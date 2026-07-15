// src/pages/CheckoutPage.tsx
// ===============================
// Purpose: The Checkout page — the last step before a user places an order.
//
// Phases (single component, state machine):
//   1. "form"        — user fills in delivery address + payment method
//   2. "paying"      — Stripe <PaymentElement> is shown, user enters card
//   3. "submitting"  — final POST /api/orders in flight
//   4. "confirmed"   — success! show the order confirmation
//
// Stripe payment flow (when user picks "card" or "wallet"):
//   1. User clicks "Pay & place order"
//   2. We POST /api/payments/create-intent with the cart total (in paisa)
//   3. Server creates a Stripe PaymentIntent, returns clientSecret
//   4. We call stripe.confirmPayment() with the clientSecret
//   5. Stripe processes the payment (card, Apple Pay, etc.)
//   6. On success, we POST /api/orders with stripePaymentIntentId
//   7. Server re-verifies the payment with Stripe before saving the order
//   8. Order saved with paymentStatus="paid"
//
// Why we don't simulate anymore:
//   - Real payment is what users expect from a "real" food app
//   - Stripe test mode lets us do this with zero risk (no real money)
//   - Test cards like 4242 4242 4242 4242 always succeed in test mode
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
  CreditCard,
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
} from "lucide-react";

// Stripe — only imported if the publishable key is set
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

// ============================================================
// TYPES
// ============================================================

// The three payment methods. "card" and "wallet" both use Stripe;
// the difference is just the UI label.
type PaymentMethod = "cash" | "card" | "wallet";

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

// ============================================================
// STRIPE-LOADED CHECK
// ============================================================
// The <Elements> provider needs a Stripe instance. We load it once
// at module init (see main.tsx). If the env var is missing, we
// render a "Stripe not configured" banner instead of the form.
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

// ============================================================
// COMPONENT
// ============================================================
const CheckoutPage = () => {
  const navigate = useNavigate();
  const { items, totalItems, totalPrice, clearCart } = useCart();
  const { user } = useAuth();

  // ----- Phase machine -----
  //   "form"        → user is filling out address + payment method
  //   "paying"      → Stripe <PaymentElement> is shown, user is entering card
  //   "submitting"  → payment succeeded, we're POSTing the order
  //   "confirmed"   → order saved, show confirmation
  const [phase, setPhase] = useState<"form" | "paying" | "submitting" | "confirmed">("form");

  // ----- Form state -----
  const [deliveryAddress, setDeliveryAddress] = useState<string>(() => {
    return [user?.address, user?.city, user?.country].filter(Boolean).join(", ");
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

  // ----- Stripe state -----
  // The clientSecret returned by /api/payments/create-intent. We pass
  // it to <Elements options={{ clientSecret }}> to mount the PaymentElement.
  // WHY clientSecret: it's the proof that this specific PaymentIntent
  // is "ours" — Stripe's PaymentElement uses it to know which intent
  // to confirm. Without it, Stripe doesn't know which card to charge.
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  // ----- Order state -----
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);

  // ----- Derived -----
  const deliveryFee = 50;
  const grandTotal = totalPrice + deliveryFee;
  // Stripe expects amount in the SMALLEST currency unit (paisa for PKR).
  // Rs. 1850 = 185000 paisa. Using integers avoids floating-point errors.
  const grandTotalInPaisa = Math.round(grandTotal * 100);

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
  // For cash: skip the Stripe step and go straight to "submitting".
  // For card/wallet: first create the PaymentIntent, then move to "paying".
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
      // Cash on delivery — no Stripe interaction. Go straight to order creation.
      await placeOrder(null);
      return;
    }

    // Card or wallet → need a PaymentIntent
    if (!stripePromise) {
      toast.error("Stripe is not configured. Set VITE_STRIPE_PUBLISHABLE_KEY in client/.env");
      return;
    }

    setPhase("paying");
    try {
      // Step 1 of the Stripe flow: ask our server to create a
      // PaymentIntent. We pass the cart total in paisa.
      const res = await api.post("/payments/create-intent", {
        amount: grandTotalInPaisa,
        currency: "pkr",
      });
      setClientSecret(res.data.data.clientSecret);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setPhase("form");  // back to the form so the user can retry
    }
  };

  // ----- The actual order placement (called after payment succeeds) -----
  // stripePaymentIntentId is passed when the user paid online. The
  // server uses it to verify the payment with Stripe before saving.
  const placeOrder = async (stripePaymentIntentId: string | null) => {
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
          paymentMethod === "cash" ? "pending" : "paid",
        stripePaymentIntentId,  // null for cash orders
      });
      setPlacedOrder(res.data.data);
      clearCart();
      setPhase("confirmed");
    } catch (err) {
      toast.error(getErrorMessage(err));
      setPhase(paymentMethod === "cash" ? "form" : "paying");
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
                <CreditCard className="w-5 h-5 text-orange-500" />
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
                  icon={<CreditCard className="w-6 h-6" />}
                  label="Credit / Debit card"
                  description="Visa, Mastercard, etc."
                  selected={paymentMethod === "card"}
                  onSelect={() => setPaymentMethod("card")}
                  disabled={phase !== "form"}
                />
                <PaymentOption
                  icon={<Wallet className="w-6 h-6" />}
                  label="Digital wallet"
                  description="Apple Pay, Google Pay, etc."
                  selected={paymentMethod === "wallet"}
                  onSelect={() => setPaymentMethod("wallet")}
                  disabled={phase !== "form"}
                />
              </div>
            </CardContent>
          </Card>

          {/* ----- Stripe Payment Element (only for card/wallet) ----- */}
          {/* This card only appears in the "paying" phase for non-cash
              methods. It hosts the Stripe <PaymentElement>, an iframe
              served by Stripe where the user types their card details. */}
          {phase === "paying" && paymentMethod !== "cash" && clientSecret && stripePromise && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-green-600" />
                  Secure payment
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* <Elements> with the clientSecret is what gives the
                    PaymentElement access to the intent. We pass
                    appearance options to match our orange theme. */}
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: {
                      theme: "stripe",
                      variables: {
                        colorPrimary: "#D19254",
                        colorBackground: "#ffffff",
                        colorText: "#1f2937",
                        fontFamily: "system-ui, sans-serif",
                        borderRadius: "8px",
                      },
                    },
                  }}
                >
                  <StripePaymentForm
                    onSuccess={placeOrder}
                    onBack={() => setPhase("form")}
                  />
                </Elements>
              </CardContent>
            </Card>
          )}

          {/* Stripe-not-configured warning for non-cash methods */}
          {phase === "form" && paymentMethod !== "cash" && !stripePromise && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <strong>Stripe is not configured.</strong> Add{" "}
              <code className="bg-amber-100 px-1 rounded">VITE_STRIPE_PUBLISHABLE_KEY</code> to{" "}
              <code className="bg-amber-100 px-1 rounded">client/.env</code> to enable card payments.
              See <a href="https://dashboard.stripe.com/test/apikeys" target="_blank" rel="noreferrer" className="underline">Stripe Dashboard</a> for test keys.
            </div>
          )}
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
                  {paymentMethod === "cash" ? "Place order" : "Continue to payment"}
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

              {/* Trust badge — visible when paying */}
              {phase === "paying" && (
                <p className="text-xs text-gray-500 text-center flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3" /> Secured by Stripe
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

// ============================================================
// STRIPE PAYMENT FORM (sub-component)
// ============================================================
// This sub-component lives INSIDE <Elements> so it can use the
// useStripe() and useElements() hooks. Its job:
//   1. Render Stripe's <PaymentElement> (the card form)
//   2. Handle the "Pay" button click
//   3. Call stripe.confirmPayment() with the clientSecret
//   4. On success → call onSuccess to trigger order placement
//   5. On failure → show the error inline
const StripePaymentForm = ({
  onSuccess,
  onBack,
}: {
  onSuccess: (paymentIntentId: string) => Promise<void>;
  onBack: () => void;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isPaying, setIsPaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js hasn't finished loading yet. Disable the button in
      // this case (handled by the disabled state below).
      return;
    }

    setIsPaying(true);
    setErrorMessage(null);

    // confirmPayment() returns a result object with `error` if it
    // failed (card declined, 3DS required, etc.) or `paymentIntent`
    // on success. It does NOT throw on most errors — we have to
    // check `error` manually.
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      // Don't redirect — we want to handle success/failure inline.
      redirect: "if_required",
      // confirmParams lets us pre-fill billing details. We pull the
      // email from our auth context if available.
      confirmParams: {
        return_url: window.location.origin + "/order/status",
        payment_method_data: {
          billing_details: {
            // We don't have name/email in scope here; PaymentElement
            // will collect them if the user hasn't filled them in.
          },
        },
      },
    });

    if (error) {
      // The user saw a decline message inside the Stripe iframe.
      // We just show a summary at the top of the form.
      setErrorMessage(error.message || "Payment failed. Please try again.");
      setIsPaying(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === "succeeded") {
      // Payment succeeded! Hand off to the parent to place the order.
      await onSuccess(paymentIntent.id);
      // Don't setIsPaying(false) here — the parent will set phase to "submitting"
    } else {
      setErrorMessage("Payment is being processed. Please wait a moment.");
      setIsPaying(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Stripe's hosted card form. Renders an iframe served by Stripe —
          card data NEVER touches our React tree or our server. */}
      <PaymentElement
        options={{
          layout: "tabs",  // "tabs" shows card/wallet as separate tabs
        }}
      />

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3">
          {errorMessage}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isPaying}
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={!stripe || isPaying}
          className="flex-1 bg-orange hover:bg-hoverOrange"
        >
          {isPaying ? (
            <>
              <Loader2 className="mr-2 w-4 h-4 animate-spin" />
              Processing payment...
            </>
          ) : (
            <>
              <Lock className="mr-2 w-4 h-4" />
              Pay now
            </>
          )}
        </Button>
      </div>
    </form>
  );
};

export default CheckoutPage;
