// utils/token.js
// ===============================
// Purpose: Sign and verify JSON Web Tokens (JWTs).
//
// We use the `jsonwebtoken` library. The SECRET is loaded from
// process.env.JWT_SECRET (set in server/.env). In production, the
// secret should be a long random string — generate one with:
//   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
// ===============================

import jwt from "jsonwebtoken";

// Sign a JWT for a user. We embed the user's _id, role, and
// sessionVersion in the payload so the verify middleware can do
// role + session-validity checks without a separate DB hit for
// the version.
//
// `sessionVersion` is the key piece that powers the "kick the
// previous session" flow for admins. When an admin logs in on a
// new device, the login controller bumps sessionVersion on the
// user document. The new JWT carries the bumped value; the old
// device's JWT still carries the old value; verifyJWT compares
// the two and rejects the old token with 401. See
// middlewares/auth.middleware.js for the check.
export const generateToken = (user) => {
  return jwt.sign(
    {
      _id: user._id.toString(),
      role: user.role,
      email: user.email,
      // Default to 0 if the field is missing (shouldn't happen
      // with the model default, but defensive — tokens issued
      // before this field existed have no value and would parse
      // as undefined otherwise).
      sessionVersion: user.sessionVersion ?? 0,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );
};

// Verify a JWT string. Throws if invalid/expired. Returns the payload
// (which contains _id, role, email) on success.
export const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};
