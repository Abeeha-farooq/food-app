// src/admin/UserManagement.tsx
// ===============================
// Admin user management — list, search, and blacklist / unblacklist users.
//
// Why this exists:
//   Admins need a single place to see all users, see who's blacklisted,
//   and suspend / restore accounts. The backend endpoints
//   (POST /api/admin/users/:id/blacklist and /unblacklist) already
//   enforce all the safety rules (no self-blacklist, idempotency,
//   reason audit trail). This page is the UI on top of those.
//
// What it does:
//   - List all users with email, role, blacklist status, join date
//   - Filter by "all" / "active" / "blacklisted" (tabs)
//   - Search by name or email
//   - "Blacklist" button on a user → opens a modal to enter a reason
//   - "Unblacklist" button on a blacklisted user → immediate restore
// ===============================

import { useEffect, useState, type FormEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Ban,
  Search,
  X,
  Loader2,
  User as UserIcon,
  ShieldCheck,
  ShieldAlert,
  Mail,
  Calendar,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";

// ============================================================
// TYPES — match the backend User model
// ============================================================
type Role = "user" | "admin" | "restaurant_owner";

interface AdminUser {
  _id: string;
  fullname: string;
  email: string;
  role: Role;
  isBlacklisted: boolean;
  blacklistedAt?: string | null;
  blacklistedBy?: string | null;
  blacklistReason?: string;
  createdAt: string;
}

// ============================================================
// COMPONENT
// ============================================================
const UserManagement = () => {
  // ----- Data -----
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // ----- Filters -----
  const [searchQuery, setSearchQuery] = useState("");
  // Filter tab: "all" | "active" | "blacklisted"
  const [filterTab, setFilterTab] = useState<"all" | "active" | "blacklisted">("all");

  // ----- Blacklist modal state -----
  // null = modal closed. Object = modal open, editing that user.
  const [blacklistTarget, setBlacklistTarget] = useState<AdminUser | null>(null);
  const [blacklistReason, setBlacklistReason] = useState("");
  const [blacklistSubmitting, setBlacklistSubmitting] = useState(false);

  // ============================================================
  // FETCH all users
  // ============================================================
  // We reuse the user-list endpoint (it's the only public list).
  // We could add an /api/admin/users endpoint in the future, but
  // /user/all (or similar) might already exist — let me check.
  // For now, we use /admin/stats + a separate fetch per user (TODO)
  //
  // Actually: the existing /api/auth/admin/users OR /api/admin/users
  // is what we need. Let me use the admin endpoint we'll add: GET
  // /api/admin/users (returns all users). If it doesn't exist yet,
  // we'll see and add it.
  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Server response shape (ApiResponse wrapper):
      //   { statusCode, data: { users, total, page, limit, totalPages }, message }
      // We need the inner `data.users` array — `data` itself is an object.
      const res = await api.get("/admin/users");
      const payload = res.data?.data;
      setUsers(Array.isArray(payload?.users) ? payload.users : []);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setUsers([]); // avoid leaving stale state from a previous load
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // ============================================================
  // HANDLERS
  // ============================================================

  // Open the blacklist modal for a user
  const openBlacklistModal = (user: AdminUser) => {
    setBlacklistTarget(user);
    setBlacklistReason("");
  };

  // Close the modal (used by Cancel + X button + Escape-style backdrop click)
  const closeBlacklistModal = () => {
    if (blacklistSubmitting) return; // don't allow close mid-submit
    setBlacklistTarget(null);
    setBlacklistReason("");
  };

  // Submit the blacklist (with optional reason)
  const submitBlacklist = async (e: FormEvent) => {
    e.preventDefault();
    if (!blacklistTarget) return;
    setBlacklistSubmitting(true);
    try {
      await api.post(
        `/admin/users/${blacklistTarget._id}/blacklist`,
        { reason: blacklistReason.trim() || undefined }
      );
      // Update the local list so the user sees the change immediately
      // (without a full refetch — faster + smoother UX)
      setUsers((prev) =>
        prev.map((u) =>
          u._id === blacklistTarget._id
            ? {
                ...u,
                isBlacklisted: true,
                blacklistedAt: new Date().toISOString(),
                blacklistReason: blacklistReason.trim() || "",
                blacklistedBy: "me", // optimistic — server has the truth
              }
            : u
        )
      );
      toast.success(`${blacklistTarget.fullname} has been suspended`);
      closeBlacklistModal();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBlacklistSubmitting(false);
    }
  };

  // Unblacklist (immediate, no modal — admin's intent is unambiguous)
  const handleUnblacklist = async (user: AdminUser) => {
    const ok = window.confirm(
      `Restore access for ${user.fullname}?\n\nThey will be able to log in immediately.`
    );
    if (!ok) return;
    try {
      await api.post(`/admin/users/${user._id}/unblacklist`);
      setUsers((prev) =>
        prev.map((u) =>
          u._id === user._id
            ? { ...u, isBlacklisted: false, blacklistedAt: null, blacklistReason: "" }
            : u
        )
      );
      toast.success(`${user.fullname}'s access has been restored`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  // ============================================================
  // DERIVED
  // ============================================================
  // Apply the search + tab filter
  const filteredUsers = users.filter((u) => {
    // Tab filter
    if (filterTab === "active" && u.isBlacklisted) return false;
    if (filterTab === "blacklisted" && !u.isBlacklisted) return false;
    // Search filter (case-insensitive, matches name OR email)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!u.fullname.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  // Counts for the tab badges
  const totalCount = users.length;
  const blacklistedCount = users.filter((u) => u.isBlacklisted).length;
  const activeCount = totalCount - blacklistedCount;

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-6">
      <PageHeader
        icon={<UserIcon className="w-6 h-6" />}
        title="User Management"
        subtitle="View all users, suspend bad actors, restore access"
      />

      {/* ----- Filter bar (tabs + search + refresh) ----- */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            {/* Tabs (All / Active / Blacklisted) */}
            <div className="flex gap-1 bg-gray-100 dark:bg-neutral-800 p-1 rounded-lg">
              {(["all", "active", "blacklisted"] as const).map((tab) => {
                const isActive = filterTab === tab;
                const count =
                  tab === "all"
                    ? totalCount
                    : tab === "active"
                    ? activeCount
                    : blacklistedCount;
                return (
                  <button
                    key={tab}
                    onClick={() => setFilterTab(tab)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? "bg-white dark:bg-neutral-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    <span className="ml-1.5 text-xs opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative flex-1">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or email..."
                className="pl-9"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>

            {/* Refresh */}
            <Button
              variant="outline"
              size="icon"
              onClick={fetchUsers}
              disabled={loading}
              aria-label="Refresh users"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ----- Users table ----- */}
      <Card>
        <CardContent className="p-0">
          {loading && users.length === 0 ? (
            // Skeleton placeholders during initial load
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <UserIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No users found.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-neutral-800">
              {filteredUsers.map((user) => (
                <UserRow
                  key={user._id}
                  user={user}
                  onBlacklist={() => openBlacklistModal(user)}
                  onUnblacklist={() => handleUnblacklist(user)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----- Blacklist confirmation modal ----- */}
      {blacklistTarget && (
        <BlacklistModal
          user={blacklistTarget}
          reason={blacklistReason}
          onReasonChange={setBlacklistReason}
          onClose={closeBlacklistModal}
          onSubmit={submitBlacklist}
          submitting={blacklistSubmitting}
        />
      )}
    </div>
  );
};

export default UserManagement;

// ============================================================
// SUB-COMPONENTS
// ============================================================

/**
 * One row in the users list. Shows user info + the Blacklist or
 * Unblacklist button depending on current status.
 */
const UserRow = ({
  user,
  onBlacklist,
  onUnblacklist,
}: {
  user: AdminUser;
  onBlacklist: () => void;
  onUnblacklist: () => void;
}) => {
  // Initials for the avatar circle
  const initials = (user.fullname || user.email).substring(0, 2).toUpperCase();

  // Color the avatar by role
  const avatarColor =
    user.role === "admin"
      ? "bg-purple-100 text-purple-700"
      : user.role === "restaurant_owner"
      ? "bg-blue-100 text-blue-700"
      : "bg-gray-200 text-gray-700";

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${avatarColor}`}
      >
        {initials}
      </div>

      {/* User info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-900 dark:text-white truncate">
            {user.fullname}
          </p>
          {/* Blacklisted badge */}
          {user.isBlacklisted && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300">
              <ShieldAlert className="w-3 h-3" />
              Blacklisted
            </span>
          )}
          {/* Role badge */}
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
              user.role === "admin"
                ? "bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300"
                : user.role === "restaurant_owner"
                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                : "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-gray-300"
            }`}
          >
            {user.role.replace("_", " ")}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Mail className="w-3 h-3" />
            {user.email}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Joined {new Date(user.createdAt).toLocaleDateString()}
          </span>
          {user.isBlacklisted && user.blacklistReason && (
            <span className="flex items-center gap-1 italic" title={user.blacklistReason}>
              <AlertTriangle className="w-3 h-3" />
              {user.blacklistReason.length > 50
                ? user.blacklistReason.slice(0, 50) + "..."
                : user.blacklistReason}
            </span>
          )}
        </div>
      </div>

      {/* Action button */}
      <div className="flex-shrink-0">
        {user.isBlacklisted ? (
          <Button
            onClick={onUnblacklist}
            variant="outline"
            size="sm"
            className="text-green-600 border-green-200 hover:bg-green-50 hover:border-green-300"
          >
            <ShieldCheck className="w-4 h-4 mr-1" />
            Unblacklist
          </Button>
        ) : (
          <Button
            onClick={onBlacklist}
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
          >
            <Ban className="w-4 h-4 mr-1" />
            Blacklist
          </Button>
        )}
      </div>
    </div>
  );
};

/**
 * Modal for confirming a blacklist action. Asks for an optional
 * reason (shown to the user when they try to log in).
 */
const BlacklistModal = ({
  user,
  reason,
  onReasonChange,
  onClose,
  onSubmit,
  submitting,
}: {
  user: AdminUser;
  reason: string;
  onReasonChange: (v: string) => void;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  submitting: boolean;
}) => {
  return (
    // Backdrop (click to close)
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Modal panel (stop propagation so clicking inside doesn't close) */}
      <div
        className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Ban className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Blacklist user</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-semibold">{user.fullname}</span> ({user.email}) will be
              unable to log in or use the app.
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

        {/* Reason input (optional, shown to the user) */}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="blacklist-reason"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Reason <span className="text-gray-400 font-normal">(optional, shown to user)</span>
            </label>
            <textarea
              id="blacklist-reason"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="e.g. Repeated policy violations, fraud, spam..."
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange"
            />
            <p className="text-xs text-gray-400 mt-1">{reason.length}/500</p>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              They'll see a 403 error on their next request and be logged out automatically.
              You can restore access anytime by clicking "Unblacklist".
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
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
              disabled={submitting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Suspending...
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4 mr-1" />
                  Blacklist user
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
