// routes/admin.route.js
// ===============================
// Purpose: Routes accessible only to admin users.
//          Currently houses the dashboard stats endpoint.
//          Will be expanded as we add more admin features.
// ===============================

import express from "express";
import { getDashboardStats } from "../controllers/admin.controller.js";
import { verifyJWT, requireRole } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Every route in this file is admin-only
router.use(verifyJWT, requireRole("admin"));

// GET /api/admin/stats — the main dashboard endpoint
router.get("/stats", getDashboardStats);

export default router;
