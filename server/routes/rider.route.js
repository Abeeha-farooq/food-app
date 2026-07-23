// routes/rider.route.js
// ===============================
// Purpose: Routes specific to delivery riders — primarily the
//          live-location endpoints.
//
// All routes require a logged-in user; specific routes further
// restrict to rider / admin / order-owner roles.
// ===============================

import express from "express";
import { verifyJWT, requireRole } from "../middlewares/auth.middleware.js";
import {
  updateRiderLocation,
  getRiderLocation,
} from "../controllers/rider.controller.js";
import { getRiderEarnings } from "../controllers/earnings.controller.js";

const router = express.Router();

// Every rider route requires login
router.use(verifyJWT);

// POST /api/rider/location — rider reports their GPS position.
// Mounted on the rider router (not the order router) because
// it's a rider action, not an order action. Body:
//   { lat: number, lng: number, orderId: string }
router.post("/location", requireRole("rider"), updateRiderLocation);

// GET /api/rider/earnings — list + summary of this rider's earnings.
// Used by the rider dashboard's "Earnings" page.
router.get("/earnings", requireRole("rider"), getRiderEarnings);

// GET /api/orders/:id/rider-location — fetch the current rider
// location for an order. Lives on the order router (existing
// /api/orders/* surface) so the URL hierarchy makes sense
// to client code that already knows the order id. We mount
// it there in server.js / index.js — see the comment below.
//
// The handler itself is in this file because the logic is
// closely related to updateRiderLocation. We re-export it
// below for the order router to use.
export { getRiderLocation };

export default router;
