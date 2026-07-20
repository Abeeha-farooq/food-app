// routes/auth.route.js
// ===============================
// Purpose: Map URLs to auth controllers.
//   POST /api/auth/signup              -> signup
//   POST /api/auth/login               -> login
//   POST /api/auth/logout              -> logout  (requires login)
//   POST /api/auth/verify-email        -> verifyEmail
//   POST /api/auth/resend-verification -> resendVerification
//   POST /api/auth/forgot-password     -> step 1: email + send OTP
//   POST /api/auth/verify-reset-otp    -> step 2: verify OTP, open 5-min reset window
//   POST /api/auth/reset-password      -> step 3: set new password (requires verified window)
//
// Rate limiting:
//   The whole /api/auth/* prefix is wrapped in `authLimiter`
//   (10 req / 15 min / IP) in server.js. The OTP-bearing endpoints
//   below — verify-email, verify-reset-otp, reset-password — get
//   the stricter `authVerifyLimiter` (5 req / 15 min / IP) layered
//   ON TOP of authLimiter. Both limits apply, and a 429 from
//   either one returns the same JSON shape to the client.
// ===============================

import express from "express";
import {
  signup,
  login,
  logout,
  verifyEmail,
  resendVerification,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
} from "../controllers/auth.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authVerifyLimiter } from "../utils/rateLimiter.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
// OTP-bearing endpoints get the tighter rate limit (5/15min) on top
// of the authLimiter (10/15min) applied at the prefix level in
// server.js. Order matters in express — the per-route limiter
// runs AFTER the prefix-level one, so both count toward the cap.
router.post("/verify-email", authVerifyLimiter, verifyEmail);
// Resend a new verification code (used by the login page's 403 UX).
// Same security model as forgot-password: always returns success to
// avoid leaking which emails are registered. Mounted with the verify
// limiter since it triggers a real email send and could be abused to
// flood someone's inbox.
router.post("/resend-verification", authVerifyLimiter, resendVerification);

// Forgot password — 3-step flow:
//   1. /forgot-password   → user submits email → server sends OTP
//   2. /verify-reset-otp  → user submits email + OTP → server marks
//      the user as "verified for reset" with a 5-min window
//   3. /reset-password    → user submits email + new password → server
//      checks the verified window, then updates the password
//
// Step 1 gets authLimiter (looser — you can submit an email a few
// times without harm), but steps 2 and 3 carry an OTP or a reset
// window, so they get the stricter authVerifyLimiter.
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", authVerifyLimiter, verifyResetOtp);
router.post("/reset-password", authVerifyLimiter, resetPassword);

// Logout requires a logged-in user (to verify it's really them logging out)
router.post("/logout", verifyJWT, logout);

export default router;
