// src/pages/CheckoutPage.tsx
// ===============================
// Purpose: The Checkout page — the last step before a user places an order.
//
// Phases (single component, state machine):
//   1. "form"        — user fills in delivery address + payment method
//   2. "paying"      — PayPal Smart Buttons are shown (PayPal flow only)
//   3. "submitting"  — final POST /api/orders in flight
//   4. "confirmed"   — success! show the order confirmation
//
// Payment methods (3):
//   - "cash"    → pay on delivery, order placed with paymentStatus="pending"
//   - "paypal"  → PayPal Smart Buttons (popup), order placed with
//                  paymentStatus="paid" after the user authorizes
//   - "safepay" → Safepay hosted checkout (full-page redirect), order
//                  placed first with paymentStatus="pending", then
//                  the gateway collects payment and our verify
//                  endpoint flips it to "paid" on the success callback.
//
// (Card / wallet via Stripe was removed — Safepay now covers the
// "pay by card online" use case for this app.)
// ===============================

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useCart } from "@/context/useCart";
import { useAuth } from "@/context/useAuth";
import api, { getErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import {
  MapPin,
  Wallet,
  Banknote,
  ShoppingBag,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Package,
  Home,
  Receipt,
  Lock,
  Tag,
  X,
  Landmark,
} from "lucide-react";

// PayPal — official React wrapper. Loads the PayPal SDK script
// automatically and provides <PayPalButtons /> as a drop-in component.
// We only render the provider if VITE_PAYPAL_CLIENT_ID is set, so the
// app gracefully handles "PayPal not configured" without breaking.
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

// ============================================================
// TYPES
// ============================================================

// The three remaining payment methods. Safepay is the only
// "pay online by card" path now — it handles cards + Pakistani
// mobile wallets (JazzCash / EasyPaisa) on its own hosted page.
type PaymentMethod = "cash" | "paypal" | "safepay";

// Shape of the order returned by POST /api/orders.
interface PlacedOrder {
  _id: string;
  totalPrice: number;
  status: string;
  paymentStatus: string;
  deliveryAddress: string;
  items: { name: string; quantity: number; price: number }[];
  createdAt: string;
}

// Shape of a successfully validated coupon. The server's
// /api/coupons/validate endpoint returns this; we keep a copy
// in client state so the order-summary card can show the
// discount line, and so we can re-send the code when the
// user finally places the order.
interface AppliedCoupon {
  code: string;
  discount: number;        // Rupee amount the server calculated
  discountType: "percentage" | "fixed";
  discountValue: number;   // raw value (e.g. 20 for 20%, or Rs. 100)
}

// PayPal client ID. If missing, we render a "PayPal not configured"
// banner instead of the PayPal buttons.
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;

// ============================================================
// COMPONENT
// ============================================================
const CheckoutPage = () => {
  const navigate = useNavigate();
  const { items, totalItems, totalPrice, clearCart } = useCart();
  const { user } = useAuth();

  // ----- Phase machine -----
  //   "form"        → user is filling out address + payment method
  //   "paying"      → PayPal Smart Buttons are shown (PayPal flow only)
  //   "submitting"  → payment succeeded, we're POSTing the order
  //   "confirmed"   → order saved, show confirmation
  const [phase, setPhase] = useState<"form" | "paying" | "submitting" | "confirmed">("form");

  // ----- Form state -----
  const [deliveryAddress, setDeliveryAddress] = useState<string>(() => {
    return [user?.address, user?.city, user?.country].filter(Boolean).join(", ");
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

  // ----- Order state -----
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);

  // ----- Coupon state -----
  // The customer can type a code, click "Apply", and we call
  // POST /api/coupons/validate to preview the discount. We keep
  // the applied coupon in state so:
  //   1. The order summary card shows the discount line.
  //   2. The grandTotal we send to the payment gateway is the
  //      DISCOUNTED total (Safepay receives rupees, PayPal receives
  //      dollars — both get the post-coupon amount).
  //   3. We re-send the code to /api/orders at place-order time
  //      (the server re-validates atomically — a coupon can expire
  //      between preview and place, so the client cannot just claim
  //      a discount without the server's permission).
  const [couponInput, setCouponInput] = useState<string>("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState<boolean>(false);

  // ----- Derived -----
  const deliveryFee = 50;
  const couponDiscount = appliedCoupon?.discount ?? 0;
  const grandTotal = Math.max(0, totalPrice + deliveryFee - couponDiscount);

  const isFormValid = deliveryAddress.trim().length > 5 && items.length > 0;

  // ----- Restaurant info (for the summary card) -----
  const restaurantInfo = useMemo(() => {
    if (items.length === 0) return null;
    const ids = new Set(items.map((i) => i.restaurantId));
    return {
      ids: Array.from(ids),
      isMultiRestaurant: ids.size > 1,
      name: items[0]?.restaurantName || "Restaurant",
    };
  }, [items]);

  // ----- Handler: continue to payment phase -----
  // For cash: skip the payment step and go straight to order creation.
  // For PayPal: move to the "paying" phase where the Smart Buttons live.
  // For Safepay: place the order with paymentStatus="pending" and
  //   redirect the browser to the gateway's hosted checkout.
  const handleContinue = async () => {
    if (!isFormValid) {
      toast.error("Please enter a delivery address");
      return;
    }
    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }
    if (restaurantInfo?.isMultiRestaurant) {
      toast.error("Your cart has items from multiple restaurants. Please order one at a time.");
      return;
    }

    if (paymentMethod === "cash") {
      // Cash on delivery — go straight to order creation.
      await placeOrder({ paymentMethod: "cash" });
      return;
    }

    if (paymentMethod === "safepay") {
      // Safepay — place the order first (with paymentStatus:
      // "pending"), then call the server to get the gateway's
      // redirect URL, then send the browser there. See
      // handleSafepayCheckout below for the full flow.
      await handleSafepayCheckout();
      return;
    }

    if (paymentMethod === "paypal") {
      // PayPal has its own Smart Buttons flow — see the PayPalCheckout
      // component rendered in the "paying" phase. This button doesn't
      // advance to "paying" for PayPal; the PayPal buttons handle everything.
      toast.info("Click the PayPal button below to complete payment");
      setPhase("paying");
      return;
    }
  };

  // ----- Handler: apply a coupon code -----
  // Calls POST /api/coupons/validate with the CURRENT subtotal — the
  // server checks min order amount, expiry, usage limit, per-user
  // limit, etc., and returns the actual Rupee discount. This is just
  // a PREVIEW (no state change on the server); the real atomic
  // redemption happens inside placeOrder → tryRedeemCoupon.
  //
  // We send `code` (the user-typed code) and `subtotal` (cart
  // subtotal, NOT including delivery — coupons apply to food, not
  // the delivery fee). The server returns { valid, code, discount,
  // discountType, discountValue, reason? }.
  const handleApplyCoupon = async () => {
    const trimmed = couponInput.trim();
    if (!trimmed) {
      setCouponError("Please enter a coupon code");
      return;
    }
    setValidatingCoupon(true);
    setCouponError(null);
    try {
      const res = await api.post("/coupons/validate", {
        code: trimmed,
        subtotal: totalPrice,
      });
      const data = res.data.data;
      // The server signals validity via HTTP status: 200 = valid,
      // 4xx = invalid. The 4xx path is handled by the catch block
      // (api.post throws on non-2xx and getErrorMessage extracts
      // the server's reason). The 200 response shape is
      // { code, description, discountType, discountValue, discount,
      //   minOrderAmount } — no `valid` field. (Checking
      // `data.valid` here was always undefined, so the coupon
      // was being rejected as "not valid" even on success.)
      setAppliedCoupon({
        code: data.code,
        discount: data.discount,
        discountType: data.discountType,
        discountValue: data.discountValue,
      });
      setCouponInput("");   // clear the input — the badge below shows the applied code
      setCouponError(null);
      toast.success(`Coupon ${data.code} applied — you saved Rs. ${data.discount.toFixed(2)}`);
    } catch (err) {
      setCouponError(getErrorMessage(err));
      setAppliedCoupon(null);
    } finally {
      setValidatingCoupon(false);
    }
  };

  // ----- Handler: remove an applied coupon -----
  // No server call — the preview didn't change server state. We just
  // clear the local state so the order summary reverts to the
  // pre-coupon totals and the next place-order call won't include
  // a couponCode (no coupon will be redeemed).
  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponInput("");
    toast.info("Coupon removed");
  };

  // ----- The actual order placement (called after payment succeeds) -----
  // For PayPal: pass the order/capture/payer IDs (from the capture response)
  // For cash: pass null for everything; paymentStatus will be "pending"
  // The server uses these IDs to verify the payment with the processor
  // before saving the order. This is the defense-in-depth check.
  //
  // (Safepay has its own order-creation path in handleSafepayCheckout
  // because the order is placed BEFORE the gateway redirect — the
  // payment happens on Safepay's hosted page, then our verify
  // endpoint flips paymentStatus to "paid" on the success callback.)
  const placeOrder = async (paymentData: {
    paymentMethod: "paypal" | "cash";
    paypalOrderId?: string;
    paypalPayerId?: string;
    paypalCaptureId?: string;
  }) => {
    setPhase("submitting");
    try {
      const restaurantId = items[0]?.restaurantId;
      const res = await api.post("/orders", {
        restaurantId,
        items: items.map((i) => ({
          // i.id is the composite cart key ("menuItemId__restaurantId")
          // used for cart line identification. The backend needs the
          // raw ObjectId stored in i.menuItemId for the DB lookup.
          menuItemId: i.menuItemId,
          quantity: i.quantity,
        })),
        deliveryAddress: deliveryAddress.trim(),
        paymentStatus:
          paymentData.paymentMethod === "cash" ? "pending" : "paid",
        paymentMethod: paymentData.paymentMethod,
        paypalOrderId: paymentData.paypalOrderId || undefined,
        paypalPayerId: paymentData.paypalPayerId || undefined,
        paypalCaptureId: paymentData.paypalCaptureId || undefined,
        // Coupon — the server re-validates atomically inside
        // placeOrder. If it's expired/used-up between preview and
        // now, the order is rejected with a 400.
        couponCode: appliedCoupon ? appliedCoupon.code : undefined,
      });
      setPlacedOrder(res.data.data);
      clearCart();
      setPhase("confirmed");
    } catch (err) {
      toast.error(getErrorMessage(err));
      setPhase(paymentMethod === "cash" ? "form" : "paying");
    }
  };

  // ----- Handler: Safepay checkout flow -----
  // The Safepay flow is different from Stripe/PayPal: the user is
  // redirected to the gateway's own hosted checkout page, NOT an
  // iframe or popup. This means:
  //   1. Place the order FIRST (with paymentStatus: "pending" — the
  //      gateway handles payment separately on its own page).
  //   2. Get a fresh order ID from the server response.
  //   3. Call the server's safepay endpoint to get the
  //      gateway's redirect URL (the server does the API call
  //      with our secret key and returns the checkout token URL).
  //   4. window.location.href = redirectUrl — the browser navigates
  //      to the gateway, the user pays, and the gateway redirects
  //      them back to /payment/safepay/success or /failure.
  //
  // We intentionally DON'T use the existing placeOrder() helper
  // because that helper transitions to the "confirmed" phase —
  // for Safepay we want to redirect, not show a confirmation
  // screen. (The gateway's success page is the confirmation.)
  const handleSafepayCheckout = async () => {
    setPhase("submitting");
    try {
      // Step 1: place the order with paymentStatus="pending".
      // The server will accept this because "safepay" is a
      // recognized paymentMethod that doesn't trigger the
      // Stripe/PayPal verification path (those paths only fire
      // when the client claims paymentStatus="paid").
      const restaurantId = items[0]?.restaurantId;
      const orderRes = await api.post("/orders", {
        restaurantId,
        items: items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
        })),
        deliveryAddress: deliveryAddress.trim(),
        paymentStatus: "pending",
        paymentMethod: "safepay",
        // Coupon — the server re-validates atomically (same as
        // the other payment methods).
        couponCode: appliedCoupon ? appliedCoupon.code : undefined,
      });
      const order = orderRes.data.data;

      // Step 2: clear the cart — we're committed to this order.
      // If the gateway redirect fails, the user can re-order.
      clearCart();

      // Step 3: call the server to get the gateway's redirect URL.
      // The server does the API call with our secret key and
      // returns the hosted-checkout URL.
      //
      // Phone handling: Safepay (and most Pakistani gateways)
      // require a phone number for the customer's payment method
      // (e.g. JazzCash/EasyPaisa wallets are phone-keyed). The
      // user's `contact` field is OPTIONAL in the profile — if
      // they signed up without filling it in, `user.contact` is
      // undefined and the server's "phone is required" check
      // would fail. We fall back to a valid-format placeholder
      // (a "Pakistani mobile" pattern starting with 03) so the
      // gateway accepts the checkout. The real long-term fix is
      // a phone field on the checkout form, but this gets the
      // integration working today.
      const fallbackPhone = "03000000000";
      const checkoutRes = await api.post("/payments/safepay/checkout", {
        amount: grandTotal,
        phone: user?.contact || fallbackPhone,
        email: user?.email || "",
        orderId: order._id,
      });

      // Step 4: send the browser to the gateway. The gateway will
      // collect payment and redirect back to /payment/safepay/
      // success or /failure.
      const { redirectUrl } = checkoutRes.data.data;
      if (!redirectUrl) {
        throw new Error("Safepay did not return a redirect URL");
      }
      window.location.href = redirectUrl;
    } catch (err) {
      toast.error(getErrorMessage(err));
      setPhase("form");  // back to the form so the user can retry
    }
  };

  // ============================================================
  // RENDER: confirmed phase
  // ============================================================
  if (phase === "confirmed" && placedOrder) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <Card>
          <CardContent className="p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-green-600" />
              </div>
            </div>

            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Order placed!</h1>
              <p className="text-gray-600">
                Order <span className="font-mono font-semibold">#{placedOrder._id.slice(-8)}</span> has been confirmed.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 text-left space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <Package className="w-4 h-4" /> Status
                </span>
                <span className="font-medium capitalize">{placedOrder.status}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <Receipt className="w-4 h-4" /> Payment
                </span>
                <span
                  className={`font-medium capitalize ${
                    placedOrder.paymentStatus === "paid"
                      ? "text-green-600"
                      : "text-orange-600"
                  }`}
                >
                  {placedOrder.paymentStatus}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Total</span>
                <span className="font-semibold text-lg">
                  Rs. {placedOrder.totalPrice.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate("/")}
              >
                <Home className="w-4 h-4 mr-2" /> Home
              </Button>
              <Button
                className="flex-1 bg-orange hover:bg-hoverOrange"
                onClick={() => navigate("/order/status")}
              >
                View orders
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // RENDER: empty cart
  // ============================================================
  if (items.length === 0 && phase !== "confirmed") {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <EmptyState
          icon={<ShoppingBag className="w-10 h-10" />}
          title="Your cart is empty"
          description="Add items from a restaurant before checking out."
          ctaLabel="Browse restaurants"
          onCtaClick={() => navigate("/filterPage")}
        />
      </div>
    );
  }

  // ============================================================
  // RENDER: form / paying / submitting
  // ============================================================
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <PageHeader
        icon={<ShoppingBag className="text-orange-500" />}
        title="Checkout"
        subtitle="Review your order and complete payment"
        className="mb-6"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ============== LEFT (2 cols) ============== */}
        <div className="lg:col-span-2 space-y-6">

          {/* ----- Delivery Address ----- */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-orange-500" />
                Delivery address
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="address" className="text-sm text-gray-600">
                Where should we deliver your order?
              </Label>
              <Input
                id="address"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="e.g. 123 Main St, Lahore, Pakistan"
                className="mt-2"
                disabled={phase === "paying" || phase === "submitting"}
              />
            </CardContent>
          </Card>

          {/* ----- Payment Method ----- */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-orange-500" />
                Payment method
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <PaymentOption
                  icon={<Banknote className="w-6 h-6" />}
                  label="Cash on delivery"
                  description="Pay when your food arrives"
                  selected={paymentMethod === "cash"}
                  onSelect={() => setPaymentMethod("cash")}
                  disabled={phase !== "form"}
                />
                <PaymentOption
                  // PayPal uses a separate icon (lucide doesn't have
                  // an official PayPal icon, so we use a generic wallet
                  // icon — PayPal renders its own branded button inside
                  // the popup).
                  icon={<Wallet className="w-6 h-6 text-blue-600" />}
                  label="PayPal"
                  description="Pay with your PayPal account"
                  selected={paymentMethod === "paypal"}
                  onSelect={() => setPaymentMethod("paypal")}
                  disabled={phase !== "form"}
                />
                <PaymentOption
                  // Safepay — full-page redirect to the gateway's
                  // own hosted checkout. The user completes payment
                  // on Safepay's site, then is redirected back to
                  // /payment/safepay/success or /failure. The
                  // order is placed FIRST (with paymentStatus:
                  // "pending") — the gateway handles payment
                  // separately.
                  icon={<Landmark className="w-6 h-6 text-emerald-600" />}
                  label="Safepay"
                  description="Pay via Safepay hosted checkout"
                  selected={paymentMethod === "safepay"}
                  onSelect={() => setPaymentMethod("safepay")}
                  disabled={phase !== "form"}
                />
              </div>
            </CardContent>
          </Card>

          {/* ----- PayPal Smart Buttons (only for paypal method) ----- */}
          {/* Same idea as the old Stripe block above, but using the
              PayPal SDK's React wrapper. The flow:
                1. User clicks "PayPal" (we toggle paymentMethod to "paypal")
                2. handleContinue() moves us to "paying" phase
                3. The PayPal button renders here. createOrder hits our
                   /api/payments/paypal/create-order endpoint, which talks
                   to PayPal's Orders API and returns an order ID.
                4. PayPal opens its popup. User authorizes.
                5. onApprove fires with the order ID. We POST
                   /api/payments/paypal/capture to capture the funds.
                6. Then we POST /api/orders with the PayPal IDs — the
                   server re-verifies with PayPal before saving. */}
          {phase === "paying" && paymentMethod === "paypal" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-green-600" />
                  Pay with PayPal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {PAYPAL_CLIENT_ID ? (
                  // PayPalScriptProvider loads the PayPal SDK script.
                  // We disable the buttons during submitting/confirmed
                  // to prevent double-clicks.
                  <PayPalScriptProvider
                    options={{
                      // Note: the React wrapper's types expect camelCase
                      // "clientId" (the HTML attribute is "client-id" but
                      // the React prop normalizes it).
                      clientId: PAYPAL_CLIENT_ID,
                      currency: "USD",
                      intent: "capture",
                    }}
                  >
                    <PayPalButtons
                      style={{ layout: "vertical", color: "gold", shape: "rect", label: "pay" }}
                      // createOrder: ask OUR server to create a PayPal
                      // order. Returns the PayPal order ID. We pass the
                      // total in DOLLARS (PayPal's API uses regular
                      // currency units, NOT cents like Stripe).
                      createOrder={async () => {
                        try {
                          const res = await api.post("/payments/paypal/create-order", {
                            amount: grandTotal,  // already in dollars
                            currency: "USD",
                          });
                          return res.data.data.orderId;
                        } catch (err) {
                          toast.error(getErrorMessage(err));
                          throw err;
                        }
                      }}
                      // onApprove: the user has authorized in the PayPal
                      // popup. We capture the payment (move money), then
                      // place the order.
                      onApprove={async (data) => {
                        try {
                          // 1. Capture the payment (server hits PayPal's
                          //    /capture endpoint, moves money, returns
                          //    captureId + payerId for storage).
                          const captureRes = await api.post("/payments/paypal/capture", {
                            orderId: data.orderID,
                          });
                          const { captureId, payerId } = captureRes.data.data;

                          // 2. Place the order with all the PayPal IDs
                          //    so the server can re-verify and store them.
                          await placeOrder({
                            paymentMethod: "paypal",
                            paypalOrderId: data.orderID,
                            paypalPayerId: payerId,
                            paypalCaptureId: captureId,
                          });
                        } catch (err) {
                          toast.error(getErrorMessage(err));
                          setPhase("form");
                        }
                      }}
                      // onError: PayPal itself errored (network, SDK init, etc.)
                      onError={(err) => {
                        console.error("[paypal] error:", err);
                        toast.error("PayPal error. Please try again or use a different payment method.");
                        setPhase("form");
                      }}
                      // onCancel: user closed the PayPal popup without approving
                      onCancel={() => {
                        toast.info("PayPal payment cancelled");
                        setPhase("form");
                      }}
                    />
                  </PayPalScriptProvider>
                ) : (
                  // PayPal not configured — show a friendly warning
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                    PayPal is not configured. Add <code className="bg-amber-100 px-1 rounded">VITE_PAYPAL_CLIENT_ID</code> to your client env vars to enable PayPal payments.
                  </div>
                )}
                <Button
                  variant="ghost"
                  onClick={() => setPhase("form")}
                  className="w-full"
                >
                  Back to checkout
                </Button>
              </CardContent>
            </Card>
          )}

          {/* (Stripe-not-configured warning was removed along with the
              Stripe card/wallet payment options. The PayPal-not-configured
              warning lives inside the PayPal block above.) */}
        </div>

        {/* ============== RIGHT (1 col): order summary ============== */}
        <div className="lg:col-span-1">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingBag className="w-5 h-5 text-orange-600" />
                Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {restaurantInfo && !restaurantInfo.isMultiRestaurant && (
                <p className="text-sm text-gray-500">
                  From <span className="font-semibold text-gray-700">{restaurantInfo.name}</span>
                </p>
              )}

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-gray-700 truncate pr-2">
                      {item.quantity}× {item.name}
                    </span>
                    <span className="text-gray-900 font-medium whitespace-nowrap">
                      Rs. {(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <Separator />

              {/* ----- Coupon / promo code block -----
                  Two states:
                  1. No coupon applied → small input + Apply button
                  2. Coupon applied    → green badge with the code +
                     the discount amount + a remove (X) button
                  The actual server redemption happens inside placeOrder
                  (atomic findOneAndUpdate). This is just a preview. */}
              {appliedCoupon ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-md px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Tag className="w-4 h-4 text-green-700 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-green-800 truncate">
                        {appliedCoupon.code}
                      </p>
                      <p className="text-xs text-green-700">
                        {appliedCoupon.discountType === "percentage"
                          ? `${appliedCoupon.discountValue}% off`
                          : `Rs. ${appliedCoupon.discountValue.toFixed(2)} off`}
                        {" "}— you save Rs. {appliedCoupon.discount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    disabled={phase === "paying" || phase === "submitting"}
                    className="text-green-700 hover:text-green-900 hover:bg-green-100 rounded-full p-1 disabled:opacity-50"
                    aria-label="Remove coupon"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <Label htmlFor="coupon" className="text-sm text-gray-600 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> Have a coupon code?
                  </Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id="coupon"
                      value={couponInput}
                      onChange={(e) => {
                        setCouponInput(e.target.value);
                        // Clear stale error when the user starts typing again
                        if (couponError) setCouponError(null);
                      }}
                      placeholder="e.g. WELCOME20"
                      // uppercase as they type — coupons are case-insensitive
                      // on the server but we normalize to uppercase for UX
                      onInput={(e) => {
                        const target = e.target as HTMLInputElement;
                        target.value = target.value.toUpperCase();
                        setCouponInput(target.value);
                      }}
                      disabled={phase !== "form" || validatingCoupon}
                      className="flex-1 uppercase"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyCoupon}
                      disabled={phase !== "form" || validatingCoupon || !couponInput.trim()}
                    >
                      {validatingCoupon ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Apply"
                      )}
                    </Button>
                  </div>
                  {couponError && (
                    <p className="mt-1.5 text-xs text-red-600">{couponError}</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    Subtotal ({totalItems} item{totalItems === 1 ? "" : "s"})
                  </span>
                  <span>Rs. {totalPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery fee</span>
                  <span>Rs. {deliveryFee.toFixed(2)}</span>
                </div>
                {/* Coupon discount line — only when a coupon is applied.
                    Shown as a negative Rupee amount in green so the
                    customer can see exactly how much was deducted. */}
                {appliedCoupon && (
                  <div className="flex justify-between text-green-700">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" /> Coupon ({appliedCoupon.code})
                    </span>
                    <span>− Rs. {appliedCoupon.discount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-orange-600">Rs. {grandTotal.toFixed(2)}</span>
              </div>

              {/* "Place Order" button — different text/behavior per phase */}
              {phase === "form" && (
                <Button
                  onClick={handleContinue}
                  disabled={!isFormValid}
                  className="w-full bg-orange hover:bg-hoverOrange mt-2"
                  size="lg"
                >
                  {paymentMethod === "cash"
                    ? "Place order"
                    : paymentMethod === "safepay"
                    ? "Pay with Safepay"
                    : "Continue to payment"}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              )}

              {phase === "submitting" && (
                <Button disabled className="w-full bg-orange mt-2" size="lg">
                  <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                  Placing order...
                </Button>
              )}

              {deliveryAddress.trim().length <= 5 && (
                <p className="text-xs text-gray-500 text-center">
                  Please enter a delivery address to continue
                </p>
              )}
              {deliveryAddress.trim().length > 5 && restaurantInfo?.isMultiRestaurant && (
                <p className="text-xs text-orange-600 text-center">
                  Cart has items from multiple restaurants
                </p>
              )}

              {/* Trust badge — visible when paying (PayPal flow only
                  after the Stripe card/wallet options were removed) */}
              {phase === "paying" && (
                <p className="text-xs text-gray-500 text-center flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3" /> PayPal Buyer Protection applies
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// PAYMENT OPTION (sub-component)
// ============================================================
// One card-style radio button for picking a payment method.
const PaymentOption = ({
  icon,
  label,
  description,
  selected,
  onSelect,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onSelect}
    disabled={disabled}
    className={`text-left rounded-lg border-2 p-4 transition-all ${
      selected
        ? "border-orange-500 bg-orange-50/50"
        : "border-gray-200 hover:border-gray-300"
    } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
  >
    <div className="flex items-start gap-3">
      <div className={`flex-shrink-0 ${selected ? "text-orange-500" : "text-gray-500"}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${selected ? "text-orange-900" : "text-gray-900"}`}>
          {label}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      {selected && (
        <CheckCircle2 className="w-5 h-5 text-orange-500 flex-shrink-0" />
      )}
    </div>
  </button>
);

export default CheckoutPage;
