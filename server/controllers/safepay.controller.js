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
//   1. createSafepayCheckout
//        a. POST /client/passport/v1/token  → get the "tbt" user token
//        b. POST /order/payments/v3/        → get the tracker token
//        c. Build the hosted-checkout URL with the OFFICIAL Safepay
//           URL pattern (verified from the open-source Safepay
//           WooCommerce plugin: github.com/getsafepay/
//           safepay-checkout-woocommerce, file
//           `SafepayPaymentGateway.php`, function `prepareRedirectUrl`).
//   2. [customer completes payment on Safepay's hosted page]
//   3. Safepay redirects to /payment/safepay/success?tracker=...
//
// Key facts (verified from the @sfpy/node-core SDK source on npm + the
// safepay-checkout-woocommerce open-source plugin on GitHub):
//   - Auth header is `x-sfpy-merchant-secret: <secret_key>` — NOT Bearer
//   - Token endpoint:  POST /client/passport/v1/token  (returns the "tbt")
//   - Checkout endpoint: POST /order/payments/v3/     (returns the tracker)
//   - Hosted URL path: /embedded/   (NOT /embedded/external/)
//   - The hosted URL needs `tbt=<userToken>&tracker=<tracker>
//     &environment=<env>&source=hosted
//     &order_id=<our-mongo-id>
//     &redirect_url=<success>&cancel_url=<cancel>`
//   - amount in PAISA (multiply rupees by 100)
//   - Sandbox host: https://sandbox.api.getsafepay.com
//   - Live host:    https://api.getsafepay.com
// ===============================

import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";

// ============================================================
// CONFIG
// ============================================================
// IMPORTANT — the `.trim()` call defensively strips any leading
// or trailing whitespace (including TAB characters) that might
// have been accidentally pasted into the env var. A TAB in
// SF_MODE would produce `?environment=\tsandbox&...` in the
// redirect URL — a value Safepay's hosted page doesn't recognize,
// causing the checkout to render blank.
const SF_MODE = (process.env.SF_MODE || "sandbox").toLowerCase().trim();
const SF_API =
  SF_MODE === "production"
    ? "https://api.getsafepay.com"
    : SF_MODE === "development"
      ? "https://dev.api.getsafepay.com"
      : "https://sandbox.api.getsafepay.com";

// Endpoint paths — taken from Safepay's open-source WooCommerce plugin
// (`includes/enums/SafepayEndpoints.php`).
const SF_PASSPORT_ENDPOINT = "/client/passport/v1/token";
const SF_CHECKOUT_ENDPOINT = "/order/payments/v3/";

// ============================================================
// createSafepayCheckout
// ============================================================
// POST /api/payments/safepay/checkout
//
// Body: { amount, phone, email, orderId, merchantName? }
//
// What this function does (matches the official Safepay hosted-checkout
// flow, as used in safepay-checkout-woocommerce):
//
//   1. POST /client/passport/v1/token
//      → returns { data: "<userToken>" }
//      → the userToken is the "tbt" param the hosted page needs
//        to authenticate its OWN client-side API calls. Without
//        it, the page loads its shell but cannot render the
//        checkout UI (the page is BLANK with no visible error).
//
//   2. POST /order/payments/v3/
//      → returns { data: { tracker: { token: "<tracker>" } } }
//      → the tracker is the unique session ID for this checkout
//
//   3. Build the redirect URL with the EXACT param names and
//      order from Safepay's plugin. The page is a SPA that
//      refuses to render when its required params are missing
//      or mis-named — common failure mode is `success_url`
//      (which our old code used) instead of `redirect_url`.
//
// We return { redirectUrl, tracker } to the client, which does
// `window.location.href = redirectUrl` to send the user to
// Safepay's hosted page.
export const createSafepayCheckout = asyncHandler(async (req, res) => {
  const { amount, phone, email, orderId, merchantName } = req.body;

  // ----- Input validation -----
  if (!amount || !phone || !email || !orderId) {
    throw new ApiError(400, "amount, phone, email, and orderId are required");
  }

  // ----- Env var validation (with diagnostic log) -----
  // .trim() on both — same defensive reason as SF_MODE. A stray
  // space or tab in the env var would cause 401/403 from Safepay
  // because the auth header value wouldn't match what the gateway
  // expects.
  const publicKey = process.env.SF_PUBLIC_KEY?.trim();
  const secretKey = process.env.SF_SECRET_KEY?.trim();
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

  // ----- Build the auth headers (shared by both API calls) -----
  // The auth header is `x-sfpy-merchant-secret: <secret>` — NOT
  // a Bearer token. This is the single most-likely-to-be-wrong
  // thing in a Safepay integration; it's easy to assume "Bearer"
  // because that's the OAuth2 / Stripe / PayPal convention.
  const authHeaders = {
    "x-sfpy-merchant-secret": secretKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // ----- Step 1: get the user token (tbt) from the passport endpoint -----
  // The hosted checkout page calls Safepay's API from the BROWSER
  // (for things like fetching available payment methods and
  // processing the payment). Those client-side calls need a
  // short-lived token, which we get here on the server and pass
  // in the `tbt` URL param.
  //
  // The endpoint and request shape were taken directly from
  // safepay-checkout-woocommerce's `SafePayApiHandler.php`:
  //   $tokenUrl = esc_url_raw($baseURL . SafepayEndpoints::TOKEN_ENDPOINT->value);
  //   // where TOKEN_ENDPOINT = '/client/passport/v1/token'
  const tokenUrl = `${SF_API}${SF_PASSPORT_ENDPOINT}`;
  console.log(`[Safepay] POST ${tokenUrl} (passport)`);

  let userToken;
  try {
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        merchant_api_key: publicKey,
      }),
    });

    const tokenText = await tokenRes.text();
    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      tokenData = { _raw: tokenText };
    }

    if (!tokenRes.ok) {
      console.error(
        `[Safepay] Passport call FAILED — status: ${tokenRes.status}, ` +
          `mode: ${SF_MODE}, body: ${tokenText.slice(0, 500)}`
      );
      throw new ApiError(
        502,
        `Safepay passport call failed (${tokenRes.status}): ${tokenText.slice(0, 500)}`
      );
    }

    // The passport response shape (per the WooCommerce plugin):
    //   { data: "<userToken-string>", ... }
    // The plugin reads: $userToken = $userToken['data']
    userToken = tokenData?.data;
    if (!userToken || typeof userToken !== "string") {
      console.error(
        `[Safepay] No userToken in passport response — keys: ${Object.keys(tokenData || {}).join(", ")}, ` +
          `raw: ${tokenText.slice(0, 500)}`
      );
      throw new ApiError(
        502,
        `Safepay passport returned no user token. Response: ${tokenText.slice(0, 500)}`
      );
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error(
      `[Safepay] Network error reaching passport endpoint: ${err.message}`
    );
    throw new ApiError(
      502,
      `Could not reach Safepay passport endpoint (${tokenUrl}). ${err.message}`
    );
  }

  // ----- Step 2: create the tracker (session) -----
  // Same body shape as the SDK's `safepay.payments.session.setup({...})`
  // example on the Safepay homepage. Amount in PAISA.
  //
  // We also send `source: "hosted"` in the body (per the WooCommerce
  // plugin's `prepareApiArguments`), and we use the same value in
  // the redirect URL below so they match.
  const amountInPaisa = Math.round(Number(amount) * 100);
  const requestBody = {
    merchant_api_key: publicKey,
    intent: "CYBERSOURCE",
    mode: "payment",
    currency: "PKR",
    amount: amountInPaisa,
    source: "hosted",
  };

  const checkoutUrl = `${SF_API}${SF_CHECKOUT_ENDPOINT}`;
  console.log(
    `[Safepay] POST ${checkoutUrl} (session, orderId=${orderId}, amount=${amountInPaisa} paisa = Rs. ${amount})`
  );

  let tracker;
  try {
    const sessionRes = await fetch(checkoutUrl, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(requestBody),
    });

    const sessionText = await sessionRes.text();
    let sessionData;
    try {
      sessionData = JSON.parse(sessionText);
    } catch {
      sessionData = { _raw: sessionText };
    }

    if (!sessionRes.ok) {
      console.error(
        `[Safepay] Session creation FAILED — status: ${sessionRes.status}, ` +
          `mode: ${SF_MODE}, request: ${JSON.stringify(requestBody)}, ` +
          `response: ${sessionText.slice(0, 500)}`
      );
      throw new ApiError(
        502,
        `Safepay session creation failed (${sessionRes.status}): ${sessionText.slice(0, 500)}`
      );
    }

    // Response shape (matches the @sfpy/node-core SDK homepage example):
    //   { data: { tracker: { token: "track_..." } } }
    tracker =
      sessionData?.data?.tracker?.token ||
      sessionData?.tracker?.token ||
      sessionData?.data?.token ||
      sessionData?.token;
    if (!tracker) {
      console.error(
        `[Safepay] No tracker in session response — keys: ${Object.keys(sessionData || {}).join(", ")}, ` +
          `raw: ${sessionText.slice(0, 500)}`
      );
      throw new ApiError(
        502,
        `Safepay session returned no tracker. Response: ${sessionText.slice(0, 500)}`
      );
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error(
      `[Safepay] Network error reaching checkout endpoint: ${err.message}`
    );
    throw new ApiError(
      502,
      `Could not reach Safepay checkout endpoint (${checkoutUrl}). ${err.message}`
    );
  }

  // ----- Step 3: build the redirect URL (OFFICIAL Safepay pattern) -----
  // The hosted-checkout URL pattern below is copied character-for-
  // character from Safepay's own open-source WooCommerce plugin
  // (function `prepareRedirectUrl` in SafepayPaymentGateway.php).
  // Verified URL:
  //   https://github.com/getsafepay/safepay-checkout-woocommerce
  //
  //   sprintf(
  //     '%s/embedded/?tbt=%s&tracker=%s&order_id=%s&environment=%s
  //      &source=woocommerce&redirect_url=%s&cancel_url=%s',
  //     ...
  //   );
  //
  // We use `source=hosted` (instead of `woocommerce`) because this
  // is a direct hosted integration, not a WooCommerce plugin.
  // `order_id` is our MongoDB ObjectId so the success page can
  // look up the order.
  //
  // The path is `/embedded/` (NOT `/embedded/external/`) — the
  // official hosted-checkout path. The `/embedded/external/` path
  // is the error page (Safepay redirects there when something
  // goes wrong).
  //
  // CRITICAL: `success_url` is the WRONG param name. The correct
  // one is `redirect_url` (this is what tripped us up before).
  // The `tbt` param is also REQUIRED — without it, the SPA
  // loads but cannot render the checkout UI (page is blank).
  const baseUrl = process.env.SF_BASE_URL || "http://localhost:5173";
  const params = new URLSearchParams({
    tbt: userToken,
    tracker,
    order_id: orderId,
    environment: SF_MODE,
    source: "hosted",
    redirect_url: `${baseUrl}/payment/safepay/success?tracker=${encodeURIComponent(tracker)}`,
    cancel_url: `${baseUrl}/payment/safepay/cancel?tracker=${encodeURIComponent(tracker)}`,
  });
  const redirectUrl = `${SF_API}/embedded/?${params.toString()}`;

  console.log(
    `[Safepay] Checkout created (mode=${SF_MODE}, tracker=${tracker.slice(0, 12)}..., orderId=${orderId}, tbt=${userToken.slice(0, 12)}...)`
  );
  console.log(`[Safepay] Redirect URL: ${redirectUrl}`);

  return res.status(200).json(
    new ApiResponse(200, { redirectUrl, tracker }, "Safepay checkout created")
  );
});
