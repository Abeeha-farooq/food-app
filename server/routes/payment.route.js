// routes/payment.route.js
// ===============================
// Purpose: Payment processor endpoints.
//
//   Stripe:
//     POST /api/payments/create-intent            →  create a PaymentIntent, return clientSecret
//     GET  /api/payments/:id/status               →  (admin) check a PaymentIntent's status
//     POST /api/payments/webhook                  →  Stripe webhook receiver (raw body, public)
//
//   PayPal:
//     POST /api/payments/paypal/create-order      →  create a PayPal order, return orderId
//     POST /api/payments/paypal/capture           →  capture a PayPal order after approval
//     POST /api/payments/paypal/webhook           →  PayPal webhook receiver (raw body, public)
//
//   Safepay (replaces the previous RapidPAY integration — see git
//   history if you need to roll back):
//     POST /api/payments/safepay/checkout         →  create a hosted-checkout session,
//                                                    return the gateway's redirect URL
//
// Mounting notes:
//   - create-intent / create-order / safepay require login (we tag with userId).
//   - webhooks are PUBLIC (the processor calls them) and need the RAW
//     request body for signature verification. Webhook routes are
//     mounted in server.js BEFORE the json() middleware.
// ===============================

import express from "express";
import {
  createPaymentIntent,
  handleStripeWebhook,
  verifyPayment,
} from "../controllers/payment.controller.js";
import {
  createPayPalOrder,
  capturePayPalOrder,
  handlePayPalWebhook,
} from "../controllers/paypal.controller.js";
import { createSafepayCheckout } from "../controllers/safepay.controller.js";
import { verifyJWT, requireRole } from "../middlewares/auth.middleware.js";
import ApiResponse from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = express.Router();

// ============================================================
// STRIPE
// ============================================================

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

// ============================================================
// PAYPAL
// ============================================================

// Create a PayPal order. Called from the client when the user clicks
// "Pay with PayPal". Returns the PayPal order ID for the Smart Buttons.
router.post("/paypal/create-order", verifyJWT, createPayPalOrder);

// Capture a PayPal order AFTER the customer has approved it in the
// PayPal popup. The order moves from APPROVED → COMPLETED and money
// is moved to our account. Returns the capture ID for storage.
router.post("/paypal/capture", verifyJWT, capturePayPalOrder);

// PayPal webhook. Mounted separately in server.js with express.raw()
// because PayPal's signature verification also reads the raw body.
router.post("/paypal/webhook", handlePayPalWebhook);

// ============================================================
// SAFEPAY
// ============================================================

// Create a Safepay hosted-checkout session. Called from the client
// AFTER the order has been placed (with paymentStatus: "pending").
// Returns the gateway's redirect URL — the client does
// `window.location.href = redirectUrl` to send the customer to the
// gateway's own checkout page. After payment, the gateway redirects
// the customer to /payment/safepay/success or /failure.
router.post("/safepay/checkout", verifyJWT, createSafepayCheckout);

export default router;
