// src/pages/UserOrdersPage.tsx
// ===============================
// Purpose: Show the logged-in user their own order history.
//
// Architecture:
//   - Fetches from GET /api/orders/my — already filters to the current user
//     server-side (via `req.user._id`), so this page is "dumb" — it just
//     renders whatever the server returns.
//   - Uses a card layout (one card per order) rather than a table. This is
//     more mobile-friendly and easier to read for end users. The admin's
//     OrdersPage uses a table because admins need to scan many rows at once;
//     regular users usually have just a handful of orders.
//   - All UI primitives come from the shared components/ui/ folder so the
//     empty state, error state, loading skeleton, and status badges stay
//     in sync with the rest of the app.
//
// Auto-review popup:
//   When the page loads, we check for delivered orders that haven't been
//   reviewed yet. If found, we open the ReviewModal automatically so the
//   user can rate their order without having to hunt for a button. This is
//   the "popup after delivery" feature from the spec — the user feels
//   prompted to give feedback instead of having to remember to do it.
// ===============================

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { StarRating } from "@/components/ui/StarRating";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/ui/status-badge";
import { ReviewModal, type ReviewableOrder } from "@/components/ReviewModal";
import api, { getErrorMessage } from "@/lib/api";
import { type Order } from "@/lib/orderStatus";
import { toast } from "sonner";
import {
  Package,
  ShoppingBag,
  Receipt,
  Store,
  Calendar,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// How many items to show in the collapsed view before adding "+N more".
// Beyond this, the user can click the card to expand the full list.
const COLLAPSE_THRESHOLD = 3;

// ============================================================
// MAIN COMPONENT
// ============================================================
const UserOrdersPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ----- Auto-review popup state -----
  // We track the list of orders that still need a review (delivered + no
  // rating yet). When this list is non-empty, we pop the modal for the
  // first one. After submit/skip, we drop it from the list and the next
  // unreviewed order (if any) becomes the new "current" one.
  const [pendingReviewIds, setPendingReviewIds] = useState<string[]>([]);
  // Whether the user dismissed all pending reviews this session. Prevents
  // the modal from re-popping every time they toggle a card expand.
  const [userDismissedReviews, setUserDismissedReviews] = useState(false);
  // The order currently being reviewed (or null if none / modal closed)
  const currentReviewOrder = useMemo(() => {
    if (userDismissedReviews) return null;
    const firstId = pendingReviewIds[0];
    if (!firstId) return null;
    return orders.find((o) => o._id === firstId) ?? null;
  }, [pendingReviewIds, orders, userDismissedReviews]);

  // ----- Fetch on mount -----
  // We extract the function so we can call it again from the "Try again"
  // button on the error state.
  const fetchMyOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/orders/my");
      // Backend wraps in ApiResponse: { statusCode, data, message, success }
      const fetched: Order[] = res.data.data;
      setOrders(fetched);

      // Build the pending-review queue. We only count orders that:
      //   - Have status === "delivered"
      //   - Don't have a rating yet (rating is null/undefined/0)
      // Sorted oldest-first so the user reviews the longest-waiting order
      // (better UX than reviewing the most recent one each time).
      const pending = fetched
        .filter((o) => o.status === "delivered" && !o.rating)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((o) => o._id);
      setPendingReviewIds(pending);
    } catch (err) {
      const message = getErrorMessage(err) || "Failed to load your orders";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyOrders();
  }, []);

  // ----- Submit a review -----
  const handleSubmitReview = async (rating: number, comment: string) => {
    if (!currentReviewOrder) return;
    try {
      await api.patch(`/orders/${currentReviewOrder._id}/review`, {
        rating,
        comment,
      });
      toast.success("Thanks for your review!");
      // Refresh the orders list so the new rating shows on the card
      await fetchMyOrders();
    } catch (err) {
      toast.error(getErrorMessage(err) || "Failed to submit review");
      throw err; // re-throw so the modal knows not to close
    }
  };

  // ----- Skip the current review -----
  // We mark "userDismissedReviews" so the modal doesn't keep popping for
  // the same orders on every interaction (expand a card, click refresh).
  // If the user wants to be re-prompted, they can refresh the page.
  const handleSkipReview = () => {
    setUserDismissedReviews(true);
  };

  // ----- Expand/collapse a card to show all items -----
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ============================================================
  // RENDER: loading state — animated skeleton cards
  // (3 placeholder cards so the layout doesn't jump when data loads)
  // ============================================================
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <PageHeader
          icon={<Receipt />}
          title="My Orders"
          subtitle={<Skeleton className="h-4 w-32 mt-1" />}
        />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20 rounded-md" />
                    <Skeleton className="h-6 w-16 rounded-md" />
                  </div>
                </div>
                <div className="border-t border-b border-gray-100 py-3 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER: error state — couldn't fetch orders, give the user a retry
  // ============================================================
  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <PageHeader icon={<Receipt />} title="My Orders" />
        <ErrorState
          title="Couldn't load your orders"
          message={error}
          onRetry={fetchMyOrders}
        />
      </div>
    );
  }

  // ============================================================
  // RENDER: empty state — the user hasn't placed any orders yet
  // ============================================================
  if (orders.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <PageHeader icon={<Receipt />} title="My Orders" />
        <EmptyState
          icon={<Package />}
          title="No orders yet"
          description="You haven't placed any orders. Browse our restaurants and find something delicious!"
          ctaLabel="Browse restaurants"
          ctaTo="/filterPage"
          className="mt-4"
        />
      </div>
    );
  }

  // ============================================================
  // RENDER: list of order cards
  // ============================================================
  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <PageHeader
        icon={<Receipt />}
        title="My Orders"
        subtitle={`${orders.length} order${orders.length === 1 ? "" : "s"} placed`}
        action={
          <button
            type="button"
            onClick={fetchMyOrders}
            disabled={loading}
            className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            Refresh
          </button>
        }
      />

      <div className="space-y-4">
        {orders.map((order) => (
          <OrderCard
            key={order._id}
            order={order}
            isExpanded={expandedIds.has(order._id)}
            onToggle={() => toggleExpanded(order._id)}
          />
        ))}
      </div>

      {/* Auto-review popup. Renders the ReviewModal whenever there's a
          delivered order that hasn't been reviewed AND the user hasn't
          dismissed the prompts this session. */}
      <ReviewModal
        order={currentReviewOrder as ReviewableOrder | null}
        open={!!currentReviewOrder}
        onSubmit={handleSubmitReview}
        onSkip={handleSkipReview}
      />
    </div>
  );
};

// ============================================================
// SUB-COMPONENT: One order card
// Renders all the order info the user spec asks for:
//   - Order ID  (top-right, short form like #ABC12345)
//   - Restaurant name + city
//   - Ordered items (collapsed by default if > 3 items)
//   - Total price (bottom-right)
//   - Payment status + order status badges
//   - Order date (bottom-left)
// ============================================================
interface OrderCardProps {
  order: Order;
  isExpanded: boolean;
  onToggle: () => void;
}

const OrderCard = ({ order, isExpanded, onToggle }: OrderCardProps) => {
  // Total quantity of items, e.g. "3 items"
  const totalQty = order.items.reduce((sum, i) => sum + i.quantity, 0);
  // How many items to show in collapsed mode
  const visibleItems = isExpanded
    ? order.items
    : order.items.slice(0, COLLAPSE_THRESHOLD);
  const hiddenCount = order.items.length - visibleItems.length;

  // Format the date in the user's locale (e.g. "Jul 11, 2026, 2:30 PM")
  const orderDate = new Date(order.createdAt).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // Short order ID for the badge — last 8 chars uppercase.
  // Full ID is in the data, but the UI only needs a recognizable short form.
  const shortId = order._id.slice(-8).toUpperCase();

  return (
    <Card className="hover:shadow-md hover:border-orange-200 transition-all duration-200">
      <CardContent className="p-5 space-y-4">
        {/* ----- Top row: restaurant + status badges ----- */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2 truncate">
              <Store className="w-4 h-4 text-orange-600 flex-shrink-0" />
              <span className="truncate">{order.restaurant.name}</span>
            </h2>
            {order.restaurant.city && (
              <p className="text-xs text-gray-500 mt-0.5">
                {order.restaurant.city}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
          </div>
        </div>

        {/* ----- Existing review (if any) -----
            Shown only on delivered orders that have been rated.
            Lets the user see their past review right on the card. */}
        {order.status === "delivered" && order.rating && (
          <div className="bg-orange-50 border border-orange-100 rounded-md p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-orange-800">Your review:</span>
              <StarRating value={order.rating} size="sm" />
            </div>
            {order.reviewComment && (
              <p className="text-sm text-gray-700 italic">
                "{order.reviewComment}"
              </p>
            )}
          </div>
        )}

        {/* ----- Items list (collapsed / expanded) ----- */}
        <div className="border-t border-b border-gray-100 py-3 space-y-1.5">
          {visibleItems.map((item, idx) => (
            <div
              key={`${order._id}-${idx}`}
              className="flex justify-between text-sm"
            >
              <span className="text-gray-700">
                <span className="font-medium text-gray-900">
                  {item.quantity}×
                </span>{" "}
                {item.name}
              </span>
              <span className="text-gray-600">
                Rs. {(item.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}

          {/* "+ N more items" / "Show less" toggle */}
          {(hiddenCount > 0 || isExpanded) && (
            <button
              type="button"
              onClick={onToggle}
              className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 mt-2 transition-colors"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  + {hiddenCount} more item{hiddenCount === 1 ? "" : "s"}
                </>
              )}
            </button>
          )}
        </div>

        {/* ----- Bottom row: order ID + date on the left, total on the right ----- */}
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div className="text-xs text-gray-500 space-y-0.5">
            <p>
              <span className="font-mono font-semibold text-gray-700">
                #{shortId}
              </span>
            </p>
            <p className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {orderDate}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">
              {totalQty} item{totalQty === 1 ? "" : "s"}
            </p>
            <p className="text-xl font-bold text-orange-600">
              Rs. {order.totalPrice.toFixed(2)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default UserOrdersPage;
