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

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/verify-email", verifyEmail);
// Resend a new verification code (used by the login page's 403 UX).
// Same security model as forgot-password: always returns success to
// avoid leaking which emails are registered.
router.post("/resend-verification", resendVerification);

// Forgot password — 3-step flow:
//   1. /forgot-password   → user submits email → server sends OTP
//   2. /verify-reset-otp  → user submits email + OTP → server marks
//      the user as "verified for reset" with a 5-min window
//   3. /reset-password    → user submits email + new password → server
//      checks the verified window, then updates the password
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOtp);
router.post("/reset-password", resetPassword);

// Logout requires a logged-in user (to verify it's really them logging out)
router.post("/logout", verifyJWT, logout);

export default router;
