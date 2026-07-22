// src/rider/RiderOrders.tsx
// ===============================
// Purpose: The rider's "My Deliveries" page (URL: /rider/orders).
//          Lists every order assigned to the current rider, with
//          filter pills (All / Pending / Completed) and per-order
//          action buttons (Accept, Picked Up, Mark as Delivered).
// ===============================

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  STATUS_LABELS,
  type Order,
  type OrderStatus,
} from "@/lib/orderStatus";
import {
  ShoppingBag,
  MapPin,
  Phone,
  Package,
  Check,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

// ============================================================
// FILTER TABS
// ============================================================
type Filter = "all" | "pending" | "completed";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending Deliveries" },
  { value: "completed", label: "Completed" },
];

const RiderOrders = () => {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // Per-order action in flight — keyed by order id so we can show
  // a spinner on the right button.
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/orders/rider/me");
      setOrders(res.data.data);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // ----- Filter the list based on the active tab -----
  const filtered = useMemo(() => {
    if (!orders) return [];
    if (filter === "pending") {
      // "Pending" = anything in the delivery flow that's not
      // delivered/cancelled yet (assigned → picked up).
      return orders.filter(
        (o) => o.status !== "delivered" && o.status !== "cancelled"
      );
    }
    if (filter === "completed") {
      return orders.filter((o) => o.status === "delivered");
    }
    return orders;
  }, [orders, filter]);

  // ----- Action: Accept Order -----
  // Calls PATCH /orders/:id/rider-accept. Sets `riderAcceptedAt`
  // server-side. Idempotent on the server.
  const handleAccept = async (orderId: string) => {
    setBusyOrderId(orderId);
    try {
      await api.patch(`/orders/${orderId}/rider-accept`);
      toast.success("Order accepted");
      await fetchOrders();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyOrderId(null);
    }
  };

  // ----- Action: Picked Up / Mark as Delivered -----
  // Both go through the existing PATCH /orders/:id/status endpoint.
  // The server allows riders to set only "out_for_delivery" and
  // "delivered" (enforced in the controller).
  const handleStatus = async (orderId: string, newStatus: OrderStatus) => {
    setBusyOrderId(orderId);
    try {
      await api.patch(`/orders/${orderId}/status`, { status: newStatus });
      toast.success(
        newStatus === "out_for_delivery"
          ? "Marked as picked up"
          : "Marked as delivered"
      );
      await fetchOrders();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyOrderId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="My Deliveries" />
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-64" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchOrders} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<ShoppingBag className="text-orange" />}
        title="My Deliveries"
        subtitle="All orders assigned to you"
      />

      {/* ============== FILTER PILLS ============== */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                active
                  ? "bg-orange text-black border-orange"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* ============== ORDER LIST ============== */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <Package className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No orders here</h3>
            <p className="text-sm text-gray-500 mt-1">
              {filter === "completed"
                ? "You haven't delivered any orders yet."
                : "No new assignments right now."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <OrderCard
              key={order._id}
              order={order}
              busy={busyOrderId === order._id}
              onAccept={() => handleAccept(order._id)}
              onPickedUp={() => handleStatus(order._id, "out_for_delivery")}
              onDelivered={() => handleStatus(order._id, "delivered")}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// ORDER CARD — single order with all its details + action buttons
// ============================================================
const OrderCard = ({
  order,
  busy,
  onAccept,
  onPickedUp,
  onDelivered,
}: {
  order: Order;
  busy: boolean;
  onAccept: () => void;
  onPickedUp: () => void;
  onDelivered: () => void;
}) => {
  // Decide which action button (if any) to show based on the
  // current state. The order of these checks matters — we go
  // from "earliest action" to "latest".
  const showAccept =
    !order.riderAcceptedAt &&
    order.status !== "delivered" &&
    order.status !== "cancelled";
  const showPickedUp =
    order.riderAcceptedAt &&
    order.status !== "out_for_delivery" &&
    order.status !== "delivered" &&
    order.status !== "cancelled";
  const showDelivered = order.status === "out_for_delivery";

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* ----- Header: order id + status + total ----- */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-gray-900">
            #{order._id.slice(-8).toUpperCase()}
          </span>
          <OrderStatusBadge status={order.status} />
          <span className="ml-auto text-base font-bold text-gray-900">
            Rs. {order.totalPrice.toFixed(2)}
          </span>
        </div>

        {/* ----- Customer + phone ----- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-orange/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-semibold text-orange">
                {order.user?.fullname?.substring(0, 1).toUpperCase() || "C"}
              </span>
            </span>
            <div className="min-w-0">
              <p className="text-xs text-gray-500">Customer</p>
              <p className="font-medium text-gray-900 truncate">
                {order.user?.fullname || "—"}
              </p>
            </div>
          </div>
          {order.user?.contact && (
            <a
              href={`tel:${order.user.contact}`}
              className="flex items-start gap-2 hover:underline"
            >
              <Phone className="w-4 h-4 mt-0.5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <p className="font-medium text-orange">{order.user.contact}</p>
              </div>
            </a>
          )}
        </div>

        {/* ----- Pickup (restaurant) ----- */}
        <div className="flex items-start gap-2 text-sm p-3 bg-blue-50 border border-blue-100 rounded-md">
          <MapPin className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-blue-600 font-medium">Pickup from</p>
            <p className="font-medium text-gray-900">
              {order.restaurant?.name || "—"}
            </p>
            {order.restaurant?.address && (
              <p className="text-xs text-gray-600 mt-0.5">
                {order.restaurant.address}
              </p>
            )}
          </div>
        </div>

        {/* ----- Delivery (customer address) ----- */}
        <div className="flex items-start gap-2 text-sm p-3 bg-orange-50 border border-orange-100 rounded-md">
          <MapPin className="w-4 h-4 mt-0.5 text-orange flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-orange font-medium">Deliver to</p>
            <p className="text-gray-900">{order.deliveryAddress || "—"}</p>
          </div>
        </div>

        {/* ----- Items ----- */}
        <div className="text-sm">
          <p className="text-xs text-gray-500 mb-1">Items</p>
          <ul className="space-y-1">
            {order.items.map((item, idx) => (
              <li key={idx} className="flex items-center justify-between text-gray-700">
                <span>
                  {item.quantity}× {item.name}
                </span>
                <span className="text-gray-500">
                  Rs. {(item.price * item.quantity).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-gray-700">
            <span>Subtotal</span>
            <span>Rs. {order.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-gray-700">
            <span>Delivery fee</span>
            <span>Rs. {order.deliveryFee.toFixed(2)}</span>
          </div>
        </div>

        {/* ----- Action buttons ----- */}
        {(showAccept || showPickedUp || showDelivered) && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-gray-100">
            {showAccept && (
              <Button
                type="button"
                onClick={onAccept}
                disabled={busy}
                className="flex-1 bg-orange hover:bg-hoverOrange text-white"
              >
                <Check className="w-4 h-4 mr-1.5" />
                Accept Order
              </Button>
            )}
            {showPickedUp && (
              <Button
                type="button"
                onClick={onPickedUp}
                disabled={busy}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Truck className="w-4 h-4 mr-1.5" />
                Picked Up
              </Button>
            )}
            {showDelivered && (
              <Button
                type="button"
                onClick={onDelivered}
                disabled={busy}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="w-4 h-4 mr-1.5" />
                Mark as Delivered
              </Button>
            )}
          </div>
        )}

        {/* If the order is in a state where no action is possible
            (delivered/cancelled), show a quiet status line instead
            of an empty actions area. */}
        {!showAccept && !showPickedUp && !showDelivered && (
          <div className="pt-2 border-t border-gray-100 text-sm text-gray-500 italic">
            No further action required — this order is {STATUS_LABELS[order.status]}.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RiderOrders;
