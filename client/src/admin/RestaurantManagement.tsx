// src/admin/RestaurantManagement.tsx
// ===============================
// Restaurant Management Module
// ===============================
// What this page does:
//   - List all restaurants in a table
//   - Search by name (also matches city and country via the backend)
//   - Add a new restaurant (opens a modal with a form)
//   - Edit an existing restaurant (opens the same modal pre-filled)
//   - Delete a restaurant (with a confirmation dialog)
//
// All data comes from the existing /api/restaurants endpoints (GET/POST/PUT/DELETE).
// No mock data, no new backend APIs needed — the backend already supports
// everything we need (verified via smoke test).
// ===============================

import { useEffect, useState, type FormEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Loader2,
  Store,
  MapPin,
  RefreshCw,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

// ============================================================
// TYPES — match the backend Restaurant model
// ============================================================
type PriceRange = "low" | "medium" | "high";

interface Restaurant {
  _id: string;
  name: string;
  cuisines: string[];
  city: string;
  country: string;
  address?: string;
  imageUrl?: string;
  priceRange: PriceRange;
  estimatedDeliveryTime: number;
}

// ============================================================
// CONSTANTS
// ============================================================
const PRICE_RANGES: { value: PriceRange; label: string; symbol: string }[] = [
  { value: "low",    label: "Low",    symbol: "$" },
  { value: "medium", label: "Medium", symbol: "$$" },
  { value: "high",   label: "High",   symbol: "$$$" },
];

// ============================================================
// MAIN COMPONENT
// ============================================================
const RestaurantManagement = () => {
  // ----- State -----
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editing, setEditing] = useState<Restaurant | null>(null);     // null = modal closed; object = open with that restaurant
  const [creating, setCreating] = useState(false);                    // true = modal open for create
  const [deletingId, setDeletingId] = useState<string | null>(null);   // id of restaurant pending delete confirmation

  // ----- Fetch on mount AND whenever searchQuery changes (debounce-less for now) -----
  useEffect(() => {
    fetchRestaurants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const fetchRestaurants = async () => {
    setLoading(true);
    try {
      // The backend's GET /api/restaurants supports ?search= which matches name, city, or country
      const res = await api.get("/restaurants", {
        params: searchQuery.trim() ? { search: searchQuery.trim() } : {},
      });
      setRestaurants(res.data.data.items);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ----- Handlers (passed to the modal) -----
  const handleSaved = (saved: Restaurant) => {
    // Update the list in-place instead of re-fetching for a snappier UX
    setRestaurants((prev) => {
      const exists = prev.find((r) => r._id === saved._id);
      if (exists) {
        return prev.map((r) => (r._id === saved._id ? saved : r));
      }
      return [saved, ...prev];   // new restaurant goes at the top
    });
  };

  const handleDeleted = (id: string) => {
    setRestaurants((prev) => prev.filter((r) => r._id !== id));
  };

  return (
    <div className="space-y-6">
      {/* ==================== HEADER ==================== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Restaurants</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your restaurants — {restaurants.length} total
          </p>
        </div>
        <Button
          onClick={() => setCreating(true)}
          className="bg-orange hover:bg-hoverOrange"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Restaurant
        </Button>
      </div>

      {/* ==================== SEARCH + REFRESH ==================== */}
      <Card>
        <CardContent className="p-4 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by name, city, or country"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={fetchRestaurants} variant="outline" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-1 hidden sm:inline">Refresh</span>
          </Button>
        </CardContent>
      </Card>

      {/* ==================== TABLE / STATES ==================== */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState />
          ) : restaurants.length === 0 ? (
            <EmptyState
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery("")}
              onAdd={() => setCreating(true)}
            />
          ) : (
            <RestaurantTable
              restaurants={restaurants}
              onEdit={(r) => setEditing(r)}
              onDelete={(id) => setDeletingId(id)}
            />
          )}
        </CardContent>
      </Card>

      {/* ==================== MODALS ==================== */}
      {creating && (
        <RestaurantFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={(r) => {
            handleSaved(r);
            setCreating(false);
            toast.success(`Restaurant "${r.name}" created`);
          }}
        />
      )}

      {editing && (
        <RestaurantFormModal
          mode="edit"
          restaurant={editing}
          onClose={() => setEditing(null)}
          onSaved={(r) => {
            handleSaved(r);
            setEditing(null);
            toast.success(`Restaurant "${r.name}" updated`);
          }}
        />
      )}

      {deletingId && (
        <DeleteConfirmModal
          restaurant={restaurants.find((r) => r._id === deletingId) || null}
          onClose={() => setDeletingId(null)}
          onDeleted={(id) => {
            handleDeleted(id);
            setDeletingId(null);
          }}
        />
      )}
    </div>
  );
};

export default RestaurantManagement;

// ============================================================
// TABLE
// ============================================================
const RestaurantTable = ({
  restaurants,
  onEdit,
  onDelete,
}: {
  restaurants: Restaurant[];
  onEdit: (r: Restaurant) => void;
  onDelete: (id: string) => void;
}) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-gray-500 border-b bg-gray-50">
          <tr>
            <th className="py-3 px-4 font-medium">Restaurant</th>
            <th className="py-3 px-4 font-medium">Location</th>
            <th className="py-3 px-4 font-medium">Cuisines</th>
            <th className="py-3 px-4 font-medium">Price</th>
            <th className="py-3 px-4 font-medium">ETA</th>
            <th className="py-3 px-4 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {restaurants.map((r) => (
            <tr key={r._id} className="border-b hover:bg-gray-50">
              {/* Restaurant name + image */}
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <img
                    src={r.imageUrl || "https://placehold.co/60x60/orange/white?text=R"}
                    alt={r.name}
                    className="w-12 h-12 rounded-md object-cover bg-gray-100"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{r.name}</p>
                    {r.address && (
                      <p className="text-xs text-gray-500 truncate">{r.address}</p>
                    )}
                  </div>
                </div>
              </td>

              {/* City, Country */}
              <td className="py-3 px-4">
                <div className="flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-gray-900">{r.city}</p>
                    <p className="text-xs text-gray-500">{r.country}</p>
                  </div>
                </div>
              </td>

              {/* Cuisines as badges */}
              <td className="py-3 px-4">
                <div className="flex flex-wrap gap-1">
                  {r.cuisines.slice(0, 3).map((c) => (
                    <span key={c} className="inline-block bg-orange-50 text-orange-700 text-xs px-2 py-0.5 rounded-md border border-orange-200">
                      {c}
                    </span>
                  ))}
                  {r.cuisines.length > 3 && (
                    <span className="text-xs text-gray-500">+{r.cuisines.length - 3}</span>
                  )}
                </div>
              </td>

              {/* Price range */}
              <td className="py-3 px-4">
                <span className={`text-xs px-2 py-0.5 rounded-md border ${
                  r.priceRange === "low"    ? "bg-green-50 text-green-700 border-green-200" :
                  r.priceRange === "medium" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                                              "bg-red-50 text-red-700 border-red-200"
                }`}>
                  {PRICE_RANGES.find((p) => p.value === r.priceRange)?.symbol || r.priceRange}
                </span>
              </td>

              {/* Delivery time */}
              <td className="py-3 px-4 text-gray-600">
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {r.estimatedDeliveryTime} min
                </div>
              </td>

              {/* Actions */}
              <td className="py-3 px-4 text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(r)}
                    aria-label={`Edit ${r.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDelete(r._id)}
                    aria-label={`Delete ${r.name}`}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ============================================================
// LOADING / EMPTY STATES
// ============================================================
const LoadingState = () => (
  // Skeleton rows for the restaurant table — preserves the layout
  // so the page doesn't jump when data arrives.
  <div className="p-4 space-y-3">
    {[0, 1, 2, 3, 4].map((i) => (
      <div key={i} className="flex items-center gap-4 py-3">
        <Skeleton className="h-12 w-12 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
    ))}
  </div>
);

const EmptyState = ({
  searchQuery,
  onClearSearch,
  onAdd,
}: {
  searchQuery: string;
  onClearSearch: () => void;
  onAdd: () => void;
}) => (
  <div className="text-center py-16 px-4">
    <Store className="w-12 h-12 text-gray-300 mx-auto mb-3" />
    {searchQuery ? (
      <>
        <p className="text-lg text-gray-700 font-medium">No restaurants match "{searchQuery}"</p>
        <p className="text-sm text-gray-500 mt-1">Try a different search or clear the filter.</p>
        <Button variant="outline" onClick={onClearSearch} className="mt-4">
          Clear search
        </Button>
      </>
    ) : (
      <>
        <p className="text-lg text-gray-700 font-medium">No restaurants yet</p>
        <p className="text-sm text-gray-500 mt-1">Add your first restaurant to get started.</p>
        <Button onClick={onAdd} className="mt-4 bg-orange hover:bg-hoverOrange">
          <Plus className="w-4 h-4 mr-1" />
          Add Restaurant
        </Button>
      </>
    )}
  </div>
);

// ============================================================
// FORM MODAL — used for both create and edit
// ============================================================
const RestaurantFormModal = ({
  mode,
  restaurant,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  restaurant?: Restaurant;
  onClose: () => void;
  onSaved: (r: Restaurant) => void;
}) => {
  // Initial form state — either pre-filled (edit) or empty (create)
  const [form, setForm] = useState({
    name: restaurant?.name || "",
    cuisines: restaurant?.cuisines.join(", ") || "",   // comma-separated string in UI
    city: restaurant?.city || "",
    country: restaurant?.country || "",
    address: restaurant?.address || "",
    imageUrl: restaurant?.imageUrl || "",
    priceRange: (restaurant?.priceRange || "medium") as PriceRange,
    estimatedDeliveryTime: restaurant?.estimatedDeliveryTime || 30,
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear field error when user starts typing
    if (errors[key as string]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  };

  // Client-side validation — mirrors what the backend enforces
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim())            newErrors.name = "Name is required";
    else if (form.name.length > 100)   newErrors.name = "Max 100 characters";
    if (!form.cuisines.trim())         newErrors.cuisines = "At least one cuisine is required";
    if (!form.city.trim())             newErrors.city = "City is required";
    if (!form.country.trim())          newErrors.country = "Country is required";
    if (form.estimatedDeliveryTime < 0) newErrors.estimatedDeliveryTime = "Must be positive";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      // Convert cuisines from "Pizza, Italian" string → ["Pizza", "Italian"] array
      const payload = {
        ...form,
        cuisines: form.cuisines.split(",").map((c) => c.trim()).filter(Boolean),
      };

      const res =
        mode === "create"
          ? await api.post("/restaurants", payload)
          : await api.put(`/restaurants/${restaurant!._id}`, payload);

      onSaved(res.data.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title={mode === "create" ? "Add Restaurant" : "Edit Restaurant"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <FormField label="Restaurant name" required error={errors.name}>
          <Input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Pizza Palace"
            maxLength={100}
          />
        </FormField>

        {/* Cuisines (comma-separated) */}
        <FormField label="Cuisines" required error={errors.cuisines} hint="Separate with commas, e.g. Pizza, Italian">
          <Input
            value={form.cuisines}
            onChange={(e) => update("cuisines", e.target.value)}
            placeholder="Pizza, Italian"
          />
        </FormField>

        {/* City + Country side-by-side */}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="City" required error={errors.city}>
            <Input
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="Lahore"
            />
          </FormField>
          <FormField label="Country" required error={errors.country}>
            <Input
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              placeholder="Pakistan"
            />
          </FormField>
        </div>

        {/* Address (optional) */}
        <FormField label="Address" hint="Optional">
          <Input
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="123 Main Boulevard"
          />
        </FormField>

        {/* Image URL (optional) */}
        <FormField label="Image URL" hint="Optional — paste any image URL">
          <Input
            value={form.imageUrl}
            onChange={(e) => update("imageUrl", e.target.value)}
            placeholder="https://example.com/photo.jpg"
          />
        </FormField>

        {/* Price range + delivery time */}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Price range">
            <select
              value={form.priceRange}
              onChange={(e) => update("priceRange", e.target.value as PriceRange)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {PRICE_RANGES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Delivery time (minutes)" error={errors.estimatedDeliveryTime}>
            <Input
              type="number"
              min={0}
              value={form.estimatedDeliveryTime}
              onChange={(e) => update("estimatedDeliveryTime", Number(e.target.value))}
            />
          </FormField>
        </div>

        {/* Footer buttons */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="bg-orange hover:bg-hoverOrange">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {saving ? "Saving..." : mode === "create" ? "Create" : "Save changes"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
};

// ============================================================
// DELETE CONFIRMATION MODAL
// ============================================================
const DeleteConfirmModal = ({
  restaurant,
  onClose,
  onDeleted,
}: {
  restaurant: Restaurant | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) => {
  const [deleting, setDeleting] = useState(false);

  if (!restaurant) return null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/restaurants/${restaurant._id}`);
      toast.success(`Restaurant "${restaurant.name}" deleted`);
      onDeleted(restaurant._id);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title="Delete restaurant?" width="max-w-md">
      <div className="space-y-4">
        <div className="flex gap-3 p-3 bg-red-50 border border-red-200 rounded-md">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-medium">This cannot be undone.</p>
            <p className="mt-1">
              Deleting <strong>{restaurant.name}</strong> will also remove all of its menu items
              (the backend handles this cascade).
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
            {deleting ? "Deleting..." : "Yes, delete"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
};

// ============================================================
// REUSABLE: ModalShell (backdrop + panel + close button)
// ============================================================
const ModalShell = ({
  children, onClose, title, width = "max-w-2xl",
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  width?: string;
}) => (
  // Fixed backdrop covers the screen
  <div
    className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
    onClick={onClose}
  >
    {/* Panel — stop propagation so clicks inside don't close it */}
    <div
      className={`bg-white rounded-lg shadow-xl w-full ${width} max-h-[90vh] overflow-y-auto`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="p-6 border-b flex items-center justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>
      {/* Body */}
      <div className="p-6">{children}</div>
    </div>
  </div>
);

// ============================================================
// REUSABLE: FormField (label + input + optional error/hint)
// ============================================================
const FormField = ({
  label, required, error, hint, children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
  </div>
);