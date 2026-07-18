// routes/admin.route.js
// ===============================
// Purpose: Routes accessible only to admin users.
//          Houses the dashboard stats + user management endpoints
//          (blacklist / unblacklist).
// ===============================

import express from "express";
import {
  getDashboardStats,
  listUsers,
  blacklistUser,
  unblacklistUser,
} from "../controllers/admin.controller.js";
import { verifyJWT, requireRole } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Every route in this file is admin-only
router.use(verifyJWT, requireRole("admin"));

// GET /api/admin/stats — the main dashboard endpoint
router.get("/stats", getDashboardStats);

// ----- User management (list + blacklist) -----
// GET  /api/admin/users?search=&status=&page=&limit=
//   — list users with optional search/filter/pagination
// POST /api/admin/users/:id/blacklist
//   — body: { reason?: string } — suspend a user
// POST /api/admin/users/:id/unblacklist
//   — restore a suspended user (no body)
router.get("/users", listUsers);
router.post("/users/:id/blacklist", blacklistUser);
router.post("/users/:id/unblacklist", unblacklistUser);

export default router;
