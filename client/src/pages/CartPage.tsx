// src/pages/CartPage.tsx
// ===============================
// User Cart Page
// ===============================
// Shows the current user's cart with all the standard e-commerce bits:
//   - Item image
//   - Item name + restaurant it came from
//   - Price (per unit + line total)
//   - Quantity +/- controls
//   - Remove button
//   - Subtotal + total
//   - Checkout button (hands off to /checkout, which actually places the order)
//   - Empty state when cart is empty
//
// Auth: requires login (any role can technically see this page by URL,
// but the NavBar link is hidden for admin so the normal flow is users-only).
// ===============================

import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useCart } from "@/context/useCart";
import {
  Trash2,
  Plus,
  Minus,
  ShoppingCart,
  ArrowRight,
  Package,
} from "lucide-react";
import { toast } from "sonner";

const CartPage = () => {
  const navigate = useNavigate();
  const { items, updateQuantity, removeItem, clearCart, totalItems, totalPrice } = useCart();

  const deliveryFee = items.length > 0 ? 50 : 0;
  const grandTotal = totalPrice + deliveryFee;

  // Hand off to the Checkout page, which does the real order placement.
  // The Checkout page also handles the edge case of an empty cart
  // (it bounces you back here) — but we double-check just in case.
  const handleCheckout = () => {
    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }
    navigate("/checkout");
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {/* ==================== HEADER ==================== */}
      <PageHeader
        icon={<ShoppingCart />}
        title="My Cart"
        subtitle={
          totalItems === 0
            ? "Your cart is empty"
            : `${totalItems} item${totalItems === 1 ? "" : "s"} in your cart`
        }
        action={
          items.length > 0 && (
            <Button variant="outline" onClick={clearCart}>
              Clear cart
            </Button>
          )
        }
      />

      {/* ==================== EMPTY STATE ==================== */}
      {items.length === 0 && (
        <EmptyState
          icon={<Package />}
          title="Your cart is empty"
          description="Looks like you haven't added anything yet. Browse our restaurants and find something delicious!"
          variant="muted"
          ctaLabel="Browse restaurants"
          ctaTo="/filterPage"
        />
      )}

      {/* ==================== CART ITEMS + SUMMARY ==================== */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items list (left, takes 2/3 width on large screens) */}
          <div className="lg:col-span-2 space-y-3">
            {items.map((item) => (
              <Card
                key={item.id}
                className="hover:shadow-md hover:border-orange-200 transition-all duration-200"
              >
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {/* Item image */}
                    <div className="w-20 h-20 md:w-24 md:h-24 flex-shrink-0 bg-gray-100 rounded-md overflow-hidden">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <Package className="w-8 h-8" />
                        </div>
                      )}
                    </div>

                    {/* Item details */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {item.name}
                      </h3>
                      <p className="text-xs text-gray-500 mb-2">
                        From: {item.restaurantName}
                      </p>
                      <p className="text-sm text-gray-700">
                        Rs. {item.price.toFixed(2)}{" "}
                        <span className="text-gray-400 text-xs">/ unit</span>
                      </p>
                    </div>

                    {/* Quantity controls + remove */}
                    <div className="flex flex-col items-end gap-2">
                      <p className="font-semibold text-gray-900">
                        Rs. {(item.price * item.quantity).toFixed(2)}
                      </p>

                      <div className="flex items-center border border-gray-300 rounded-md">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          aria-label="Decrease quantity"
                          className="p-1.5 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="px-3 text-sm font-medium min-w-[2rem] text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          aria-label="Increase quantity"
                          className="p-1.5 hover:bg-gray-100 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      <button
                        onClick={() => removeItem(item.id)}
                        aria-label="Remove from cart"
                        className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Order summary (right, 1/3 width on large screens) */}
          <div className="lg:col-span-1">
            <Card className="sticky top-20">
              <CardContent className="p-6 space-y-3">
                <h3 className="font-bold text-lg mb-4">Order Summary</h3>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal ({totalItems} items)</span>
                  <span>Rs. {totalPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Delivery fee</span>
                  <span>Rs. {deliveryFee.toFixed(2)}</span>
                </div>

                <div className="border-t pt-3 mt-3">
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-orange-600">Rs. {grandTotal.toFixed(2)}</span>
                  </div>
                </div>

                <Button
                  onClick={handleCheckout}
                  className="w-full bg-orange hover:bg-hoverOrange mt-4"
                  size="lg"
                >
                  Checkout
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>

                <p className="text-xs text-gray-400 text-center mt-2">
                  Your order is placed on the next step
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartPage;