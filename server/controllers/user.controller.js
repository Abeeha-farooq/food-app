// controllers/user.controller.js
// ===============================
// Purpose: Get + update the logged-in user's profile.
// ===============================

import User from "../models/user.model.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// GET /api/user/me — return the current user's profile
export const getMyProfile = asyncHandler(async (req, res) => {
  // req.user was attached by the verifyJWT middleware
  return res.status(200).json(new ApiResponse(200, req.user, "Profile fetched"));
});

// PUT /api/user/me — update the current user's profile
export const updateMyProfile = asyncHandler(async (req, res) => {
  // Whitelist what can be updated — never let users change their role or password here
  const allowed = ["fullname", "contact", "address", "city", "country", "profilePicture"];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,            // return the updated document, not the old one
    runValidators: true,  // run schema validators on update too
  });

  if (!user) throw new ApiError(404, "User not found");

  return res.status(200).json(new ApiResponse(200, user, "Profile updated"));
});
