// routes/payment.route.js
// ===============================
// Purpose: Stripe payment endpoints.
//
//   POST /api/payments/create-intent  →  create a PaymentIntent, return clientSecret
//   GET  /api/payments/:id/status     →  (admin) check a PaymentIntent's status
//   POST /api/payments/webhook        →  Stripe webhook receiver (raw body, public)
//
// Mounting notes:
//   - create-intent requires login (we tag the intent with userId).
//   - webhook is PUBLIC (Stripe calls it) and needs the RAW request body
//     for signature verification. The webhook route is mounted in
//     server.js BEFORE the json() middleware (so the body is still raw
//     when it arrives here).
// ===============================

import express from "express";
import { createPaymentIntent, handleStripeWebhook, verifyPayment } from "../controllers/payment.controller.js";
import { verifyJWT, requireRole } from "../middlewares/auth.middleware.js";
import ApiResponse from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = express.Router();

// Create a PaymentIntent. Called from the client when the user clicks
// "Pay with card". Returns the clientSecret used to confirm payment.
router.post("/create-intent", verifyJWT, createPaymentIntent);

// Get a PaymentIntent's current status (server-side verification only).
// Used by the order controller — NOT exposed to the browser.
router.get("/:id/status", verifyJWT, requireRole("admin"), asyncHandler(async (req, res) => {
  const intent = await verifyPayment(req.params.id);
  return res.status(200).json(new ApiResponse(200, {
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
  }, "PaymentIntent status"));
}));

// Stripe webhook. Mounted separately in server.js with express.raw()
// because Stripe's signature verification needs the raw bytes.
router.post("/webhook", handleStripeWebhook);

export default router;
