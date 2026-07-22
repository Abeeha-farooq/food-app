// src/rider/RiderDashboard.tsx
// ===============================
// Purpose: The rider's landing page (URL: /rider).
//          Shows 3 stat cards + a "next action" callout for the
//          most recently assigned order that still needs attention.
// ===============================

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import {
  type Order,
} from "@/lib/orderStatus";
import {
  ShoppingBag,
  Package,
  PackageCheck,
  ChevronRight,
  MapPin,
  Phone,
  Clock,
  Bike,
} from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

// ============================================================
// STAT CARD TYPES
// ============================================================
// We compute the 3 stats on the client by filtering the orders
// array. This is intentional — the alternative (a dedicated
// /rider/stats endpoint) would be a 2nd round-trip for data we
// already have.
interface Stats {
  assigned: number;       // any order with a rider, not yet delivered/cancelled
  pending: number;        // in-progress deliveries (out_for_delivery)
  completed: number;      // delivered (today, ideally)
}

const RiderDashboard = () => {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // ----- Compute the 3 stats from the order list -----
  // "Assigned" = assigned to me AND not delivered/cancelled AND not
  //   yet accepted by the rider
  // "Pending Deliveries" = status is "out_for_delivery" (rider has
  //   picked up, on the way)
  // "Completed" = status is "delivered"
  const stats: Stats = useMemo(() => {
    if (!orders) return { assigned: 0, pending: 0, completed: 0 };
    return {
      assigned: orders.filter(
        (o) => o.status !== "delivered" && o.status !== "cancelled" && !o.riderAcceptedAt
      ).length,
      pending: orders.filter((o) => o.status === "out_for_delivery").length,
      completed: orders.filter((o) => o.status === "delivered").length,
    };
  }, [orders]);

  // "Next action" = the oldest assigned order that still needs
  // attention (assigned but not accepted, or accepted but not
  // picked up). We sort by createdAt ascending and pick the first
  // one that isn't delivered/cancelled.
  const nextAction = useMemo(() => {
    if (!orders) return null;
    return (
      orders
        .filter((o) => o.status !== "delivered" && o.status !== "cancelled")
        .sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )[0] || null
    );
  }, [orders]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchOrders} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Bike className="text-orange" />}
        title="Rider Dashboard"
        subtitle="Your deliveries at a glance"
      />

      {/* ============== STAT CARDS ============== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<Package className="w-5 h-5" />}
          label="Assigned Orders"
          value={stats.assigned}
          color="bg-blue-50 text-blue-600"
          hint="New assignments waiting for your acceptance"
        />
        <StatCard
          icon={<ShoppingBag className="w-5 h-5" />}
          label="Pending Deliveries"
          value={stats.pending}
          color="bg-amber-50 text-amber-600"
          hint="Picked up, on the way to customer"
        />
        <StatCard
          icon={<PackageCheck className="w-5 h-5" />}
          label="Completed"
          value={stats.completed}
          color="bg-green-50 text-green-600"
          hint="Delivered successfully"
        />
      </div>

      {/* ============== NEXT ACTION CALLOUT ============== */}
      {nextAction ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4 text-orange" />
              Next action
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-500">Order</span>
                  <span className="font-mono text-sm font-semibold text-gray-900">
                    #{nextAction._id.slice(-8).toUpperCase()}
                  </span>
                  <OrderStatusBadge status={nextAction.status} />
                </div>
                <div className="text-sm font-medium text-gray-900">
                  {nextAction.restaurant?.name || "—"}
                  <span className="text-gray-400 mx-1.5">→</span>
                  {nextAction.user?.fullname || "Customer"}
                </div>
                <div className="flex items-start gap-1.5 text-sm text-gray-600">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">
                    {nextAction.deliveryAddress || "—"}
                  </span>
                </div>
                {nextAction.user?.contact && (
                  <a
                    href={`tel:${nextAction.user.contact}`}
                    className="inline-flex items-center gap-1.5 text-sm text-orange hover:underline"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {nextAction.user.contact}
                  </a>
                )}
              </div>
              <Link
                to="/rider/orders"
                className="md:ml-auto inline-flex items-center gap-1 px-4 py-2 rounded-md bg-orange text-white text-sm font-medium hover:bg-hoverOrange transition-colors"
              >
                View all
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-3">
              <PackageCheck className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">All caught up</h3>
            <p className="text-sm text-gray-500 mt-1">
              No new assignments right now. We'll notify you when an order is ready.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ============================================================
// STAT CARD — small reusable card for the 3 stat boxes
// ============================================================
const StatCard = ({
  icon,
  label,
  value,
  color,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  hint: string;
}) => (
  <Card>
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          <p className="text-xs text-gray-400 mt-1">{hint}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
);

export default RiderDashboard;
