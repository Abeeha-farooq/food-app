// src/context/useCart.ts
// ===============================
// Purpose: The `useCart` hook — the "radio" that components use to
//          tune into the cart radio station.
//
// Why a separate file:
//   Fast Refresh needs CartContext.tsx (the Provider) to export ONLY
//   components. Splitting the hook out keeps the Provider file clean.
// ===============================

import { useContext } from "react";
import { CartContext } from "./cart-context";

/**
 * Access the cart state from any component.
 *
 * Usage:
 *   const { items, addItem, totalItems } = useCart();
 */
export const useCart = () => useContext(CartContext);
