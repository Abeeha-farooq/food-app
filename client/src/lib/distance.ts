// src/lib/distance.ts
// ===============================
// Purpose: Compute the straight-line distance between two
//          lat/lng points using the Haversine formula.
//
//          The Haversine formula gives the great-circle distance
//          between two points on a sphere (Earth). It's accurate
//          to ~0.5% over short distances, which is plenty for
//          "rider is 1.2 km away from the customer" indicators.
//
//          We do NOT use a routing API (Google Directions, OSRM,
//          Mapbox) for the MVP — those add cost + complexity. The
//          straight-line distance is a good "as the crow flies"
//          approximation and is what most food delivery apps show
//          alongside a map anyway. The user can see the actual
//          route on the embedded map.
// ===============================

/**
 * Compute the great-circle distance between two lat/lng points.
 *
 * @param a - First point { lat, lng } in decimal degrees
 * @param b - Second point { lat, lng } in decimal degrees
 * @returns Distance in meters (use the format helpers below to display)
 */
export const haversineMeters = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number => {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

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

/**
 * Format a distance in meters as a human-readable string.
 *   < 1000m  → "420 m"
 *   >= 1000m → "1.2 km" (1 decimal place)
 */
export const formatDistance = (meters: number): string => {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};

/**
 * Format a duration estimate based on distance and an assumed
 * average speed (default 25 km/h — typical for a delivery rider
 * in mixed urban traffic). Pure convenience helper for the UI.
 */
export const formatEta = (meters: number, kmh = 25): string => {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  const hours = meters / 1000 / kmh;
  const minutes = Math.round(hours * 60);
  if (minutes < 1) return "< 1 min";
  return `${minutes} min`;
};
