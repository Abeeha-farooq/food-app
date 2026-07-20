// routes/coupon.route.js
// ===============================
// Purpose: Mount the coupon endpoints.
//
// Two route files mount the same controller:
//   - /api/coupons/validate        → mounted here, logged-in users
//                                   (the customer needs to validate
//                                   before placing the order)
//   - /api/admin/coupons/*        → mounted in admin.route.js, admin-only
//                                   (list / create / update / delete)
//
// Why split them: the validate endpoint is part of the normal
// checkout flow (called by any logged-in customer), but the CRUD
// endpoints are admin operations. Mounting them in different files
// keeps the auth requirements explicit and the route tables clean.
// ===============================

import express from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validateCoupon } from "../controllers/coupon.controller.js";

const router = express.Router();

// validateCoupon is a logged-in operation (we use the user's
// order history for the per-user usage check). It is NOT
// admin-only — any customer can validate any code at checkout.
router.post("/validate", verifyJWT, validateCoupon);

export default router;
