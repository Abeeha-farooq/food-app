// routes/partnerLead.route.js
// ===============================
// Public lead-capture endpoint (POST /api/partner/lead).
// The admin-side endpoints (GET, PATCH) live in admin.route.js
// because they require the same admin auth + role check as the
// rest of the admin panel.
// ===============================

import express from "express";
import { createPartnerLead } from "../controllers/partnerLead.controller.js";

const router = express.Router();

// Public — no auth. The general rate limiter (100 req / 15 min / IP)
// applied at the server level covers spam protection.
router.post("/lead", createPartnerLead);

export default router;
