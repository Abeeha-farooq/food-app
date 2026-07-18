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
  createdAt: string;
  updatedAt: string;
}

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

// Human-readable status labels. "placed" displays as "Pending" because the
// project's UX spec uses that terminology (Pending / Preparing / Out for
// delivery / Delivered / Cancelled). The backend value stays "placed" so
// the API contract doesn't change.
export const STATUS_LABELS: Record<OrderStatus, string> = {
  placed:           "Pending",
  confirmed:        "Confirmed",
  preparing:        "Preparing",
  out_for_delivery: "Out for delivery",
  delivered:        "Delivered",
  cancelled:        "Cancelled",
};

// The 5 statuses the admin can SET via the order-status update endpoint.
// "confirmed" is intentionally excluded — the system auto-skips that stage
// in this project's workflow.
export const ADMIN_SETTABLE_STATUSES: OrderStatus[] = [
  "placed",
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
