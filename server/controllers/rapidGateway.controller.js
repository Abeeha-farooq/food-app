// controllers/rapidGateway.controller.js
// ===============================
// Purpose: Rapid Gateway (RapidPAY) hosted-checkout integration.
//
// Why this is a separate file from payment.controller.js:
//   - payment.controller.js handles Stripe (iframe-based, client-confirmed)
//   - paypal.controller.js handles PayPal (popup + Smart Buttons)
//   - This file handles Rapid Gateway (full-page redirect to the gateway's
//     own checkout page) — different flow, different state model.
//
// Flow (server side):
//   1. createRapidGatewayCheckout  — get an OAuth token, submit the
//                                    transaction with the order's
//                                    basketId, return the gateway's
//                                    redirect URL.
//   2. [customer completes payment on the gateway's hosted page]
//   3. handleRapidGatewayRedirect  — success/failure redirect target
//                                    that the gateway sends the
//                                    customer to after payment. We
//                                    expose this as a thin endpoint
//                                    so the client can read the
//                                    basketId from the URL and
//                                    navigate to the right page.
//
// We cache the OAuth access token in `global.rapidGatewayTokenCache`
// so we don't fetch a new one on every checkout. The gateway's tokens
// are short-lived (~5 min), so we refresh 60s early to be safe.
// ===============================

import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";

// ============================================================
// CONFIG
// ============================================================
// The token endpoint is the SAME for both sandbox and production
// — only the merchant ID / client secret differ between the two.
//
// The transaction endpoint, however, is DIFFERENT:
//   - sandbox: /sandbox/process-transaction
//   - live:    /rapid/process-transaction
//
// We pick the right one based on `RG_MODE` (same pattern as
// PayPal's `PAYPAL_MODE`). Defaults to "sandbox" so a fresh
// deployment can't accidentally hit the real payment endpoint
// before the merchant has finished testing.
//
// If you don't set RG_MODE, every checkout call goes to the
// SANDBOX. This is the safe default — no real money moves even
// if you accidentally use sandbox credentials in production.
const RG_API = "https://secure.rapid-gateway.com";
const RG_MODE = (process.env.RG_MODE || "sandbox").toLowerCase();
const RG_TRANSACTION_ENDPOINT =
  RG_MODE === "live"
    ? `${RG_API}/rapid/process-transaction`
    : `${RG_API}/sandbox/process-transaction`;

// Reusable access token cache (singleton across serverless invocations
// in the same container). Same pattern as PayPal's token cache.
let tokenCache = global.rapidGatewayTokenCache;
if (!tokenCache) {
  tokenCache = global.rapidGatewayTokenCache = { token: null, expiresAt: 0 };
}

// ============================================================
// OAUTH: get an access token (cached)
// ============================================================
// Rapid Gateway uses HTTP Basic auth (MERCHANT_ID:CLIENT_SECRET
// base64-encoded) for the OAuth token endpoint, then Bearer auth
// for all subsequent calls. Identical pattern to PayPal.
//
// Caching strategy:
//   - If we have a cached token that's still valid, return it.
//   - Otherwise, fetch a new one and cache it until `expires_in`
//     seconds from now, minus a 60-second safety margin.
//   - The 60s margin handles clock skew and the time it takes for
//     the token to actually be accepted by the gateway (network
//     latency). Better to refresh slightly early than to have a
//     request rejected for an expired token.
const getRapidGatewayAccessToken = async () => {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  const merchantId = process.env.RG_MERCHANT_ID;
  const clientSecret = process.env.RG_CLIENT_SECRET;
  if (!merchantId || !clientSecret) {
    throw new ApiError(
      500,
      "Rapid Gateway is not configured. Set RG_MERCHANT_ID and RG_CLIENT_SECRET in server/.env."
    );
  }

  // Basic auth: base64("MERCHANT_ID:CLIENT_SECRET")
  const credentials = Buffer.from(`${merchantId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${RG_API}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const err = await response.text();
    throw new ApiError(500, `Rapid Gateway OAuth failed: ${err}`);
  }

  const data = await response.json();
  // Standard OAuth2 response: { access_token, token_type, expires_in }
  // Some gateways also return `scope` — we ignore it.
  if (!data.access_token) {
    throw new ApiError(500, "Rapid Gateway OAuth returned no access_token");
  }

  // Cache until expiry minus a 60s safety margin. If `expires_in`
  // is missing or 0, default to 5 minutes (matches the token's
  // observed lifetime from the sample JWT).
  const ttlMs = (data.expires_in || 300) * 1000;
  tokenCache.token = data.access_token;
  tokenCache.expiresAt = now + ttlMs - 60_000;

  // Log once per token fetch (which is rare thanks to the cache)
  // so the dev can see which mode the server is in. Helpful when
  // debugging "why am I hitting the live endpoint" or "why is my
  // sandbox payment not going through".
  console.log(`[Rapid Gateway] OAuth token acquired (mode=${RG_MODE}, endpoint=${RG_TRANSACTION_ENDPOINT}, ttl=${data.expires_in}s)`);

  return data.access_token;
};

// ============================================================
// createRapidGatewayCheckout
// ============================================================
// POST /api/payments/rapid-gateway/checkout
//
// Body: { amount, phone, email, orderId, merchantName? }
//
// 1. Fetches a (cached) OAuth token.
// 2. Submits the transaction to /rapid/process-transaction with
//    all the merchant/customer/order fields.
// 3. Reads the `Location` header from the response (the gateway
//    returns a 3xx with the checkout URL in the Location header).
// 4. Returns { redirectUrl } to the client.
//
// The client then does `window.location.href = redirectUrl` to
// send the customer to the gateway's hosted checkout page.
//
// Why we use redirect: 'manual' on the fetch:
//   The gateway returns a 3xx redirect (status 302/303). We want
//   the Location header, not to follow the redirect server-side
//   (which would try to GET the gateway's checkout page from our
//   server, which we don't want — the user's browser should go
//   there, not ours).
export const createRapidGatewayCheckout = asyncHandler(async (req, res) => {
  const { amount, phone, email, orderId, merchantName } = req.body;

  // ----- Input validation -----
  if (!amount || !phone || !email || !orderId) {
    throw new ApiError(400, "amount, phone, email, and orderId are required");
  }

  const merchantId = process.env.RG_MERCHANT_ID;
  if (!merchantId) {
    throw new ApiError(
      500,
      "Rapid Gateway is not configured. Set RG_MERCHANT_ID in server/.env."
    );
  }

  // ----- Step 1: get an access token -----
  const accessToken = await getRapidGatewayAccessToken();

  // ----- Step 2: submit the transaction -----
  // The gateway expects application/x-www-form-urlencoded with
  // these specific field names. We use URLSearchParams to build
  // the body — it handles the encoding (spaces, special chars)
  // correctly.
  const body = new URLSearchParams({
    MERCHANT_ID: merchantId,
    MERCHANT_NAME: merchantName || "Flavour Court",
    TXNAMT: String(amount),
    CURRENCY_CODE: "PKR",
    CUSTOMER_MOBILE_NO: phone,
    CUSTOMER_EMAIL_ADDRESS: email,
    BASKET_ID: orderId,
    SUCCESS_URL: `${process.env.RG_BASE_URL || "http://localhost:5173"}/payment/rapid-gateway/success`,
    FAILURE_URL: `${process.env.RG_BASE_URL || "http://localhost:5173"}/payment/rapid-gateway/failure`,
    CHECKOUT_URL: `${process.env.RG_BASE_URL || "http://localhost:5173"}/payment/rapid-gateway/success`,
    VERSION: "MY_VER_1.0",
    PROCCODE: "0",
  });

  const payRes = await fetch(RG_TRANSACTION_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    // The gateway returns a 3xx with the checkout URL in the
    // Location header. We read it manually instead of letting
    // fetch follow the redirect — the customer's browser should
    // navigate to the gateway, not our server.
    redirect: "manual",
  });

  // ----- Step 3: extract the redirect URL -----
  // The gateway returns a redirect (status 301/302/303/307/308).
  // The Location header contains the hosted-checkout URL.
  // We accept any 2xx-3xx range; the gateway's exact status
  // code isn't documented as part of the contract.
  const redirectUrl = payRes.headers.get("location");

  if (!redirectUrl) {
    // If there's no Location header, the gateway likely returned
    // an error response. Read the body for debugging.
    const errorBody = await payRes.text().catch(() => "");
    throw new ApiError(
      502,
      `Rapid Gateway did not return a redirect URL. Status: ${payRes.status}. Body: ${errorBody.slice(0, 500)}`
    );
  }

  return res.status(200).json(
    new ApiResponse(200, { redirectUrl }, "Rapid Gateway checkout created")
  );
});
