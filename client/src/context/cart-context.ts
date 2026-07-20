// src/context/cart-context.ts
// ===============================
// Purpose: The shared CartContext object (and its value type).
//
// Why a separate file:
//   Same reason as auth-context.ts — splits the cart system across
//   3 files so each one exports only one kind of thing:
//     1. cart-context.ts  — this file: the context + value type
//     2. useCart.ts       — the `useCart` hook
//     3. CartContext.tsx  — the `CartProvider` component
// ===============================

import { createContext } from "react";
import { type CartItem } from "./cart-types";

/**
 * When the user tries to add an item from a different restaurant
 * than what's already in the cart, we DON'T add it immediately.
 * Instead, we park the request in `pendingConflict` and surface a
 * confirmation modal. This data shape is what the modal reads.
 *
 * - `pendingItem`       — the item the user wanted to add (sans id/quantity,
 *                         so the modal can describe it: name, price, image)
 * - `pendingQuantity`   — how many they wanted to add
 * - `conflictRestaurant` — the CURRENT cart's restaurant
 *                          (name + id + how many items are already in it,
 *                          so the modal can show "you have 3 items from X")
 */
export interface CartConflict {
  pendingItem: Omit<CartItem, "id" | "quantity">;
  pendingQuantity: number;
  conflictRestaurant: {
    id: string;
    name: string;
    itemCount: number;
  };
}

/**
 * Shape of the value the CartContext provides.
 */
export interface CartContextValue {
  items: CartItem[];

  // Add a new item, or increase quantity if it already exists.
  //
  // One-cart-per-restaurant rule:
  //   If the cart has items from a DIFFERENT restaurant than the
  //   one this item belongs to, addItem will NOT add the item
  //   immediately. Instead it sets `pendingConflict` (which the
  //   <CartConflictModal /> component watches). The user must
  //   confirm "Replace cart" or "Keep current cart" before
  //   addItem actually mutates the items array.
  addItem: (item: Omit<CartItem, "id" | "quantity">, quantity?: number) => void;

  // Set the quantity of an item to a specific value. If quantity becomes 0,
  // the item is removed.
  updateQuantity: (id: string, quantity: number) => void;

  // Remove an item from the cart entirely
  removeItem: (id: string) => void;

  // Empty the cart (e.g. after checkout)
  clearCart: () => void;

  // Convenience: total number of items (sum of quantities)
  totalItems: number;

  // Convenience: total price of all items
  totalPrice: number;

  // ----- Cross-restaurant conflict state -----
  // Non-null when the user tried to add from a different restaurant
  // and a confirmation is pending. The modal calls `confirmReplace`
  // (clears cart + adds the new item) or `cancelAdd` (clears the
  // pending state, leaves the cart alone).
  pendingConflict: CartConflict | null;
  confirmReplace: () => void;
  cancelAdd: () => void;
}

/**
 * The shared context object. Default values are placeholders; the real
 * values come from <CartProvider>.
 */
export const CartContext = createContext<CartContextValue>({
  items: [],
  addItem: () => {},
  updateQuantity: () => {},
  removeItem: () => {},
  clearCart: () => {},
  totalItems: 0,
  totalPrice: 0,
  pendingConflict: null,
  confirmReplace: () => {},
  cancelAdd: () => {},
});
