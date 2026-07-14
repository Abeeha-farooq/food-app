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
 * Shape of the value the CartContext provides.
 */
export interface CartContextValue {
  items: CartItem[];

  // Add a new item, or increase quantity if it already exists
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
});
