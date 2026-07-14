// src/admin/OrdersPage.tsx
// ===============================
// Orders Page — shared between admin and regular users
// ===============================
// Role-aware behavior:
//   - Admin       → fetches /api/orders        → sees ALL orders across all customers
//                   + can update status, sees Customer column, sees revenue stat
//   - Regular user → fetches /api/orders/my    → sees only THEIR own orders
//                   + no status update, no customer column, no revenue stat
//
// Routes using this component:
//   /admin/orders  → ProtectedRoute + RoleGuard(allow=["admin"])
//   /order/status  → ProtectedRoute only (any logged-in user)
// ===============================

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/ui/status-badge";
import { Loader2, Search, X, ChevronRight, Calendar, User, Store, MapPin, DollarSign, ShoppingBag, Clock, CheckCircle2, Truck, Inbox } from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
import {
  STATUS_COLORS,
  PAYMENT_STATUS_COLORS,
  STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  ADMIN_SETTABLE_STATUSES,
  type OrderStatus,
  type PaymentStatus,
  type Order,
} from "@/lib/orderStatus";

// ============================================================
// MAIN COMPONENT
// ============================================================
const OrdersPage = () => {
  // Get the logged-in user so we can decide what to show + where to fetch from
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // ----- State -----
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);   // for the detail modal
  // Track which order is currently being updated (for per-row spinner).
  // null = no update in progress. This is per-row so multiple rows can
  // show independent "Updating..." state.
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // ----- Fetch orders on mount AND whenever the user or filters change -----
  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id, statusFilter, paymentFilter]);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      // ROLE-BASED DATA SOURCE:
      //   - admin       → /api/orders      (all orders across all customers)
      //   - regular user → /api/orders/my   (only this user's own orders)
      const endpoint = isAdmin ? "/orders" : "/orders/my";
      const params: Record<string, string> = {};
      if (isAdmin) {
        // Only admin view supports these filters
        if (statusFilter !== "all")   params.status = statusFilter;
        if (paymentFilter !== "all")  params.paymentStatus = paymentFilter;
      }
      const res = await api.get(endpoint, { params });
      setOrders(res.data.data);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // ----- Update an order's status (admin only) -----
  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    if (!isAdmin) {
      toast.error("Only admins can change order status");
      return;
    }
    // Optimistic guard: if user picks the same status, don't fire a request.
    const current = orders.find((o) => o._id === orderId);
    if (current && current.status === newStatus) return;

    setUpdatingOrderId(orderId);
    try {
      const res = await api.patch(`/orders/${orderId}/status`, { status: newStatus });
      // Update in our local list
      setOrders((prev) =>
        prev.map((o) => (o._id === orderId ? res.data.data : o))
      );
      // Also update the selected order if it's open in the modal
      if (selectedOrder?._id === orderId) {
        setSelectedOrder(res.data.data);
      }
      toast.success(`Order status updated to "${STATUS_LABELS[newStatus]}"`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // ----- Update an order's payment status (admin only) -----
  // Separate from order status — they update independently.
  const updatePaymentStatus = async (orderId: string, newPaymentStatus: PaymentStatus) => {
    if (!isAdmin) {
      toast.error("Only admins can change payment status");
      return;
    }
    setUpdatingOrderId(orderId);
    try {
      const res = await api.patch(`/orders/${orderId}/payment`, { paymentStatus: newPaymentStatus });
      setOrders((prev) =>
        prev.map((o) => (o._id === orderId ? res.data.data : o))
      );
      if (selectedOrder?._id === orderId) {
        setSelectedOrder(res.data.data);
      }
      toast.success(`Payment status updated to "${PAYMENT_STATUS_LABELS[newPaymentStatus]}"`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // ----- Derived data: stats -----
  // useMemo recalculates only when `orders` changes (not on every render)
  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => o.status === "placed").length;
    const inProgress = orders.filter((o) =>
      ["confirmed", "preparing", "out_for_delivery"].includes(o.status)
    ).length;
    const delivered = orders.filter((o) => o.status === "delivered").length;
    // Only count revenue from actually-delivered orders (not cancelled)
    const revenue = orders
      .filter((o) => o.status === "delivered")
      .reduce((sum, o) => sum + o.totalPrice, 0);
    return { total, pending, inProgress, delivered, revenue };
  }, [orders]);

  // ----- Derived data: filtered orders -----
  const filteredOrders = useMemo(() => {
    let result = orders;
    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter((o) => o.status === statusFilter);
    }
    // Filter by search (order ID, customer name/email, or restaurant name)
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((o) => {
        // CRITICAL: `o.user` is OPTIONAL — in the user view it's just a String ID
        // (not populated by the backend), so we MUST use optional chaining throughout
        // or fall back to empty string. Otherwise the whole component crashes.
        const customerText = `${o.user?.fullname ?? ""} ${o.user?.email ?? ""}`.toLowerCase();
        return (
          o._id.toLowerCase().includes(query) ||
          customerText.includes(query) ||
          o.restaurant.name.toLowerCase().includes(query)
        );
      });
    }
    return result;
  }, [orders, statusFilter, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* ==================== HEADER ==================== */}
      <PageHeader
        title={isAdmin ? "All Orders" : "My Orders"}
        subtitle={isAdmin
          ? "Manage all orders across all restaurants"
          : "Track your past and current orders"}
      />

      {/* ==================== STATS CARDS ==================== */}
      {/* Same 4 cards for both views; revenue card is admin-only */}
      <div className={`grid grid-cols-2 ${isAdmin ? "md:grid-cols-5" : "md:grid-cols-4"} gap-4`}>
        <StatCard icon={<ShoppingBag className="w-5 h-5" />} label={isAdmin ? "Total" : "My orders"} value={stats.total} color="blue" />
        <StatCard icon={<Clock className="w-5 h-5" />}         label="Pending"  value={stats.pending}  color="yellow" />
        <StatCard icon={<Truck className="w-5 h-5" />}         label="In progress" value={stats.inProgress} color="orange" />
        <StatCard icon={<CheckCircle2 className="w-5 h-5" />}  label="Delivered" value={stats.delivered} color="green" />
        {isAdmin && (
          <StatCard icon={<DollarSign className="w-5 h-5" />} label="Revenue" value={`Rs. ${stats.revenue.toFixed(0)}`} color="purple" />
        )}
      </div>

      {/* ==================== FILTERS ==================== */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder={isAdmin
                ? "Search by order ID, customer, or restaurant"
                : "Search by order ID or restaurant"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {/* Status filter dropdown (admin only — user view doesn't filter by status) */}
          {isAdmin && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | OrderStatus)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          )}
          {/* Payment status filter (admin only) */}
          {isAdmin && (
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as "all" | PaymentStatus)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="all">All payments</option>
              {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          )}
          {/* Refresh button */}
          <Button onClick={fetchOrders} variant="outline" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
          </Button>
        </CardContent>
      </Card>

      {/* ==================== ORDERS TABLE ==================== */}
      <Card>
        <CardHeader>
          <CardTitle>
            Orders ({filteredOrders.length}
            {filteredOrders.length !== orders.length && ` of ${orders.length}`})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            // Skeleton rows — show 5 placeholder rows so the table doesn't jump
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32 flex-1" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-20 rounded-md" />
                  <Skeleton className="h-6 w-16 rounded-md" />
                </div>
              ))}
            </div>
          ) : error ? (
            // Inline error with retry — replaces the old toast-only behavior
            <div className="py-6">
              <ErrorState
                title="Couldn't load orders"
                message={error}
                onRetry={fetchOrders}
              />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-6">
              <EmptyState
                icon={<Inbox />}
                title={orders.length === 0
                  ? isAdmin ? "No orders yet" : "You haven't placed any orders"
                  : "No orders match your filters"}
                description={orders.length === 0
                  ? isAdmin
                    ? "No orders have been placed yet. Once customers place orders, they'll show up here."
                    : "Browse restaurants and find something delicious to get started."
                  : "Try adjusting your filters or search query."}
                ctaLabel={orders.length === 0 && !isAdmin ? "Browse restaurants" : undefined}
                ctaTo={orders.length === 0 && !isAdmin ? "/filterPage" : undefined}
                variant="muted"
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 border-b">
                  <tr>
                    <th className="py-2 px-2">Order ID</th>
                    {/* Customer column only for admin — for regular users, every row IS the customer */}
                    {isAdmin && <th className="py-2 px-2">Customer</th>}
                    <th className="py-2 px-2">Restaurant</th>
                    <th className="py-2 px-2">Items</th>
                    <th className="py-2 px-2 text-right">Total</th>
                    <th className="py-2 px-2">Status</th>
                    {/* Payment column shown to both admin and users — they both care about this */}
                    <th className="py-2 px-2">Payment</th>
                    <th className="py-2 px-2">Date</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr
                      key={order._id}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <td className="py-3 px-2 font-mono text-xs text-gray-600">
                        #{order._id.slice(-8).toUpperCase()}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-2">
                          <div className="font-medium">{order.user?.fullname || "—"}</div>
                          <div className="text-xs text-gray-500">{order.user?.email || "—"}</div>
                        </td>
                      )}
                      <td className="py-3 px-2">{order.restaurant.name}</td>
                      <td className="py-3 px-2 text-gray-600">
                        {order.items.reduce((sum, i) => sum + i.quantity, 0)} items
                      </td>
                      <td className="py-3 px-2 text-right font-semibold">
                        Rs. {order.totalPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-2">
                        {isAdmin ? (
                          // ----- Admin: inline status dropdown -----
                          // Editable per row. When changed, hits
                          // PATCH /api/orders/:id/status for THIS order only.
                          // The local list + modal are updated optimistically
                          // on success, and a small spinner shows while waiting.
                          <div className="flex items-center gap-2">
                            <select
                              aria-label="Change order status"
                              value={order.status}
                              disabled={updatingOrderId === order._id}
                              onChange={(e) =>
                                updateStatus(
                                  order._id,
                                  e.target.value as OrderStatus
                                )
                              }
                              className="text-xs rounded-md border border-gray-300 bg-white px-2 py-1 pr-7 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-w-[140px]"
                            >
                              {ADMIN_SETTABLE_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                            {updatingOrderId === order._id && (
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin text-orange-500 shrink-0"
                                aria-label="Updating"
                              />
                            )}
                          </div>
                        ) : (
                          // ----- Regular user: read-only badge -----
                          <OrderStatusBadge status={order.status} />
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <PaymentStatusBadge status={order.paymentStatus} />
                      </td>
                      <td className="py-3 px-2 text-gray-600 text-xs">
                        {new Date(order.createdAt).toLocaleDateString()}
                        <br />
                        <span className="text-gray-400">
                          {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ==================== DETAIL MODAL ==================== */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdateStatus={updateStatus}
          onUpdatePaymentStatus={updatePaymentStatus}
          updating={updatingOrderId === selectedOrder?._id}
          canEdit={isAdmin}
        />
      )}
    </div>
  );
};

export default OrdersPage;

// ============================================================
// SUB-COMPONENTS (kept in same file since they're tightly coupled)
// ============================================================

// Small stat card used at the top
const StatCard = ({
  icon, label, value, color,
}: { icon: React.ReactNode; label: string; value: number | string; color: string }) => {
  const colorClasses: Record<string, string> = {
    blue:   "bg-blue-50 text-blue-700",
    yellow: "bg-yellow-50 text-yellow-700",
    orange: "bg-orange-50 text-orange-700",
    green:  "bg-green-50 text-green-700",
    purple: "bg-purple-50 text-purple-700",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className={`p-1.5 rounded ${colorClasses[color]}`}>{icon}</span>
          {label}
        </div>
        <div className="text-2xl font-bold mt-2">{value}</div>
      </CardContent>
    </Card>
  );
};

// Detail modal — shows full order info + status/payment update controls (admin only)
const OrderDetailModal = ({
  order, onClose, onUpdateStatus, onUpdatePaymentStatus, updating, canEdit,
}: {
  order: Order;
  onClose: () => void;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onUpdatePaymentStatus: (id: string, paymentStatus: PaymentStatus) => void;
  updating: boolean;
  canEdit: boolean;   // true only for admin
}) => {
  return (
    <div
      // Fixed overlay covers the whole screen with a semi-transparent backdrop
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        // Modal panel
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        // Stop propagation so clicking inside the modal doesn't close it
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Order Details</h2>
            <p className="text-sm text-gray-500 font-mono">#{order._id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* ====== ORDER STATUS row ====== */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Order status:</span>
              <span
                className={`inline-block px-3 py-1 text-sm font-medium rounded-md border ${STATUS_COLORS[order.status]}`}
              >
                {STATUS_LABELS[order.status]}
              </span>
            </div>
            {canEdit && (
              <div className="md:ml-auto flex items-center gap-2">
                <span className="text-sm text-gray-500">Update:</span>
                {/* Only the 5 statuses the admin can set (no "confirmed") */}
                <select
                  value={order.status}
                  disabled={updating}
                  onChange={(e) => onUpdateStatus(order._id, e.target.value as OrderStatus)}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50"
                >
                  {ADMIN_SETTABLE_STATUSES.map((value) => (
                    <option key={value} value={value}>{STATUS_LABELS[value]}</option>
                  ))}
                </select>
                {updating && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              </div>
            )}
          </div>

          {/* ====== PAYMENT STATUS row (separate from order status) ====== */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Payment:</span>
              <span
                className={`inline-block px-3 py-1 text-sm font-medium rounded-md border ${PAYMENT_STATUS_COLORS[order.paymentStatus]}`}
              >
                {PAYMENT_STATUS_LABELS[order.paymentStatus]}
              </span>
            </div>
            {canEdit && (
              <div className="md:ml-auto flex items-center gap-2">
                <span className="text-sm text-gray-500">Update:</span>
                <select
                  value={order.paymentStatus}
                  disabled={updating}
                  onChange={(e) => onUpdatePaymentStatus(order._id, e.target.value as PaymentStatus)}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50"
                >
                  {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {updating && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              </div>
            )}
          </div>

          {/* Customer info — only relevant in admin view (in user view, the customer is "you") */}
          {canEdit && (
            <InfoRow icon={<User className="w-4 h-4" />} label="Customer">
              <div className="font-medium">{order.user?.fullname || "—"}</div>
              <div className="text-sm text-gray-500">{order.user?.email || "—"}</div>
            </InfoRow>
          )}

          {/* Restaurant info */}
          <InfoRow icon={<Store className="w-4 h-4" />} label="Restaurant">
            <div className="font-medium">{order.restaurant.name}</div>
            <div className="text-sm text-gray-500">{order.restaurant.city}</div>
          </InfoRow>

          {/* Delivery address */}
          <InfoRow icon={<MapPin className="w-4 h-4" />} label="Delivery address">
            <div>{order.deliveryAddress}</div>
          </InfoRow>

          {/* Items */}
          <InfoRow icon={<ShoppingBag className="w-4 h-4" />} label="Items">
            <div className="space-y-1">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span>
                    {item.quantity}× {item.name}
                  </span>
                  <span className="text-gray-600">
                    Rs. {(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </InfoRow>

          {/* Price breakdown */}
          <InfoRow icon={<DollarSign className="w-4 h-4" />} label="Price">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span>Rs. {order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Delivery fee</span>
                <span>Rs. {order.deliveryFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-1 border-t">
                <span>Total</span>
                <span>Rs. {order.totalPrice.toFixed(2)}</span>
              </div>
            </div>
          </InfoRow>

          {/* Dates */}
          <InfoRow icon={<Calendar className="w-4 h-4" />} label="Timeline">
            <div className="text-sm text-gray-600">
              Placed: {new Date(order.createdAt).toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">
              Last updated: {new Date(order.updatedAt).toLocaleString()}
            </div>
          </InfoRow>
        </div>

        {/* Footer with close button */}
        <div className="p-4 border-t flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
};

// Small reusable row: icon + label on left, content on right
const InfoRow = ({
  icon, label, children,
}: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    <div className="flex items-center gap-1.5 text-gray-500 mt-0.5 min-w-[120px]">
      {icon}
      <span className="text-sm">{label}</span>
    </div>
    <div className="flex-1">{children}</div>
  </div>
);