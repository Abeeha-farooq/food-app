// src/admin/RiderManagement.tsx
// ===============================
// Purpose: Admin page for managing delivery riders.
//
// What the admin can do here:
//   1. Add a new rider directly (fullname, email, contact, password)
//      — creates a User with role="rider", isApproved=true, isVerified=true.
//      Bypasses the public signup + email-OTP flow because the admin
//      is trusted to enter the rider's details correctly.
//   2. See all riders (approved + pending) in a list
//   3. Approve / reject riders (toggle isApproved)
//   4. Blacklist / unblacklist riders (suspend / restore their account)
//
// How the data flows:
//   GET    /api/admin/users?role=rider              → list (re-uses the
//                                                       user-list endpoint
//                                                       with the role filter
//                                                       we already have)
//   POST   /api/admin/riders                         → create
//   POST   /api/admin/riders/:id/approve             → approve
//   POST   /api/admin/riders/:id/reject              → revoke approval
//   POST   /api/admin/users/:id/blacklist             → suspend
//   POST   /api/admin/users/:id/unblacklist           → restore
//
// Why this lives in src/admin/ (not src/pages/):
//   Same reason as CouponManagement / MenuManagement — the entire
//   src/admin/ tree is mounted under the /admin/* route in App.tsx,
//   which is gated by the admin role guard.
// ===============================

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  Plus,
  RefreshCw,
  Bike,
  X,
  Mail,
  Phone,
  User as UserIcon,
  Lock,
  CheckCircle2,
  XCircle,
  ShieldOff,
  ShieldCheck,
  Loader2,
  Eye,
  EyeOff,
  Wallet,
  TrendingUp,
  Clock,
  Banknote,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

// ============================================================
// TYPES — mirror the server's User model + the rider-specific fields
// ============================================================
interface AdminRider {
  _id: string;
  fullname: string;
  email: string;
  contact: string;
  role: "rider";
  isApproved: boolean;
  isBlacklisted: boolean;
  blacklistedAt?: string | null;
  blacklistReason?: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// EARNINGS TYPES — mirror the server's RiderEarning model
// ============================================================
// Used by the "Earnings" tab in this page. We keep the type
// local rather than importing from a shared module because
// the admin's "Mark as Paid" flow has the same shape as the
// standalone /admin/earnings page — we could DRY it up later
// by extracting a shared <EarningsTable> component.
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

interface RiderEarningsResponse {
  earnings: Earning[];
  summary: {
    total: number;
    pending: number;
    earned: number;
    paid: number;
    cancelled: number;
    count: { pending: number; earned: number; paid: number; cancelled: number };
  };
}

const EARNING_STATUS_COLORS: Record<EarningStatus, string> = {
  pending:   "bg-yellow-100 text-yellow-800 border-yellow-300",
  earned:    "bg-green-100 text-green-800 border-green-300",
  paid:      "bg-blue-100 text-blue-800 border-blue-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

const EARNING_STATUS_LABELS: Record<EarningStatus, string> = {
  pending:   "Pending",
  earned:    "Earned",
  paid:      "Paid",
  cancelled: "Cancelled",
};

const fmtRs = (n: number) => `Rs. ${n.toFixed(0)}`;
const fmtKm = (m: number | null) =>
  m == null
    ? "—"
    : m < 1000
    ? `${Math.round(m)} m`
    : `${(m / 1000).toFixed(1)} km`;

// Form state for the create modal. Strings for everything so the
// user can clear + retype without NaN coercion.
interface RiderFormData {
  fullname: string;
  email: string;
  contact: string;
  password: string;
}

const EMPTY_FORM: RiderFormData = {
  fullname: "",
  email: "",
  contact: "",
  password: "",
};

// Status filter for the list (similar to the tabs in UserManagement,
// but kept simpler here — just three pills).
type StatusFilter = "all" | "pending" | "approved" | "blacklisted" | "earnings";

// ============================================================
// COMPONENT
// ============================================================
const RiderManagement = () => {
  // ----- Data -----
  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ----- Per-row in-flight tracking -----
  // Separate state for each action type so an in-flight approve
  // doesn't disable a rider's blacklist button.
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [blacklistingId, setBlacklistingId] = useState<string | null>(null);
  const [unblacklistingId, setUnblacklistingId] = useState<string | null>(null);

  // ----- Earnings per rider -----
  // When the "Earnings" tab is active, we lazy-load each rider's
  // earnings the first time the tab is opened. We cache them in
  // a Map<riderId, RiderEarningsResponse> so navigating back and
  // forth doesn't re-hit the server. Refresh is per-rider.
  const [earningsByRider, setEarningsByRider] = useState<
    Record<string, RiderEarningsResponse | null>
  >({});
  const [earningsLoading, setEarningsLoading] = useState<Set<string>>(
    new Set()
  );
  const [payingEarningId, setPayingEarningId] = useState<string | null>(null);

  const fetchRiderEarnings = async (riderId: string, force = false) => {
    if (!force && earningsByRider[riderId] !== undefined) return;
    setEarningsLoading((prev) => new Set(prev).add(riderId));
    try {
      // We use the public /api/rider/earnings endpoint (rider role
      // gated). The admin's JWT has role="admin" — which would be
      // rejected by requireRole("rider") on the server. So we
      // need an admin-scoped endpoint instead. Easiest: reuse the
      // /admin/earnings list and filter client-side, OR add a new
      // /admin/riders/:id/earnings endpoint. We'll filter from the
      // global list to keep this small.
      //
      // The full list endpoint returns earnings for ALL riders; we
      // filter client-side by rider._id. For 1000+ earnings this
      // could become slow — at that point we'd add a per-rider
      // endpoint. For an MVP with < 100 active earnings, this is
      // instant.
      const res = await api.get("/admin/earnings");
      const all: RiderEarningsResponse = res.data.data;
      // Build a per-rider response shape from the global one.
      const mine = all.earnings.filter(
        (e: Earning) => e.rider === riderId || (e.rider as any)?._id === riderId
      );
      const summary = {
        total: 0,
        pending: 0,
        earned: 0,
        paid: 0,
        cancelled: 0,
        count: { pending: 0, earned: 0, paid: 0, cancelled: 0 },
      };
      for (const e of mine) {
        summary.total += e.amount || 0;
        if (e.status === "pending") {
          summary.pending += e.amount || 0;
          summary.count.pending += 1;
        } else if (e.status === "earned") {
          summary.earned += e.amount || 0;
          summary.count.earned += 1;
        } else if (e.status === "paid") {
          summary.paid += e.amount || 0;
          summary.count.paid += 1;
        } else if (e.status === "cancelled") {
          summary.cancelled += e.amount || 0;
          summary.count.cancelled += 1;
        }
      }
      setEarningsByRider((prev) => ({
        ...prev,
        [riderId]: { earnings: mine, summary },
      }));
    } catch (err) {
      toast.error(getErrorMessage(err));
      setEarningsByRider((prev) => ({ ...prev, [riderId]: null }));
    } finally {
      setEarningsLoading((prev) => {
        const next = new Set(prev);
        next.delete(riderId);
        return next;
      });
    }
  };

  const handleMarkPaid = async (riderId: string, earningId: string) => {
    if (!window.confirm("Mark this earning as paid?")) return;
    setPayingEarningId(earningId);
    try {
      await api.patch(`/admin/earnings/${earningId}/pay`, {
        method: "cash",
        note: "",
      });
      toast.success("Earning marked as paid");
      // Re-fetch this rider's earnings (force = true) so the
      // local state reflects the new status.
      await fetchRiderEarnings(riderId, true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPayingEarningId(null);
    }
  };

  const handleCancelEarning = async (
    riderId: string,
    earningId: string
  ) => {
    if (
      !window.confirm(
        "Cancel this earning? (Use when an order was refunded or disputed.)"
      )
    )
      return;
    setPayingEarningId(earningId);
    try {
      await api.patch(`/admin/earnings/${earningId}/cancel`, { note: "" });
      toast.success("Earning cancelled");
      await fetchRiderEarnings(riderId, true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPayingEarningId(null);
    }
  };

  // ----- UI state -----
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // ============================================================
  // FETCH all riders
  // ============================================================
  // We re-use the user-list endpoint with ?role=rider (already
  // supported, see admin.controller.js `listUsers`). This keeps
  // the search/pagination logic in one place.
  const fetchRiders = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get("/admin/users", { params: { role: "rider" } });
      // listUsers returns { users: [...], total, page, limit, totalPages }
      // but we accept the array form too for forward-compat.
      const payload = res.data?.data;
      const list: AdminRider[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.users)
          ? payload.users
          : [];
      // The endpoint returns full User docs. Narrow to the rider
      // shape we need so the UI doesn't have to defend against
      // extra fields.
      setRiders(
        list
          .filter((u) => u.role === "rider")
          .map((u) => ({
            _id: u._id,
            fullname: u.fullname,
            email: u.email,
            contact: u.contact,
            role: "rider" as const,
            isApproved: u.isApproved ?? true,
            isBlacklisted: u.isBlacklisted ?? false,
            blacklistedAt: u.blacklistedAt,
            blacklistReason: u.blacklistReason,
            isVerified: u.isVerified ?? true,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
          }))
      );
    } catch (err) {
      setLoadError(getErrorMessage(err));
      setRiders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiders();
  }, []);

  // ============================================================
  // HANDLERS
  // ============================================================

  // Approve a pending rider. POST /api/admin/riders/:id/approve
  const handleApprove = async (rider: AdminRider) => {
    setApprovingId(rider._id);
    try {
      const res = await api.post(`/admin/riders/${rider._id}/approve`);
      const updated: AdminRider = res.data?.data ?? { ...rider, isApproved: true };
      setRiders((prev) =>
        prev.map((r) => (r._id === rider._id ? { ...r, isApproved: updated.isApproved } : r))
      );
      toast.success(`${rider.fullname} approved as a rider`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setApprovingId(null);
    }
  };

  // Reject (revoke approval) for a rider. POST /api/admin/riders/:id/reject
  const handleReject = async (rider: AdminRider) => {
    const ok = window.confirm(
      `Revoke ${rider.fullname}'s rider approval?\n\nThey will be unable to log in until you re-approve them.`
    );
    if (!ok) return;
    setRejectingId(rider._id);
    try {
      const res = await api.post(`/admin/riders/${rider._id}/reject`);
      const updated: AdminRider = res.data?.data ?? { ...rider, isApproved: false };
      setRiders((prev) =>
        prev.map((r) => (r._id === rider._id ? { ...r, isApproved: updated.isApproved } : r))
      );
      toast.success(`${rider.fullname}'s rider access has been revoked`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRejectingId(null);
    }
  };

  // Blacklist a rider (suspend). POST /api/admin/users/:id/blacklist
  const handleBlacklist = async (rider: AdminRider) => {
    const reason = window.prompt(
      `Blacklist ${rider.fullname}?\n\nThey will not be able to log in or be assigned orders until unblacklisted.\n\nOptional reason:`,
      ""
    );
    // window.prompt returns null on cancel, "" on OK with empty input.
    if (reason === null) return;
    setBlacklistingId(rider._id);
    try {
      const res = await api.post(`/admin/users/${rider._id}/blacklist`, {
        reason: reason.trim() || undefined,
      });
      const updated: AdminRider = res.data?.data ?? { ...rider, isBlacklisted: true };
      setRiders((prev) =>
        prev.map((r) => (r._id === rider._id ? { ...r, isBlacklisted: updated.isBlacklisted } : r))
      );
      toast.success(`${rider.fullname} has been suspended`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBlacklistingId(null);
    }
  };

  // Unblacklist (restore) a rider. POST /api/admin/users/:id/unblacklist
  const handleUnblacklist = async (rider: AdminRider) => {
    setUnblacklistingId(rider._id);
    try {
      const res = await api.post(`/admin/users/${rider._id}/unblacklist`);
      const updated: AdminRider = res.data?.data ?? { ...rider, isBlacklisted: false };
      setRiders((prev) =>
        prev.map((r) => (r._id === rider._id ? { ...r, isBlacklisted: updated.isBlacklisted } : r))
      );
      toast.success(`${rider.fullname}'s access has been restored`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUnblacklistingId(null);
    }
  };

  // ============================================================
  // DERIVED DATA
  // ============================================================
  // Counts for the status pills. Recomputed whenever `riders` changes.
  const counts = useMemo(() => {
    const c = { all: riders.length, pending: 0, approved: 0, blacklisted: 0 };
    for (const r of riders) {
      if (r.isBlacklisted) c.blacklisted += 1;
      else if (r.isApproved) c.approved += 1;
      else c.pending += 1;
    }
    return c;
  }, [riders]);

  // Apply status filter + search.
  const filteredRiders = useMemo(() => {
    let list = riders;
    if (statusFilter === "pending") {
      list = list.filter((r) => !r.isApproved && !r.isBlacklisted);
    } else if (statusFilter === "approved") {
      list = list.filter((r) => r.isApproved && !r.isBlacklisted);
    } else if (statusFilter === "blacklisted") {
      list = list.filter((r) => r.isBlacklisted);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.fullname.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.contact.toLowerCase().includes(q)
      );
    }
    return list;
  }, [riders, statusFilter, searchQuery]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Bike className="text-orange-500" />}
        title="Riders"
        subtitle={
          loading
            ? <Skeleton className="h-4 w-40" />
            : `${counts.all} rider${counts.all === 1 ? "" : "s"} • ${counts.pending} pending • ${counts.approved} approved`
        }
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={fetchRiders}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              className="bg-orange hover:bg-hoverOrange"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add rider
            </Button>
          </div>
        }
      />

      {/* ----- Status filter pills + search ----- */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { value: "all",         label: `All (${counts.all})` },
              { value: "pending",     label: `Pending (${counts.pending})` },
              { value: "approved",    label: `Approved (${counts.approved})` },
              { value: "blacklisted", label: `Blacklisted (${counts.blacklisted})` },
              { value: "earnings",    label: `Earnings` },
            ] as { value: StatusFilter; label: string }[]
          ).map((opt) => {
            const active = statusFilter === opt.value;
            // The project defines a CUSTOM color `orange: "var(--button)"`
            // in tailwind.config.js (no shade suffix), so `bg-orange`
            // maps to the brand orange and `bg-orange-500` does NOT
            // (it's a default Tailwind shade that may be purged or
            // overridden by the base button background). Use `bg-orange`
            // + `border-orange` to match the custom color reliably.
            // Text is intentionally `text-black` so it's visible even
            // if the background doesn't apply for any reason.
            const className = `px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              active
                ? "bg-orange text-black border-orange"
                : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
            }`;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={className}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="flex-1 sm:max-w-xs sm:ml-auto">
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="h-9"
          />
        </div>
      </div>

      {/* ----- Loading skeleton ----- */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ----- Error state ----- */}
      {!loading && loadError && (
        <ErrorState
          title="Could not load riders"
          message={loadError}
          onRetry={fetchRiders}
        />
      )}

      {/* ----- Empty state (no riders at all) ----- */}
      {!loading && !loadError && riders.length === 0 && (
        <EmptyState
          icon={<Bike className="w-10 h-10" />}
          title="No riders yet"
          description="Add your first delivery rider to start accepting orders. Riders you create here are immediately active — no separate approval step needed."
          ctaLabel="Add rider"
          onCtaClick={() => setShowCreate(true)}
        />
      )}

      {/* ----- Filtered empty state ----- */}
      {!loading && !loadError && riders.length > 0 && filteredRiders.length === 0 && (
        <EmptyState
          icon={<Bike className="w-10 h-10" />}
          title="No riders match your filters"
          description={
            statusFilter === "pending"
              ? "Everyone who's signed up has been approved. 🎉"
              : statusFilter === "blacklisted"
                ? "No riders are currently suspended."
                : "Try a different search or filter."
          }
        />
      )}

      {/* ----- Earnings tab: per-rider earnings list with summary ----- */}
      {statusFilter === "earnings" && !loading && !loadError && (
        <RiderEarningsSection
          riders={filteredRiders}
          earningsByRider={earningsByRider}
          earningsLoading={earningsLoading}
          payingEarningId={payingEarningId}
          onFetchEarnings={fetchRiderEarnings}
          onMarkPaid={handleMarkPaid}
          onCancelEarning={handleCancelEarning}
        />
      )}

      {/* ----- List ----- */}
      {statusFilter !== "earnings" &&
        !loading &&
        !loadError &&
        filteredRiders.length > 0 && (
          <div className="space-y-3">
            {filteredRiders.map((rider) => (
              <RiderRow
                key={rider._id}
                rider={rider}
                isApproving={approvingId === rider._id}
                isRejecting={rejectingId === rider._id}
                isBlacklisting={blacklistingId === rider._id}
                isUnblacklisting={unblacklistingId === rider._id}
                onApprove={() => handleApprove(rider)}
                onReject={() => handleReject(rider)}
                onBlacklist={() => handleBlacklist(rider)}
                onUnblacklist={() => handleUnblacklist(rider)}
              />
            ))}
          </div>
        )}

      {/* ----- Create modal ----- */}
      {showCreate && (
        <CreateRiderModal
          onClose={() => setShowCreate(false)}
          onCreated={(r) => {
            setRiders((prev) => [r, ...prev]);
            setShowCreate(false);
            setStatusFilter("all");
          }}
        />
      )}
    </div>
  );
};

export default RiderManagement;

// ============================================================
// RIDER ROW (sub-component)
// ============================================================
// One card per rider. Shows the rider's name, contact, status badges,
// and a row of action buttons. The action set depends on the rider's
// current state:
//
//   isBlacklisted: only "Unblacklist" is shown (the rest are disabled
//                   because a blacklisted rider can't log in or be
//                   assigned orders, so approving/etc. is moot).
//   !isApproved:    "Approve" + "Blacklist" (reject is also available
//                   but Approve is the primary action for new signups).
//   isApproved:     "Reject" (revoke) + "Blacklist".
const RiderRow = ({
  rider,
  isApproving,
  isRejecting,
  isBlacklisting,
  isUnblacklisting,
  onApprove,
  onReject,
  onBlacklist,
  onUnblacklist,
}: {
  rider: AdminRider;
  isApproving: boolean;
  isRejecting: boolean;
  isBlacklisting: boolean;
  isUnblacklisting: boolean;
  onApprove: () => void;
  onReject: () => void;
  onBlacklist: () => void;
  onUnblacklist: () => void;
}) => {
  // Derived display flags
  const isBusy = isApproving || isRejecting || isBlacklisting || isUnblacklisting;

  return (
    <Card className={rider.isBlacklisted ? "opacity-70" : ""}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* ----- Left: name + contact + status badges ----- */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-gray-900 truncate">
                {rider.fullname}
              </h3>
              {rider.isBlacklisted ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  <ShieldOff className="w-3 h-3" /> Suspended
                </span>
              ) : !rider.isApproved ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  <XCircle className="w-3 h-3" /> Pending approval
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              )}
            </div>

            {/* Contact row — email + phone */}
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
              <span className="flex items-center gap-1.5 min-w-0">
                <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate">{rider.email}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                {rider.contact}
              </span>
            </div>

            {/* Blacklist reason (if any) */}
            {rider.isBlacklisted && rider.blacklistReason && (
              <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-md px-2 py-1 inline-block">
                Reason: {rider.blacklistReason}
              </p>
            )}
          </div>

          {/* ----- Right: action buttons ----- */}
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            {/* Approve / Reject (toggle based on isApproved) */}
            {rider.isBlacklisted ? (
              // Blacklisted → can't approve/reject; only unblacklist
              <Button
                size="sm"
                variant="outline"
                onClick={onUnblacklist}
                disabled={isBusy}
                title="Restore this rider's access"
              >
                {isUnblacklisting ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                )}
                Restore
              </Button>
            ) : !rider.isApproved ? (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={onApprove}
                disabled={isBusy}
                title="Approve this rider"
              >
                {isApproving ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                )}
                Approve
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={onReject}
                disabled={isBusy}
                title="Revoke this rider's approval (they won't be able to log in until you re-approve)"
              >
                {isRejecting ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                )}
                Revoke
              </Button>
            )}

            {/* Blacklist / Unblacklist (the suspension toggle) */}
            {rider.isBlacklisted ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onUnblacklist}
                disabled={isBusy}
                className="border-green-200 text-green-700 hover:bg-green-50"
                title="Unblacklist this rider (re-enable login + order assignment)"
              >
                {isUnblacklisting ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                )}
                Unblacklist
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={onBlacklist}
                disabled={isBusy}
                className="border-red-200 text-red-700 hover:bg-red-50"
                title="Suspend this rider (they won't be able to log in or be assigned orders)"
              >
                {isBlacklisting ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <ShieldOff className="w-3.5 h-3.5 mr-1.5" />
                )}
                Suspend
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================================
// CREATE RIDER MODAL (sub-component)
// ============================================================
// A simple form modal that posts to /api/admin/riders.
//
// We collect:
//   - fullname (required, min 2 chars)
//   - email    (required, valid email format)
//   - contact  (required, free-form — the rider's phone number)
//   - password (required, min 6 chars, with show/hide toggle)
//
// On success, calls onCreated with the new rider so the parent can
// prepend it to the list and close the modal.
const CreateRiderModal = ({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (rider: AdminRider) => void;
}) => {
  const [form, setForm] = useState<RiderFormData>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const update = <K extends keyof RiderFormData>(
    key: K,
    value: RiderFormData[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // ----- Client-side validation -----
    // The server validates too, but we catch the obvious issues here
    // to give instant feedback. (Server returns 400 with a useful
    // message if any of these slip through.)
    const fullname = form.fullname.trim();
    if (fullname.length < 2) {
      setError("Full name must be at least 2 characters");
      return;
    }
    const email = form.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }
    const contact = form.contact.trim();
    if (contact.length < 4) {
      setError("Please enter a contact number");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/admin/riders", {
        fullname,
        email,
        contact,
        password: form.password,
      });
      // Server returns the created rider (without the password hash)
      const created: AdminRider = res.data?.data ?? res.data;
      onCreated(created);
      toast.success(`Rider ${fullname} created`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // Backdrop + modal container. z-[60] sits above the admin sidebar
    // (z-30) so the modal is always on top.
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* ----- Header ----- */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Bike className="w-5 h-5 text-orange-500" />
            Add rider
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ----- Form body (scrollable if narrow viewport) ----- */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Inline error (server or client validation) */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3">
              {error}
            </div>
          )}

          {/* Full name */}
          <div>
            <Label htmlFor="rider-fullname" className="mb-1.5 inline-block">
              Full name
            </Label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                id="rider-fullname"
                type="text"
                value={form.fullname}
                onChange={(e) => update("fullname", e.target.value)}
                placeholder="e.g. Asad Ali"
                className="pl-9"
                required
                autoFocus
                disabled={submitting}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <Label htmlFor="rider-email" className="mb-1.5 inline-block">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                id="rider-email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="rider@example.com"
                className="pl-9"
                required
                disabled={submitting}
              />
            </div>
          </div>

          {/* Contact (phone) */}
          <div>
            <Label htmlFor="rider-contact" className="mb-1.5 inline-block">
              Contact number
            </Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                id="rider-contact"
                type="tel"
                value={form.contact}
                onChange={(e) => update("contact", e.target.value)}
                placeholder="e.g. 0300-1234567"
                className="pl-9"
                required
                disabled={submitting}
              />
            </div>
          </div>

          {/* Password (with show/hide toggle) */}
          <div>
            <Label htmlFor="rider-password" className="mb-1.5 inline-block">
              Initial password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                id="rider-password"
                // Toggle between text/password so the admin can
                // double-check what they typed (typos are the #1
                // source of "rider can't log in" support tickets).
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="At least 6 characters"
                className="pl-9 pr-10"
                required
                disabled={submitting}
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 rounded"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              Share this with the rider out-of-band. They can change it after logging in.
            </p>
          </div>
        </form>

        {/* ----- Footer ----- */}
        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/50 flex gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-orange hover:bg-hoverOrange min-w-[120px]"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Add rider
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// RIDER EARNINGS SECTION
// ============================================================
// Rendered when the admin selects the "Earnings" tab in the
// RiderManagement page. For each rider in the (filtered) list,
// we show:
//   1. A summary card with total/pending/earned/paid
//   2. An expandable list of every earning (with [Mark as Paid]
//      and [Cancel] actions for unpaid ones)
//
// The component is "self-contained" — it calls onFetchEarnings
// (passed from the parent) to lazy-load each rider's data the
// first time their card is shown, then keeps the data in the
// parent's earningsByRider cache so navigating away + back
// doesn't re-hit the server.
// ============================================================
interface RiderEarningsSectionProps {
  riders: AdminRider[];
  earningsByRider: Record<string, RiderEarningsResponse | null>;
  earningsLoading: Set<string>;
  payingEarningId: string | null;
  onFetchEarnings: (riderId: string, force?: boolean) => Promise<void>;
  onMarkPaid: (riderId: string, earningId: string) => Promise<void>;
  onCancelEarning: (riderId: string, earningId: string) => Promise<void>;
}

const RiderEarningsSection = ({
  riders,
  earningsByRider,
  earningsLoading,
  payingEarningId,
  onFetchEarnings,
  onMarkPaid,
  onCancelEarning,
}: RiderEarningsSectionProps) => {
  // When the section first mounts, kick off earnings fetches for
  // every visible rider. We DON'T await — each card shows its
  // own skeleton. This means the section appears immediately
  // and rows populate as their data arrives (in parallel).
  useEffect(() => {
    for (const r of riders) {
      if (earningsByRider[r._id] === undefined && !earningsLoading.has(r._id)) {
        onFetchEarnings(r._id);
      }
    }
    // We intentionally exclude onFetchEarnings / earningsByRider
    // / earningsLoading from deps — we only want to kick off
    // fetches for riders we haven't seen yet. Re-running on
    // every state change would cause an infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riders]);

  if (riders.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="w-12 h-12" />}
        title="No riders to show"
        description="Switch to All/Pending/Approved to see riders."
      />
    );
  }

  return (
    <div className="space-y-3">
      {riders.map((rider) => (
        <RiderEarningsCard
          key={rider._id}
          rider={rider}
          data={earningsByRider[rider._id] ?? null}
          loading={earningsLoading.has(rider._id)}
          payingEarningId={payingEarningId}
          onRefresh={() => onFetchEarnings(rider._id, true)}
          onMarkPaid={(earningId) => onMarkPaid(rider._id, earningId)}
          onCancel={(earningId) => onCancelEarning(rider._id, earningId)}
        />
      ))}
    </div>
  );
};

// ============================================================
// RIDER EARNINGS CARD — per-rider card with summary + earning list
// ============================================================
const RiderEarningsCard = ({
  rider,
  data,
  loading,
  payingEarningId,
  onRefresh,
  onMarkPaid,
  onCancel,
}: {
  rider: AdminRider;
  data: RiderEarningsResponse | null;
  loading: boolean;
  payingEarningId: string | null;
  onRefresh: () => void;
  onMarkPaid: (earningId: string) => Promise<void>;
  onCancel: (earningId: string) => Promise<void>;
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* ----- Header: name + summary tiles ----- */}
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-gray-900">
                {rider.fullname}
              </h3>
              {rider.isBlacklisted && (
                <span className="inline-block px-2 py-0.5 text-xs font-medium rounded border bg-red-100 text-red-800 border-red-300">
                  Suspended
                </span>
              )}
              {!rider.isApproved && (
                <span className="inline-block px-2 py-0.5 text-xs font-medium rounded border bg-amber-100 text-amber-800 border-amber-300">
                  Pending
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {rider.email}
              <span className="text-gray-300 mx-1.5">•</span>
              {rider.contact}
            </p>
          </div>

          {loading && !data ? (
            <div className="flex flex-wrap gap-2 md:max-w-md">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-24 rounded-lg" />
              ))}
            </div>
          ) : data ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:max-w-2xl">
              <EarningSummaryTile
                icon={<TrendingUp className="w-4 h-4" />}
                label="Total"
                value={data.summary.total}
                color="bg-blue-50 text-blue-600"
              />
              <EarningSummaryTile
                icon={<Clock className="w-4 h-4" />}
                label="Pending"
                value={data.summary.pending}
                color="bg-yellow-50 text-yellow-600"
              />
              <EarningSummaryTile
                icon={<Banknote className="w-4 h-4" />}
                label="Earned"
                value={data.summary.earned}
                color="bg-green-50 text-green-600"
              />
              <EarningSummaryTile
                icon={<Wallet className="w-4 h-4" />}
                label="Paid"
                value={data.summary.paid}
                color="bg-purple-50 text-purple-600"
              />
            </div>
          ) : null}
        </div>

        {/* ----- Earning list (expandable) ----- */}
        {data && data.earnings.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-orange"
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              {data.earnings.length} earning
              {data.earnings.length === 1 ? "" : "s"}
              {data.summary.cancelled > 0 &&
                ` (${data.summary.cancelled} cancelled)`}
            </button>
            {expanded && (
              <div className="mt-3 space-y-1.5">
                {sortEarningsForAdmin(data.earnings).map((e) => (
                  <EarningRow
                    key={e._id}
                    earning={e}
                    paying={payingEarningId === e._id}
                    onMarkPaid={() => onMarkPaid(e._id)}
                    onCancel={() => onCancel(e._id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ----- Empty state for "no earnings yet" ----- */}
        {data && data.earnings.length === 0 && (
          <p className="text-sm text-gray-500 italic">
            No earnings yet — assign this rider to an order to start tracking their pay.
          </p>
        )}

        {/* ----- Refresh button ----- */}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================================
// EARNING SUMMARY TILE — one of the 4 mini-cards in the header
// ============================================================
const EarningSummaryTile = ({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) => (
  <div className={`rounded-lg p-2.5 ${color.split(" ")[0]} flex items-center gap-2`}>
    <div className={`w-7 h-7 rounded flex items-center justify-center ${color}`}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-gray-900">{fmtRs(value)}</p>
    </div>
  </div>
);

// ============================================================
// EARNING ROW — one line in the expandable list
// ============================================================
const EarningRow = ({
  earning,
  paying,
  onMarkPaid,
  onCancel,
}: {
  earning: Earning;
  paying: boolean;
  onMarkPaid: () => Promise<void>;
  onCancel: () => Promise<void>;
}) => {
  const orderId = earning.order?._id?.slice(-8).toUpperCase() || "—";
  const restaurantName = earning.order?.restaurant?.name || "—";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 bg-gray-50 rounded-md">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-gray-500">#{orderId}</span>
          <span
            className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded border ${
              EARNING_STATUS_COLORS[earning.status]
            }`}
          >
            {EARNING_STATUS_LABELS[earning.status]}
          </span>
        </div>
        <p className="text-xs text-gray-700 mt-0.5">{restaurantName}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {fmtKm(earning.distanceMeters)}
          <span className="text-gray-300 mx-1">•</span>
          {new Date(earning.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-gray-900">
          {fmtRs(earning.amount)}
        </p>
        {earning.status === "earned" && (
          <Button
            type="button"
            size="sm"
            onClick={onMarkPaid}
            disabled={paying}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Check className="w-3 h-3 mr-1" />
            {paying ? "Paying…" : "Mark as Paid"}
          </Button>
        )}
        {(earning.status === "pending" || earning.status === "earned") && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCancel}
            disabled={paying}
            className="text-red-700 border-red-200 hover:bg-red-50"
          >
            Cancel
          </Button>
        )}
        {earning.status === "paid" && earning.paidAt && (
          <span className="text-[10px] text-gray-400">
            Paid {new Date(earning.paidAt).toLocaleDateString()}
            {earning.paidMethod && ` • ${earning.paidMethod}`}
          </span>
        )}
        {earning.status === "cancelled" && earning.cancelledAt && (
          <span className="text-[10px] text-gray-400">
            Cancelled {new Date(earning.cancelledAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
};

// ============================================================
// sortEarningsForAdmin — pending/earned first (most actionable),
// newest first within each status. Pure helper.
// ============================================================
const sortEarningsForAdmin = (earnings: Earning[]): Earning[] => {
  const order: Record<EarningStatus, number> = {
    earned: 0,
    pending: 1,
    paid: 2,
    cancelled: 3,
  };
  return [...earnings].sort((a, b) => {
    const oa = order[a.status];
    const ob = order[b.status];
    if (oa !== ob) return oa - ob;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
};
