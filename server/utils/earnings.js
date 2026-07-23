// utils/earnings.js
// ===============================
// Purpose: Pure functions for calculating and summarizing rider
//          earnings. No DB or HTTP code here — this file is
//          importable from both the server (controllers, models)
//          and (potentially) tests.
//
// Formula (tunable in one place — see CONFIG below):
//   amount = baseFee + (distanceKm × ratePerKm)
//   rounded to the nearest whole rupee
//
// If the distance can't be computed (e.g. one side has no
// coordinates yet), we fall back to a flat defaultFee. This
// means the feature works end-to-end BEFORE every restaurant
// has been geocoded — the rider still gets paid, just at the
// flat rate.
// ===============================

// ============================================================
// CONFIG — single source of truth for the pricing formula
// ============================================================
// Change these numbers and the entire app updates. Don't tune
// them per-order or per-rider — we want predictability for the
// rider (they should be able to estimate their own pay from
// the distance they recognize).
export const EARNINGS_CONFIG = {
  baseFee: 30,       // Rs. 30 — paid for every completed delivery
  ratePerKm: 8,      // Rs. 8 per km from restaurant → customer
  defaultFee: 50,    // Fallback when distance is unknown
  // Refused orders don't generate an earning by default.
  // The admin can manually create a "compensation" earning if
  // they want to pay the rider anyway.
};

/**
 * Calculate the earning for a single delivery.
 *
 * @param {number | null} distanceMeters - Haversine distance
 *   between restaurant and delivery address, in meters. Pass
 *   `null` if either side is missing coordinates — the function
 *   will return the flat default fee.
 * @returns {number} Whole-rupee amount to credit the rider.
 */
export const calculateEarning = (distanceMeters) => {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) {
    return EARNINGS_CONFIG.defaultFee;
  }
  const km = distanceMeters / 1000;
  const raw = EARNINGS_CONFIG.baseFee + km * EARNINGS_CONFIG.ratePerKm;
  return Math.round(raw);
};

/**
 * Compute a summary from an array of earnings docs.
 *
 * @param {Array<{ amount: number, status: string }>} earnings
 * @returns {{
 *   total: number,    // sum of ALL earnings
 *   pending: number,  // assigned but not delivered yet
 *   earned: number,   // delivered, waiting for payout
 *   paid: number,     // admin has paid out
 *   cancelled: number,// order was refused — no pay
 *   count: { pending, earned, paid, cancelled }
 * }}
 */
export const summarizeEarnings = (earnings) => {
  const result = {
    total: 0,
    pending: 0,
    earned: 0,
    paid: 0,
    cancelled: 0,
    count: { pending: 0, earned: 0, paid: 0, cancelled: 0 },
  };
  for (const e of earnings) {
    result.total += e.amount || 0;
    const s = e.status;
    if (s === "pending") {
      result.pending += e.amount || 0;
      result.count.pending += 1;
    } else if (s === "earned") {
      result.earned += e.amount || 0;
      result.count.earned += 1;
    } else if (s === "paid") {
      result.paid += e.amount || 0;
      result.count.paid += 1;
    } else if (s === "cancelled") {
      result.cancelled += e.amount || 0;
      result.count.cancelled += 1;
    }
  }
  return result;
};
