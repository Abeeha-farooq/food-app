// src/pages/PaymentFailurePage.tsx
// ===============================
// Purpose: The redirect target after a FAILED Rapid Gateway
//          payment. The gateway sends the customer here with
//          ?basketId=<orderId> in the URL.
//
// What this page does:
//   1. Reads the basketId (order ID) from the URL
//   2. Shows a "Payment failed" message
//   3. Provides links to retry the payment or go back to cart
//
// Note on the order state:
//   The order is still in the database with paymentStatus="pending".
//   The admin can see the failed attempt in the dashboard. The
//   customer can retry the payment from the order status page
//   (or place a new order). We don't auto-cancel the order here —
//   the user might have just hit a network issue and want to retry.
// ===============================

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, Home, RefreshCw, ShoppingCart, ArrowLeft } from "lucide-react";

const PaymentFailurePage = () => {
  // Read ?basketId=<orderId> from the URL. The gateway appends this
  // so we can reference the specific order that failed.
  const [searchParams] = useSearchParams();
  const basketId = searchParams.get("basketId") || "";

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
              We weren't able to process your payment with Rapid Gateway.
              {basketId && (
                <>
                  {" "}Order{" "}
                  <span className="font-mono font-semibold">
                    #{basketId.slice(-8)}
                  </span>{" "}
                  is still pending.
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

export default PaymentFailurePage;
