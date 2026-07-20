// src/components/ui/CartConflictModal.tsx
// ===============================
// Purpose: A global modal that pops up when the user tries to add
//          an item from a different restaurant than what's already
//          in their cart.
//
// Why this is a global modal (not part of any single page):
//   The conflict can be triggered from any "Add to cart" button in
//   the app — RestaurantDetailPage, AddToCartDemoPage, a future
//   "Quick add" widget, etc. Mounting the modal at the top of the
//   React tree means it works from anywhere without each caller
//   having to set up its own state.
//
// How it works:
//   - CartContext's `addItem` detects the cross-restaurant case and
//     parks the request in `pendingConflict` (instead of mutating
//     the cart). It does NOT open the modal itself.
//   - This component reads `pendingConflict` from useCart() and
//     renders a modal when it's non-null.
//   - The modal's "Replace" button calls `confirmReplace`, which
//     clears the cart and adds the pending item.
//   - The modal's "Keep current cart" button (or backdrop click /
//     Escape) calls `cancelAdd`, which just dismisses the modal.
//
// Visual design:
//   - Centered card with a backdrop (click backdrop to cancel)
//   - Two "carts" shown side-by-side: current on the left, new on
//     the right. The arrow between them signals the replace action.
//   - Two buttons: a secondary "Keep current cart" and a primary
//     "Replace cart" (orange — the app's accent color).
// ===============================

import { useEffect, useRef } from "react";
import { AlertTriangle, ArrowRight, ShoppingBag, X } from "lucide-react";
import { useCart } from "@/context/useCart";
import { Button } from "./button";

// ============================================================
// COMPONENT
// ============================================================
export const CartConflictModal = () => {
  const { pendingConflict, confirmReplace, cancelAdd } = useCart();

  // Ref to the "Replace" button so we can autofocus it on open.
  // The destructive action (replacing the existing cart) is the
  // secondary action — we don't want to autofocus it because the
  // user might press Enter by accident. The cancel button is
  // safer as the default focus.
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  // ----- Lock body scroll while the modal is open -----
  // Same UX as the create-coupon modal. We toggle overflow on
  // <body> so the page behind the modal doesn't scroll when the
  // user presses arrow keys or accidentally scrolls the wheel.
  // Cleanup restores the previous value (in case some other
  // component had set overflow already — though we don't have
  // any such case today, defensive coding is cheap).
  useEffect(() => {
    if (!pendingConflict) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Autofocus the cancel button (the safer default) on open.
    // requestAnimationFrame defers to after the modal mounts +
    // the browser's default focus settles.
    requestAnimationFrame(() => {
      cancelButtonRef.current?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingConflict]);

  // ----- Close on Escape -----
  // The cancel handler is the same as clicking the backdrop —
  // both dismiss the modal without changing the cart.
  useEffect(() => {
    if (!pendingConflict) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelAdd();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pendingConflict, cancelAdd]);

  // Don't render anything when there's no conflict. The component
  // is mounted at the top of the tree, so it stays subscribed
  // to the context even when no modal is visible.
  if (!pendingConflict) return null;

  const { pendingItem, pendingQuantity, conflictRestaurant } = pendingConflict;

  return (
    <>
      {/* Backdrop — click to cancel. z-[60] puts it above the
          rest of the app (NavBar is z-30, modals in the app
          use z-50). We use a higher number to make sure this
          overlay sits on top of any other modals that might
          be open (e.g. the Stripe payment form). */}
      <div
        className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-conflict-title"
        onClick={(e) => {
          // Only close if the click landed on the backdrop,
          // not the modal card. The card has its own
          // onClick stopPropagation below.
          if (e.target === e.currentTarget) {
            cancelAdd();
          }
        }}
      >
        {/* ----- Modal card ----- */}
        {/* Stop propagation so a click INSIDE the card doesn't
            bubble to the backdrop and dismiss the modal. The
            card has its own background and rounded corners,
            so the user can clearly see what's "inside". */}
        <div
          className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ----- Header ----- */}
          {/* Orange-tinted top section to draw the eye — this
              is a warning / decision moment, not a normal flow
              step. The icon is a triangle-warning, not a
              question mark, because the rule is firm: the user
              can't keep both restaurants' items in one cart. */}
          <div className="bg-orange-50 px-6 py-5 flex items-start gap-3 border-b border-orange-100">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="cart-conflict-title"
                className="text-lg font-bold text-gray-900"
              >
                Start a new cart?
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                You can only order from one restaurant at a time.
              </p>
            </div>
            <button
              type="button"
              onClick={cancelAdd}
              aria-label="Close"
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 hover:bg-orange-100 rounded-full p-1 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ----- Body: two-cart comparison ----- */}
          {/* Side-by-side cards so the user can SEE the swap
              they're about to make. The current cart is on the
              left (with the item count), the new one on the
              right (with the new item). The arrow between them
              communicates "this becomes that". */}
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              {/* Current cart (left) */}
              <CartPreview
                title="Current cart"
                subtitle={
                  conflictRestaurant.itemCount === 1
                    ? "1 item"
                    : `${conflictRestaurant.itemCount} items`
                }
                restaurantName={conflictRestaurant.name}
                variant="current"
              />
              {/* Arrow */}
              <div className="flex-shrink-0 text-gray-400">
                <ArrowRight className="w-5 h-5" />
              </div>
              {/* New cart (right) */}
              <CartPreview
                title="New cart"
                subtitle={
                  pendingQuantity > 1
                    ? `${pendingQuantity}× ${pendingItem.name}`
                    : pendingItem.name
                }
                restaurantName={pendingItem.restaurantName}
                imageUrl={pendingItem.imageUrl}
                variant="new"
              />
            </div>

            <p className="text-sm text-gray-600 bg-gray-50 rounded-md p-3 border border-gray-200">
              Replacing your cart will remove{" "}
              <span className="font-semibold text-gray-800">
                {conflictRestaurant.itemCount} item
                {conflictRestaurant.itemCount === 1 ? "" : "s"} from{" "}
                {conflictRestaurant.name}
              </span>
              .
            </p>
          </div>

          {/* ----- Footer ----- */}
          <div className="px-6 py-4 bg-gray-50 border-t flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              ref={cancelButtonRef}
              variant="outline"
              onClick={cancelAdd}
              className="w-full sm:w-auto"
            >
              Keep current cart
            </Button>
            <Button
              onClick={confirmReplace}
              className="w-full sm:w-auto bg-orange hover:bg-hoverOrange"
            >
              <ShoppingBag className="w-4 h-4 mr-2" />
              Replace cart
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default CartConflictModal;

// ============================================================
// CART PREVIEW (sub-component)
// ============================================================
// A small "card" showing one side of the conflict: the current
// cart or the new cart. The "current" variant uses neutral colors
// (it represents what's already there); the "new" variant uses
// the app's orange accent (it represents the action the user is
// about to take).
const CartPreview = ({
  title,
  subtitle,
  restaurantName,
  imageUrl,
  variant,
}: {
  title: string;
  subtitle: string;
  restaurantName: string;
  imageUrl?: string;
  variant: "current" | "new";
}) => {
  return (
    <div
      className={
        // Current: gray-tinted border, neutral. New: orange-tinted
        // border, app accent. Both have a light tinted background.
        variant === "current"
          ? "rounded-lg border border-gray-200 bg-gray-50 p-3"
          : "rounded-lg border border-orange-200 bg-orange-50/60 p-3"
      }
    >
      <p
        className={
          variant === "current"
            ? "text-xs font-semibold text-gray-500 uppercase tracking-wide"
            : "text-xs font-semibold text-orange-700 uppercase tracking-wide"
        }
      >
        {title}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        {/* Tiny thumbnail — only the new side typically has an
            image (the current side just has a name + count). */}
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="w-9 h-9 rounded-md object-cover flex-shrink-0 bg-gray-100"
          />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {restaurantName}
          </p>
          <p className="text-xs text-gray-600 truncate">{subtitle}</p>
        </div>
      </div>
    </div>
  );
};
