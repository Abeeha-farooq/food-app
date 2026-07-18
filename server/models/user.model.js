// models/user.model.js
// ===============================
// Purpose: Define what a "User" looks like in our database.
// Every user document saved in MongoDB will follow this shape.
// ===============================

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// A "schema" is the blueprint. Mongoose uses it to:
//   1. Validate data before saving
//   2. Cast types (string -> Date, etc.)
//   3. Build helpful query methods
const userSchema = new mongoose.Schema(
  {
    // Basic identity
    fullname: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,        // removes leading/trailing whitespace
      minlength: 2,
      maxlength: 50,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,       // no two users can have the same email
      lowercase: true,    // "John@x.com" and "john@x.com" become the same
      trim: true,
    },

    contact: {
      type: String,
      required: [true, "Contact number is required"],
      trim: true,
    },

    // We NEVER store plain text passwords. We store the scrambled version.
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,      // don't return password in queries by default (security)
    },

    // Authorization role: regular user vs admin vs restaurant owner
    role: {
      type: String,
      enum: ["user", "admin", "restaurant_owner"],
      default: "user",
    },

    // Profile extras
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    country: { type: String, default: "" },
    profilePicture: {
      type: String,
      default: "",        // empty by default; we'll fill it with a URL after upload
    },

    // Email verification
    // (Note: in the new flow, a User is only CREATED after the OTP is
    // verified. So `isVerified` is always true for any user that exists.
    // We keep the field for backward compat with the seed and the auth
    // context, but no code path sets it to false.)
    isVerified: {
      type: Boolean,
      default: true,
    },

    // Password reset — two-phase flow:
    //   1. forgot-password → user submits email → server sends OTP,
    //      stores resetPasswordOTP + resetPasswordExpires
    //   2. verify-reset-otp → user submits email + OTP → server marks
    //      the user as "verified for reset" with a 5-min window
    //      (resetPasswordVerified + resetPasswordVerifiedExpires)
    //   3. reset-password → user submits email + new password → server
    //      checks the verified window, then updates the password
    //
    // Why two phases instead of one? So the user has to PROVE they
    // own the email (by entering the OTP) BEFORE we let them change
    // the password — and the "verified" window is short (5 min) so
    // an attacker who somehow got the OTP can't sit on it forever.
    resetPasswordOTP: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    resetPasswordVerified: { type: Boolean, default: false, select: false },
    resetPasswordVerifiedExpires: { type: Date, select: false },
  },
  {
    // `timestamps` automatically adds `createdAt` and `updatedAt` fields.
    // Super useful for auditing ("when was this user created?")
    timestamps: true,
  }
);

// ============================================================
// MIDDLEWARE: runs BEFORE saving a user to the DB
// ============================================================
// If the password was modified (or it's a new user), scramble it.
//
// Note: modern Mongoose does NOT pass a `next` callback to async hooks.
// Just write `async function ()` and Mongoose will await your promise.
userSchema.pre("save", async function () {
  // `this` refers to the user document being saved
  // If password wasn't changed, skip hashing (saves CPU on profile updates)
  if (!this.isModified("password")) return;

  // `bcrypt.hash(password, saltRounds)` — higher rounds = more secure but slower.
  // 10 is a good balance for dev/prod.
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// ============================================================
// CUSTOM METHODS (attached to every user document)
// ============================================================

// Compare a candidate password (typed by user at login) with the stored hash.
// Returns true if they match.
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Create a "model" from the schema. This is what we use to query the DB:
//   User.find(), User.findById(), new User({...}).save() etc.
const User = mongoose.model("User", userSchema);

export default User;
