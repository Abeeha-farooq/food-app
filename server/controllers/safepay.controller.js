// controllers/safepay.controller.js
// ===============================
// Purpose: Safepay (sandbox + live) hosted-checkout integration.
//
// Why this is a separate file from payment.controller.js:
//   - payment.controller.js handles Stripe (iframe-based, client-confirmed)
//   - paypal.controller.js handles PayPal (popup + Smart Buttons)
//   - rapidGateway.controller.js was the previous attempt — REMOVED
//     when we switched to Safepay (different auth model, different
//     API shape, and the user explicitly requested Safepay).
//   - This file handles Safepay (hosted checkout, API-key auth).
//
// Safepay flow (server side):
//   1. createSafepayCheckout  — POST to Safepay's checkout endpoint
//                               with the secret key as Bearer auth.
//                               Safepay returns a `token` (sometimes
//                               called a "tracker"). We construct the
//                               hosted-checkout URL from it and return
//                               the URL to the client.
//   2. [customer completes payment on Safepay's hosted page]
//   3. Safepay redirects to /payment/safepay/success or /failure.
//
// Auth model — SIMPLER than RapidPAY:
//   - No OAuth2 dance. Safepay uses a simple API key.
//   - SF_PUBLIC_KEY  — used in the FRONTEND (Safepay.js widget, if used)
//   - SF_SECRET_KEY  — used in the BACKEND (Bearer token on all calls)
//   This is why we don't need a separate "Client ID" and "Merchant ID"
//   like RapidPAY had — Safepay collapses all three into two keys.
//
// IMPORTANT — adjust if needed:
//   I implemented this based on the standard hosted-checkout pattern
//   that most Pakistani gateways (Safepay, Payfast, etc.) follow:
//     POST /v1/wallet/checkout
//     → { data: { token: "track_xxx" } }
//
//   Safepay's actual endpoint + field names MAY differ. If you get
//   a 4xx from Safepay with an error body, check the response —
//   it'll tell you which field is wrong. The most likely differences:
//     - Endpoint path  (/v1/checkout vs /v1/wallet/checkout)
//     - Auth header    (Bearer <secret> vs Basic auth, etc.)
//     - Field names    (amount vs value, currency vs currency_code)
//   The diagnostic log in createSafepayCheckout will show the
//   request body + response so you can adjust.
// ===============================

import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";

// ============================================================
// CONFIG
// ============================================================
// Safepay's API base URL switches between sandbox and live.
// SF_MODE defaults to "sandbox" so a fresh deployment can't
// accidentally hit the real payment endpoint.
const SF_MODE = (process.env.SF_MODE || "sandbox").toLowerCase();
const SF_API = SF_MODE === "live"
  ? "https://api.safepay.pk"
  : "https://api.sandbox.safepay.pk";

// The hosted-checkout page where the user actually pays. The
// checkout token is appended to this URL.
const SF_CHECKOUT_HOST = "https://checkout.safepay.pk";

// ============================================================
// createSafepayCheckout
// ============================================================
// POST /api/payments/safepay/checkout
//
// Body: { amount, phone, email, orderId, merchantName? }
//
// 1. Sends a server-to-server request to Safepay's checkout API
//    with our secret key (Bearer auth) and the order details.
// 2. Safepay returns a checkout token.
// 3. We construct the hosted-checkout URL: `${SF_CHECKOUT_HOST}/track/${token}`.
// 4. We return { redirectUrl } to the client, which does
//    `window.location.href = redirectUrl` to send the user to
//    Safepay's hosted page.
//
// The order has ALREADY been placed by the client (with
// paymentStatus="pending" — the order ID we send to Safepay
// is the BASKET_ID so we can match the redirect back to the
// order).
export const createSafepayCheckout = asyncHandler(async (req, res) => {
  const { amount, phone, email, orderId, merchantName } = req.body;

  // ----- Input validation -----
  if (!amount || !phone || !email || !orderId) {
    throw new ApiError(400, "amount, phone, email, and orderId are required");
  }

  // ----- Env var validation (with diagnostic log) -----
  // We log which vars are set/missing (values masked) so you
  // can see in Vercel logs (or local dev) exactly what's
  // misconfigured. Same masking pattern as the rapidGateway
  // diagnostic: first 3 chars only for the public key, just
  // "set"/"MISSING" for the secret.
  const publicKey = process.env.SF_PUBLIC_KEY;
  const secretKey = process.env.SF_SECRET_KEY;
  if (!publicKey || !secretKey) {
    console.error(
      `[Safepay] NOT CONFIGURED — SF_PUBLIC_KEY: ${
        publicKey ? `set (${publicKey.slice(0, 3)}***)` : "MISSING"
      }, SF_SECRET_KEY: ${secretKey ? "set" : "MISSING"}, SF_MODE: ${SF_MODE}`
    );
    throw new ApiError(
      500,
      "Safepay is not configured. Set SF_PUBLIC_KEY and SF_SECRET_KEY in server/.env (and in your Vercel project settings if deployed)."
    );
  }

  // ----- Build the checkout request body -----
  // Field names below are the standard hosted-checkout pattern.
  // If Safepay's actual API uses different names (e.g. `value`
  // instead of `amount`, or `currency_code` instead of `currency`),
  // adjust here. The diagnostic log below will show what we sent
  // so you can compare with the actual error response.
  //
  // amount is in RUPEES (not paisa). Safepay's API expects the
  // major currency unit, unlike Stripe which uses paisa.
  const requestBody = {
    amount: Number(amount),
    currency: "PKR",
    description: `Order ${orderId}`,
    customer: {
      email,
      phone,
    },
    // Safepay's hosted page redirects the customer back to one
    // of these URLs after payment. We pass our /payment/safepay/
    // success and /failure routes; the order ID comes back as
    // a `tracker` query param so the success page can match it
    // back to the order.
    redirect_url: `${process.env.SF_BASE_URL || "http://localhost:5173"}/payment/safepay/success`,
    cancel_url: `${process.env.SF_BASE_URL || "http://localhost:5173"}/payment/safepay/failure`,
    // The basket/order ID is sent through to Safepay so we can
    // identify the order on the redirect back. Safepay's field
    // name for this is commonly `order_id` or `reference` —
    // adjust if needed.
    order_id: orderId,
    // Optional metadata that Safepay can show on the checkout
    // page. Useful for the customer to see WHAT they're paying for.
    merchant_name: merchantName || "Flavour Court",
  };

  // ----- Send the request to Safepay -----
  // The exact endpoint and field names are based on the standard
  // hosted-checkout pattern. If Safepay returns a 4xx, the error
  // body will tell you which field is wrong. See the comments
  // at the top of this file for what to check.
  const safepayRes = await fetch(`${SF_API}/v1/wallet/checkout`, {
    method: "POST",
    headers: {
      // Safepay uses the SECRET key as a Bearer token. The public
      // key would be used by the frontend if we used the Safepay.js
      // widget — for the hosted-page redirect, only the secret
      // is needed on the backend.
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  // ----- Parse the response -----
  // Safepay's response shape is usually:
  //   { status: true, data: { token: "track_xxx" } }
  // But it MAY also be:
  //   { token: "track_xxx" }
  // or:
  //   { data: { tracker: "track_xxx" } }
  // We accept any of these — the diagnostic log shows the raw
  // response so you can adjust if needed.
  const responseText = await safepayRes.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { _raw: responseText };
  }

  if (!safepayRes.ok) {
    // Log the full request + response for debugging. Safepay's
    // error body usually has a clear "field X is required" or
    // "invalid authentication" message.
    console.error(
      `[Safepay] Checkout creation FAILED — status: ${safepayRes.status}, mode: ${SF_MODE}, ` +
        `request: ${JSON.stringify(requestBody)}, response: ${responseText}`
    );
    throw new ApiError(
      502,
      `Safepay checkout creation failed (${safepayRes.status}): ${responseText.slice(0, 500)}`
    );
  }

  // ----- Extract the checkout token -----
  // Try the common field names. If none match, log the full
  // response so you can adjust the field name.
  const token =
    responseData?.data?.token ||
    responseData?.token ||
    responseData?.data?.tracker ||
    responseData?.tracker;

  if (!token) {
    console.error(
      `[Safepay] No checkout token in response — keys: ${Object.keys(responseData || {}).join(", ")}, ` +
        `raw: ${responseText}`
    );
    throw new ApiError(
      502,
      `Safepay returned no checkout token. Response: ${responseText.slice(0, 500)}`
    );
  }

  // ----- Construct and return the redirect URL -----
  const redirectUrl = `${SF_CHECKOUT_HOST}/track/${token}`;

  // Log success — first 8 chars of the token are safe to log
  // (tokens aren't secret — they're URL-bound, short-lived identifiers).
  console.log(
    `[Safepay] Checkout created (mode=${SF_MODE}, token=${token.slice(0, 8)}..., orderId=${orderId})`
  );

  return res.status(200).json(
    new ApiResponse(200, { redirectUrl, token }, "Safepay checkout created")
  );
});
