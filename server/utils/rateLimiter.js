// utils/rateLimiter.js
// ===============================
// Purpose: Centralized rate-limit configs for the API.
//
// Three buckets, each tuned to the threat model of its endpoint:
//
//   1. authLimiter      — login, signup, forgot-password, verify-reset-otp
//                         Tighter: 10 requests / 15 min / IP. A real user
//                         almost never hits these more than a few times
//                         in a session, so anything beyond this is
//                         brute-force / OTP-spraying / account-takeover
//                         noise.
//
//   2. authVerifyLimiter — email-verify + password-reset
//                          TIGHTEST: 5 requests / 15 min / IP. These
//                          endpoints take an OTP that's typically
//                          6 digits — guessing or spraying them is
//                          the most direct path to account takeover,
//                          so the cap is intentionally low.
//
//   3. generalLimiter    — every other route (browsing, cart, etc.)
//                          Looser: 100 requests / 15 min / IP. Lets
//                          real users scroll / refresh without hitting
//                          the wall but still cuts off bot scraping.
//
// Why we keep this in a separate file:
//   - The auth routes get different limits than the rest of the API
//   - Centralizing means we can tweak all buckets in one place
//   - It also keeps server.js readable — server.js just mounts
//     `app.use("/api/auth/...", authLimiter)` and the rest is here.
//
// Behind the scenes we use express-rate-limit v7's `ipKeyGenerator`
// helper for the per-IP key. Behind a proxy (Vercel), we trust
// X-Forwarded-For — express-rate-limit does this by default with
// `trust proxy` enabled in app settings, but we set it explicitly
// in server.js to be safe.
// ===============================

import rateLimit from "express-rate-limit";

/**
 * Helper: return a 429 JSON in our standard ApiResponse shape so the
 * client-side error handler can surface a clean message instead of
 * the default "Too many requests" plain-text response.
 *
 * Note: we don't import ApiResponse here to avoid a circular
 * dependency (utils/ → utils/apiResponse). We hand-roll the shape
 * instead — it's just two fields and avoids the import cycle.
 */
const json429 = (_req, res) => {
  res.status(429).json({
    success: false,
    message: "Too many requests. Please try again in a few minutes.",
  });
};

// ----- 1. Auth endpoints (login / signup / forgot-password) -----
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 10,                    // 10 requests / 15 min / IP
  standardHeaders: true,     // RateLimit-* headers (RFC 6585 / draft)
  legacyHeaders: false,       // disable X-RateLimit-* (deprecated)
  handler: json429,
  // The default keyGenerator is fine for our use case (IP-based).
  // On Vercel, `req.ip` is the real client IP because the server
  // is behind the Vercel proxy and we set `trust proxy` in server.js.
});

// ----- 2. OTP verify / password-reset -----
// Tighter: guessing a 6-digit OTP is the most direct attack on
// an account. 5 attempts / 15 min is enough for a real user who
// mistypes once or twice, but kills brute-force.
export const authVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 5,                     // 5 requests / 15 min / IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

// ----- 3. General API traffic -----
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 100,                   // 100 requests / 15 min / IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});
