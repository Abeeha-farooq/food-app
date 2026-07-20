// src/context/CartContext.tsx
// ===============================
// Purpose: Global cart state with localStorage persistence.
//
// Like AuthContext, this is a "radio station" — any component can call
// useCart() to read items, add items, remove items, etc.
//
// We persist to localStorage so the cart survives page refreshes.
// For a real app with multiple devices, you'd persist to the backend instead.
//
// One-cart-per-restaurant rule (enforced here, not in components):
//   When the user tries to add an item from a DIFFERENT restaurant
//   than what's already in the cart, addItem does NOT mutate the
//   cart. Instead, it parks the request in `pendingConflict` and
//   surfaces a confirmation modal (<CartConflictModal />).
//   The user must confirm "Replace cart" or "Keep current cart"
//   before the cart actually changes.
//
// Why in the context, not in each caller:
//   Putting the check here means every caller (RestaurantDetailPage,
//   AddToCartDemoPage, future "Quick add" widgets) gets the same
//   behavior automatically. If we put it in each component, we'd
//   have to remember to add the check every time — one missed
//   caller and the rule is broken.
// ===============================

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { type CartItem } from "./cart-types";
import {
  CartContext,
  type CartConflict,
  type CartContextValue,
} from "./cart-context";

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

  // Pending cross-restaurant add request. Non-null means a
  // confirmation modal should be visible. The modal reads this
  // and calls `confirmReplace` or `cancelAdd` to dismiss.
  const [pendingConflict, setPendingConflict] = useState<CartConflict | null>(null);

  // Persist to localStorage whenever items change.
  useEffect(() => {
    saveToStorage(items);
  }, [items]);

  // Generate a stable id for cart line items.
  // Same dish from same restaurant = same cart line.
  const makeId = (menuItemId: string, restaurantId: string) =>
    `${menuItemId}__${restaurantId}`;

  // ----- Helper: do the actual "add" (no conflict check) -----
  // Used by confirmReplace (when the user OKs the replacement).
  // Pulled out so the same logic isn't duplicated in two places.
  // Wrapped in useCallback so it has a stable reference for the
  // confirmReplace callback below.
  //
  // IMPORTANT — the toast is OUTSIDE the setItems updater. In React
  // 18 StrictMode (dev mode), setState updaters are called TWICE to
  // catch impure functions. Side effects inside the updater (like
  // toast.success) would fire twice. We use a closure variable
  // (`wasNew`) to record the result of the updater, then fire the
  // toast in the event-handler scope where it runs once.
  const performAdd = useCallback(
    (item: Omit<CartItem, "id" | "quantity">, quantity: number) => {
      const id = makeId(item.menuItemId, item.restaurantId);
      let wasNew = false;
      setItems((prev) => {
        const existing = prev.find((i) => i.id === id);
        if (existing) {
          // Already in cart — just bump the quantity
          return prev.map((i) =>
            i.id === id ? { ...i, quantity: i.quantity + quantity } : i
          );
        }
        // New item — record it so the caller can fire the toast
        wasNew = true;
        return [...prev, { ...item, id, quantity }];
      });
      if (wasNew) {
        toast.success(`Added ${item.name} to cart`);
      }
    },
    []
  );

  const addItem: CartContextValue["addItem"] = (item, quantity = 1) => {
    // ----- CROSS-RESTAURANT CHECK -----
    // We only enforce the rule when the cart is non-empty AND the
    // new item is from a different restaurant. If the cart is
    // empty, there's nothing to conflict with. If it's the same
    // restaurant, the existing merge-by-id logic handles it.
    //
    // We deliberately do NOT check this for updateQuantity or
    // removeItem — those operate on items already in the cart, so
    // they can't trigger a cross-restaurant conflict.
    //
    // We use closure variables to communicate the result of the
    // updater out, so side effects (toast / modal) fire ONCE in the
    // event-handler scope — not inside the updater where React 18
    // StrictMode would invoke them twice.
    let wasNew = false;
    let hadConflict = false;
    let conflictData: CartConflict | null = null;

    setItems((currentItems) => {
      if (currentItems.length > 0) {
        const currentRestaurantId = currentItems[0].restaurantId;
        if (currentRestaurantId !== item.restaurantId) {
          // CONFLICT — don't add. Park the request and surface
          // the modal. We capture the data here and schedule the
          // setState OUTSIDE the updater (via queueMicrotask in
          // the post-setItems block) so the updater stays pure.
          //
          // We read `currentItems` (the live cart at the time
          // of the add call) instead of the `items` state
          // variable to avoid a stale-closure bug: the user
          // could add multiple items in quick succession
          // before React re-renders, and each setItems call
          // sees the latest currentItems.
          hadConflict = true;
          conflictData = {
            pendingItem: item,
            pendingQuantity: quantity,
            conflictRestaurant: {
              id: currentRestaurantId,
              name: currentItems[0].restaurantName,
              itemCount: currentItems.reduce(
                (sum, i) => sum + i.quantity,
                0
              ),
            },
          };
          return currentItems;   // no-op — don't mutate the cart
        }
      }
      // No conflict — add directly (inline merge, since we're
      // already inside the setItems updater and must derive the
      // new state, not side-effect it).
      const id = makeId(item.menuItemId, item.restaurantId);
      const existing = currentItems.find((i) => i.id === id);
      if (existing) {
        return currentItems.map((i) =>
          i.id === id ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      wasNew = true;
      return [...currentItems, { ...item, id, quantity }];
    });

    // Side effects fire ONCE here (event-handler scope, not inside
    // the updater — so StrictMode's double-invocation of the
    // updater doesn't double-fire them).
    if (hadConflict && conflictData) {
      queueMicrotask(() => setPendingConflict(conflictData));
    } else if (wasNew) {
      toast.success(`Added ${item.name} to cart`);
    }
  };

  // ----- Confirm: clear cart, add the pending item -----
  // Called by the modal's "Replace cart" button. This is the
  // only path that ACTUALLY wipes the cart and starts over with
  // the pending item from the new restaurant.
  const confirmReplace = useCallback(() => {
    if (!pendingConflict) return;
    const { pendingItem, pendingQuantity, conflictRestaurant } = pendingConflict;
    setItems([]);    // wipe the existing cart
    // performAdd uses the makeId from the closure; it sets
    // items and shows the success toast. We use
    // queueMicrotask so React batches the clear + add into a
    // single render (React 18+ auto-batches microtasks).
    queueMicrotask(() => {
      performAdd(pendingItem, pendingQuantity);
    });
    setPendingConflict(null);
    // Friendly toast so the user knows what just happened.
    // We mention the OLD restaurant by name so it's clear
    // which cart got replaced.
    toast.info(`Replaced ${conflictRestaurant.name} cart with ${pendingItem.restaurantName}`);
  }, [pendingConflict, performAdd]);

  // ----- Cancel: dismiss the modal, leave the cart alone -----
  // Called by the modal's "Keep current cart" button, by
  // clicking the backdrop, or by pressing Escape. We just
  // clear the pending state — the cart is untouched.
  const cancelAdd = useCallback(() => {
    setPendingConflict(null);
  }, []);

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
    // Capture the removed item's name OUTSIDE the updater so the
    // toast fires once (StrictMode invokes the updater twice).
    let removedName: string | null = null;
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) removedName = item.name;
      return prev.filter((i) => i.id !== id);
    });
    if (removedName) {
      toast.success(`Removed ${removedName} from cart`);
    }
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
    pendingConflict,
    confirmReplace,
    cancelAdd,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};