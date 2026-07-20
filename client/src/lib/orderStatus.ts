// src/lib/orderStatus.ts
// ===============================
// Purpose: Shared types, labels, and colors for order status / payment status.
//
// Why this file exists:
//   Two pages need to display the same status fields with the same colors and
//   labels (admin OrdersPage + user UserOrdersPage). If we duplicated the
//   constants in both files, a change to "Pending" → "Received" in one would
//   silently be missed in the other. Centralizing them here keeps both views
//   in sync by construction.
//
// Visual design (Tailwind classes):
//   - The badges use bg-{color}-100 + text-{color}-800 + border-{color}-300.
//     This is the standard "soft badge" pattern — readable on white, clearly
//     distinguishable from each other, accessible contrast ratios.
// ===============================

// ============================================================
// TYPES
// ============================================================

// The lifecycle of an order. The backend model has 6 values, but per the
// project's UX spec, the admin only SETS 5 (no "confirmed" — the system
// skips that stage). "Confirmed" is still a valid value on existing orders
// from the seed data, so we keep it in the type.
export type OrderStatus =
  | "placed"
  | "confirmed"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

// Payment status — independent of order status. An order can be "delivered"
// with payment "pending" (cash on delivery), or "preparing" with payment
// "paid" (online payment up-front). The two fields update separately.
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

// One line item inside an order. `name` and `price` are snapshots from the
// menu item at order time, so the order still shows the correct name/price
// even if the menu item later changes name, price, or gets deleted.
export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}

// The shape of an order as returned by the backend. `user` and `restaurant`
// are populated differently depending on the endpoint:
//   - GET /api/orders/my   → restaurant is populated, user is just the ID
//   - GET /api/orders      (admin) → BOTH are populated
//   - POST /api/orders     → neither is populated
// We type `user` as optional so both views can share this interface.
export interface Order {
  _id: string;
  user?: { _id?: string; fullname?: string; email?: string };
  restaurant: { _id: string; name: string; city?: string; imageUrl?: string };
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  totalPrice: number;
  deliveryAddress: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  // ----- Rider (assigned by admin) -----
  // Populated by the backend in all GET endpoints with fullname +
  // contact (phone). `null` when no rider is assigned yet.
  // The customer sees this immediately on assignment (per the spec).
  rider?: { _id: string; fullname: string; contact: string } | null;
  // ----- Rider snapshot (frozen at delivery) -----
  // When the order transitions to "delivered", the server copies
  // the rider's name + phone + a timestamp into this subdoc. For
  // delivered orders, the customer-facing views display THIS (not
  // the live `rider` ref) so the historical record can't drift
  // when the rider's account later changes (rename, phone change,
  // deletion, blacklist). The fields are all optional / nullable
  // because the snapshot is only set on delivery.
  riderSnapshot?: {
    fullname: string | null;
    contact: string | null;
    capturedAt: string | null;   // ISO date
  } | null;
  // ----- Review fields (set after the customer rates a delivered order) -----
  // All optional — undefined for orders that haven't been reviewed yet.
  rating?: number;          // 1-5
  reviewComment?: string;   // optional text
  reviewedAt?: string;      // ISO date
  // ----- Rider review (independent of food review) -----
  // Same one-shot pattern. Set when the customer rates the delivery
  // rider; only present if the order had a rider assigned.
  riderRating?: number;          // 1-5
  riderReviewComment?: string;   // optional text
  riderReviewedAt?: string;      // ISO date
  // ----- Coupon / promo code (denormalized snapshot) -----
  // Set when the order was placed with a valid coupon. The server
  // stores BOTH the code AND the Rupee discount that was applied,
  // so the historical order stays readable even if the coupon is
  // later edited or deleted by an admin. `couponCode` is null
  // when no coupon was used.
  couponCode?: string | null;
  couponDiscount?: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// RIDER INFO HELPER
// ============================================================
// Returns the name + phone that should be DISPLAYED for this order's
// rider. For delivered orders, prefer the snapshot (the historical
// record at the moment of delivery). For non-delivered orders, use
// the live `rider` ref (the current assignment).
//
// Returns `null` when neither is available (no rider ever assigned).
//
// Why a helper and not inline `order.rider ?? order.riderSnapshot`?
// Because we want the "snapshot wins if present and order is delivered"
// rule in one place — every view (customer card, admin detail modal,
// review modal) uses this same rule, and the conditional is non-trivial
// (snapshot has nullable inner fields, not just null/undefined).
export interface DisplayRiderInfo {
  fullname: string;
  contact: string;
  // true if the data is from the snapshot (frozen at delivery),
  // false if it's from the live `rider` ref (current assignment).
  isFromSnapshot: boolean;
}

export const getDisplayRider = (order: Order): DisplayRiderInfo | null => {
  // For delivered orders with a snapshot, use the snapshot. The
  // snapshot fields are individually nullable, so we need to check
  // each one (a malformed snapshot shouldn't crash the UI).
  if (
    order.status === "delivered" &&
    order.riderSnapshot?.capturedAt &&
    order.riderSnapshot.fullname
  ) {
    return {
      fullname: order.riderSnapshot.fullname,
      contact: order.riderSnapshot.contact || "",
      isFromSnapshot: true,
    };
  }
  // Otherwise use the live ref. The backend populates this for all
  // GET endpoints (with fullname + contact), so a null/undefined
  // rider means the order never had one assigned.
  if (order.rider?.fullname) {
    return {
      fullname: order.rider.fullname,
      contact: order.rider.contact || "",
      isFromSnapshot: false,
    };
  }
  return null;
};

// A single rider row in the "assign rider" dropdown. Returned by
// GET /api/admin/riders/available, sorted by activeDeliveries asc
// (the first item is the auto-suggestion).
export interface AvailableRider {
  _id: string;
  fullname: string;
  email: string;
  contact?: string;
  isApproved: boolean;
  activeDeliveries: number;
  createdAt: string;
}

// ============================================================
// ORDER STATUS — colors + labels
// ============================================================

// Soft badge colors per status. Chosen so each status is visually distinct
// AND the order of severity roughly matches color: yellow (waiting) → blue
// (acknowledged) → orange (active) → purple (in transit) → green (done) →
// red (problem).
export const STATUS_COLORS: Record<OrderStatus, string> = {
  placed:           "bg-yellow-100 text-yellow-800 border-yellow-300",
  confirmed:        "bg-blue-100 text-blue-800 border-blue-300",
  preparing:        "bg-orange-100 text-orange-800 border-orange-300",
  out_for_delivery: "bg-purple-100 text-purple-800 border-purple-300",
  delivered:        "bg-green-100 text-green-800 border-green-300",
  cancelled:        "bg-red-100 text-red-800 border-red-300",
};

// Human-readable status labels. "placed" displays as "Pending acceptance"
// because the new admin-accept workflow makes the distinction important:
// before acceptance, the order is queued for admin review; after, the
// kitchen + rider flow takes over. The backend value stays "placed" so the
// API contract doesn't change.
export const STATUS_LABELS: Record<OrderStatus, string> = {
  placed:           "Pending acceptance",
  confirmed:        "Accepted",
  preparing:        "Preparing",
  out_for_delivery: "Out for delivery",
  delivered:        "Delivered",
  cancelled:        "Cancelled",
};

// The 6 statuses the admin can SET via the order-status update endpoint.
// "confirmed" is now included — the dedicated Accept / Reject endpoints
// are the typical path, but admins can still manually transition via the
// status dropdown if they need to (e.g. correct a misclick).
export const ADMIN_SETTABLE_STATUSES: OrderStatus[] = [
  "placed",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

// ============================================================
// PAYMENT STATUS — colors + labels
// ============================================================
// Same soft-badge pattern, but for the payment field.
export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  pending:  "bg-yellow-100 text-yellow-800 border-yellow-300",
  paid:     "bg-green-100 text-green-800 border-green-300",
  failed:   "bg-red-100 text-red-800 border-red-300",
  refunded: "bg-purple-100 text-purple-800 border-purple-300",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending:  "Pending",
  paid:     "Paid",
  failed:   "Failed",
  refunded: "Refunded",
};
