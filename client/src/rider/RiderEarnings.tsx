// src/rider/RiderEarnings.tsx
// ===============================
// Purpose: The rider's "Earnings" page (URL: /rider/earnings).
//          Shows 4 summary cards (Total / Pending / Earned / Paid)
//          + a per-order table with status badges + the formula
//          used to compute each amount.
//
// Data flow:
//   1. On mount: GET /api/rider/earnings → { earnings, summary, config }
//   2. Refresh button (re-fetches the same endpoint)
//   3. Filter pills: All / Pending / Earned / Paid / Cancelled
// ===============================

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  Clock,
  Banknote,
  TrendingUp,
  RefreshCw,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

// ============================================================
// TYPES — matches the server response
// ============================================================
type EarningStatus = "pending" | "earned" | "paid" | "cancelled";

interface OrderSummary {
  _id: string;
  status: string;
  totalPrice: number;
  deliveryAddress: string;
  restaurant?: { name: string };
  createdAt: string;
}

interface Earning {
  _id: string;
  rider: string;
  order: OrderSummary;
  amount: number;
  distanceMeters: number | null;
  baseFee: number;
  ratePerKm: number;
  status: EarningStatus;
  createdAt: string;
  earnedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  paidMethod: string;
  paymentNote: string;
}

interface EarningsConfig {
  baseFee: number;
  ratePerKm: number;
  defaultFee: number;
}

interface Summary {
  total: number;
  pending: number;
  earned: number;
  paid: number;
  cancelled: number;
  count: { pending: number; earned: number; paid: number; cancelled: number };
}

interface EarningsResponse {
  earnings: Earning[];
  summary: Summary;
  config: EarningsConfig;
}

type Filter = "all" | EarningStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all",       label: "All" },
  { value: "pending",   label: "Pending" },
  { value: "earned",    label: "Earned" },
  { value: "paid",      label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_LABELS: Record<EarningStatus, string> = {
  pending:   "Pending",
  earned:    "Earned",
  paid:      "Paid",
  cancelled: "Cancelled",
};

// Status pill colors — kept consistent with the order status
// palette so a glance at any list shows the same "in flight vs
// done" semantics.
const STATUS_COLORS: Record<EarningStatus, string> = {
  pending:   "bg-yellow-100 text-yellow-800 border-yellow-300",
  earned:    "bg-green-100 text-green-800 border-green-300",
  paid:      "bg-blue-100 text-blue-800 border-blue-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

const fmtRs = (n: number) => `Rs. ${n.toFixed(0)}`;
const fmtKm = (m: number | null) =>
  m == null ? "—" : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;

const RiderEarnings = () => {
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const fetchEarnings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/rider/earnings");
      setData(res.data.data);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEarnings();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.earnings;
    return data.earnings.filter((e) => e.status === filter);
  }, [data, filter]);

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Earnings" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchEarnings} />;
  }

  if (!data) return null;
  const { summary, config } = data;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Wallet className="text-orange" />}
        title="Earnings"
        subtitle={`Earned at ${fmtRs(config.baseFee)} + ${fmtRs(config.ratePerKm)}/km`}
        action={
          <Button
            type="button"
            variant="outline"
            onClick={fetchEarnings}
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Refresh
          </Button>
        }
      />

      {/* ============== Summary cards ============== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Total Earnings"
          value={summary.total}
          color="bg-blue-50 text-blue-600"
          hint="All-time across every status"
        />
        <SummaryCard
          icon={<Clock className="w-5 h-5" />}
          label="Pending"
          value={summary.pending}
          color="bg-yellow-50 text-yellow-600"
          hint="Assigned but not delivered yet"
        />
        <SummaryCard
          icon={<Banknote className="w-5 h-5" />}
          label="Earned (Unpaid)"
          value={summary.earned}
          color="bg-green-50 text-green-600"
          hint="Delivered, waiting for admin payout"
        />
        <SummaryCard
          icon={<Wallet className="w-5 h-5" />}
          label="Paid Out"
          value={summary.paid}
          color="bg-purple-50 text-purple-600"
          hint="Admin has paid — yours to keep"
        />
      </div>

      {/* ============== Formula explainer ============== */}
      <Card>
        <CardContent className="p-4 text-sm text-gray-600">
          <p>
            <strong>How your pay is calculated:</strong> Rs. {config.baseFee}{" "}
            base + Rs. {config.ratePerKm} per km (restaurant → delivery
            address). If the distance can't be computed, you get a flat Rs.{" "}
            {config.defaultFee}.
          </p>
        </CardContent>
      </Card>

      {/* ============== Filter pills ============== */}
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

      {/* ============== Earning list ============== */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <Wallet className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              No earnings here
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {filter === "all"
                ? "Complete your first delivery to start earning."
                : `No ${filter} earnings right now.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <EarningRow key={e._id} earning={e} />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Sub-components
// ============================================================
const SummaryCard = ({
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
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
            {fmtRs(value)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{hint}</p>
        </div>
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}
        >
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
);

const EarningRow = ({ earning }: { earning: Earning }) => {
  const orderId = earning.order?._id?.slice(-8).toUpperCase() || "—";
  const restaurantName = earning.order?.restaurant?.name || "—";
  const statusColor = STATUS_COLORS[earning.status];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* ----- Order id + restaurant ----- */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-gray-900">
                #{orderId}
              </span>
              <span
                className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${statusColor}`}
              >
                {STATUS_LABELS[earning.status]}
              </span>
            </div>
            <p className="text-sm text-gray-700 mt-1">{restaurantName}</p>
            {earning.order?.deliveryAddress && (
              <p className="text-xs text-gray-500 mt-0.5 flex items-start gap-1">
                <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-1">
                  {earning.order.deliveryAddress}
                </span>
              </p>
            )}
          </div>

          {/* ----- Amount + distance + date ----- */}
          <div className="md:text-right">
            <p className="text-lg font-bold text-gray-900">
              {fmtRs(earning.amount)}
            </p>
            <p className="text-xs text-gray-500 flex items-center md:justify-end gap-1">
              <span>{fmtKm(earning.distanceMeters)}</span>
              <span className="text-gray-300">•</span>
              <span>{new Date(earning.createdAt).toLocaleDateString()}</span>
            </p>
            {/* Show the date that matters per status. The "When" line
                shows the most relevant milestone for the current
                status — assignment for pending, delivery for earned,
                payout for paid. */}
            <p className="text-xs text-gray-400 mt-0.5">
              {earning.status === "pending" && "Assigned"}
              {earning.status === "earned" && earning.earnedAt &&
                `Delivered ${new Date(earning.earnedAt).toLocaleDateString()}`}
              {earning.status === "paid" && earning.paidAt &&
                `Paid ${new Date(earning.paidAt).toLocaleDateString()}`}
              {earning.status === "cancelled" && earning.cancelledAt &&
                `Cancelled ${new Date(earning.cancelledAt).toLocaleDateString()}`}
            </p>
          </div>
        </div>
        {/* Show payment note if there is one (e.g. "Bank transfer
            ref #1234" for paid earnings) — useful for the rider
            to reconcile their own records. */}
        {earning.paymentNote && (
          <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
            <span className="font-medium">Note:</span> {earning.paymentNote}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default RiderEarnings;
