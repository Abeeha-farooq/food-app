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
  const { search, status, role, isApproved, limit, page } = req.query;

  // ----- Build the MongoDB filter -----
  // The same endpoint serves three admin views:
  //   - All users (no role)        — the user-management page
  //   - Riders only (role=rider)   — the rider-approval tab
  //   - Any single role            — for future filters
  // The status filter keeps its old meaning: "active" / "blacklisted".
  // The isApproved filter is specifically for the rider view: pass
  // isApproved=false to see pending-approval riders only.
  const filter = {};
  if (status === "active") filter.isBlacklisted = false;
  if (status === "blacklisted") filter.isBlacklisted = true;
  if (role && typeof role === "string" && role.trim()) {
    filter.role = role.trim();
  }
  if (isApproved === "true") filter.isApproved = true;
  if (isApproved === "false") filter.isApproved = false;
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

// ============================================================
// RIDER MANAGEMENT
// ============================================================
// Riders are just User documents with role="rider". The signup flow
// creates them with isApproved=false, so the admin needs to actively
// approve before they can log in / be assigned to orders.
//
// These endpoints let the admin:
//   - approveRider  — flip isApproved to true
//   - rejectRider   — flip isApproved to false (admin can re-approve later)
//   - listAvailableRiders — show approved, non-blacklisted riders for
//     the order-assignment dropdown, sorted by "fewest active deliveries"
//     so the first one is the auto-suggestion.

// POST /api/admin/riders/:id/approve
// Approves a pending rider. Idempotent — if already approved, returns
// the user with a "already approved" message (no DB write).
export const approveRider = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Safety: only act on actual riders. If an admin hits this endpoint
  // with a regular user's ID, surface a clear error rather than
  // silently flipping a non-rider's isApproved (which is a no-op
  // anyway, but the error is more helpful for debugging).
  if (user.role !== "rider") {
    throw new ApiError(400, "This user is not a rider");
  }

  if (user.isApproved) {
    return res
      .status(200)
      .json(new ApiResponse(200, user, "Rider is already approved"));
  }

  user.isApproved = true;
  await user.save();

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Rider approved successfully"));
});

// POST /api/admin/riders/:id/reject
// Revokes a rider's approval. Useful when admin made a mistake or
// the rider is no longer eligible. After this, the rider is blocked
// from logging in (login + verifyJWT both check isApproved).
// Idempotent — if already not approved, returns success without DB write.
export const rejectRider = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.role !== "rider") {
    throw new ApiError(400, "This user is not a rider");
  }

  if (!user.isApproved) {
    return res
      .status(200)
      .json(new ApiResponse(200, user, "Rider is already not approved"));
  }

  user.isApproved = false;
  await user.save();

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Rider approval revoked"));
});

// GET /api/admin/riders/available
// Returns the list of approved, non-blacklisted riders for the order
// assignment dropdown. We sort by "active delivery count" ascending
// so the FIRST rider in the list is the auto-suggestion (the one with
// the fewest in-progress orders).
//
// "Active" = orders in statuses that imply the rider is still working
// on them: placed / confirmed / preparing / out_for_delivery.
// Delivered + cancelled do NOT count — those are done.
export const listAvailableRiders = asyncHandler(async (req, res) => {
  // 1. Fetch the candidate pool: approved, non-blacklisted, role=rider.
  //    We exclude the soft-deleted / blacklisted ones so the admin
  //    can't accidentally assign an unavailable rider.
  const riders = await User.find({
    role: "rider",
    isApproved: true,
    isBlacklisted: false,
  })
    .select("fullname email contact isApproved createdAt")
    .sort({ createdAt: 1 }); // tiebreaker so the list is stable

  if (riders.length === 0) {
    return res
      .status(200)
      .json(new ApiResponse(200, { riders: [], suggestedId: null }, "No riders available"));
  }

  // 2. Count active deliveries per rider in ONE query. We group by
  //    `rider` and filter on the active status set in the same
  //    pipeline so we don't pull every order to the app.
  const activeStatuses = ["placed", "confirmed", "preparing", "out_for_delivery"];
  const counts = await Order.aggregate([
    { $match: { rider: { $in: riders.map((r) => r._id) }, status: { $in: activeStatuses } } },
    { $group: { _id: "$rider", count: { $sum: 1 } } },
  ]);
  const countByRider = Object.fromEntries(counts.map((c) => [c._id.toString(), c.count]));

  // 3. Decorate + sort. The first item after sorting is the suggestion.
  const decorated = riders.map((r) => ({
    ...r.toObject(),
    activeDeliveries: countByRider[r._id.toString()] || 0,
  }));
  decorated.sort((a, b) => a.activeDeliveries - b.activeDeliveries);

  // Tiebreaker: alphabetical by fullname. Keeps the suggestion stable
  // when several riders have the same active count.
  // (The pre-sort by createdAt above doesn't carry through because
  // Array.sort isn't guaranteed stable across all engines — we
  // re-apply the secondary sort explicitly.)
  decorated.sort((a, b) => {
    if (a.activeDeliveries !== b.activeDeliveries) {
      return a.activeDeliveries - b.activeDeliveries;
    }
    return a.fullname.localeCompare(b.fullname);
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        riders: decorated,
        suggestedId: decorated[0]?._id?.toString() || null,
      },
      "Available riders fetched"
    )
  );
});