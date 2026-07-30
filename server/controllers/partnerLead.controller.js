// controllers/partnerLead.controller.js
// ======================================
// Purpose: Handles POST /api/partner/lead — the public
//          lead-capture endpoint for the B2B marketing page
//          at /partner.
//
//          Also handles the admin-side endpoints for reviewing
//          and updating lead status (GET / list, PATCH /:id).
// ======================================

import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import PartnerLead from "../models/partnerLead.model.js";

// ============================================================
// createPartnerLead
// ============================================================
// POST /api/partner/lead
//
// Public, no auth. Stores the lead and returns 201.
// Throttled by the general rate limiter (100 req / 15 min) which
// is plenty for a lead form — if a single IP submits 100 forms
// in 15 minutes, they have a problem, not us.
export const createPartnerLead = asyncHandler(async (req, res) => {
  const { fullname, email, phone, city, capital, background } = req.body || {};

  // ----- Input validation (defense in depth) -----
  // The client also validates, but a curl script or a malicious
  // user could skip it. We re-check the critical fields here.
  if (
    typeof fullname !== "string" ||
    typeof email !== "string" ||
    typeof phone !== "string" ||
    typeof city !== "string" ||
    !fullname.trim() ||
    !email.trim() ||
    !phone.trim() ||
    !city.trim()
  ) {
    throw new ApiError(
      400,
      "Name, email, phone, and city are required"
    );
  }
  // Length caps so a malicious payload can't bloat the DB or
  // trigger expensive downstream work (email sending, etc.).
  if (fullname.length > 100) throw new ApiError(400, "Name is too long");
  if (email.length > 254)   throw new ApiError(400, "Email is too long");
  if (phone.length > 30)    throw new ApiError(400, "Phone is too long");
  if (city.length > 100)    throw new ApiError(400, "City is too long");

  // Validate capital against the enum, but allow empty string
  // (the dropdown is optional, though the client requires it).
  const validCapital = ["lt-10", "10-25", "25-50", "gt-50", ""];
  if (capital !== undefined && !validCapital.includes(capital)) {
    throw new ApiError(400, "Invalid capital range");
  }

  // ----- Create the lead -----
  const lead = await PartnerLead.create({
    fullname: fullname.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    city: city.trim(),
    capital: capital || "",
    background: typeof background === "string" ? background.trim().slice(0, 2000) : "",
    source: "partner-landing",
  });

  // Log so the founder sees incoming leads in the server logs
  // even if they don't have a fancy admin panel yet.
  console.log(
    `[Partner] New lead: ${lead.fullname} <${lead.email}> from ${lead.city} ` +
    `(capital=${lead.capital || "n/a"}, background=${(lead.background || "").length} chars)`
  );

  return res
    .status(201)
    .json(new ApiResponse(201, { id: lead._id }, "Application received"));
});

// ============================================================
// listPartnerLeads
// ============================================================
// GET /api/partner/leads
//
// Admin-only. Returns all leads, most recent first, optionally
// filtered by status. Used by the future /admin/leads page
// (and right now, by the founder running the query in MongoDB
// Compass — but it's nice to have the endpoint).
export const listPartnerLeads = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status && typeof req.query.status === "string") {
    filter.status = req.query.status;
  }
  const leads = await PartnerLead.find(filter)
    .sort({ createdAt: -1 })
    .limit(200);  // cap to prevent huge responses; pagination can be added later
  return res
    .status(200)
    .json(new ApiResponse(200, leads, "Leads fetched"));
});

// ============================================================
// updatePartnerLeadStatus
// ============================================================
// PATCH /api/partner/leads/:id
//
// Admin-only. Update status + notes on a lead. Used when the
// founder follows up with a prospect and wants to mark them as
// "contacted" / "qualified" / etc.
export const updatePartnerLeadStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body || {};
  const validStatuses = ["new", "contacted", "qualified", "rejected", "signed"];
  if (status !== undefined && !validStatuses.includes(status)) {
    throw new ApiError(400, `Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }
  const updates = {};
  if (status !== undefined) updates.status = status;
  if (notes !== undefined)  updates.notes = String(notes).slice(0, 5000);

  const lead = await PartnerLead.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
  if (!lead) throw new ApiError(404, "Lead not found");
  return res
    .status(200)
    .json(new ApiResponse(200, lead, "Lead updated"));
});
