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
type StatusFilter = "all" | "pending" | "approved" | "blacklisted";

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
            ] as { value: StatusFilter; label: string }[]
          ).map((opt) => {
            const active = statusFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={
                  "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors " +
                  (active
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-white text-gray-700 border-gray-200 hover:border-gray-300")
                }
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

      {/* ----- List ----- */}
      {!loading && !loadError && filteredRiders.length > 0 && (
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
