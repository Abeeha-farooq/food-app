// controllers/admin.controller.js
// ===============================
// Purpose: Admin-only operations.
//   - getDashboardStats       — numbers for the dashboard
//   - blacklistUser            — suspend a user account
//   - unblacklistUser          — restore a suspended user account
// ===============================

import Restaurant from "../models/restaurant.model.js";
import MenuItem from "../models/menu.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

/**
 * GET /api/admin/stats
 * Returns:
 *   - totalRestaurants  — count of all restaurants
 *   - totalMenuItems   — count of all menu items
 *   - totalOrders      — count of all orders
 *   - totalRevenue     — sum of totalPrice for DELIVERED orders only
 *   - ordersByStatus   — breakdown of orders grouped by status
 *   - recentOrders     — last 5 orders (for the "Recent activity" widget)
 *
 * Uses Promise.all to run all 5 queries in parallel — total response time
 * is the slowest single query, not the sum of all queries.
 */
export const getDashboardStats = asyncHandler(async (req, res) => {
  // Run all 5 queries in parallel
  const [
    totalRestaurants,
    totalMenuItems,
    totalOrders,
    revenueResult,
    ordersByStatus,
    recentOrders,
  ] = await Promise.all([
    Restaurant.countDocuments(),
    MenuItem.countDocuments(),
    Order.countDocuments(),

    // Aggregate: sum totalPrice of orders where status === "delivered"
    Order.aggregate([
      { $match: { status: "delivered" } },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]),

    // Aggregate: count orders grouped by status
    Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    // Last 5 orders, newest first, with user + restaurant populated
    Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("user", "fullname email")
      .populate("restaurant", "name city"),
  ]);

  // The revenue aggregate returns an array with one element (or empty)
  const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

  // Convert ordersByStatus from [{_id: "delivered", count: 1}, ...] to
  // { delivered: 1, placed: 2, ...} for easier consumption on the frontend
  const statusBreakdown = ordersByStatus.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalRestaurants,
        totalMenuItems,
        totalOrders,
        totalRevenue: Math.round(totalRevenue * 100) / 100,  // round to 2 decimals
        ordersByStatus: statusBreakdown,
        recentOrders,
      },
      "Dashboard stats fetched"
    )
  );
});

// ============================================================
// LIST ALL USERS (admin view of the user table)
// ============================================================
// GET /api/admin/users
// Query params (all optional):
//   - search   — case-insensitive match on fullname OR email
//   - status   — "all" | "active" | "blacklisted"  (default: "all")
//   - limit    — default 100, max 500
//   - page     — 1-indexed, default 1
//
// Used by: /admin/users page (the UserManagement component) so the
// admin can browse everyone, search, filter by blacklist status, and
// click into Blacklist / Unblacklist.
//
// We don't return passwords (excluded at the schema level too).
// We sort by createdAt DESC so the newest users appear first.
export const listUsers = asyncHandler(async (req, res) => {
  const { search, status, limit, page } = req.query;

  // ----- Build the MongoDB filter -----
  const filter = {};
  if (status === "active") filter.isBlacklisted = false;
  if (status === "blacklisted") filter.isBlacklisted = true;
  if (search && typeof search === "string" && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match against fullname OR email (case-insensitive)
    filter.$or = [
      { fullname: { $regex: escaped, $options: "i" } },
      { email: { $regex: escaped, $options: "i" } },
    ];
  }

  // ----- Pagination -----
  const lim = Math.min(parseInt(limit) || 100, 500);
  const pg = Math.max(parseInt(page) || 1, 1);
  const skip = (pg - 1) * lim;

  // ----- Run count + page in parallel -----
  const [total, docs] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(lim),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        users: docs,
        total,
        page: pg,
        limit: lim,
        totalPages: Math.ceil(total / lim),
      },
      "Users fetched"
    )
  );
});

// ============================================================
// BLACKLIST A USER (suspend their account)
// ============================================================
export const blacklistUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  // ----- Safety: admin can't blacklist themselves -----
  // (would lock them out of the admin panel; they'd need a DB-level fix)
  if (id === req.user._id.toString()) {
    throw new ApiError(
      400,
      "You cannot blacklist yourself. Ask another admin to do it if needed."
    );
  }

  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Idempotent: if already blacklisted, just return success
  if (user.isBlacklisted) {
    return res
      .status(200)
      .json(new ApiResponse(200, user, "User is already blacklisted"));
  }

  user.isBlacklisted = true;
  user.blacklistedAt = new Date();
  user.blacklistedBy = req.user._id;
  user.blacklistReason = (reason || "").slice(0, 500);
  await user.save();

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User blacklisted successfully"));
});

// ============================================================
// UNBLACKLIST A USER (restore their account)
// ============================================================
// POST /api/admin/users/:id/unblacklist
//
// What it does:
//   1. Sets isBlacklisted = false
//   2. Clears blacklistedAt, blacklistedBy, blacklistReason (so the
//      audit trail is preserved as "no longer suspended" rather than
//      retaining the old reason — keeps the history clean)
//
// Idempotent: if already unblacklisted, returns success without DB write.
export const unblacklistUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!user.isBlacklisted) {
    return res
      .status(200)
      .json(new ApiResponse(200, user, "User is already active"));
  }

  user.isBlacklisted = false;
  user.blacklistedAt = null;
  user.blacklistedBy = null;
  user.blacklistReason = "";
  await user.save();

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User unblacklisted successfully"));
});