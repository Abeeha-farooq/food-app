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
    // `decoded` is the payload we signed at login: { _id, role, email,
    // sessionVersion, ... }. Fetch the live user document so req.user
    // has all fields (fullname, email, role, profilePicture, etc.)
    // and is up-to-date.
    //
    // We also explicitly select `sessionVersion` because the default
    // Mongoose query doesn't include it (no `select: false` on the
    // schema, but the `.select("-password")` form excludes only
    // password — every other field is included by default. We just
    // want to be defensive in case the field is later added with
    // `select: false`).
    const user = await User.findById(decoded._id)
      .select("-password +sessionVersion");
    if (!user) {
      throw new ApiError(401, "Unauthorized: user not found");
    }

    // ----- Session version check (admins only) -----
    // For role="admin", the token's sessionVersion must match the
    // user's current sessionVersion. If it doesn't, this token is
    // from a previous login that's been superseded by a newer one
    // (likely on a different device). Reject with 401 so the kicked-
    // out admin's next request fails and the axios interceptor
    // redirects them to /login.
    //
    // We default both sides to 0 when the field is missing (for
    // tokens issued before the field existed), so old tokens with
    // no sessionVersion still match users with default 0.
    //
    // Why only admins: customer/rider accounts routinely use
    // multiple devices simultaneously, and kicking them off
    // on every login would be hostile UX. Admins are
    // high-trust, so the stricter behavior is appropriate.
    if (user.role === "admin") {
      const tokenVersion = decoded.sessionVersion ?? 0;
      const currentVersion = user.sessionVersion ?? 0;
      if (tokenVersion !== currentVersion) {
        console.warn(
          `[Auth] Admin session invalidated — user=${user._id} (${user.email}), ` +
          `tokenVersion=${tokenVersion}, currentVersion=${currentVersion}. ` +
          `Kicked (likely a new login on another device).`
        );
        throw new ApiError(
          401,
          "Your session has ended because someone signed in to this account on another device. Please sign in again."
        );
      }
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
