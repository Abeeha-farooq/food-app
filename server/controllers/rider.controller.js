// controllers/rider.controller.js
// ===============================
// Purpose: Endpoints specific to delivery riders — primarily
//          the live-location reporting that powers the
//          "Track your order" map on the customer side and the
//          "distance to pickup / drop-off" indicators on the
//          rider side.
// ===============================

import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import Order from "../models/order.model.js";

// ============================================================
// POST /api/rider/location
// ============================================================
// The rider's browser sends their current GPS position
// every ~15 seconds while on an active delivery.
//
// Body: { lat: number, lng: number, orderId: string }
//
// Auth: rider only.
//
// Validation:
//   - lat / lng must be valid numbers in the standard ranges
//   - The order must be assigned to THIS rider
//   - The order must be in a "live delivery" state (confirmed,
//     preparing, or out_for_delivery) — we never store a rider's
//     location when they don't have an active order (privacy)
//
// We update Order.riderLocation (lat, lng, updatedAt) atomically.
// We return the fresh order so the rider UI can update the
// "distance to drop-off" indicator without an extra round-trip.
export const updateRiderLocation = asyncHandler(async (req, res) => {
  if (req.user.role !== "rider") {
    throw new ApiError(403, "Only riders can update their location");
  }

  const { lat, lng, orderId } = req.body;

  // ----- Input validation -----
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new ApiError(400, "lat / lng must be valid numbers in the standard ranges");
  }
  if (!orderId || typeof orderId !== "string") {
    throw new ApiError(400, "orderId is required");
  }

  // ----- Look up the order + verify ownership -----
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, "Order not found");

  if (!order.rider || order.rider.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "This order is not assigned to you");
  }

  // Only accept location updates during an active delivery window.
  // Once the order is delivered or cancelled, the rider shouldn't
  // be reporting location anymore (privacy + battery).
  const liveStates = ["confirmed", "preparing", "out_for_delivery"];
  if (!liveStates.includes(order.status)) {
    throw new ApiError(
      400,
      `Cannot report location for an order with status "${order.status}"`
    );
  }

  // ----- Persist the location -----
  // We use findOneAndUpdate (bypasses pre-save hooks, but the
  // riderLocation subdoc has none). We return the updated order
  // so the client can update derived state (e.g. distance to
  // customer) without a second round-trip.
  const updated = await Order.findByIdAndUpdate(
    orderId,
    {
      $set: {
        "riderLocation.lat": lat,
        "riderLocation.lng": lng,
        "riderLocation.updatedAt": new Date(),
      },
    },
    { new: true }
  )
    .populate("restaurant", "name city address")
    .populate("user", "fullname contact");

  return res.status(200).json(
    new ApiResponse(200, updated, "Rider location updated")
  );
});

// ============================================================
// GET /api/orders/:id/rider-location
// ============================================================
// Fetches the current rider location for an order. Used by the
// customer's "Track your order" map.
//
// Auth:
//   - The customer who placed the order, OR
//   - An admin (for support / debugging), OR
//   - The rider themselves (so the rider can see what data is
//     being shared)
//
// Returns the order's riderLocation subdoc (lat, lng, updatedAt)
// plus the restaurant + customer address coords if known, so
// the client can render the map without making a second call.
export const getRiderLocation = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("restaurant", "name city address")
    .populate("user", "fullname contact");
  if (!order) throw new ApiError(404, "Order not found");

  const isCustomer =
    order.user &&
    order.user._id &&
    order.user._id.toString() === req.user._id.toString();
  const isRider =
    order.rider && order.rider.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin";

  if (!isCustomer && !isRider && !isAdmin) {
    throw new ApiError(403, "You don't have access to this order's tracking");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        // Rider's current position (null if not yet reported)
        riderLocation: order.riderLocation || null,
        // Restaurant / pickup location
        restaurant: order.restaurant || null,
        // Customer's delivery address (we don't store lat/lng for
        // it — the client can geocode on demand if needed)
        deliveryAddress: order.deliveryAddress,
        // Order status — used by the client to know whether to
        // show the map at all
        status: order.status,
      },
      "Rider location fetched"
    )
  );
});
