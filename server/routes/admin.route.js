// routes/admin.route.js
// ===============================
// Purpose: Routes accessible only to admin users.
//          Houses the dashboard stats + user management endpoints
//          (blacklist / unblacklist) + rider management endpoints
//          (approve / reject / list available).
// ===============================

import express from "express";
import {
  getDashboardStats,
  listUsers,
  blacklistUser,
  unblacklistUser,
  approveRider,
  rejectRider,
  listAvailableRiders,
} from "../controllers/admin.controller.js";
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
// POST /api/admin/riders/:id/approve   — flip isApproved to true
// POST /api/admin/riders/:id/reject    — flip isApproved to false
// GET  /api/admin/riders/available     — list approved + non-blacklisted
//                                         riders, sorted by fewest active
//                                         deliveries (first = suggestion)
//
// The `/available` route is mounted BEFORE the `/:id/...` routes so
// "available" isn't interpreted as a user ID. Express matches in
// declaration order, and the literal-segment match wins.
router.get("/riders/available", listAvailableRiders);
router.post("/riders/:id/approve", approveRider);
router.post("/riders/:id/reject", rejectRider);

export default router;
