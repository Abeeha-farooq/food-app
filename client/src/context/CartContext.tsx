// src/context/CartContext.tsx
// ===============================
// Purpose: Global cart state with localStorage persistence.
//
// Like AuthContext, this is a "radio station" — any component can call
// useCart() to read items, add items, remove items, etc.
//
// We persist to localStorage so the cart survives page refreshes.
// For a real app with multiple devices, you'd persist to the backend instead.
// ===============================

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { type CartItem } from "./cart-types";
import { CartContext, type CartContextValue } from "./cart-context";

// ============================================================
// STORAGE — localStorage key + helpers
// ============================================================
const STORAGE_KEY = "foodapp_cart_v1";

const loadFromStorage = (): CartItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Basic sanity check
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item && typeof item.id === "string" && typeof item.quantity === "number"
    );
  } catch {
    // If localStorage is corrupted, just start fresh
    return [];
  }
};

const saveToStorage = (items: CartItem[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Quota exceeded or storage disabled — fail silently
  }
};

// ============================================================
// PROVIDER
// ============================================================
export const CartProvider = ({ children }: { children: ReactNode }) => {
  // Lazy init: read from localStorage on first render.
  // If we used useEffect + setState, the cart would briefly be empty
  // and the badge would flash "0 → N" on every page load.
  const [items, setItems] = useState<CartItem[]>(() => loadFromStorage());

  // Persist to localStorage whenever items change.
  useEffect(() => {
    saveToStorage(items);
  }, [items]);

  // Generate a stable id for cart line items.
  // Same dish from same restaurant = same cart line.
  const makeId = (menuItemId: string, restaurantId: string) =>
    `${menuItemId}__${restaurantId}`;

  const addItem: CartContextValue["addItem"] = (item, quantity = 1) => {
    const id = makeId(item.menuItemId, item.restaurantId);
    setItems((prev) => {
      const existing = prev.find((i) => i.id === id);
      if (existing) {
        // Already in cart — just bump the quantity
        return prev.map((i) =>
          i.id === id ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      // New item
      toast.success(`Added ${item.name} to cart`);
      return [...prev, { ...item, id, quantity }];
    });
  };

  const updateQuantity: CartContextValue["updateQuantity"] = (id, quantity) => {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity } : i))
    );
  };

  const removeItem: CartContextValue["removeItem"] = (id) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) toast.success(`Removed ${item.name} from cart`);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearCart = () => {
    setItems([]);
    toast.success("Cart cleared");
  };

  // useMemo so the totals don't recalculate on every render
  const { totalItems, totalPrice } = useMemo(() => {
    const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
    const price = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    return { totalItems: itemCount, totalPrice: price };
  }, [items]);

  const value: CartContextValue = {
    items,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    totalItems,
    totalPrice,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};