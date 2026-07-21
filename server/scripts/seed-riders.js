// scripts/seed-riders.js
// ===============================
// Purpose: Insert the 3 rider accounts into MongoDB Atlas with
//          correctly bcrypt-hashed passwords. Run once.
//
// Usage (from D:\food app\server):
//   node scripts/seed-riders.js
//
// What it does:
//   1. Connects to MONGODB_URI (read from server/.env)
//   2. Upserts each rider by email — safe to re-run
//   3. Sets role: "rider", isApproved: true, isVerified: true
//   4. Hashes the password with bcrypt (10 rounds, same as the
//      pre-save hook in user.model.js — so login will work)
//
// After running, the 3 riders can log in via the standard
// /api/auth/login endpoint with their email + the password below.
// ===============================

import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/user.model.js";

// ============================================================
// RIDER DEFINITIONS
// ============================================================
// Change passwords here if you want different ones. Email is
// the unique key — re-running the script won't create duplicates.
const RIDERS = [
  {
    fullname: "Arshad Ali",
    email:    "arshad.ali@flavourcourt.com",
    contact:  "03203441233",
    password: "rider123",
  },
  {
    fullname: "Asad Ali",
    email:    "asad.rider@flavourcourt.test",
    contact:  "0300-1234567",
    password: "rider123",
  },
  {
    fullname: "Bilal Khan",
    email:    "bilal.rider@flavourcourt.test",
    contact:  "0321-7654321",
    password: "rider123",
  },
];

const seedRiders = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI is not set in server/.env");
    process.exit(1);
  }

  console.log("🔌 Connecting to MongoDB…");
  await mongoose.connect(uri);
  console.log("✅ Connected\n");

  for (const r of RIDERS) {
    // Hash the password (10 rounds — matches the pre-save hook).
    const hash = await bcrypt.hash(r.password, 10);
    // Upsert by email so re-running the script updates the
    // existing rider rather than creating a duplicate.
    const result = await User.findOneAndUpdate(
      { email: r.email.toLowerCase() },
      {
        fullname:      r.fullname,
        email:         r.email.toLowerCase(),
        contact:       r.contact,
        password:      hash,
        role:          "rider",
        isApproved:    true,
        isVerified:    true,
        isBlacklisted: false,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(
      `✅ ${result.fullname.padEnd(15)} | ${result.email.padEnd(35)} | ${r.contact}`
    );
  }

  console.log("\n🎉 Done. Riders can now log in with their email + password.");
  console.log("   All 3 use password: rider123");
  console.log("   Change them in the script if you want different passwords.\n");

  await mongoose.disconnect();
};

seedRiders().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
