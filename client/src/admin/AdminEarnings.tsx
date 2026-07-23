// src/admin/AdminEarnings.tsx
// ===============================
// Purpose: The admin's view of all rider earnings. Shows:
//   - Summary cards: total / pending / earned / paid
//   - A per-rider rollup (who to pay next + how much)
//   - A full list of earnings with [Mark as Paid] + [Cancel] actions
//
// URL: /admin/earnings
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
  Check,
  XCircle,
  User,
} from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

// ============================================================
// TYPES
// ============================================================
type EarningStatus = "pending" | "earned" | "paid" | "cancelled";

interface Rider {
  _id: string;
  fullname: string;
  email: string;
  contact: string;
}

interface OrderSummary {
  _id: string;
  status: string;
  totalPrice: number;
  deliveryAddress: string;
}

interface Earning {
  _id: string;
  rider: Rider;
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
  paidBy: string | null;
  paidMethod: string;
  paymentNote: string;
}

interface RiderRollup {
  rider: Rider;
  total: number;
  pending: number;
  earned: number;
  paid: number;
  count: number;
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
  riderRollup: RiderRollup[];
  config: { baseFee: number; ratePerKm: number; defaultFee: number };
}

const fmtRs = (n: number) => `Rs. ${n.toFixed(0)}`;
const fmtKm = (m: number | null) =>
  m == null ? "—" : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;

const STATUS_COLORS: Record<EarningStatus, string> = {
  pending:   "bg-yellow-100 text-yellow-800 border-yellow-300",
  earned:    "bg-green-100 text-green-800 border-green-300",
  paid:      "bg-blue-100 text-blue-800 border-blue-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

const STATUS_LABELS: Record<EarningStatus, string> = {
  pending:   "Pending",
  earned:    "Earned",
  paid:      "Paid",
  cancelled: "Cancelled",
};

const AdminEarnings = () => {
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track which earning is currently being paid (shows a spinner
  // on the right button).
  const [payingId, setPayingId] = useState<string | null>(null);

  const fetchEarnings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/admin/earnings");
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

  const handleMarkPaid = async (earningId: string) => {
    // Lightweight confirmation — the act is irreversible from
    // the rider's perspective (once paid, the UI flashes "Paid"
    // and the admin has to manually un-cancel if they made a
    // mistake). The prompt keeps the click intentional.
    if (!window.confirm("Mark this earning as paid?")) return;

    setPayingId(earningId);
    try {
      await api.patch(`/admin/earnings/${earningId}/pay`, {
        method: "cash",
        note: "",
      });
      toast.success("Earning marked as paid");
      await fetchEarnings();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPayingId(null);
    }
  };

  const handleCancel = async (earningId: string) => {
    if (!window.confirm("Cancel this earning? (Use when an order was refunded or disputed.)")) return;
    setPayingId(earningId);
    try {
      await api.patch(`/admin/earnings/${earningId}/cancel`, { note: "" });
      toast.success("Earning cancelled");
      await fetchEarnings();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPayingId(null);
    }
  };

  // Sort earnings: pending first (most actionable), then earned,
  // then paid, then cancelled. Within a status, newest first.
  const sortedEarnings = useMemo(() => {
    if (!data) return [];
    const order: Record<EarningStatus, number> = {
      earned: 0,
      pending: 1,
      paid: 2,
      cancelled: 3,
    };
    return [...data.earnings].sort((a, b) => {
      const oa = order[a.status];
      const ob = order[b.status];
      if (oa !== ob) return oa - ob;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Rider Earnings" />
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
  const { summary, riderRollup, config } = data;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Wallet className="text-orange" />}
        title="Rider Earnings"
        subtitle={`Formula: ${fmtRs(config.baseFee)} base + ${fmtRs(config.ratePerKm)}/km from restaurant to delivery address`}
      />

      {/* ============== Summary cards ============== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Total"
          value={summary.total}
          color="bg-blue-50 text-blue-600"
          hint="All riders, all statuses"
        />
        <SummaryCard
          icon={<Clock className="w-5 h-5" />}
          label="Pending"
          value={summary.pending}
          color="bg-yellow-50 text-yellow-600"
          hint="Assigned but not delivered"
        />
        <SummaryCard
          icon={<Banknote className="w-5 h-5" />}
          label="Awaiting Payout"
          value={summary.earned}
          color="bg-green-50 text-green-600"
          hint="Delivered, riders waiting"
        />
        <SummaryCard
          icon={<Check className="w-5 h-5" />}
          label="Paid Out"
          value={summary.paid}
          color="bg-purple-50 text-purple-600"
          hint="Riders have been paid"
        />
      </div>

      {/* ============== Per-rider rollup ============== */}
      {riderRollup.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className="text-base font-bold text-gray-900 mb-3">
              Per-rider summary
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4">Rider</th>
                    <th className="py-2 px-4 text-right">Pending</th>
                    <th className="py-2 px-4 text-right">Earned</th>
                    <th className="py-2 px-4 text-right">Paid</th>
                    <th className="py-2 pl-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {riderRollup.map((r) => (
                    <tr key={r.rider._id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <div className="font-medium text-gray-900">
                          {r.rider.fullname}
                        </div>
                        <div className="text-xs text-gray-500">
                          {r.rider.email}
                        </div>
                      </td>
                      <td className="py-2 px-4 text-right text-yellow-700">
                        {fmtRs(r.pending)}
                      </td>
                      <td className="py-2 px-4 text-right text-green-700">
                        {fmtRs(r.earned)}
                      </td>
                      <td className="py-2 px-4 text-right text-purple-700">
                        {fmtRs(r.paid)}
                      </td>
                      <td className="py-2 pl-4 text-right font-semibold">
                        {fmtRs(r.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============== All earnings list ============== */}
      <h2 className="text-base font-bold text-gray-900">All earnings</h2>
      {sortedEarnings.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-gray-500">
              No earnings yet. Assign a rider to an order to generate the first one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedEarnings.map((e) => (
            <Card key={e._id}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">
                        {e.rider.fullname}
                      </span>
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${STATUS_COLORS[e.status]}`}
                      >
                        {STATUS_LABELS[e.status]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 font-mono">
                      Order #{e.order?._id?.slice(-8).toUpperCase() || "—"}
                      <span className="text-gray-300 mx-1.5">•</span>
                      {fmtKm(e.distanceMeters)}
                      <span className="text-gray-300 mx-1.5">•</span>
                      {new Date(e.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-gray-900 mr-2">
                      {fmtRs(e.amount)}
                    </p>
                    {e.status === "earned" && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleMarkPaid(e._id)}
                        disabled={payingId === e._id}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        {payingId === e._id ? "Paying…" : "Mark as Paid"}
                      </Button>
                    )}
                    {(e.status === "pending" || e.status === "earned") && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancel(e._id)}
                        disabled={payingId === e._id}
                        className="text-red-700 border-red-200 hover:bg-red-50"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                    )}
                    {e.status === "paid" && e.paidAt && (
                      <span className="text-xs text-gray-400">
                        Paid {new Date(e.paidAt).toLocaleDateString()}
                        {e.paidMethod && ` • ${e.paidMethod}`}
                      </span>
                    )}
                    {e.status === "cancelled" && e.cancelledAt && (
                      <span className="text-xs text-gray-400">
                        Cancelled {new Date(e.cancelledAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Summary card — same shape as the rider's earnings page
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

export default AdminEarnings;
