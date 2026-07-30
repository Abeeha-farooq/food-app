// models/partnerLead.model.js
// ===============================
// Purpose: Stores applications from the B2B landing page at
// /partner. The founder reviews these manually (via the admin
// panel or directly in MongoDB Compass) and follows up via
// WhatsApp/email within 2 business days.
//
// NOT linked to the User model — leads are public, no login
// required to submit, and we don't want spam signups polluting
// the user table.
// ===============================

import mongoose from "mongoose";

const partnerLeadSchema = new mongoose.Schema(
  {
    fullname: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      // Light validation — we trust the user's input enough to store
      // it. The real check happens when we email them and they
      // reply. Server-side full validation is overkill for a
      // marketing lead-capture form.
      maxlength: 254,
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
      maxlength: 30,
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
      maxlength: 100,
    },
    // Which investment tier they self-identified with
    capital: {
      type: String,
      enum: ["lt-10", "10-25", "25-50", "gt-50", ""],
      default: "",
    },
    // Free-text "tell us about yourself" — usually 1-3 sentences.
    background: {
      type: String,
      maxlength: 2000,
      default: "",
    },
    // ----- Lead pipeline state -----
    // We could add a CRM later; for now a simple status + notes
    // is enough. The admin will use MongoDB Compass (or a future
    // /admin/leads page) to update these.
    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "rejected", "signed"],
      default: "new",
      index: true,   // indexed so the admin's "new leads" filter is fast
    },
    notes: {
      type: String,
      maxlength: 5000,
      default: "",
    },
    // Source = where the lead came from. We hardcode "partner-landing"
    // for this form, but the field exists so future lead sources
    // (Facebook ads, referrals) can be tracked separately without
    // a schema change.
    source: {
      type: String,
      default: "partner-landing",
      maxlength: 50,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index on (status, createdAt) — supports the admin's
// "show me all new leads, most recent first" view in one query.
partnerLeadSchema.index({ status: 1, createdAt: -1 });

const PartnerLead = mongoose.model("PartnerLead", partnerLeadSchema);

export default PartnerLead;
