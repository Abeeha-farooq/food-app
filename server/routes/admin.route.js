// routes/admin.route.js
// ===============================
// Purpose: Routes accessible only to admin users.
//          Houses the dashboard stats + user management endpoints
//          (blacklist / unblacklist) + rider management endpoints
//          (approve / reject / list available) + coupon CRUD.
// ===============================

import express from "express";
import {
  getDashboardStats,
  listUsers,
  blacklistUser,
  unblacklistUser,
  createRider,
  approveRider,
  rejectRider,
  listAvailableRiders,
} from "../controllers/admin.controller.js";
import {
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from "../controllers/coupon.controller.js";
import {
  getAllEarnings,
  markEarningPaid,
  cancelEarning,
} from "../controllers/earnings.controller.js";
import { verifyJWT, requireRole } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Every route in this file is admin-only
router.use(verifyJWT, requireRole("admin"));

// GET /api/admin/stats — the main dashboard endpoint
router.get("/stats", getDashboardStats);

// ----- User management (list + blacklist) -----
// GET  /api/admin/users?search=&status=&role=&isApproved=&page=&limit=
//   — list users with optional search/filter/pagination
//   — `role=rider` shows only riders; `isApproved=false` shows pending
// POST /api/admin/users/:id/blacklist
//   — body: { reason?: string } — suspend a user
// POST /api/admin/users/:id/unblacklist
//   — restore a suspended user (no body)
router.get("/users", listUsers);
router.post("/users/:id/blacklist", blacklistUser);
router.post("/users/:id/unblacklist", unblacklistUser);

// ----- Rider management -----
// POST /api/admin/riders              — create a new rider directly
//                                        (bypasses public signup + OTP;
//                                        rider is created already-approved)
// GET  /api/admin/riders/available    — list approved + non-blacklisted
//                                        riders, sorted by fewest active
//                                        deliveries (first = suggestion)
// POST /api/admin/riders/:id/approve  — flip isApproved to true
// POST /api/admin/riders/:id/reject   — flip isApproved to false
//
// The literal-segment routes (`/riders` POST for create, and
// `/riders/available` GET) are mounted BEFORE the `/:id/...` routes so
// they aren't interpreted as a user ID. Express matches in declaration
// order, and literal segments always win over parameters.
router.post("/riders", createRider);
router.get("/riders/available", listAvailableRiders);
router.post("/riders/:id/approve", approveRider);
router.post("/riders/:id/reject", rejectRider);

// ----- Coupon management (CRUD) -----
// GET    /api/admin/coupons          — list all coupons (newest first)
// POST   /api/admin/coupons          — create a new coupon
// PATCH  /api/admin/coupons/:id      — edit a coupon (toggle active,
//                                       extend expiry, bump usage
//                                       limit, etc.)
// DELETE /api/admin/coupons/:id      — hard delete a coupon
//
// The /:id routes are mounted AFTER the literal "/coupons" path
// in client code, but Express uses declaration order so this
// doesn't matter for this specific case (we have no "/coupons"
// literal under /api/admin).
router.get("/coupons", listCoupons);
router.post("/coupons", createCoupon);
router.patch("/coupons/:id", updateCoupon);
router.delete("/coupons/:id", deleteCoupon);

// ----- Earnings / payout management -----
// GET    /api/admin/earnings          — all earnings (across riders)
//                                       + per-rider rollup for the dashboard
// PATCH  /api/admin/earnings/:id/pay  — mark a single earning as paid
//                                       (body: { method?, note? })
// PATCH  /api/admin/earnings/:id/cancel — cancel an unpaid earning
//                                       (body: { note? })
//
// The /:id/pay + /:id/cancel literals are mounted BEFORE the
// /:id parameter route (if we ever add one) so they don't get
// interpreted as action verbs. For now there's no bare /:id on
// this router, so ordering doesn't strictly matter — but it's a
// good habit to keep the literal-action routes first.
router.get("/earnings", getAllEarnings);
router.patch("/earnings/:id/pay", markEarningPaid);
router.patch("/earnings/:id/cancel", cancelEarning);

export default router;
