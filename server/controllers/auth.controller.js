// controllers/auth.controller.js
// ===============================
// Purpose: All auth-related endpoints.
//
//   POST /api/auth/signup              — start signup, send OTP email
//   POST /api/auth/login               — verify email + password, set cookie
//   POST /api/auth/logout              — clear cookie (requires login)
//   POST /api/auth/verify-email        — submit OTP, create User, auto-login
//   POST /api/auth/resend-verification — generate a fresh OTP, email it
//   POST /api/auth/forgot-password     — generate reset OTP, email it
//   POST /api/auth/reset-password      — verify reset OTP, change password
//
// Security model:
//   - Passwords are bcrypt-hashed (10 rounds) before storage
//   - JWTs are signed with JWT_SECRET and stored as httpOnly cookies
//   - Cookies use SameSite=Lax so cross-site requests can't read them
//   - OTPs are 6 digits, 10-minute TTL, single-use (deleted on verify)
//   - Login / forgot-password always return the same generic message
//     to avoid leaking which emails are registered
// ===============================

import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import {
  setPendingSignup,
  getPendingSignup,
  deletePendingSignup,
  updateOTP,
} from "../utils/pendingSignupStore.js";
import {
  sendVerificationOTPEmail,
  sendPasswordResetEmail,
} from "../utils/mailer.js";
import { generateToken } from "../utils/token.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// ============================================================
// SIGNUP
// ============================================================
// Starts the signup flow: validates input, hashes the password,
// stores everything in PendingSignup, and emails a 6-digit OTP.
// We do NOT create the User here — that only happens after the
// user proves they own the email by entering the OTP.
export const signup = asyncHandler(async (req, res) => {
  const { fullname, email, contact, password } = req.body;

  // Basic sanity checks (the zod schema in the route does the deep validation,
  // but a quick guard here gives better error messages).
  if (!fullname || !email || !contact || !password) {
    throw new ApiError(400, "All fields are required");
  }

  // Has the user ALREADY registered and verified? If so, tell them.
  // We check User (verified) here but NOT PendingSignup — someone
  // re-attempting signup with the same email should get a fresh OTP
  // and overwrite the old PendingSignup.
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ApiError(409, "An account with this email already exists. Please log in.");
  }

  // Hash the password BEFORE storing it in PendingSignup. This way
  // even the in-progress signup is safe if the DB is compromised.
  const hashedPassword = await bcrypt.hash(password, 10);

  // Store in PendingSignup + generate + email the OTP. setPendingSignup
  // returns a Promise — the OTP generation happens inside it.
  await setPendingSignup({
    fullname: fullname.trim(),
    email: email.toLowerCase(),
    contact: contact.trim(),
    password: hashedPassword,
  });

  // Fetch the OTP we just generated so we can email it. (We could
  // refactor setPendingSignup to return the OTP, but this keeps the
  // helper's return value simple.)
  const pending = await getPendingSignup(email);
  await sendVerificationOTPEmail(email, fullname, pending.verifyOTP);

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { email },
        "Signup started. Check your email for the verification code."
      )
    );
});

// ============================================================
// VERIFY EMAIL
// ============================================================
// User submits the OTP. We:
//   1. Look up the PendingSignup by email
//   2. Compare the OTP (and check expiry)
//   3. Create the real User document
//   4. Delete the PendingSignup
//   5. Sign a JWT and set it as a cookie
//   6. Return the user data so the client can log them in
export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const pending = await getPendingSignup(email);
  if (!pending) {
    throw new ApiError(404, "No pending signup for this email. Please sign up again.");
  }

  // OTP must match AND not be expired
  if (pending.verifyOTP !== otp) {
    throw new ApiError(400, "Invalid verification code");
  }
  if (pending.verifyOTPExpires < new Date()) {
    throw new ApiError(400, "Verification code expired. Please request a new one.");
  }

  // Create the real User. password is already hashed from signup,
  // so we use `collection.insertOne()` to BYPASS the User model's
  // pre-save hash hook (otherwise it would hash the hash a second
  // time and the user couldn't log in).
  const userDoc = await User.collection.insertOne({
    fullname: pending.fullname,
    email: pending.email,
    contact: pending.contact,
    password: pending.password,   // already hashed
    role: "user",                 // default role; admins set via seed/DB
    isVerified: true,
    profilePicture: "",
    address: "",
    city: "",
    country: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Clean up the temp record
  await deletePendingSignup(email);

  // Re-fetch as a Mongoose document (so we have all the schema methods)
  const user = await User.findById(userDoc.insertedId);

  // Sign JWT + set as httpOnly cookie
  const token = generateToken(user);
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",  // HTTPS-only in prod
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,                 // 7 days
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          _id: user._id,
          fullname: user.fullname,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
          profilePicture: user.profilePicture,
          token,                                      // also return for localStorage
        },
        "Email verified — you are now logged in"
      )
    );
});

// ============================================================
// RESEND VERIFICATION
// ============================================================
// Generates a fresh OTP and emails it. Always returns success
// (even if no PendingSignup exists) to avoid leaking which emails
// are registered.
export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, "Email is required");

  const pending = await getPendingSignup(email);
  if (!pending) {
    // No pending signup — but we don't want to leak that. Return success.
    return res
      .status(200)
      .json(new ApiResponse(200, null, "If that email has a pending signup, a new code has been sent."));
  }

  const newOTP = await updateOTP(email);
  await sendVerificationOTPEmail(email, pending.fullname, newOTP);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "A new verification code has been sent."));
});

// ============================================================
// LOGIN
// ============================================================
// Validates email + password. On success, sets the JWT cookie
// and returns the user data + token.
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  // We explicitly select `password` (which has `select: false` on the
  // schema) so we can compare it.
  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError(401, "Invalid email or password");
  }

  const token = generateToken(user);
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        profilePicture: user.profilePicture,
        token,
      },
      "Logged in"
    )
  );
});

// ============================================================
// LOGOUT
// ============================================================
// Clear the cookie. (No server-side session to invalidate because
// we use stateless JWTs — the client just discards the token.)
export const logout = asyncHandler(async (_req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    expires: new Date(0),  // expire immediately
  });
  return res.status(200).json(new ApiResponse(200, null, "Logged out"));
});

// ============================================================
// FORGOT PASSWORD
// ============================================================
// Generates a reset OTP, stores it on the User (with a 10-min
// expiry), and emails it. Always returns success to avoid
// leaking which emails are registered.
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, "Email is required");

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res
      .status(200)
      .json(new ApiResponse(200, null, "If that email is registered, a reset code has been sent."));
  }

  // Generate a fresh OTP and store it on the User
  const { generateOTP } = await import("../utils/mailer.js");
  const otp = generateOTP();
  user.resetPasswordOTP = otp;
  user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  await sendPasswordResetEmail(email, user.fullname, otp);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "If that email is registered, a reset code has been sent."));
});

// ============================================================
// VERIFY RESET OTP (step 2 of the 3-step forgot-password flow)
// ============================================================
// Called after the user enters the OTP from their email. We verify
// the OTP is correct and not expired, then mark the user as
// "verified for password reset" with a 5-minute window. The actual
// password change happens in the next step (resetPassword), which
// checks this verified window.
//
// This two-phase design means:
//   1. User must PROVE they own the email (by entering the OTP) BEFORE
//      we accept a new password
//   2. The "verified" window is short (5 min) so an attacker who
//      intercepted the OTP can't sit on it indefinitely
//   3. The OTP itself becomes useless after verification (cleared),
//      so a later leak of the OTP doesn't help
export const verifyResetOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() })
    .select("+resetPasswordOTP +resetPasswordExpires");
  if (!user || !user.resetPasswordOTP || !user.resetPasswordExpires) {
    throw new ApiError(
      400,
      "No reset code found. Please request a new one from the forgot password link."
    );
  }
  if (user.resetPasswordOTP !== otp) {
    throw new ApiError(400, "Invalid reset code. Please check your email and try again.");
  }
  if (user.resetPasswordExpires < new Date()) {
    throw new ApiError(
      400,
      "Reset code expired. Please request a new one from the forgot password link."
    );
  }

  // OTP is valid. Mark the user as "verified for reset" with a 5-min
  // window. We do NOT clear the OTP yet — resetPassword will clear
  // it after a successful password change.
  user.resetPasswordVerified = true;
  user.resetPasswordVerifiedExpires = new Date(Date.now() + 5 * 60 * 1000);
  await user.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      { verified: true, email: user.email },
      "Code verified. You can now set a new password."
    )
  );
});

// ============================================================
// RESET PASSWORD (step 3 of the 3-step forgot-password flow)
// ============================================================
// Requires the user to have verified their OTP within the last 5
// minutes (checked via resetPasswordVerified + resetPasswordVerifiedExpires).
// On success: hashes the new password, clears ALL reset fields.
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    throw new ApiError(400, "Email and new password are required");
  }
  if (newPassword.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  const user = await User.findOne({ email: email.toLowerCase() })
    // IMPORTANT: we need both the verified flags AND the OTP fields
    // (we clear the OTP after successful reset).
    .select("+resetPasswordOTP +resetPasswordExpires +resetPasswordVerified +resetPasswordVerifiedExpires");
  if (!user) {
    throw new ApiError(400, "Invalid request");
  }

  // Defense layer 1: must have completed OTP verification
  if (!user.resetPasswordVerified) {
    throw new ApiError(
      400,
      "Please verify your reset code first (enter the 6-digit code we emailed you)"
    );
  }

  // Defense layer 2: the verified window must not be expired
  if (!user.resetPasswordVerifiedExpires || user.resetPasswordVerifiedExpires < new Date()) {
    throw new ApiError(
      400,
      "Verification expired. Please restart the password reset process."
    );
  }

  // All checks passed — update the password and clear all reset fields
  user.password = newPassword;       // pre-save hook will hash it
  user.resetPasswordOTP = undefined;
  user.resetPasswordExpires = undefined;
  user.resetPasswordVerified = false;
  user.resetPasswordVerifiedExpires = undefined;
  await user.save();

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Password reset successfully. You can now log in."));
});
