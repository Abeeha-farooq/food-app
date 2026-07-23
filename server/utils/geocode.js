// utils/geocode.js
// ===============================
// Purpose: Convert an address string into { lat, lng } using the
//          Google Geocoding API.
//
// Why Google (over Nominatim / OpenStreetMap):
//   - More accurate for Pakistan-specific addresses
//   - 50 requests/second rate limit (vs Nominatim's 1/sec)
//   - Same key works for both the map display (client-side) and
//     the geocoding (server-side)
//
// Security model:
//   - The API key is read from process.env.GOOGLE_MAPS_API_KEY
//     on the server (NEVER bundled in the client code that
//     geocodes — the client only geocodes via us).
//   - The CLIENT only uses the key to render the map; that key
//     should be HTTP-referrer-restricted in Google Cloud Console
//     to prevent abuse.
//   - The server can ALSO use the same key (it's the same Google
//     project) — both server and client read the same value from
//     the same .env file.
//
// Caching:
//   - Same in-memory cache as before. Geocoding results don't
//     change often, so caching by address hash avoids repeat
//     charges. (Geocoding API costs $5 / 1000 requests.)
//   - We cache "not found" too, so a malformed address doesn't
//     keep hitting the API.
//
// Graceful degradation:
//   - If GOOGLE_MAPS_API_KEY is missing, geocoding returns null
//     and the caller falls back to a flat fee for the earning
//     calculation. The app still works; you just don't get
//     distance-based pay for new orders until you set the key.
// ===============================

// ----- In-memory cache -----
// Key: lowercased + trimmed address. Value: { lat, lng } | null.
const cache = new Map();

// ----- Serialized request queue -----
// Google allows 50 req/sec, but we serialize anyway so a burst
// of new orders doesn't spike. Each request gets a small
// artificial delay (50ms) — well under the limit but smooths
// the curve.
let lastRequestAt = 0;
let nextRequest = Promise.resolve();

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const RATE_LIMIT_MS = 50; // 50ms between requests = max 20 req/sec, well under Google's 50/sec limit

/**
 * Geocode a single address string via Google Geocoding API.
 * Returns { lat, lng } or null.
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

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    // No key configured — we silently return null. The caller
    // (rider earnings system) will fall back to a flat fee.
    // Log once on first call so the operator notices in their
    // server logs that geocoding is disabled.
    if (!geocodeAddress._warned) {
      console.warn(
        "[geocode] GOOGLE_MAPS_API_KEY is not set — geocoding is disabled. " +
          "Riders will get the flat default fee until this is configured."
      );
      geocodeAddress._warned = true;
    }
    cache.set(key, null);
    return null;
  }

  // Serialize: chain the next request after the current one,
  // with a 50ms gap to stay well under Google's 50 req/sec limit.
  const result = nextRequest.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, RATE_LIMIT_MS - (now - lastRequestAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();

    try {
      const url = new URL(GOOGLE_GEOCODE_URL);
      url.searchParams.set("address", address);
      url.searchParams.set("key", apiKey);

      const res = await fetch(url);
      if (!res.ok) {
        console.warn(
          `[geocode] Google returned HTTP ${res.status} for "${address}"`
        );
        return null;
      }
      const data = await res.json();
      // Google's response shape:
      //   { status: "OK" | "ZERO_RESULTS" | "OVER_QUERY_LIMIT" | ...,
      //     results: [{ geometry: { location: { lat, lng } }, ... }] }
      if (data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
        // OVER_QUERY_LIMIT is worth surfacing — the operator
        // should know if they're being rate-limited.
        if (data.status === "OVER_QUERY_LIMIT" || data.status === "REQUEST_DENIED") {
          console.warn(
            `[geocode] Google status "${data.status}" for "${address}". ` +
              "Check your API key, billing, and quota."
          );
        }
        return null;
      }

      const { lat, lng } = data.results[0].geometry.location;
      const latN = Number(lat);
      const lngN = Number(lng);
      if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return null;
      return { lat: latN, lng: lngN };
    } catch (err) {
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
 *
 * We keep the math here rather than re-importing the client util
 * because the server is Node and the client is browser — sharing
 * via copy is fine; we just need to keep the two in sync. (Same
 * algorithm: R=6371km, atan2(sin²+cos·cos·sin²).)
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
