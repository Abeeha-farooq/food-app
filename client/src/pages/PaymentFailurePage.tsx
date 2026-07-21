// src/pages/PaymentFailurePage.tsx
// ===============================
// Purpose: The redirect target after a FAILED Safepay
//          payment. The gateway sends the customer here with
//          ?tracker=<tracker>&orderId=<mongoId> in the URL.
//
// What this page does:
//   1. Reads the tracker and orderId from the URL
//   2. Calls POST /api/payments/safepay/verify with status="failed"
//      so the order's paymentStatus flips from "pending" to
//      "failed" (the admin can then see the failed attempt
//      in the dashboard and the customer can retry from the
//      order status page)
//   3. Shows a "Payment failed" message
//
// Idempotency: the server endpoint refuses to overwrite an
// already-paid order, so re-loading this page is safe.
// ===============================

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, Home, RefreshCw, ShoppingCart, ArrowLeft } from "lucide-react";
import api from "@/lib/api";

const PaymentFailurePage = () => {
  // Read the payment identifiers from the URL.
  // Same rationale as PaymentSuccessPage: Safepay echoes back
  // `order_id` (snake_case) and `tracker` after the cancel. We also
  // fall back to the camelCase keys in case any old URL is still
  // floating around. The `sanitizeOrderId` helper at the bottom of
  // this file strips any malformed suffix (see comment there) so old
  // in-flight orders still get processed.
  const [searchParams] = useSearchParams();
  const tracker =
    searchParams.get("tracker") || searchParams.get("tbt") || "";
  const rawOrderId =
    searchParams.get("order_id") || searchParams.get("orderId") || "";
  const orderId = sanitizeOrderId(rawOrderId);

  // Verify-on-mount: mark the order as failed. We don't BLOCK the
  // page on this call (unlike the success page) — the user sees
  // the failure UI immediately and the verify fires in the
  // background. Even if it fails, the page still works; the order
  // just stays in "pending" until the admin manually marks it.
  useEffect(() => {
    if (!tracker || !orderId) return;
    api
      .post("/payments/safepay/verify", {
        tracker,
        orderId,
        status: "failed",
      })
      .catch(() => {
        // Best-effort — don't show a toast here, the page is
        // already showing a failure UI. Worst case the order
        // stays "pending" and the admin resolves it manually.
      });
  }, [tracker, orderId]);

  // Slight visual delay before the failure animation settles.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <Card>
        <CardContent className="p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div
              className={`w-20 h-20 rounded-full bg-red-100 flex items-center justify-center transition-transform ${
                ready ? "scale-100" : "scale-50"
              }`}
            >
              <XCircle className="w-12 h-12 text-red-600" />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Payment failed
            </h1>
            <p className="text-gray-600">
              We weren't able to process your payment with Safepay.
              {orderId && (
                <>
                  {" "}Order{" "}
                  <span className="font-mono font-semibold">
                    #{orderId.slice(-8)}
                  </span>{" "}
                  is marked as failed.
                </>
              )}
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left space-y-2">
            <p className="text-sm font-semibold text-amber-900">
              Common reasons for payment failure
            </p>
            <ul className="text-sm text-amber-800 list-disc list-inside space-y-1">
              <li>Insufficient funds or daily transaction limit reached</li>
              <li>Card / account details entered incorrectly</li>
              <li>Bank declined the transaction (fraud check)</li>
              <li>Network timeout during the redirect</li>
            </ul>
            <p className="text-sm text-amber-800 mt-2">
              Your bank or card issuer was not charged. You can safely try again.
            </p>
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
              variant="outline"
              className="flex-1"
              asChild
            >
              <Link to="/cart">
                <ShoppingCart className="w-4 h-4 mr-2" /> Back to cart
              </Link>
            </Button>
            <Button
              className="flex-1 bg-orange hover:bg-hoverOrange"
              asChild
            >
              <Link to="/order/status">
                <RefreshCw className="w-4 h-4 mr-2" /> View orders
                <ArrowLeft className="ml-2 w-4 h-4 rotate-180" />
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
// Same defensive helper as in PaymentSuccessPage — strips a malformed
// orderId down to its valid 24-char ObjectId. Older builds embedded
// `?tracker=...&orderId=...` inside the redirect_url, which caused
// Safepay to append its own echoed params with `?` instead of `&`,
// producing a 58-char orderId like:
//   "6a5f06a26ed54f66dbcb2455?order_id=6a5f06a26ed54f66dbcb2455"
// We extract just the first 24 hex chars so any in-flight order
// from BEFORE this fix shipped can still be marked failed (the
// alternative is the order staying in "pending" forever, which
// the admin would have to flip manually).
function sanitizeOrderId(raw: string): string {
  if (!raw) return "";
  if (/^[0-9a-f]{24}$/i.test(raw)) return raw;
  const match = raw.match(/^[0-9a-f]{24}/i);
  return match ? match[0] : raw;
}

export default PaymentFailurePage;
