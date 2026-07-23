// utils/geocode.js
// ===============================
// Purpose: Convert an address string into { lat, lng } using the
//          OpenStreetMap Nominatim API (free, no API key).
//
// Why Nominatim:
//   - Free, no signup, no API key
//   - OpenStreetMap data covers Pakistan well
//   - Standard for hobby / small-scale food delivery apps
//
// Why not Google Maps Geocoding API:
//   - Costs $5 / 1000 requests
//   - Requires a billing account even for free tier
//   - The user said "no duplicate APIs" — OSM is the only one we
//     need for both the map and the geocoding
//
// Rate limiting:
//   - Nominatim's usage policy: max 1 request per second
//   - We serialize requests through a chain so the rate is respected
//   - We cache results in-memory forever (addresses don't move)
//   - If Nominatim is down or returns no result, we return null
//     and the caller falls back to a flat fee (graceful degradation)
//
// Privacy:
//   - Nominatim logs the requesting IP. The user-agent header is
//     mandatory per their policy. We set it to "FlavourCourt/1.0"
//     + a contact URL so they can reach us if our traffic spikes.
// ===============================

import { ApiError } from "./apiError.js";

// ----- In-memory cache -----
// Key: lowercased + trimmed address. Value: { lat, lng } | null.
// We cache "not found" results too (as null) so a malformed
// address doesn't keep hitting the API on every request.
const cache = new Map();

// ----- Serialized request queue -----
// A single promise chain ensures requests fire at most 1 per
// second. We schedule a small artificial delay (1.1s) between
// each call to stay well under Nominatim's rate limit.
let lastRequestAt = 0;
let nextRequest = Promise.resolve();

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const RATE_LIMIT_MS = 1100; // 1.1 seconds between requests
const USER_AGENT = "FlavourCourt/1.0 (contact: support@flavourcourt.com)";

/**
 * Geocode a single address string. Returns { lat, lng } or null.
 *
 * @param {string} address - The full address to geocode
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
export const geocodeAddress = async (address) => {
  if (!address || typeof address !== "string") return null;
  const key = address.trim().toLowerCase();
  if (!key) return null;

  // Cache hit (success or "not found" — both stored)
  if (cache.has(key)) return cache.get(key);

  // Serialize: chain the next request after the current one,
  // with a 1.1s gap to respect Nominatim's rate limit.
  const result = nextRequest.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, RATE_LIMIT_MS - (now - lastRequestAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();

    try {
      const url = new URL(NOMINATIM_URL);
      url.searchParams.set("q", address);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      // addressdetails=1 lets us read the formatted address back
      // (useful for the "did we find what you meant?" UX later).
      url.searchParams.set("addressdetails", "1");

      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) {
        // Rate-limited or server error — don't throw, just return
        // null and let the caller fall back. Log so we can see it.
        console.warn(
          `[geocode] Nominatim returned ${res.status} for "${address}"`
        );
        return null;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;

      const { lat, lon } = data[0];
      const latN = Number(lat);
      const lngN = Number(lon);
      if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return null;
      return { lat: latN, lng: lngN };
    } catch (err) {
      // Network error, DNS error, etc. Don't throw — caller will
      // fall back to a flat fee.
      console.warn(`[geocode] Error geocoding "${address}":`, err.message);
      return null;
    }
  });

  // Chain the NEXT request after this one finishes (regardless of
  // outcome). This keeps the rate limit even if a request throws.
  nextRequest = result.catch(() => null);

  const coords = await result;
  cache.set(key, coords); // cache both success and null
  return coords;
};

/**
 * Haversine distance between two { lat, lng } points, in METERS.
 * We keep the math here (rather than re-importing the client util)
 * because the server might be Node and the client browser —
 * sharing the same formula via copy is fine; we just need to keep
 * the two in sync. (Same algorithm: R=6371km, atan2(sin²+cos·cos·sin²).)
 */
export const haversineMeters = (a, b) => {
  if (!a || !b) return null;
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
};
