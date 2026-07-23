// scripts/geocode-restaurants.js
// ===============================
// Purpose: One-off script to backfill `location` (lat/lng) on
//          every restaurant that doesn't have it yet. Run ONCE
//          after deploying the rider earnings feature.
//
// Usage (from D:\food app\server):
//   node scripts/geocode-restaurants.js
//
// What it does:
//   1. Connects to MONGODB_URI
//   2. Finds all restaurants where `location.lat` is null
//   3. Geocodes each one's full address (city + country + address)
//      via Nominatim (rate-limited to 1 req/sec)
//   4. Updates the restaurant with the coordinates
//
// We respect Nominatim's rate limit (1.1s between requests).
// For 10 restaurants, the script takes ~15 seconds. For 50, ~1
// minute. You can re-run it any time — restaurants that already
// have coordinates are skipped.
// ===============================

import "dotenv/config";
import mongoose from "mongoose";
import Restaurant from "../models/restaurant.model.js";
import { geocodeAddress } from "../utils/geocode.js";

const geocodeRestaurants = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI not set in server/.env");
    process.exit(1);
  }

  console.log("🔌 Connecting to MongoDB…");
  await mongoose.connect(uri);
  console.log("✅ Connected\n");

  // Find every restaurant missing coordinates. We use `$or` so
  // restaurants with `location: null` AND restaurants with
  // `location.lat: null` both match.
  const pending = await Restaurant.find({
    $or: [
      { "location.lat": null },
      { "location.lat": { $exists: false } },
    ],
  });

  if (pending.length === 0) {
    console.log("🎉 All restaurants already have coordinates. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  console.log(`📍 Found ${pending.length} restaurant(s) without coordinates. Geocoding…\n`);

  let success = 0;
  let failed = 0;
  for (const r of pending) {
    // Build the full address string. Nominatim does better with
    // more context (city + country especially).
    const fullAddress = [r.address, r.city, r.country]
      .filter(Boolean)
      .join(", ");

    if (!fullAddress.trim()) {
      console.log(`  ⚠️  ${r.name} — no address on record, skipping`);
      failed += 1;
      continue;
    }

    process.stdout.write(`  • ${r.name} (${fullAddress}) … `);
    const coords = await geocodeAddress(fullAddress);
    if (!coords) {
      console.log("❌ not found");
      failed += 1;
      continue;
    }

    r.location = {
      lat: coords.lat,
      lng: coords.lng,
      geocodedAt: new Date(),
    };
    await r.save();
    console.log(`✅ (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
    success += 1;
  }

  console.log(`\n🎉 Done. ${success} succeeded, ${failed} failed.`);
  console.log("   You can re-run this script any time — already-geocoded restaurants are skipped.");

  await mongoose.disconnect();
};

geocodeRestaurants().catch((err) => {
  console.error("❌ Geocoding failed:", err);
  process.exit(1);
});
