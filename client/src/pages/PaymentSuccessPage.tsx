// src/pages/PaymentSuccessPage.tsx
// ===============================
// Purpose: The redirect target after a successful Safepay
//          payment. The gateway sends the customer here with
//          ?tracker=<tracker>&orderId=<mongoId> in the URL.
//
// What this page does:
//   1. Reads the tracker and orderId from the URL
//   2. Calls POST /api/payments/safepay/verify to mark the
//      order as paid (this is what makes the order's
//      paymentStatus flip from "pending" to "paid" — see
//      comment in server/controllers/safepay.controller.js
//      for why this is the trigger, not a webhook)
//   3. Shows a "Payment successful" message once verified
//
// Why we don't trust the URL alone to mark as paid:
//   A malicious user could craft a URL pointing to this page
//   with any tracker/orderId. The server's verify endpoint
//   enforces ownership + paymentMethod=safepay + current
//   paymentStatus=pending, so the actual state change is
//   gated by the database. This page is just the trigger.
// ===============================

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Home, Receipt, ArrowRight, AlertCircle } from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { toast } from "sonner";

const PaymentSuccessPage = () => {
  // Read the payment identifiers from the URL.
  //
  // Why we read `order_id` (snake_case) as the PRIMARY key, and only
  // fall back to `orderId` (camelCase):
  //   When the server creates the Safepay checkout, the redirect_url
  //   it sends to Safepay is a PLAIN path with no query string
  //   (see server/controllers/safepay.controller.js — embedding a
  //   query string in the redirect_url causes Safepay to append its
  //   own echoed params using `?` instead of `&`, producing a
  //   malformed query string and a 58-char orderId).
  //   Safepay then echoes back the top-level `order_id` param with
  //   a proper `&` separator, so the success URL has `?order_id=...`
  //   (not `?orderId=...`). We read `order_id` first, with `orderId`
  //   as a fallback for any old URLs that may still have the old key.
  //
  // The `sanitizeOrderId` step below is a belt-and-suspenders for any
  // old URL still in flight that has the malformed `?`+`order_id=...`
  // suffix. We defensively extract just the first 24 hex chars if
  // the value looks longer than a valid ObjectId. This means an
  // order placed BEFORE this fix shipped can still be verified
  // successfully once the user lands on the success page.
  const [searchParams] = useSearchParams();
  const tracker =
    searchParams.get("tracker") || searchParams.get("tbt") || "";
  const rawOrderId =
    searchParams.get("order_id") || searchParams.get("orderId") || "";
  const orderId = sanitizeOrderId(rawOrderId);

  // Verification state — we kick off the verify call on mount
  // and wait for the server's response before showing the
  // success UI. Without this, the order would still be in
  // paymentStatus="pending" and would show up incorrectly in
  // the order list.
  const [verifying, setVerifying] = useState(true);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Slight visual delay before the success animation settles —
  // gives the user a moment to register the page change.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Fire the verify call on mount (or when the URL params change).
  // The server endpoint is idempotent — a second call returns the
  // already-paid order without erroring.
  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      // If we don't have the required URL params, we can't verify.
      // Show a helpful error rather than silently doing nothing.
      if (!tracker || !orderId) {
        setVerifying(false);
        setVerifyError(
          "Missing tracker or orderId in the URL — we can't confirm your payment. Please contact support if you were charged."
        );
        return;
      }

      try {
        await api.post("/payments/safepay/verify", {
          tracker,
          orderId,
          status: "paid",
        });
        if (!cancelled) {
          setVerifying(false);
        }
      } catch (err) {
        if (cancelled) return;
        // The order might already be paid (idempotency), or the
        // user might not own the order, or the orderId might be
        // bad. Show the error and let the user contact support.
        setVerifying(false);
        setVerifyError(getErrorMessage(err));
        toast.error(getErrorMessage(err));
      }
    };

    verify();
    return () => {
      cancelled = true;
    };
  }, [tracker, orderId]);

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <Card>
        <CardContent className="p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-transform ${
                ready ? "scale-100" : "scale-50"
              } ${
                verifyError
                  ? "bg-amber-100"
                  : "bg-green-100"
              }`}
            >
              {verifyError ? (
                <AlertCircle className="w-12 h-12 text-amber-600" />
              ) : (
                <CheckCircle2 className="w-12 h-12 text-green-600" />
              )}
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {verifyError
                ? "Payment received — order update pending"
                : verifying
                  ? "Confirming your payment…"
                  : "Payment successful!"}
            </h1>
            <p className="text-gray-600">
              {verifyError ? (
                verifyError
              ) : verifying ? (
                "Please wait while we update your order."
              ) : (
                <>
                  Your order has been received and your payment was processed
                  by Safepay.
                  {tracker && (
                    <>
                      {" "}Order{" "}
                      <span className="font-mono font-semibold">
                        #{orderId ? orderId.slice(-8) : tracker.slice(-8)}
                      </span>
                      .
                    </>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-6 text-left space-y-4">
            <div className="flex items-start gap-3">
              <Receipt className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-gray-900 text-sm">
                  What's next?
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  The restaurant will confirm your order shortly. You'll
                  receive updates on your order status page. If the order
                  doesn't show as paid in a few minutes, please refresh
                  the orders page or contact support with your tracker ID.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              asChild
            >
              <Link to="/">
                <Home className="w-4 h-4 mr-2" /> Home
              </Link>
            </Button>
            <Button
              className="flex-1 bg-orange hover:bg-hoverOrange"
              asChild
            >
              <Link to="/order/status">
                View orders
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ============================================================
// sanitizeOrderId
// ============================================================
// Strips a malformed orderId down to its valid 24-char ObjectId.
//
// Background: older builds of server/controllers/safepay.controller.js
// embedded `?tracker=...&orderId=...` inside the redirect_url sent
// to Safepay. Safepay's redirect behavior then appended its own
// echoed params with `?` instead of `&`, producing a URL like:
//   /success?tracker=...&orderId=6a5f06a26ed54f66dbcb2455
//                     ?order_id=6a5f06a26ed54f66dbcb2455&tracker=...
// The browser then captures the 58-char string
// "6a5f06a26ed54f66dbcb2455?order_id=6a5f06a26ed54f66dbcb2455" as
// the orderId value, which fails server-side ObjectId validation.
//
// This helper defensively extracts the first 24 hex chars from a
// too-long value, so any in-flight order from BEFORE this fix
// shipped can still be verified once the user lands on the success
// page (the alternative is showing "Invalid orderId" forever for
// those orders, which would force the admin to manually flip the
// status on every single one).
//
// For brand-new orders, the value is already 24 chars, so this
// function is a no-op.
function sanitizeOrderId(raw: string): string {
  if (!raw) return "";
  // Already a clean 24-char ObjectId → return as-is
  if (/^[0-9a-f]{24}$/i.test(raw)) return raw;
  // Try to extract the first 24 hex chars from a longer value.
  // Covers the "?order_id=..." suffix bug AND any other future
  // mangling Safepay might do.
  const match = raw.match(/^[0-9a-f]{24}/i);
  return match ? match[0] : raw;
}

export default PaymentSuccessPage;
