// controllers/payment.controller.js
// ===============================
// Purpose: Stripe payment integration.
//
// What this controller does:
//   1. createPaymentIntent — given an amount, ask Stripe to create a
//      PaymentIntent. Stripe returns a `clientSecret` that the browser
//      will use to confirm the payment. We send that secret back to
//      the client.
//   2. verifyPayment — given a PaymentIntent ID, ask Stripe for its
//      current status. Used by the order controller BEFORE saving an
//      order as "paid" — never trust the client to tell us payment
//      succeeded; re-check with Stripe.
//   3. webhook — Stripe sends us events (payment succeeded, failed,
//      refunded). This is the canonical way to update orders in
//      production. We verify the webhook signature so we can trust it.
//
// Why PaymentIntent (not Charges):
//   - PaymentIntent is Stripe's modern object model (post-2018). It
//     supports SCA / 3D-Secure automatically, idempotency, and partial
//     captures — the older Charges API doesn't.
//   - The client confirms the intent from the browser; the server only
//     creates it. This means the card never touches our server.
// ===============================

import Stripe from "stripe";
import "dotenv/config";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// ============================================================
// STRIPE CLIENT (singleton)
// ============================================================
// We initialize once and reuse. The API version pin is important —
// it locks our code to a specific Stripe API surface so a future
// Stripe update can't break us silently.
//
// `apiVersion: "2024-06-20"` is the latest stable version as of this
// writing. Stripe SDK requires you to set this explicitly.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_PLACEHOLDER", {
  apiVersion: "2024-06-20",
});

// Guard helper: fail loud at request-time if the key is missing.
// We don't crash at import-time (some routes like /api/restaurants
// don't need Stripe and should work even without it).
const requireStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new ApiError(
      500,
      "Stripe is not configured. Set STRIPE_SECRET_KEY in server/.env — get a test key at https://dashboard.stripe.com/test/apikeys"
    );
  }
};

// ============================================================
// POST /api/payments/create-intent
// ============================================================
// Body: { amount: number, currency?: string }
//   - amount is in the SMALLEST currency unit (paisa for PKR, cents
//     for USD). Rs. 1850 = 185000 paisa. This avoids floating-point
//     errors.
//   - currency defaults to "pkr" (Pakistani Rupee, your locale).
//
// Returns: { clientSecret, paymentIntentId }
//
// The client uses `clientSecret` with stripe.confirmPayment() on the
// browser side. We never send the PaymentIntent to the client — only
// the secret that authorizes one confirm attempt.
export const createPaymentIntent = asyncHandler(async (req, res) => {
  requireStripe();
  const { amount, currency = "pkr" } = req.body;

  // ----- Input validation -----
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 100) {
    throw new ApiError(400, "amount must be a number >= 100 (smallest currency unit, e.g. paisa)");
  }

  // The PaymentIntent is the "slot" where one payment lives. Creating
  // it does NOT charge the card — that happens when the client calls
  // stripe.confirmPayment() with the clientSecret.
  //
  // We pass `automatic_payment_methods.enabled: true` so Stripe picks
  // the best set of methods (card, Apple Pay, Google Pay, etc.) based
  // on the user's device. Modern best practice — saves us from
  // hardcoding a method list.
  //
  // `metadata` is how we tag Stripe objects with our internal IDs so
  // we can correlate later. Useful for refunds and support tickets.
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(amount),
    currency: currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: {
      // We don't have the order ID yet at this point (payment comes
      // BEFORE order creation in our flow). We'll update the metadata
      // after the order is created.
      userId: req.user._id.toString(),
    },
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
      },
      "PaymentIntent created"
    )
  );
});

// ============================================================
// GET /api/payments/:id/status
// ============================================================
// Returns the current status of a PaymentIntent. The order controller
// calls this to verify a payment succeeded before saving the order.
//
// We don't expose this to the browser — only the server uses it to
// verify (and we use the webhook for real-time updates).
export const verifyPayment = async (paymentIntentId) => {
  requireStripe();
  if (!paymentIntentId) {
    throw new ApiError(400, "paymentIntentId is required");
  }
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return intent;
};

// ============================================================
// POST /api/payments/webhook
// ============================================================
// Stripe sends us events here. We verify the signature (so attackers
// can't forge events) then update the order status accordingly.
//
// In dev (no public URL), the webhook is hard to test. The flow still
// works for the order creation step (we verify directly via
// verifyPayment) — webhooks just keep things in sync for refunds,
// disputes, async payment methods (like bank transfers), etc.
//
// CRITICAL: this route needs the RAW request body (not parsed JSON)
// to verify the signature. Express's json() middleware parses JSON
// for us elsewhere, but here we need to read the raw stream. We mount
// this route in server.js with express.raw() before app.use(json()).
export const handleStripeWebhook = asyncHandler(async (req, res) => {
  requireStripe();
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // Webhook secret is optional in dev (where we don't have a public
    // URL to register a webhook with). In production, this MUST be set.
    console.warn("[STRIPE] STRIPE_WEBHOOK_SECRET not set — webhooks disabled");
    return res.status(200).json({ received: true, note: "webhook secret not configured" });
  }

  let event;
  try {
    // stripe.webhooks.constructEvent verifies the signature using the
    // raw body. If it fails (tampered or wrong secret), it throws.
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    throw new ApiError(400, `Webhook signature verification failed: ${err.message}`);
  }

  // Handle the specific events we care about
  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object;
      console.info(`[STRIPE] PaymentIntent ${intent.id} succeeded (${intent.amount} ${intent.currency})`);
      // TODO (production): update the matching Order in our DB to paymentStatus="paid"
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      console.warn(`[STRIPE] PaymentIntent ${intent.id} failed: ${intent.last_payment_error?.message}`);
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      console.info(`[STRIPE] Charge ${charge.id} refunded`);
      // TODO (production): update the matching Order to paymentStatus="refunded"
      break;
    }
    default:
      // We don't care about other event types
      break;
  }

  // Stripe requires a 200 response to consider the webhook delivered
  return res.status(200).json({ received: true });
});

export { stripe };
