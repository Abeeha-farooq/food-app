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

// Sign a JWT for a user. We embed the user's _id and role in the
// payload so the verify middleware can do role checks without a DB hit.
export const generateToken = (user) => {
  return jwt.sign(
    {
      _id: user._id.toString(),
      role: user.role,
      email: user.email,
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
