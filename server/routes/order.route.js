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
} from "../controllers/order.controller.js";
import { verifyJWT, requireRole } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Every order route requires login
router.use(verifyJWT);

router.post("/", placeOrder);
router.get("/my", getMyOrders);
router.get("/:id", getOrderById);

// Submit a review for a delivered order.
// Any logged-in user can hit this — the controller enforces that the order
// belongs to the caller and is in "delivered" status. We mount this BEFORE
// the admin-only PATCH routes so the path is matched correctly.
router.patch("/:id/review", submitReview);

// Admin-only routes
router.get("/", requireRole("admin"), getAllOrders);
router.patch("/:id/status",   requireRole("admin", "restaurant_owner"), updateOrderStatus);
router.patch("/:id/payment", requireRole("admin", "restaurant_owner"), updateOrderPayment);

// Assign / unassign a rider to an order.
// Admin-only — restaurant owners don't manage delivery staffing.
// Body: { riderId: string | null }
router.patch("/:id/rider", requireRole("admin"), assignRider);

export default router;
