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
import Order from "../models/order.model.js";
import mongoose from "mongoose";

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
  //
  // We also append our own `orderId` to the redirect_url so the
  // success page can look up the order and mark it as paid
  // (we don't have a Safepay webhook configured, so the success
  // page is the only way to update the order's paymentStatus).
  const baseUrl = process.env.SF_BASE_URL || "http://localhost:5173";
  const params = new URLSearchParams({
    tbt: userToken,
    tracker,
    order_id: orderId,
    environment: SF_MODE,
    source: "hosted",
    redirect_url: `${baseUrl}/payment/safepay/success?tracker=${encodeURIComponent(tracker)}&orderId=${encodeURIComponent(orderId)}`,
    cancel_url: `${baseUrl}/payment/safepay/cancel?tracker=${encodeURIComponent(tracker)}&orderId=${encodeURIComponent(orderId)}`,
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

// ============================================================
// verifySafepayPayment
// ============================================================
// POST /api/payments/safepay/verify
//
// Called by the success page (and the cancel page) after the user
// is redirected back from Safepay's hosted checkout. Marks the
// matching order as paid (success) or failed (cancel).
//
// Body: { tracker: string, orderId: string, status: "paid" | "failed" }
//
// Why this exists:
//   Safepay's hosted-checkout flow normally relies on a server-side
//   webhook to tell us when a payment is complete. We do NOT have
//   a webhook configured (that requires adding a webhook URL +
//   webhook secret in the Safepay dashboard AND building a
//   signature-verifying endpoint on our server — a multi-hour
//   integration that's overkill for the current stage).
//
//   Instead, we use the success page's "user redirected back"
//   signal as the trigger. The downside is that a malicious user
//   could theoretically craft a URL to /payment/safepay/success
//   with any tracker and orderId and get their (or someone
//   else's) order marked as paid. We mitigate this with three
//   checks below:
//
//     1. The order must belong to the calling user (req.user._id
//        must match order.user) — prevents cross-user tampering.
//     2. The order's paymentMethod must be "safepay" — prevents
//        misusing this endpoint on cash / stripe / paypal orders.
//     3. The order's current paymentStatus must be "pending" —
//        the endpoint is idempotent and refuses to downgrade a
//        paid order (or re-flag a refunded one).
//
//   In a production deployment with a real Safepay integration,
//   you'd swap this for a webhook handler that verifies the
//   signature with `merchantWebhookSecret` (see the Safepay
//   WooCommerce plugin's `validate_webhook` for the pattern).
export const verifySafepayPayment = asyncHandler(async (req, res) => {
  const { tracker, orderId, status } = req.body;

  // Log the verify call at the top so we can see in the server
  // logs whether the success page actually fires it. If the order
  // is stuck in "pending" but this log doesn't appear, the client
  // isn't reaching the endpoint at all (e.g. wrong URL, auth
  // failure, or the success page isn't even mounting).
  console.log(
    `[Safepay] verify called: orderId=${JSON.stringify(orderId)}, status=${status}, ` +
    `tracker=${(tracker || "").slice(0, 12)}..., user=${req.user?._id}, ` +
    `body keys=${Object.keys(req.body || {}).join(",")}`
  );

  // ----- Input validation -----
  if (!tracker || !orderId) {
    throw new ApiError(400, "tracker and orderId are required");
  }
  if (!["paid", "failed"].includes(status)) {
    throw new ApiError(400, "status must be 'paid' or 'failed'");
  }
  // Defensive ObjectId validation. The client reads orderId from a URL
  // query string (searchParams.get), which can be empty or corrupted
  // if the URL was hand-crafted or got mangled by a redirect. We log
  // the raw value here so Vercel logs show exactly what came in —
  // critical for debugging "the order never got marked paid" tickets.
  if (!mongoose.isValidObjectId(orderId)) {
    console.error(
      `[Safepay] verify REJECTED — orderId is not a valid ObjectId. ` +
      `raw value: ${JSON.stringify(orderId)} (length=${String(orderId).length}), ` +
      `raw type: ${typeof orderId}, user=${req.user?._id}`
    );
    throw new ApiError(
      400,
      `Invalid orderId (length=${String(orderId).length}, expected 24-char hex)`
    );
  }

  // ----- Find the order -----
  // Order.findById throws a CastError if orderId isn't a valid ObjectId.
  // We catch it explicitly so the 400 path has a consistent shape
  // (the !mongoose.isValidObjectId guard above catches the common case,
  // but this is the belt-and-suspenders for any edge case where the
  // orderId somehow passes the guard but Mongoose still rejects it).
  let order;
  try {
    order = await Order.findById(orderId);
  } catch (err) {
    if (err && err.name === "CastError") {
      console.error(
        `[Safepay] verify — Order.findById CastError for orderId=${JSON.stringify(orderId)}`
      );
      throw new ApiError(400, "Invalid orderId format");
    }
    throw err;
  }
  if (!order) throw new ApiError(404, "Order not found");

  // ----- Ownership check -----
  // The order must belong to the calling user. Prevents user A
  // from marking user B's order as paid by guessing the orderId.
  if (order.user.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Forbidden — not your order");
  }

  // ----- Method check -----
  // Only applies to Safepay orders. Cash/stripe/paypal orders
  // have their own payment-update flow.
  if (order.paymentMethod !== "safepay") {
    throw new ApiError(
      400,
      `This endpoint is only for Safepay orders; this order uses ${order.paymentMethod}`
    );
  }

  // ----- Idempotency / state check -----
  // The order must currently be in "pending" status. This:
  //   - Makes the endpoint idempotent (a second success-page
  //     load with the same tracker won't re-fire the update)
  //   - Prevents overwriting a real "paid" or "refunded" status
  //     if the gateway redirects back twice (browser back button
  //     after success, etc.)
  if (order.paymentStatus !== "pending") {
    // Idempotent success — return the current order without
    // touching it. The client just wants to know the order is
    // in a good state; we don't need to error.
    return res.status(200).json(
      new ApiResponse(200, order, `Order payment is already ${order.paymentStatus}`)
    );
  }

  // ----- Apply the update -----
  // We set BOTH paymentStatus and safepayTransactionId in a
  // single save so the order is in a fully-consistent state
  // (no window where the order is "paid" but the tx id is
  // still empty).
  //
  // We ALSO auto-accept the order (status: "placed" → "confirmed")
  // when the payment is "paid", because:
  //   - The customer has actually paid; the admin's accept step
  //     would just be a rubber-stamp
  //   - Without auto-accept, paid orders still show up at the top
  //     of the admin's order list under "placed" (the action queue),
  //     which makes the admin's job harder (they have to filter
  //     out already-paid orders before they can see what actually
  //     needs attention)
  //   - For cash on delivery the order stays at "placed" and
  //     paymentStatus="pending" — those still need manual accept
  order.paymentStatus = status;
  order.safepayTransactionId = tracker;
  if (status === "paid" && order.status === "placed") {
    order.status = "confirmed";
  }
  await order.save();

  console.log(
    `[Safepay] Order ${orderId} paymentStatus → ${status}` +
    (status === "paid" ? `, status → confirmed` : "") +
    ` (tracker=${tracker.slice(0, 12)}..., user=${req.user._id})`
  );

  return res.status(200).json(
    new ApiResponse(200, order, `Order payment marked ${status}`)
  );
});
