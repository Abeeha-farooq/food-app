// routes/auth.route.js
// ===============================
// Purpose: Map URLs to auth controllers.
//   POST /api/auth/signup              -> signup
//   POST /api/auth/login               -> login
//   POST /api/auth/logout              -> logout  (requires login)
//   POST /api/auth/verify-email        -> verifyEmail
//   POST /api/auth/resend-verification -> resendVerification
//   POST /api/auth/forgot-password
//   POST /api/auth/reset-password
// ===============================

import express from "express";
import {
  signup,
  login,
  logout,
  verifyEmail,
  resendVerification,
  forgotPassword,
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
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Logout requires a logged-in user (to verify it's really them logging out)
router.post("/logout", verifyJWT, logout);

export default router;
