// src/context/cart-types.ts
// ===============================
// Purpose: Type definitions for the cart system.
//
// Why a separate file:
//   Same reason as auth-types.ts — Fast Refresh needs CartContext.tsx
//   to export ONLY components, not types. Putting `CartItem` here
//   keeps the context file clean for HMR.
// ===============================

/**
 * One item in the cart. We store enough info to render the cart row
 * without needing to re-fetch the menu item from the server every time.
 */
export interface CartItem {
  /**
   * A unique id for this cart line item.
   * We use `${menuItemId}__${restaurantId}` so the same dish from
   * different restaurants counts as different items.
   */
  id: string;
  menuItemId: string;
  restaurantId: string;
  restaurantName: string;
  name: string;
  price: number;
  imageUrl?: string;
  quantity: number;
}
