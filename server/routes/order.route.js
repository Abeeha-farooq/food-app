// routes/order.route.js
import express from "express";
import {
  placeOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  updateOrderPayment,
  submitReview,
  assignRider,
  acceptOrder,
  rejectOrder,
  getRiderOrders,
  riderAcceptOrder,
} from "../controllers/order.controller.js";
import { getRiderLocation } from "./rider.route.js";
import { verifyJWT, requireRole } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Every order route requires login
router.use(verifyJWT);

router.post("/", placeOrder);
router.get("/my", getMyOrders);

// Real-time rider location for the customer's "Track order" map.
// Mounted under /orders/:id/rider-location (not /rider/.../location)
// because the URL hierarchy matches what the client code already
// knows — the order id. The handler itself is in rider.controller.js
// (closely related to updateRiderLocation). Auth: customer who
// placed the order, the assigned rider, or an admin.
router.get("/:id/rider-location", getRiderLocation);
router.get("/:id", getOrderById);

// ============================================================
// RIDER ROUTES
// ============================================================
// GET /rider/me — list the current rider's assigned orders.
// We mount this BEFORE the "/:id" route so the literal "rider/me"
// path is matched first (otherwise Express would treat "rider" as
// an order id and 404).
router.get("/rider/me", requireRole("rider"), getRiderOrders);

// Rider-only status transitions + the dedicated accept endpoint.
// Riders can only update their own orders to "out_for_delivery"
// or "delivered" (enforced in the controller).
router.patch("/:id/rider-accept", requireRole("rider"), riderAcceptOrder);
router.patch("/:id/status",        requireRole("admin", "restaurant_owner", "rider"), updateOrderStatus);

// Submit a review for a delivered order.
// Any logged-in user can hit this — the controller enforces that the order
// belongs to the caller and is in "delivered" status. We mount this BEFORE
// the admin-only PATCH routes so the path is matched correctly.
router.patch("/:id/review", submitReview);

// Admin-only routes
router.get("/", requireRole("admin"), getAllOrders);
router.patch("/:id/payment", requireRole("admin", "restaurant_owner"), updateOrderPayment);

// Accept / reject the initial order (admin-only).
//   POST /:id/accept  — transitions "placed" → "confirmed"
//   POST /:id/reject  — transitions "placed" → "cancelled"
// Only valid from "placed" — see the controllers for the full rules.
// After accept, the admin can assign a rider via PATCH /:id/rider.
router.post("/:id/accept", requireRole("admin"), acceptOrder);
router.post("/:id/reject", requireRole("admin"), rejectOrder);

// Assign / unassign a rider to an order.
// Admin-only — restaurant owners don't manage delivery staffing.
// Only valid in the post-accept flow (status = confirmed or later).
// Body: { riderId: string | null }
router.patch("/:id/rider", requireRole("admin"), assignRider);

export default router;
