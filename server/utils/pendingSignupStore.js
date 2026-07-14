// utils/pendingSignupStore.js
// ===============================
// Purpose: CRUD helpers for the PendingSignup collection.
//
// All auth flows (signup, verify-email, resend) go through these
// functions. Centralizing the DB calls here means the controller
// stays focused on HTTP concerns (validation, status codes, cookies).
// ===============================

import PendingSignup from "../models/pendingSignup.model.js";
import { generateOTP } from "./mailer.js";

// 10 minutes — short enough that stale OTPs can't be reused, long
// enough that the user has time to find the email and type the code.
const OTP_TTL_MS = 10 * 60 * 1000;

// SET — upsert a PendingSignup for the given email
// If a PendingSignup already exists for this email, replace it.
// This handles the "user tried to sign up but didn't verify, then
// tries again" case — we don't want two PendingSignups floating
// around with different OTPs.
export const setPendingSignup = async (data) => {
  const { email, fullname, contact, password } = data;
  await PendingSignup.findOneAndUpdate(
    { email: email.toLowerCase() },
    {
      fullname,
      contact,
      password,
      verifyOTP: generateOTP(),
      verifyOTPExpires: new Date(Date.now() + OTP_TTL_MS),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

// GET — fetch a PendingSignup by email, including the OTP and expiry
// (both have `select: false` on the schema, so we explicitly select them)
export const getPendingSignup = async (email) => {
  return PendingSignup.findOne({ email: email.toLowerCase() }).select(
    "+verifyOTP +verifyOTPExpires"
  );
};

// DELETE — remove a PendingSignup (called after successful verification)
export const deletePendingSignup = async (email) => {
  await PendingSignup.deleteOne({ email: email.toLowerCase() });
};

// UPDATE OTP — generate a fresh OTP and reset the expiry
// (called by resend-verification)
export const updateOTP = async (email) => {
  const newOTP = generateOTP();
  await PendingSignup.findOneAndUpdate(
    { email: email.toLowerCase() },
    {
      verifyOTP: newOTP,
      verifyOTPExpires: new Date(Date.now() + OTP_TTL_MS),
    }
  );
  return newOTP;
};
