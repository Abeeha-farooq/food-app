// src/admin/CouponManagement.tsx
// ===============================
// Purpose: Admin page for creating and managing promo codes.
//
// What the admin can do here:
//   1. Create a new coupon (code, discount type/value, min order,
//      max discount cap, validity window, usage limits, active flag)
//   2. See all existing coupons in a list (with usage stats)
//   3. Toggle a coupon's `active` flag (turn on/off without deleting)
//   4. Delete a coupon (hard delete — past orders retain their
//      denormalized couponCode/couponDiscount snapshots)
//
// How the data flows:
//   GET    /api/admin/coupons              → list
//   POST   /api/admin/coupons              → create
//   PATCH  /api/admin/coupons/:id          → toggle active (or any field)
//   DELETE /api/admin/coupons/:id          → remove
//   POST   /api/coupons/validate           → (customer side, not used here)
//
// Why this lives in src/admin/ (not src/pages/):
//   The entire src/admin/ tree is mounted under the /admin/* route
//   in App.tsx, which is gated by the AdminLayout (admin-only).
//   Putting the page here keeps the auth boundary obvious — there's
//   no accidental "anyone can hit this route" risk.
// ===============================

import { useEffect, useState, type FormEvent } from "react";
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
  Trash2,
  RefreshCw,
  Tag,
  Calendar,
  Percent,
  DollarSign,
  Power,
  PowerOff,
  X,
  Users,
  Hash,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

// ============================================================
// TYPES — mirror the server's Coupon model
// ============================================================
type DiscountType = "percentage" | "fixed";

interface AdminCoupon {
  _id: string;
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount?: number | null;
  validFrom: string;
  validUntil: string;
  usageLimit?: number | null;       // null = unlimited
  usageLimitPerUser: number;
  usageCount: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// Form state for the create modal. We use strings (not numbers) for
// numeric inputs so the user can clear + retype without the field
// re-coercing to NaN. We convert to numbers on submit.
interface CouponFormData {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;     // string while editing
  minOrderAmount: string;
  maxDiscountAmount: string;  // empty = no cap
  validFrom: string;          // yyyy-mm-dd (date input format)
  validUntil: string;         // yyyy-mm-dd
  usageLimit: string;         // empty = unlimited
  usageLimitPerUser: string;
  active: boolean;
}

const EMPTY_FORM: CouponFormData = {
  code: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  minOrderAmount: "0",
  maxDiscountAmount: "",
  validFrom: "",
  validUntil: "",
  usageLimit: "",
  usageLimitPerUser: "1",
  active: true,
};

// ============================================================
// COMPONENT
// ============================================================
const CouponManagement = () => {
  // ----- Data -----
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ----- Create modal -----
  // null = closed. "create" = open in create mode (no other modes
  // for now — the spec keeps update minimal: only toggle active +
  // delete from the list; admins use the create form for new coupons).
  const [showCreate, setShowCreate] = useState(false);

  // ----- Per-row in-flight tracking -----
  // We track ids so multiple toggle/delete calls can run concurrently
  // and their spinners don't bleed into each other.
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ============================================================
  // FETCH all coupons
  // ============================================================
  const fetchCoupons = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get("/admin/coupons");
      const payload = res.data?.data;
      // Server returns either an array (older) or { coupons: [...] }.
      // We accept both for forward-compat.
      const list: AdminCoupon[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.coupons)
        ? payload.coupons
        : [];
      setCoupons(list);
    } catch (err) {
      setLoadError(getErrorMessage(err));
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  // ============================================================
  // HANDLERS
  // ============================================================

  // Toggle a coupon's `active` flag — PATCH /admin/coupons/:id
  // with { active: <new value> }. We optimistically update local
  // state so the UI feels instant, then revert on error.
  const handleToggleActive = async (coupon: AdminCoupon) => {
    const newValue = !coupon.active;
    setTogglingId(coupon._id);
    // Optimistic update
    setCoupons((prev) =>
      prev.map((c) => (c._id === coupon._id ? { ...c, active: newValue } : c))
    );
    try {
      await api.patch(`/admin/coupons/${coupon._id}`, { active: newValue });
      toast.success(
        `Coupon ${coupon.code} ${newValue ? "activated" : "deactivated"}`
      );
    } catch (err) {
      // Revert on error
      setCoupons((prev) =>
        prev.map((c) => (c._id === coupon._id ? { ...c, active: !newValue } : c))
      );
      toast.error(getErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  };

  // Delete a coupon — DELETE /admin/coupons/:id.
  // Past orders still show the coupon code (it's denormalized) so
  // this is safe for historical data.
  const handleDelete = async (coupon: AdminCoupon) => {
    const confirmed = window.confirm(
      `Delete coupon "${coupon.code}"?\n\n` +
        `This cannot be undone. Past orders that used this code will still display "${coupon.code}" on the order receipt.\n\n` +
        `Current usage: ${coupon.usageCount} redemption${coupon.usageCount === 1 ? "" : "s"}.`
    );
    if (!confirmed) return;

    setDeletingId(coupon._id);
    try {
      await api.delete(`/admin/coupons/${coupon._id}`);
      setCoupons((prev) => prev.filter((c) => c._id !== coupon._id));
      toast.success(`Coupon ${coupon.code} deleted`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Tag className="text-orange-500" />}
        title="Coupons"
        subtitle={
          loading
            ? <Skeleton className="h-4 w-32" />
            : `${coupons.length} coupon${coupons.length === 1 ? "" : "s"} total`
        }
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={fetchCoupons}
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
              Add coupon
            </Button>
          </div>
        }
      />

      {/* ----- Loading skeleton ----- */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                  <Skeleton className="h-9 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ----- Error state ----- */}
      {!loading && loadError && (
        <ErrorState
          title="Could not load coupons"
          message={loadError}
          onRetry={fetchCoupons}
        />
      )}

      {/* ----- Empty state ----- */}
      {!loading && !loadError && coupons.length === 0 && (
        <EmptyState
          icon={<Tag className="w-10 h-10" />}
          title="No coupons yet"
          description="Create your first promo code to start offering discounts at checkout."
          ctaLabel="Add coupon"
          onCtaClick={() => setShowCreate(true)}
        />
      )}

      {/* ----- List ----- */}
      {!loading && !loadError && coupons.length > 0 && (
        <div className="space-y-3">
          {coupons.map((coupon) => (
            <CouponRow
              key={coupon._id}
              coupon={coupon}
              isToggling={togglingId === coupon._id}
              isDeleting={deletingId === coupon._id}
              onToggleActive={() => handleToggleActive(coupon)}
              onDelete={() => handleDelete(coupon)}
            />
          ))}
        </div>
      )}

      {/* ----- Create modal ----- */}
      {showCreate && (
        <CreateCouponModal
          onClose={() => setShowCreate(false)}
          onCreated={(c) => {
            setCoupons((prev) => [c, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
};

export default CouponManagement;

// ============================================================
// COUPON ROW (sub-component)
// ============================================================
// One card per coupon. Shows the code, the discount formula, the
// usage stats, the validity window, and a row of action buttons.
//
// Why a card (not a table row):
//   The admin only has a handful of coupons at a time (most teams
//   run 3-5 active promos). A card layout is easier to scan on
//   mobile and lets each row carry its own multi-line details
//   (description, validity, usage) without truncating into table
//   tooltips.
const CouponRow = ({
  coupon,
  isToggling,
  isDeleting,
  onToggleActive,
  onDelete,
}: {
  coupon: AdminCoupon;
  isToggling: boolean;
  isDeleting: boolean;
  onToggleActive: () => void;
  onDelete: () => void;
}) => {
  // ----- Derived display values -----
  const discountLabel =
    coupon.discountType === "percentage"
      ? `${coupon.discountValue}% off`
      : `Rs. ${coupon.discountValue.toFixed(0)} off`;

  const validUntil = new Date(coupon.validUntil);
  const validFrom = new Date(coupon.validFrom);
  const now = new Date();
  // A coupon is "expired" if the validUntil timestamp is in the past
  // (regardless of the `active` flag). Admin should see this clearly.
  const isExpired = validUntil < now;
  // "Exhausted" = has a usage limit AND has hit it
  const isExhausted =
    coupon.usageLimit !== null &&
    coupon.usageLimit !== undefined &&
    coupon.usageCount >= coupon.usageLimit;

  return (
    <Card className={!coupon.active ? "opacity-60" : ""}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* ----- Left: code + details ----- */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-gray-900 font-mono">
                {coupon.code}
              </h3>
              {/* Status badges — order matters: most actionable first */}
              {isExpired ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  <XCircle className="w-3 h-3" /> Expired
                </span>
              ) : isExhausted ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  <XCircle className="w-3 h-3" /> Limit reached
                </span>
              ) : coupon.active ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                  <PowerOff className="w-3 h-3" /> Inactive
                </span>
              )}
            </div>

            {/* Discount formula */}
            <p className="mt-1 text-sm text-gray-700 flex items-center gap-1.5">
              {coupon.discountType === "percentage" ? (
                <Percent className="w-3.5 h-3.5 text-orange-500" />
              ) : (
                <DollarSign className="w-3.5 h-3.5 text-orange-500" />
              )}
              <span className="font-semibold">{discountLabel}</span>
              {coupon.maxDiscountAmount ? (
                <span className="text-gray-500">
                  (capped at Rs. {coupon.maxDiscountAmount.toFixed(0)})
                </span>
              ) : null}
            </p>

            {coupon.description && (
              <p className="mt-1 text-sm text-gray-600">{coupon.description}</p>
            )}

            {/* Meta row: validity + usage + min order */}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {validFrom.toLocaleDateString()} → {validUntil.toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1">
                <Hash className="w-3 h-3" />
                Min order: Rs. {coupon.minOrderAmount.toFixed(0)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                Used: {coupon.usageCount}
                {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ""}
                {" "}({coupon.usageLimitPerUser} per user)
              </span>
            </div>
          </div>

          {/* ----- Right: actions ----- */}
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleActive}
              disabled={isToggling || isDeleting}
              title={coupon.active ? "Deactivate" : "Activate"}
            >
              {isToggling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : coupon.active ? (
                <PowerOff className="w-4 h-4" />
              ) : (
                <Power className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={isToggling || isDeleting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              title="Delete coupon"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================================
// CREATE COUPON MODAL (sub-component)
// ============================================================
// Modal form for creating a new coupon. Renders on top of the
// page as a fixed-position card with a backdrop click-to-close.
//
// The form uses string-typed numeric inputs so the user can
// clear the field and retype without the React state coercing
// to NaN. We convert + validate on submit.
//
// Fields:
//   - code (required, 3-30 uppercase chars, no spaces)
//   - description (optional)
//   - discountType: percentage | fixed
//   - discountValue (required, > 0)
//     for percentage: 1-100
//     for fixed: positive Rupee amount
//   - minOrderAmount (default 0)
//   - maxDiscountAmount (only meaningful for percentage, optional)
//   - validFrom (required date)
//   - validUntil (required date, must be after validFrom)
//   - usageLimit (optional, empty = unlimited)
//   - usageLimitPerUser (default 1)
//   - active (default true)
const CreateCouponModal = ({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (coupon: AdminCoupon) => void;
}) => {
  const [form, setForm] = useState<CouponFormData>({
    ...EMPTY_FORM,
    // Default the validity window to "starts today, ends in 30 days"
    validFrom: new Date().toISOString().slice(0, 10),
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update a single field by name. We type the key against
  // CouponFormData so we don't fat-finger a field name.
  const update = <K extends keyof CouponFormData>(
    key: K,
    value: CouponFormData[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // ----- Client-side validation -----
    // The server validates too, but we catch the obvious issues
    // here to give instant feedback.
    const code = form.code.trim().toUpperCase();
    if (!code) {
      setError("Coupon code is required");
      return;
    }
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
      setError(
        "Coupon code must be 3-30 characters, letters/numbers/_/- only, no spaces"
      );
      return;
    }
    const discountValue = parseFloat(form.discountValue);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      setError("Discount value must be greater than 0");
      return;
    }
    if (
      form.discountType === "percentage" &&
      (discountValue < 1 || discountValue > 100)
    ) {
      setError("Percentage discount must be between 1 and 100");
      return;
    }
    const minOrder = parseFloat(form.minOrderAmount) || 0;
    if (minOrder < 0) {
      setError("Min order amount cannot be negative");
      return;
    }
    const maxDiscount = form.maxDiscountAmount.trim()
      ? parseFloat(form.maxDiscountAmount)
      : null;
    if (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) {
      setError("Max discount must be a positive number (or leave empty for no cap)");
      return;
    }
    if (!form.validFrom || !form.validUntil) {
      setError("Both valid-from and valid-until dates are required");
      return;
    }
    if (new Date(form.validUntil) <= new Date(form.validFrom)) {
      setError("Valid-until must be after valid-from");
      return;
    }
    const usageLimit = form.usageLimit.trim()
      ? parseInt(form.usageLimit, 10)
      : null;
    if (
      usageLimit !== null &&
      (!Number.isInteger(usageLimit) || usageLimit < 1)
    ) {
      setError("Usage limit must be a positive whole number (or empty for unlimited)");
      return;
    }
    const perUser = parseInt(form.usageLimitPerUser, 10);
    if (!Number.isInteger(perUser) || perUser < 1) {
      setError("Per-user limit must be 1 or more");
      return;
    }

    // ----- Submit -----
    setSubmitting(true);
    try {
      const res = await api.post("/admin/coupons", {
        code,
        description: form.description.trim() || undefined,
        discountType: form.discountType,
        discountValue,
        minOrderAmount: minOrder,
        maxDiscountAmount: maxDiscount,
        validFrom: new Date(form.validFrom).toISOString(),
        validUntil: new Date(form.validUntil).toISOString(),
        usageLimit,
        usageLimitPerUser: perUser,
        active: form.active,
      });
      // Server returns the created coupon directly (or under .data)
      const created: AdminCoupon = res.data?.data ?? res.data;
      onCreated(created);
      toast.success(`Coupon ${code} created`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop — click to close. z-50 keeps the modal above
          the rest of the page (sidebar, etc). */}
      <div
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto"
        onClick={onClose}
      >
        {/* Stop propagation so clicks INSIDE the modal don't
            bubble up to the backdrop and close it. */}
        <div
          className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8"
          onClick={(e) => e.stopPropagation()}
        >
          <form onSubmit={handleSubmit}>
            {/* ----- Header ----- */}
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-orange-500" />
                <h2 className="text-xl font-bold">New coupon</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 rounded-full p-1 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ----- Body ----- */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Code + description row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cc-code">Code</Label>
                  <Input
                    id="cc-code"
                    value={form.code}
                    onChange={(e) => update("code", e.target.value.toUpperCase())}
                    placeholder="WELCOME20"
                    className="mt-1 uppercase"
                    maxLength={30}
                  />
                </div>
                <div>
                  <Label htmlFor="cc-desc">Description (optional)</Label>
                  <Input
                    id="cc-desc"
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    placeholder="e.g. 20% off for new customers"
                    className="mt-1"
                    maxLength={200}
                  />
                </div>
              </div>

              {/* Discount type + value + min order + max discount */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="cc-type">Discount type</Label>
                  <select
                    id="cc-type"
                    value={form.discountType}
                    onChange={(e) =>
                      update("discountType", e.target.value as DiscountType)
                    }
                    className="mt-1 w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed amount (Rs.)</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="cc-value">
                    {form.discountType === "percentage" ? "Percent" : "Amount (Rs.)"}
                  </Label>
                  <Input
                    id="cc-value"
                    type="number"
                    min="0"
                    step={form.discountType === "percentage" ? "1" : "0.01"}
                    value={form.discountValue}
                    onChange={(e) => update("discountValue", e.target.value)}
                    placeholder={form.discountType === "percentage" ? "20" : "100"}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="cc-min">Min order (Rs.)</Label>
                  <Input
                    id="cc-min"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.minOrderAmount}
                    onChange={(e) => update("minOrderAmount", e.target.value)}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Max discount cap — only meaningful for percentage,
                  but we leave it visible (and disable) for fixed
                  type so the form layout is stable. */}
              <div>
                <Label htmlFor="cc-max">
                  Max discount cap (Rs., optional)
                </Label>
                <Input
                  id="cc-max"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.maxDiscountAmount}
                  onChange={(e) => update("maxDiscountAmount", e.target.value)}
                  placeholder={
                    form.discountType === "percentage"
                      ? "e.g. 200 (caps a 20% off coupon at Rs. 200 off)"
                      : "N/A for fixed — leave empty"
                  }
                  className="mt-1"
                  disabled={form.discountType === "fixed"}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {form.discountType === "percentage"
                    ? "If set, no customer will ever get more than this Rupee amount off, no matter the order size."
                    : "Not applicable for fixed-amount coupons (the discount is already a fixed Rs. value)."}
                </p>
              </div>

              {/* Validity window */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cc-from">Valid from</Label>
                  <Input
                    id="cc-from"
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => update("validFrom", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="cc-until">Valid until</Label>
                  <Input
                    id="cc-until"
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => update("validUntil", e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Usage limits */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cc-total">Total usage limit (optional)</Label>
                  <Input
                    id="cc-total"
                    type="number"
                    min="1"
                    step="1"
                    value={form.usageLimit}
                    onChange={(e) => update("usageLimit", e.target.value)}
                    placeholder="Empty = unlimited"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="cc-per-user">Usage limit per user</Label>
                  <Input
                    id="cc-per-user"
                    type="number"
                    min="1"
                    step="1"
                    value={form.usageLimitPerUser}
                    onChange={(e) => update("usageLimitPerUser", e.target.value)}
                    placeholder="1"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => update("active", e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-700">
                  Active immediately (customers can use it as soon as it's created)
                </span>
              </label>

              {/* Error banner */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3">
                  {error}
                </div>
              )}
            </div>

            {/* ----- Footer ----- */}
            <div className="flex justify-end gap-2 p-6 border-t bg-gray-50 rounded-b-lg">
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
                className="bg-orange hover:bg-hoverOrange"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 w-4 h-4" />
                    Create coupon
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};
