// controllers/admin.controller.js
// ===============================
// Purpose: Admin dashboard stats — single endpoint that returns
//          all the numbers the dashboard needs in one call.
// ===============================

import Restaurant from "../models/restaurant.model.js";
import MenuItem from "../models/menu.model.js";
import Order from "../models/order.model.js";
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