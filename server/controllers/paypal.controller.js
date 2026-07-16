// controllers/paypal.controller.js
// ===============================
// Purpose: PayPal Orders API v2 integration.
//
// Why we use raw fetch (not @paypal/checkout-server-sdk):
//   - The SDK is deprecated and adds 200KB+ of dependencies
//   - The REST API is simple enough that fetch + a tiny helper is clearer
//   - Zero new dependencies = smaller install, fewer security audits
//
// PayPal flow (server side):
//   1. createPayPalOrder    — POST /v2/checkout/orders, get order ID
//   2. [customer approves in browser via PayPal Smart Buttons]
//   3. capturePayPalOrder   — POST /v2/checkout/orders/{id}/capture, get capture ID
//   4. verifyPayPalPayment  — re-fetch the order to confirm COMPLETED + amount
//   5. handlePayPalWebhook  — async webhook for refunds / disputes
//
// We cache the OAuth access token in `global.paypalTokenCache` so we
// don't request a new one on every call. PayPal tokens are valid for
// ~9 hours, but we refresh every 5 minutes to be safe.
// ===============================

import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";

// ============================================================
// CONFIG
// ============================================================

// PayPal API base URL. "sandbox" is for testing (fake money, test accounts),
// "live" is for production (real money, real accounts).
const PAYPAL_API = process.env.PAYPAL_MODE === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

// Reusable access token cache (singleton across serverless invocations
// in the same container). Same pattern as the Mongoose connection cache.
let tokenCache = global.paypalTokenCache;
if (!tokenCache) {
  tokenCache = global.paypalTokenCache = { token: null, expiresAt: 0 };
}

// ============================================================
// OAUTH: get an access token (cached)
// ============================================================
// PayPal uses HTTP Basic auth (client_id:client_secret base64-encoded)
// for the OAuth token endpoint, then Bearer auth for all subsequent calls.
// We cache the token aggressively — invalidating it is cheap (one HTTP
// call will return a new one if the cached one is rejected).
const getPayPalAccessToken = async () => {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ApiError(
      500,
      "PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in server/.env — get sandbox credentials at https://developer.paypal.com/dashboard/applications/sandbox"
    );
  }

  // Basic auth: base64("client_id:client_secret")
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const err = await response.text();
    throw new ApiError(500, `PayPal OAuth failed: ${err}`);
  }

  const data = await response.json();
  // PayPal tokens last 32400 seconds (9h). We refresh after 5 minutes
  // of inactivity to be safe in serverless where containers can be reused
  // or restarted unpredictably.
  tokenCache.token = data.access_token;
  tokenCache.expiresAt = now + 5 * 60 * 1000; // 5 minutes
  return data.access_token;
};

// ============================================================
// CREATE ORDER
// ============================================================
// POST /api/payments/paypal/create-order
// Body: { amount: number, currency?: string }
//   - amount is in NORMAL currency units (e.g. 18.50, NOT 1850 cents)
//   - PayPal's API uses dollars, unlike Stripe which uses cents.
//     This is the OPPOSITE convention from Stripe — annoying, but we
//     follow PayPal's spec to keep the API call simple.
//   - currency defaults to "USD" (PayPal supports ~25 currencies)
//
// Returns: { orderId: string }
//   The client passes this to PayPal Smart Buttons, which opens
//   the PayPal popup. After the customer approves, PayPal returns
//   to our client with the order ID, and the client calls /capture.
export const createPayPalOrder = asyncHandler(async (req, res) => {
  const { amount, currency = "USD" } = req.body;

  // ----- Input validation (defense in depth — the order controller
  // will also recompute the total from the DB, but validate here too) -----
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "amount must be a positive number (e.g. 18.50 for $18.50)");
  }

  const accessToken = await getPayPalAccessToken();

  // We tag the order with our internal userId in `custom_id` so we
  // can correlate the PayPal order back to our user during reconciliation.
  // (PayPal doesn't know about our users; this is a free-form string field.)
  const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",  // we want to capture funds immediately, not just authorize
      purchase_units: [
        {
          amount: {
            currency_code: currency.toUpperCase(),
            // PayPal requires the value as a string with 2 decimal places.
            // toFixed(2) is critical — "18.5" gets rejected, "18.50" is correct.
            value: amount.toFixed(2),
          },
          custom_id: req.user._id.toString(),  // our internal user ID for reconciliation
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[paypal] createOrder failed:", err);
    throw new ApiError(500, `PayPal create order failed: ${err}`);
  }

  const data = await response.json();
  // Sanity check: PayPal should return a CREATED order
  if (data.status !== "CREATED") {
    throw new ApiError(500, `Unexpected PayPal status: ${data.status}`);
  }

  return res.status(201).json(
    new ApiResponse(201, { orderId: data.id }, "PayPal order created")
  );
});

// ============================================================
// CAPTURE ORDER
// ============================================================
// POST /api/payments/paypal/capture
// Body: { orderId: string }
//
// Called after the customer has approved the payment in the PayPal
// popup. The order moves from "APPROVED" → "COMPLETED" and money is
// moved from the buyer's PayPal account to ours.
//
// Returns: { status, captureId, payerId, amount, currency }
//   - status: "COMPLETED" if everything went well
//   - captureId: PayPal's ID for the capture event (needed for refunds)
//   - payerId: the buyer's PayPal account ID
//   - amount, currency: what was actually charged (for the order controller to verify)
export const capturePayPalOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  if (!orderId || typeof orderId !== "string") {
    throw new ApiError(400, "orderId is required");
  }

  const accessToken = await getPayPalAccessToken();

  const response = await fetch(
    `${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("[paypal] captureOrder failed:", err);
    throw new ApiError(500, `PayPal capture failed: ${err}`);
  }

  const data = await response.json();

  // Status can be COMPLETED, or in rare cases PARTIALLY_REFUNDED, etc.
  // For first-time capture, we expect COMPLETED.
  if (data.status !== "COMPLETED") {
    throw new ApiError(
      402,
      `Payment not completed (PayPal status: ${data.status}). Please complete payment and try again.`
    );
  }

  // Extract the capture details from PayPal's response. The structure is:
  //   purchase_units[0].payments.captures[0] = { id, amount, status, ... }
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture) {
    throw new ApiError(500, "PayPal response missing capture details");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        status: data.status,
        captureId: capture.id,           // save this for refunds
        payerId: data.payer?.payer_id,    // save this for refunds + disputes
        amount: parseFloat(capture.amount.value),
        currency: capture.amount.currency_code,
      },
      "PayPal payment captured"
    )
  );
});

// ============================================================
// VERIFY PAYMENT (used by the order controller)
// ============================================================
// Re-fetches a PayPal order and returns its current state.
// The order controller calls this BEFORE saving an order as "paid"
// — the same defense-in-depth pattern we use for Stripe.
//
// Unlike Stripe, PayPal capture is synchronous: by the time /capture
// returns 200, the money has moved. So this is mostly for the case
// where the user closes the tab and we still need to know if their
// PayPal popup approved the payment.
export const verifyPayPalPayment = async (orderId) => {
  if (!orderId) {
    throw new ApiError(400, "PayPal orderId is required for verification");
  }
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(
    `${PAYPAL_API}/v2/checkout/orders/${orderId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!response.ok) {
    throw new ApiError(500, `PayPal verify failed for order ${orderId}`);
  }
  return response.json();
};

// ============================================================
// WEBHOOK HANDLER
// ============================================================
// PayPal webhooks are POSTed to a URL we register in the PayPal
// dashboard. They tell us about async events: refunds, disputes,
// capture completions, etc.
//
// IMPORTANT: PayPal's webhook verification is different from Stripe's.
// Stripe includes a signature in the headers; PayPal requires you
// to POST the event back to PayPal's verification endpoint and
// they tell you whether it's legitimate.
export const handlePayPalWebhook = asyncHandler(async (req, res) => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.warn("[paypal] PAYPAL_WEBHOOK_ID not set — webhooks disabled");
    return res.status(200).json({ received: true, note: "webhook not configured" });
  }

  const accessToken = await getPayPalAccessToken();

  // Verify the webhook by POSTing the event back to PayPal.
  // https://developer.paypal.com/api/rest/webhooks/event-verification/
  const verifyResponse = await fetch(
    `${PAYPAL_API}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: req.headers["paypal-auth-algo"],
        cert_url: req.headers["paypal-cert-url"],
        transmission_id: req.headers["paypal-transmission-id"],
        transmission_sig: req.headers["paypal-transmission-sig"],
        transmission_time: req.headers["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: req.body,
      }),
    }
  );

  if (!verifyResponse.ok) {
    console.error("[paypal] webhook verification request failed");
    return res.status(400).json({ message: "verification request failed" });
  }

  const verification = await verifyResponse.json();
  if (verification.verification_status !== "SUCCESS") {
    return res.status(400).json({ message: "invalid webhook signature" });
  }

  // Webhook is legitimate. Now process the event.
  const event = req.body;
  console.info(`[paypal] webhook event: ${event.event_type}`);

  switch (event.event_type) {
    case "PAYMENT.CAPTURE.COMPLETED": {
      // A capture succeeded (usually our own /capture call, but
      // could also be a delayed async event)
      const captureId = event.resource?.id;
      console.info(`[paypal] Capture ${captureId} completed`);
      // TODO (production): find the matching Order by captureId and
      // mark it paid if it isn't already (idempotent)
      break;
    }
    case "PAYMENT.CAPTURE.REFUNDED": {
      // Customer was refunded
      const captureId = event.resource?.id;
      console.info(`[paypal] Capture ${captureId} refunded`);
      // TODO (production): find the Order and mark paymentStatus="refunded"
      break;
    }
    case "CUSTOMER.DISPUTE.CREATED": {
      // Customer filed a chargeback / dispute
      console.warn(`[paypal] dispute created for order ${event.resource?.custom_id}`);
      // TODO (production): flag the order for manual review
      break;
    }
    default:
      // We don't care about other event types
      break;
  }

  return res.status(200).json({ received: true });
});
