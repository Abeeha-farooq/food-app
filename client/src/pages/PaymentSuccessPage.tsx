// src/pages/PaymentSuccessPage.tsx
// ===============================
// Purpose: The redirect target after a successful Rapid Gateway
//          payment. The gateway sends the customer here with
//          ?basketId=<orderId> in the URL.
//
// What this page does:
//   1. Reads the basketId (order ID) from the URL
//   2. Shows a "Payment successful" message
//   3. Provides links to view the order status / browse more
//
// Why we DON'T update the order's paymentStatus to "paid" here:
//   The order is already placed with paymentStatus="pending".
//   The gateway is supposed to send a webhook to our server to
//   update the status. If the webhook is delayed or never
//   arrives, the order is still visible in the customer's order
//   list with status "pending" — the admin dashboard will catch
//   the discrepancy. We could also call a server endpoint to
//   mark it paid, but that's a secondary verification path we
//   haven't built yet.
// ===============================

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Home, Receipt, ArrowRight } from "lucide-react";

const PaymentSuccessPage = () => {
  // Read ?basketId=<orderId> from the URL. The gateway appends this
  // so we can link the user to their specific order.
  const [searchParams] = useSearchParams();
  const basketId = searchParams.get("basketId") || "";

  // Slight visual delay before the success animation settles —
  // gives the user a moment to register the page change.
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
              className={`w-20 h-20 rounded-full bg-green-100 flex items-center justify-center transition-transform ${
                ready ? "scale-100" : "scale-50"
              }`}
            >
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Payment successful!
            </h1>
            <p className="text-gray-600">
              Your order has been received and your payment was processed
              by Rapid Gateway.
              {basketId && (
                <>
                  {" "}Order{" "}
                  <span className="font-mono font-semibold">
                    #{basketId.slice(-8)}
                  </span>
                  .
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
                  receive updates on your order status page. If you don't
                  see the payment reflected immediately, please allow a
                  few minutes for the gateway to confirm the transaction.
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

export default PaymentSuccessPage;
