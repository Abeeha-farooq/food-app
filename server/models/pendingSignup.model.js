// models/pendingSignup.model.js
// ===============================
// Purpose: Temporary storage for in-progress signups.
//
// Flow:
//   1. POST /api/auth/signup — we hash the password, save the user
//      data here (NOT in the User collection), and email an OTP.
//   2. POST /api/auth/verify-email — user submits the OTP; we look it
//      up here, create the real User document, and delete the entry.
//
// Why not just create the User immediately?
//   Because we want email verification BEFORE the account exists. If
//   we created the User right away, anyone could sign up with someone
//   else's email and lock the real owner out. This way, only emails the
//   owner can verify become User documents.
//
// TTL index on `createdAt`:
//   A MongoDB TTL index automatically deletes expired docs. We set
//   expireAfterSeconds to 3600 (1 hour) so unverified signups don't
//   pile up forever. Note: the TTL monitor runs every ~60s, so docs
//   may live up to 1 hour + 1 minute past their expiry.
// ===============================

import mongoose from "mongoose";

const pendingSignupSchema = new mongoose.Schema(
  {
    // What the user typed during signup. We keep the HASHED password
    // here, never the plain text — so even if the DB leaks, the
    // passwords aren't immediately usable.
    fullname: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    contact: { type: String, required: true, trim: true },
    password: { type: String, required: true, select: false },   // hashed

    // OTP + expiry. We store BOTH the OTP and an explicit expiry so
    // we can quickly check `now < verifyOTPExpires` without scanning.
    verifyOTP: { type: String, select: false },
    verifyOTPExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

// TTL index — MongoDB deletes docs whose `createdAt` is older than
// 3600 seconds (1 hour). The TTL monitor runs ~every 60s, so
// deletion happens up to ~60s after the 1h mark.
pendingSignupSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

const PendingSignup = mongoose.model("PendingSignup", pendingSignupSchema);

export default PendingSignup;
