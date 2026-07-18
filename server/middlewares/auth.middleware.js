// middlewares/auth.middleware.js
// ===============================
// Purpose: JWT-based authentication middleware.
//
//   verifyJWT    — reads the JWT from cookies (or Authorization header),
//                  verifies it, and attaches `req.user` (the Mongoose
//                  document) for downstream handlers.
//   requireRole  — checks the role of req.user and 403s if not allowed.
// ===============================

import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import ApiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";

// verifyJWT — attaches req.user if a valid JWT is present
export const verifyJWT = asyncHandler(async (req, _res, next) => {
  // We accept the token from EITHER:
  //   1. The `token` httpOnly cookie (preferred — set on login)
  //   2. The `Authorization: Bearer <token>` header (used by some clients)
  const token =
    req.cookies?.token ||
    (req.header("Authorization")?.startsWith("Bearer ")
      ? req.header("Authorization").split(" ")[1]
      : null);

  if (!token) {
    throw new ApiError(401, "Unauthorized: no token provided");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // `decoded` is the payload we signed at login: { _id, role, ... }
    // Fetch the live user document so req.user has all fields (fullname,
    // email, role, profilePicture, etc.) and is up-to-date.
    const user = await User.findById(decoded._id).select("-password");
    if (!user) {
      throw new ApiError(401, "Unauthorized: user not found");
    }

    // ----- Blacklist check -----
    // If an admin has blacklisted this user AFTER they logged in (so they
    // have a valid JWT), we still block their request. This is the
    // "already logged in" case — they don't have to log out, they just
    // can't do anything. The axios interceptor on the client catches
    // this 403 and redirects to /login.
    if (user.isBlacklisted) {
      const reasonSuffix = user.blacklistReason
        ? ` Reason: ${user.blacklistReason}`
        : "";
      throw new ApiError(
        403,
        `Your account has been suspended.${reasonSuffix} Contact support if you believe this is a mistake.`
      );
    }

    // ----- Rider approval check (mid-session) -----
    // Same idea as the blacklist check, but for the rider approval
    // flow. If an admin rejects a rider AFTER they've logged in
    // (flips isApproved to false), their existing JWT would otherwise
    // still be valid — we explicitly block here so they get kicked
    // out the next request.
    // For all non-rider roles isApproved is true by default → no-op.
    if (user.role === "rider" && !user.isApproved) {
      throw new ApiError(
        403,
        "Your rider account is pending admin approval. You'll be able to use the app once it's approved."
      );
    }

    req.user = user;
    next();
  } catch (err) {
    // JWT errors (expired, malformed, bad signature) all → 401
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      throw new ApiError(401, "Unauthorized: invalid or expired token");
    }
    throw err;
  }
});

// requireRole — factory: requireRole("admin") or requireRole("admin", "restaurant_owner")
export const requireRole = (...allowed) =>
  asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      throw new ApiError(401, "Authentication required");
    }
    if (!allowed.includes(req.user.role)) {
      throw new ApiError(
        403,
        `Forbidden: requires one of [${allowed.join(", ")}], you are ${req.user.role || "none"}`
      );
    }
    next();
  });
