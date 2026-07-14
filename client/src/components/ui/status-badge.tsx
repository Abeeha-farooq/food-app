// src/components/ui/status-badge.tsx
// ===============================
// Purpose: Reusable status pill — used for both order status and payment
//          status across the app.
//
// Why this exists:
//   The exact same `inline-block px-2.5 py-1 text-xs font-medium rounded-md
//   border ${STATUS_COLORS[...]}` pattern is repeated 4+ times across
//   OrdersPage, UserOrdersPage, and Dashboard. Centralizing it means:
//     1. The visual style is consistent (same padding, same border radius,
//        same font size) — impossible to drift.
//     2. If we later want to add a tooltip or click-to-filter behavior, we
//        change it in ONE place.
//     3. Pages don't have to import the raw STATUS_COLORS map.
//
// The colors come from `lib/orderStatus` which is the single source of
// truth. The admin OrdersPage still imports the maps directly for
// dynamic option lists (e.g. "all 6 status colors"); this component is
// for display only.
// ===============================

import {
  STATUS_COLORS,
  STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/orderStatus";
import { cn } from "@/lib/utils";

export interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

export const OrderStatusBadge = ({ status, className }: OrderStatusBadgeProps) => (
  <span
    className={cn(
      "inline-block px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap",
      STATUS_COLORS[status],
      className
    )}
  >
    {STATUS_LABELS[status]}
  </span>
);

export interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  className?: string;
}

export const PaymentStatusBadge = ({ status, className }: PaymentStatusBadgeProps) => (
  <span
    className={cn(
      "inline-block px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap",
      PAYMENT_STATUS_COLORS[status],
      className
    )}
  >
    {PAYMENT_STATUS_LABELS[status]}
  </span>
);
