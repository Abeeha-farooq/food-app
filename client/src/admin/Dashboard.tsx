// src/admin/Dashboard.tsx
// ===============================
// Purpose: The admin dashboard landing page (URL: /admin).
//          Shows the 4 stat cards + recent orders + orders-by-status breakdown.
// ===============================

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import { STATUS_COLORS, STATUS_LABELS, type OrderStatus } from "@/lib/orderStatus";
import { Store, Utensils, ShoppingBag, DollarSign, TrendingUp, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

// ============================================================
// TYPES — matches the backend response
// ============================================================
interface RecentOrder {
  _id: string;
  user: { _id: string; fullname: string; email: string };
  restaurant: { _id: string; name: string; city: string };
  items: { name: string; quantity: number; price: number }[];
  totalPrice: number;
  status: OrderStatus;
  createdAt: string;
}

interface DashboardStats {
  totalRestaurants: number;
  totalMenuItems: number;
  totalOrders: number;
  totalRevenue: number;
  ordersByStatus: Record<string, number>;
  recentOrders: RecentOrder[];
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/admin/stats");
      setStats(res.data.data);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          subtitle={<Skeleton className="h-4 w-64 mt-1" />}
        />
        {/* Skeleton for the 4 stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Skeleton for the recent orders section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardContent className="p-6 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex justify-between p-3 border border-gray-200 rounded-md">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-1.5 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Overview of your restaurants, menu, and orders" />
        <ErrorState
          title="Couldn't load dashboard stats"
          message={error || "Something went wrong while loading the dashboard."}
          onRetry={fetchStats}
        />
      </div>
    );
  }

  // ==================== DERIVED: orders by status (always 6 keys, defaulting to 0) ====================
  const statusOrder: OrderStatus[] = ["placed", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];
  const statusData = statusOrder.map((s) => ({
    status: s,
    label: STATUS_LABELS[s],   // use the shared label map
    count: stats.ordersByStatus[s] || 0,
  }));

  return (
    <div className="space-y-6">
      {/* ==================== HEADER ==================== */}
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your restaurants, menu, and orders"
      />

      {/* ==================== 4 STAT CARDS ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Store className="w-5 h-5" />}
          label="Total Restaurants"
          value={stats.totalRestaurants}
          color="blue"
          href="/admin/restaurant"
        />
        <StatCard
          icon={<Utensils className="w-5 h-5" />}
          label="Total Menu Items"
          value={stats.totalMenuItems}
          color="purple"
          href="/admin/menu"
        />
        <StatCard
          icon={<ShoppingBag className="w-5 h-5" />}
          label="Total Orders"
          value={stats.totalOrders}
          color="orange"
          href="/admin/orders"
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Total Revenue"
          value={`Rs. ${stats.totalRevenue.toLocaleString()}`}
          color="green"
          sublabel="From delivered orders"
        />
      </div>

      {/* ==================== TWO-COLUMN SECTION ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent orders (2/3 width on large screens) */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>Last {stats.recentOrders.length} orders placed</CardDescription>
            </div>
            <Link to="/admin/orders" className="text-sm text-orange-600 hover:text-orange-700 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {stats.recentOrders.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No orders yet.</p>
            ) : (
              <div className="space-y-3">
                {stats.recentOrders.map((order) => (
                  <div
                    key={order._id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-md hover:bg-gray-50 hover:border-orange-200 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 truncate">
                          {order.user.fullname}
                        </p>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {order.restaurant.name} · {order.items.length} item{order.items.length === 1 ? "" : "s"} ·{" "}
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        Rs. {order.totalPrice.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Orders by status (1/3 width) */}
        <Card>
          <CardHeader>
            <CardTitle>Orders by Status</CardTitle>
            <CardDescription>Current breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {statusData.map(({ status, label, count }) => {
                const total = stats.totalOrders || 1;  // avoid divide-by-zero
                const pct = Math.round((count / total) * 100);
                // Use the shared STATUS_COLORS — extract just the bg-* for the progress bar fill
                const badgeClass = STATUS_COLORS[status];
                const progressBg = badgeClass.split(" ")[0];   // first class is the bg-{color}-100
                return (
                  <div key={status}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${badgeClass}`}>
                        {label}
                      </span>
                      <span className="text-gray-600">
                        {count} ({pct}%)
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${progressBg}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <TrendingUp className="w-4 h-4" />
                <span>All-time totals</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ==================== QUICK ACTIONS ==================== */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Jump to common tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuickAction href="/admin/orders"   icon={<ShoppingBag className="w-5 h-5" />} label="Manage Orders" />
            <QuickAction href="/admin/restaurant" icon={<Store className="w-5 h-5" />} label="Add Restaurant" />
            <QuickAction href="/admin/menu"     icon={<Utensils className="w-5 h-5" />} label="Manage Menu" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;

// ============================================================
// SUB-COMPONENTS
// ============================================================

// One of the 4 main stat cards. If `href` is provided, the whole card becomes clickable.
const StatCard = ({
  icon, label, value, color, sublabel, href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: "blue" | "purple" | "orange" | "green";
  sublabel?: string;
  href?: string;
}) => {
  const colorMap = {
    blue:   { bg: "bg-blue-50",   text: "text-blue-600" },
    purple: { bg: "bg-purple-50", text: "text-purple-600" },
    orange: { bg: "bg-orange-50", text: "text-orange-600" },
    green:  { bg: "bg-green-50",  text: "text-green-600" },
  };
  const c = colorMap[color];

  // The card body — either wrapped in a Link (clickable) or a div
  const body = (
    <Card className={`${href ? "hover:shadow-md hover:border-orange-200 transition-all cursor-pointer" : ""} h-full`}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className={`p-1.5 rounded ${c.bg} ${c.text}`}>{icon}</span>
          {label}
        </div>
        <div className="text-2xl font-bold mt-3 text-gray-900">{value}</div>
        {sublabel && <div className="text-xs text-gray-400 mt-1">{sublabel}</div>}
        {href && (
          <div className="mt-3 text-xs text-orange-600 flex items-center gap-1">
            View <ArrowRight className="w-3 h-3" />
          </div>
        )}
      </CardContent>
    </Card>
  );

  return href ? <Link to={href}>{body}</Link> : body;
};

const QuickAction = ({
  href, icon, label,
}: { href: string; icon: React.ReactNode; label: string }) => (
  <Link
    to={href}
    className="flex items-center justify-between p-3 border border-gray-200 rounded-md hover:border-orange-300 hover:bg-orange-50 transition-colors group"
  >
    <div className="flex items-center gap-3">
      <span className="text-gray-500 group-hover:text-orange-600 transition-colors">{icon}</span>
      <span className="font-medium text-gray-700 group-hover:text-orange-600 transition-colors">{label}</span>
    </div>
    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-orange-600 transition-colors" />
  </Link>
);