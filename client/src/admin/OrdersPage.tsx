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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/ui/status-badge";
import { Loader2, Search, X, ChevronRight, ChevronDown, Calendar, User, Store, MapPin, DollarSign, ShoppingBag, Clock, CheckCircle2, Truck, Inbox, Bike, Phone, Star, UserPlus, UserMinus, AlertTriangle, XCircle } from "lucide-react";
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
  type AvailableRider,
  getDisplayRider,
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

  // ----- Helper: drop an order from the list + close its detail modal -----
  // Used by terminal actions (cancel / reject). The order is still in
  // the database with status="cancelled" — it just disappears from
  // the admin's default "all" view so they don't see no-action rows.
  // If the admin wants to see cancelled orders, they can filter by
  // the "cancelled" status pill, or refresh the page to re-fetch
  // everything from the server.
  //
  // Defined as a `function` (hoisted) rather than `const` so it can
  // be referenced by any of the action handlers below without
  // ordering concerns.
  function removeOrderFromList(orderId: string) {
    setOrders((prev) => prev.filter((o) => o._id !== orderId));
    if (selectedOrder?._id === orderId) {
      setSelectedOrder(null);
    }
  }

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
      // Cancellation is a TERMINAL action — the order is done, no further
      // admin interaction is needed. Close the detail modal if it was open
      // and drop the order from the list (the row is still in the DB, the
      // admin can see it again by filtering for "cancelled" or by
      // refreshing the page; we just don't want it sitting in the
      // default "all" view as a no-action entry).
      if (newStatus === "cancelled") {
        removeOrderFromList(orderId);
      } else {
        // Update in our local list
        setOrders((prev) =>
          prev.map((o) => (o._id === orderId ? res.data.data : o))
        );
        // Also update the selected order if it's open in the modal
        if (selectedOrder?._id === orderId) {
          setSelectedOrder(res.data.data);
        }
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

  // ============================================================
  // RIDER ASSIGNMENT (admin only)
  // ============================================================
  // The OrderDetailModal fetches its own list of available riders
  // (lazy — only when opened) so we don't hit /api/admin/riders/available
  // on every page load. The modal handles the actual PATCH /api/orders/:id/rider
  // call too; this page just refreshes the local state when it succeeds.

  // Called by the modal after a successful assign/reassign/unassign.
  // Pulls the updated order (with rider populated) from the server
  // and merges it into both the list and the currently-open modal.
  const refreshOrder = async (orderId: string) => {
    try {
      const res = await api.get(`/orders/${orderId}`);
      const fresh = res.data.data;
      setOrders((prev) => prev.map((o) => (o._id === orderId ? fresh : o)));
      if (selectedOrder?._id === orderId) {
        setSelectedOrder(fresh);
      }
    } catch (err) {
      // Non-fatal — the order is still updated server-side, we just
      // couldn't pull the fresh copy. A toast lets the admin know.
      toast.error("Couldn't refresh order — please reload");
    }
  };

  // ============================================================
  // ACCEPT / REJECT ORDER
  // ============================================================
  // These are dedicated admin actions for the initial "placed" state
  // of an order. The endpoints are admin-only server-side.
  //
  // Accept: placed → confirmed. After this, the order is in the
  //   "post-accept" flow and the admin can assign a rider.
  // Reject: placed → cancelled. The customer can place a new order.
  //
  // We don't confirm with a modal — accept is positive (no
  // destructive action), and reject is reversible (the order is
  // just cancelled). A toast on success is enough.

  const acceptOrder = async (orderId: string) => {
    setUpdatingOrderId(orderId);
    try {
      const res = await api.post(`/orders/${orderId}/accept`);
      // Update the list + the open modal in place
      setOrders((prev) => prev.map((o) => (o._id === orderId ? res.data.data : o)));
      if (selectedOrder?._id === orderId) {
        setSelectedOrder(res.data.data);
      }
      toast.success("Order accepted");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // ----- Helper: drop an order from the list + close its detail modal -----
  // (see `removeOrderFromList` near the top of the component — it's
  // a function declaration so it's hoisted to the top of the scope
  // and can be referenced from any of the action handlers below.)

  const rejectOrder = async (orderId: string) => {
    // Confirm — rejection is destructive (cancels the order). The
    // user can re-place, but we want to make sure admin didn't
    // mis-click.
    const ok = window.confirm(
      "Reject this order?\n\nThe customer will see their order as cancelled and can place a new one."
    );
    if (!ok) return;
    setUpdatingOrderId(orderId);
    try {
      await api.post(`/orders/${orderId}/reject`);
      // Reject is terminal — close the detail modal (if it was open
      // showing this order) and remove the row from the list. The
      // order is still in the DB with status="cancelled"; the admin
      // can see it again by filtering for "cancelled".
      removeOrderFromList(orderId);
      toast.success("Order rejected");
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

    // ----- Sort: pending-acceptance orders first, then by createdAt DESC -----
    // Admin's "action queue" is `placed` orders (they need to be accepted
    // or rejected). Surfacing them at the top of the table means the admin
    // sees what needs their attention immediately, without scrolling
    // past hundreds of in-progress or delivered orders.
    //
    // Within each group (placed vs not-placed), newest first — matches
    // the server's default sort and keeps the action queue ordered
    // by recency (oldest pending last in the list).
    //
    // Note: this sort only runs on the admin view. The customer view
    // has no "action queue" so the natural newest-first order is
    // fine as-is.
    if (isAdmin) {
      const PLACED = "placed";
      result = [...result].sort((a, b) => {
        // Both placed → newer first
        if (a.status === PLACED && b.status === PLACED) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        // Only a is placed → a comes first
        if (a.status === PLACED) return -1;
        // Only b is placed → b comes first
        if (b.status === PLACED) return 1;
        // Neither is placed → newer first (preserve server order)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    return result;
  }, [orders, statusFilter, searchQuery, isAdmin]);

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
                          //
                          // We use Radix DropdownMenu (NOT a native <select>)
                          // for two reasons:
                          //   1. The row has an onClick that opens the detail
                          //      modal. A native <select> opened the OS dropdown
                          //      AND bubbled the click up to the row, opening
                          //      the modal at the same time (bug report). Radix
                          //      renders its own absolutely-positioned panel,
                          //      and we stopPropagation on the wrapper so the
                          //      row never sees the click.
                          //   2. The native dropdown also overlapped the row
                          //      awkwardly and was clipped by the table.
                          <div
                            className="flex items-center gap-2"
                            // Stop the click from bubbling up to the <tr> and
                            // opening the detail modal behind the dropdown.
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={updatingOrderId === order._id}
                                  className="h-7 text-xs justify-between min-w-[140px] px-2 py-1 border-gray-300 bg-white"
                                >
                                  <span>{STATUS_LABELS[order.status]}</span>
                                  <ChevronDown className="w-3.5 h-3.5 ml-2 opacity-60" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="start"
                                sideOffset={4}
                                // Reuse the trigger width so the panel lines
                                // up neatly with the small row button.
                                className="min-w-[var(--radix-dropdown-menu-trigger-width)] max-h-60"
                                // Click on the panel also shouldn't bubble to
                                // the row (defense-in-depth: Radix already
                                // portals it, but keeps the contract obvious).
                                onClick={(e) => e.stopPropagation()}
                              >
                                {ADMIN_SETTABLE_STATUSES.filter(
                                  (v) => v !== order.status
                                ).map((value) => (
                                  <DropdownMenuItem
                                    key={value}
                                    onSelect={() =>
                                      updateStatus(order._id, value)
                                    }
                                    className="cursor-pointer text-xs"
                                  >
                                    <span
                                      className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${STATUS_COLORS[value]}`}
                                    >
                                      {STATUS_LABELS[value]}
                                    </span>
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
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
          onAcceptOrder={acceptOrder}
          onRejectOrder={rejectOrder}
          updating={updatingOrderId === selectedOrder?._id}
          canEdit={isAdmin}
          onRiderChanged={() => refreshOrder(selectedOrder._id)}
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
  order, onClose, onUpdateStatus, onUpdatePaymentStatus, onAcceptOrder, onRejectOrder, updating, canEdit, onRiderChanged,
}: {
  order: Order;
  onClose: () => void;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onUpdatePaymentStatus: (id: string, paymentStatus: PaymentStatus) => void;
  onAcceptOrder: (id: string) => void;
  onRejectOrder: (id: string) => void;
  updating: boolean;
  canEdit: boolean;   // true only for admin
  onRiderChanged: () => void;
}) => {
  // ----- Rider assignment modal state -----
  // null = closed; object = open for that order
  const [riderModal, setRiderModal] = useState<{
    mode: "assign" | "reassign";
  } | null>(null);
  // The unassign action tracks its own spinner (we don't reuse
  // `updating` because that flag is also driven by status changes).
  const [unassigning, setUnassigning] = useState(false);

  // State flags for the order lifecycle. We derive these from the
  // current status so the UI can adapt to the right action set:
  //   - isPlaced: order is awaiting admin accept/reject decision
  //   - isTerminal: order is in a final state (delivered or cancelled)
  //     — no further actions, just display
  const isPlaced = order.status === "placed";
  const isTerminal = order.status === "delivered" || order.status === "cancelled";

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
          {/* ====== ORDER STATUS row ======
              Custom Radix DropdownMenu instead of native <select>.
              Why: the native <select> opens a system-level overlay
              that ignores CSS positioning, z-index, and overflow.
              It can extend past the modal's right edge and visually
              cover the order rows behind the modal (as shown in
              the bug report screenshot). The Radix DropdownMenu is
              a normal React-rendered panel that respects the modal's
              z-index, stays inside the modal, and can be styled
              cleanly. The hidden "Cancel" option (current status)
              keeps the dropdown from allowing a no-op selection. */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-500">Order status:</span>
              <span
                className={`inline-block px-3 py-1 text-sm font-medium rounded-md border ${STATUS_COLORS[order.status]}`}
              >
                {STATUS_LABELS[order.status]}
              </span>
            </div>
            {canEdit && !isPlaced && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-500">Update to:</span>
                {/* The status dropdown is hidden when the order is in
                    "placed" — the dedicated Accept / Reject buttons
                    below are the right action for that state. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={updating}
                      className="flex-1 sm:flex-none justify-between min-w-[180px] border-gray-300 bg-white"
                    >
                      <span>{STATUS_LABELS[order.status]}</span>
                      <ChevronDown className="w-4 h-4 ml-2 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    // align="end" puts the panel under the trigger's right
                    // edge, which keeps it inside the modal's right padding
                    // on narrow viewports. sideOffset=4 adds a small gap.
                    align="start"
                    sideOffset={4}
                    // Constrain the panel so it can't grow taller than
                    // the modal's content area and stay inside it.
                    className="min-w-[var(--radix-dropdown-menu-trigger-width)] max-h-60"
                  >
                    {ADMIN_SETTABLE_STATUSES.filter((v) => v !== order.status).map((value) => (
                      <DropdownMenuItem
                        key={value}
                        onSelect={() => onUpdateStatus(order._id, value)}
                        className="cursor-pointer"
                      >
                        {/* Small status pill that mirrors the badge
                            styling in the row above, so the dropdown
                            items visually match the current status
                            indicators the admin already knows. */}
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border mr-2 ${STATUS_COLORS[value]}`}>
                          {STATUS_LABELS[value]}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {updating && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              </div>
            )}
          </div>

          {/* ====== ACCEPT / REJECT buttons ======
              Shown only when the order is in the "placed" state.
              This is the primary way the admin handles new orders:
                - Accept → status becomes "confirmed" (then the admin
                  can assign a rider + the kitchen can start)
                - Reject → status becomes "cancelled" (the customer
                  can place a new order)
              We hide the regular status dropdown above for placed
              orders so the UI flow is unambiguous. */}
          {canEdit && isPlaced && (
            <div className="flex flex-col sm:flex-row gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex-1 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">This order is awaiting your decision.</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Accept to start preparation, or reject to cancel.
                    You can assign a rider only after the order is accepted.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:flex-shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onRejectOrder(order._id)}
                  disabled={updating}
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                >
                  {updating ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-1" />
                  )}
                  Reject
                </Button>
                <Button
                  type="button"
                  onClick={() => onAcceptOrder(order._id)}
                  disabled={updating}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {updating ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                  )}
                  Accept order
                </Button>
              </div>
            </div>
          )}

          {/* ====== PAYMENT STATUS row (separate from order status) ======
              Same Radix DropdownMenu pattern as the order status row.
              Custom panel (not native <select>) so the dropdown stays
              inside the modal and doesn't visually leak past the
              modal's right edge. */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-500">Payment:</span>
              <span
                className={`inline-block px-3 py-1 text-sm font-medium rounded-md border ${PAYMENT_STATUS_COLORS[order.paymentStatus]}`}
              >
                {PAYMENT_STATUS_LABELS[order.paymentStatus]}
              </span>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-500">Update to:</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={updating}
                      className="flex-1 sm:flex-none justify-between min-w-[160px] border-gray-300 bg-white"
                    >
                      <span>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
                      <ChevronDown className="w-4 h-4 ml-2 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={4}
                    className="min-w-[var(--radix-dropdown-menu-trigger-width)] max-h-60"
                  >
                    {Object.entries(PAYMENT_STATUS_LABELS)
                      .filter(([value]) => value !== order.paymentStatus)
                      .map(([value, label]) => (
                        <DropdownMenuItem
                          key={value}
                          onSelect={() => onUpdatePaymentStatus(order._id, value as PaymentStatus)}
                          className="cursor-pointer"
                        >
                          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border mr-2 ${PAYMENT_STATUS_COLORS[value as PaymentStatus]}`}>
                            {label}
                          </span>
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
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

          {/* Rider info — admin-only. Shown for ALL orders (including
              terminal ones) so the admin can see "who delivered this"
              on the historical record. The displayed name + phone use
              the same snapshot-wins rule as the customer card
              (getDisplayRider) so the two views stay in sync.

              Action buttons (Unassign / Reassign) only show for
              non-terminal orders — once delivered/cancelled, the
              assignment is final and we just display the frozen info. */}
          {canEdit && (() => {
            const displayRider = getDisplayRider(order);
            return (
              <InfoRow
                icon={<Bike className="w-4 h-4" />}
                label={displayRider?.isFromSnapshot ? "Delivered by" : "Rider"}
              >
                {displayRider ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1">
                      <div className="font-medium">{displayRider.fullname}</div>
                      <div className="text-sm text-gray-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {displayRider.contact || "—"}
                      </div>
                      {displayRider.isFromSnapshot && order.riderSnapshot?.capturedAt && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          frozen on {new Date(order.riderSnapshot.capturedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    {!isTerminal && (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={unassigning}
                          onClick={async () => {
                            setUnassigning(true);
                            try {
                              await api.patch(`/orders/${order._id}/rider`, { riderId: null });
                              toast.success("Rider unassigned");
                              onRiderChanged();
                            } catch (err) {
                              toast.error(getErrorMessage(err));
                            } finally {
                              setUnassigning(false);
                            }
                          }}
                        >
                          {unassigning ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <UserMinus className="w-4 h-4 mr-1" />
                          )}
                          Unassign
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setRiderModal({ mode: "reassign" })}
                        >
                          Reassign
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 italic">
                      {isPlaced
                        ? "Accept the order to enable rider assignment"
                        : "No rider assigned yet"}
                    </span>
                    {/* Assign button is hidden in two states:
                          1. Order is in "placed" — admin must accept first
                          2. Order is terminal (delivered/cancelled) */}
                    {!isTerminal && !isPlaced && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setRiderModal({ mode: "assign" })}
                        className="ml-auto"
                      >
                        <UserPlus className="w-4 h-4 mr-1" />
                        Assign rider
                      </Button>
                    )}
                  </div>
                )}
              </InfoRow>
            );
          })()}

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

      {/* ----- Rider assign/reassign modal ----- */}
      {/* Stacked on top of the order detail modal (z-60 vs z-50) so
          the admin can layer them naturally. */}
      {riderModal && (
        <RiderAssignModal
          orderId={order._id}
          onClose={() => setRiderModal(null)}
          onAssigned={onRiderChanged}
        />
      )}
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

// ============================================================
// RIDER ASSIGN / REASSIGN MODAL
// ============================================================
// Opens from the OrderDetailModal. Fetches the available riders
// (approved, non-blacklisted) ONCE on open, sorts by active
// deliveries, and pre-selects the suggestion (the first item) so
// the admin can usually just hit "Assign" without thinking.
//
// If no riders are available, the modal shows an empty state with
// a link to the User Management page so the admin knows where to
// go to approve pending riders.
const RiderAssignModal = ({
  orderId,
  onClose,
  onAssigned,
}: {
  orderId: string;
  onClose: () => void;
  onAssigned: () => void;
}) => {
  // ----- State -----
  const [riders, setRiders] = useState<AvailableRider[]>([]);
  const [suggestedId, setSuggestedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // ----- Fetch available riders on mount -----
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/admin/riders/available");
        // Shape: { data: { riders: [...], suggestedId } }
        const payload = res.data?.data;
        setRiders(Array.isArray(payload?.riders) ? payload.riders : []);
        setSuggestedId(payload?.suggestedId ?? null);
        // Pre-select the suggestion (so admin can just click "Assign").
        setSelectedId(payload?.suggestedId ?? null);
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ----- Submit -----
  const submit = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const res = await api.patch(`/orders/${orderId}/rider`, { riderId: selectedId });
      // The server returns the full updated order with rider populated.
      const assigned = res.data?.data?.rider;
      toast.success(
        assigned
          ? `Assigned to ${assigned.fullname}`
          : "Rider assigned"
      );
      onAssigned();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Bike className="w-5 h-5 text-orange-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold">Assign a rider</h2>
            <p className="text-sm text-gray-500">
              The customer will see the rider's name + phone immediately.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">
            <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
            Loading available riders...
          </div>
        ) : riders.length === 0 ? (
          // Empty state — no approved riders yet
          <div className="py-8 text-center">
            <Bike className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-medium text-gray-700">No riders available</p>
            <p className="text-xs text-gray-500 mt-1">
              Approve pending riders in the User Management page (Riders tab),
              then come back here.
            </p>
          </div>
        ) : (
          // Rider list
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {riders.map((r) => {
              const isSelected = r._id === selectedId;
              const isSuggested = r._id === suggestedId;
              return (
                <button
                  key={r._id}
                  type="button"
                  onClick={() => setSelectedId(r._id)}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-md border transition-colors ${
                    isSelected
                      ? "border-orange bg-orange-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {/* Radio dot */}
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                      isSelected
                        ? "border-orange bg-orange"
                        : "border-gray-300"
                    }`}
                  >
                    {isSelected && (
                      <div className="w-full h-full rounded-full bg-white scale-50" />
                    )}
                  </div>
                  {/* Rider info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{r.fullname}</span>
                      {isSuggested && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-300">
                          <Star className="w-2.5 h-2.5" />
                          SUGGESTED
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {r.contact || "—"}
                      </span>
                      <span>·</span>
                      <span>
                        {r.activeDeliveries === 0
                          ? "Available now"
                          : `${r.activeDeliveries} active delivery${r.activeDeliveries === 1 ? "" : "s"}`}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-4 mt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={!selectedId || submitting}
            className="bg-orange hover:bg-hoverOrange text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-1" />
                Assign
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};