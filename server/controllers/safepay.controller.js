// controllers/safepay.controller.js
// ===============================
// Purpose: Safepay (sandbox + live) hosted-checkout integration.
//
// Why this is a separate file from payment.controller.js:
//   - payment.controller.js handles Stripe (iframe-based, client-confirmed)
//   - paypal.controller.js handles PayPal (popup + Smart Buttons)
//   - This file handles Safepay (hosted checkout, API-key auth).
//
// Safepay flow (server side):
//   1. createSafepayCheckout  — POST /order/payments/v3/ to Safepay with
//                               the secret key in the x-sfpy-merchant-secret
//                               header. Safepay returns a "tracker" object
//                               containing a token. We construct the
//                               hosted-checkout URL from the token and
//                               return it to the client.
//   2. [customer completes payment on Safepay's hosted page]
//   3. Safepay redirects to /payment/safepay/success or /failure.
//
// The values below were confirmed by reading the @sfpy/node-core
// SDK source code (the official Safepay Node.js library) on npm:
//   https://www.npmjs.com/package/@sfpy/node-core
//   https://unpkg.com/@sfpy/node-core@0.3.5/
//
// Key facts (all from the SDK source):
//   - Auth header is `x-sfpy-merchant-secret: <secret_key>` — NOT Bearer
//   - Endpoint is `POST /order/payments/v3/`
//   - Request body needs: merchant_api_key, intent, mode, currency, amount
//   - amount is in PAISA (multiply rupees by 100) — e.g. Rs. 6000 → 600000
//   - Response shape: { data: { tracker: { token: "..." } } }
//   - Sandbox host: https://sandbox.api.getsafepay.com
//   - Live host:     https://api.getsafepay.com
// ===============================

import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";

// ============================================================
// CONFIG
// ============================================================
const SF_MODE = (process.env.SF_MODE || "sandbox").toLowerCase();
const SF_API = SF_MODE === "live"
  ? "https://api.getsafepay.com"
  : "https://sandbox.api.getsafepay.com";

// The endpoint path for creating a payment session. This is the
// "checkout creation" endpoint in Safepay's API. The path was
// verified from the @sfpy/node-core SDK source —
// `basePath: "/order"` + `path: "/payments/v3/"` = `/order/payments/v3/`.
const SF_CHECKOUT_ENDPOINT = "/order/payments/v3/";

// ============================================================
// createSafepayCheckout
// ============================================================
// POST /api/payments/safepay/checkout
//
// Body: { amount, phone, email, orderId, merchantName? }
//
// 1. Sends a server-to-server POST to Safepay's /order/payments/v3/
//    with the secret key in the x-sfpy-merchant-secret header
//    and the public key + order details in the JSON body.
// 2. Safepay returns a "tracker" with a token.
// 3. We construct the hosted-checkout URL: `${SF_API}/embedded/<token>`
//    (or similar — see below for the exact URL pattern).
// 4. We return { redirectUrl } to the client, which does
//    `window.location.href = redirectUrl` to send the user to
//    Safepay's hosted page.
//
// The order has ALREADY been placed by the client (with
// paymentStatus="pending" — the order ID we send to Safepay
// is the merchant_reference so we can match the redirect back
// to the order).
export const createSafepayCheckout = asyncHandler(async (req, res) => {
  const { amount, phone, email, orderId, merchantName } = req.body;

  // ----- Input validation -----
  if (!amount || !phone || !email || !orderId) {
    throw new ApiError(400, "amount, phone, email, and orderId are required");
  }

  // ----- Env var validation (with diagnostic log) -----
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

  // ----- Build the request body -----
  // Field names match the @sfpy/node-core SDK example (which calls
  // safepay.payments.session.setup({...})). The body uses camelCase
  // (matching the SDK's JS interface), not snake_case.
  //
  // CRITICAL: amount is in PAISA, not rupees. The client sends
  // the order total in rupees (e.g. 6000 for Rs. 6000), and we
  // multiply by 100 here. This matches how the SDK example works
  // (6000 PKR → 600000 in the body).
  //
  // intent: "CYBERSOURCE" is the default from the SDK's homepage
  // example. Safepay may have other intent values for different
  // payment methods — adjust if needed.
  const amountInPaisa = Math.round(Number(amount) * 100);
  const requestBody = {
    merchant_api_key: publicKey,
    intent: "CYBERSOURCE",
    mode: "payment",   // one-time payment (vs "subscription" for recurring)
    currency: "PKR",
    amount: amountInPaisa,
    // merchant_reference is our own order ID — Safepay echoes it
    // back on the redirect so the success page can match the
    // redirect to the original order.
    merchant_reference: orderId,
  };

  // ----- Send the request -----
  // The auth header is `x-sfpy-merchant-secret: <secret>` — NOT
  // a Bearer token. This is the single most-likely-to-be-wrong
  // thing in a Safepay integration; it's easy to assume "Bearer"
  // because that's the OAuth2 / Stripe / PayPal convention.
  const requestUrl = `${SF_API}${SF_CHECKOUT_ENDPOINT}`;

  console.log(
    `[Safepay] POST ${requestUrl} (mode=${SF_MODE}, orderId=${orderId}, amount=${amountInPaisa} paisa = Rs. ${amount})`
  );

  let safepayRes;
  try {
    safepayRes = await fetch(requestUrl, {
      method: "POST",
      headers: {
        // CRITICAL: this header name is `x-sfpy-merchant-secret`,
        // NOT `Authorization: Bearer ...`. The latter is the
        // OAuth2 / Stripe / PayPal pattern; Safepay uses a
        // custom header.
        "x-sfpy-merchant-secret": secretKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (networkErr) {
    console.error(
      `[Safepay] Network error — could not reach ${requestUrl}. ${networkErr.message}`
    );
    throw new ApiError(
      502,
      `Could not reach Safepay at ${requestUrl}. ${networkErr.message}. ` +
        `If the host is wrong, fix SF_MODE (currently "${SF_MODE}").`
    );
  }

  // ----- Parse the response -----
  // Safepay returns JSON in the success case. We log the raw
  // response (first 500 chars) on failure so you can see
  // exactly what went wrong — the most common issues are:
  //   - Wrong header name (Bearer instead of x-sfpy-merchant-secret)
  //   - Wrong field name in the body
  //   - Wrong intent value
  //   - Auth failure (401)
  const responseText = await safepayRes.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { _raw: responseText };
  }

  if (!safepayRes.ok) {
    console.error(
      `[Safepay] Checkout creation FAILED — status: ${safepayRes.status}, mode: ${SF_MODE}, ` +
        `request: ${JSON.stringify(requestBody)}, response: ${responseText.slice(0, 500)}`
    );
    throw new ApiError(
      502,
      `Safepay checkout creation failed (${safepayRes.status}): ${responseText.slice(0, 500)}`
    );
  }

  // ----- Extract the checkout token -----
  // Based on the @sfpy/node-core SDK homepage example:
  //   safepay.payments.session.setup({...})
  //     .then(payment => console.log(payment.tracker.token))
  //
  // The response shape varies by version, so we accept a few:
  //   - { data: { tracker: { token: "..." } } }   (newer SDK)
  //   - { tracker: { token: "..." } }             (direct response)
  //   - { data: { token: "..." } }                  (alt format)
  //   - { token: "..." }                            (simplest)
  const token =
    responseData?.data?.tracker?.token ||
    responseData?.tracker?.token ||
    responseData?.data?.token ||
    responseData?.token;

  if (!token) {
    console.error(
      `[Safepay] No checkout token in response — keys: ${Object.keys(responseData || {}).join(", ")}, ` +
        `raw: ${responseText.slice(0, 500)}`
    );
    throw new ApiError(
      502,
      `Safepay returned no checkout token. Response: ${responseText.slice(0, 500)}`
    );
  }

  // ----- Construct the redirect URL -----
  // The hosted-checkout URL pattern. We use
  // `${SF_API}/embedded/external/?tracker=...&environment=...`
  // plus three more required params:
  //   - `merchant`     = the PUBLIC key (sec_...) so the hosted
  //                      page knows which merchant this checkout
  //                      belongs to. Without this, the SPA loads
  //                      but can't render the checkout UI — the
  //                      page is blank (this was the bug).
  //   - `success_url`  = where Safepay redirects after a
  //                      successful payment.
  //   - `cancel_url`   = where Safepay redirects after a
  //                      cancelled / failed payment.
  //
  // The path is `/embedded/external/` (NOT `/embedded/`). The
  // SDK's Checkout.js uses `/embedded/` for the EMBEDDED flow
  // (iframe in your page); the EXTERNAL flow (full-page redirect,
  // which is what we want) uses `/embedded/external/`. This was
  // confirmed by the error page URL Safepay shows when something
  // is wrong: `/embedded/external/error?error=Session%20expired!`
  // — the `/embedded/external/` segment is the checkout path.
  const baseUrl = process.env.SF_BASE_URL || "http://localhost:5173";
  const redirectUrl =
    `${SF_API}/embedded/external/` +
    `?tracker=${encodeURIComponent(token)}` +
    `&environment=${SF_MODE}` +
    `&merchant=${encodeURIComponent(publicKey)}` +
    `&success_url=${encodeURIComponent(`${baseUrl}/payment/safepay/success`)}` +
    `&cancel_url=${encodeURIComponent(`${baseUrl}/payment/safepay/failure`)}`;

  console.log(
    `[Safepay] Checkout created (mode=${SF_MODE}, token=${token.slice(0, 12)}..., orderId=${orderId}, redirectUrl=${redirectUrl})`
  );

  return res.status(200).json(
    new ApiResponse(200, { redirectUrl, token }, "Safepay checkout created")
  );
});
