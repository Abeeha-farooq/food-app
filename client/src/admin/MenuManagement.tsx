// src/admin/MenuManagement.tsx
// ===============================
// Menu Management Module
// ===============================
// What this page does:
//   - Pick a restaurant from a dropdown
//   - List that restaurant's menu items
//   - Add a new menu item (opens a modal with a form + image upload)
//   - Edit an existing item (modal pre-filled)
//   - Delete an item (with confirmation)
//   - Toggle availability (available / sold out)
//
// All data comes from the existing /api/restaurants/:id/menu/* endpoints
// (GET/POST/PUT/DELETE) — no new APIs, no new models, no mock data.
//
// Image upload: we COMPRESS the chosen file in the browser before
// reading it as a base64 data URL. This solves the 413 (Payload
// Too Large) errors we were hitting on Vercel — see
// src/lib/imageCompress.ts for the full why. The compressed image
// is still a `data:image/jpeg;base64,...` URL stored in the same
// `imageUrl` field, so no server-side changes are needed.
// ===============================

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compressImage } from "@/lib/imageCompress";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Utensils,
  ImagePlus,
  RefreshCw,
  AlertTriangle,
  Tag,
  DollarSign,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

// ============================================================
// TYPES — match the backend MenuItem model
// ============================================================
interface MenuItem {
  _id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  category: string;
  tags?: string[];
  available: boolean;
  restaurant: string;   // restaurant ID (just the ID, not populated)
}

interface Restaurant {
  _id: string;
  name: string;
  city: string;
}

// ============================================================
// SUGGESTED CATEGORIES — matches what we used in the seed
// (just a UX hint, the backend accepts any string)
// ============================================================
const CATEGORY_SUGGESTIONS = [
  "Pizza", "Burger", "Starter", "Dessert", "Drinks", "Desi", "Asian", "Italian", "Bakery", "Other",
];

// ============================================================
// MAIN COMPONENT
// ============================================================
const MenuManagement = () => {
  // ----- Restaurant list (so the user can pick one) -----
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>("");

  // ----- Menu items for the selected restaurant -----
  const [items, setItems] = useState<MenuItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ----- Modals -----
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ============================================================
  // Fetch the restaurant list once on mount
  // ============================================================
  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        const res = await api.get("/restaurants", { params: { limit: 100 } });
        setRestaurants(res.data.data.items);
        // Auto-select the first restaurant so the user sees something
        if (res.data.data.items.length > 0) {
          setSelectedRestaurantId(res.data.data.items[0]._id);
        }
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setRestaurantsLoading(false);
      }
    };
    fetchRestaurants();
  }, []);

  // ============================================================
  // Fetch menu items whenever the selected restaurant changes
  // ============================================================
  useEffect(() => {
    if (!selectedRestaurantId) {
      setItems([]);
      return;
    }
    const fetchItems = async () => {
      setItemsLoading(true);
      try {
        const res = await api.get(`/restaurants/${selectedRestaurantId}/menu`);
        setItems(res.data.data);
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setItemsLoading(false);
      }
    };
    fetchItems();
  }, [selectedRestaurantId]);

  // ============================================================
  // In-place list updates (snappier than refetching)
  // ============================================================
  const handleSaved = (saved: MenuItem) => {
    setItems((prev) => {
      const exists = prev.find((i) => i._id === saved._id);
      if (exists) return prev.map((i) => (i._id === saved._id ? saved : i));
      return [saved, ...prev];
    });
  };

  const handleDeleted = (id: string) => {
    setItems((prev) => prev.filter((i) => i._id !== id));
  };

  // Filter items by name (client-side — the menu list is usually small)
  const visibleItems = items.filter((i) =>
    !searchQuery.trim() || i.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const selectedRestaurant = restaurants.find((r) => r._id === selectedRestaurantId);

  return (
    <div className="space-y-6">
      {/* ==================== HEADER + RESTAURANT SELECTOR ==================== */}
      <div className="flex flex-col md:flex-row md:items-end gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900">Menu Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Add, edit, and remove menu items
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 md:items-end">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600 mb-1">Restaurant</label>
            <select
              value={selectedRestaurantId}
              onChange={(e) => setSelectedRestaurantId(e.target.value)}
              disabled={restaurantsLoading}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white min-w-[220px] focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {restaurantsLoading ? (
                <option>Loading restaurants...</option>
              ) : restaurants.length === 0 ? (
                <option>No restaurants available</option>
              ) : (
                restaurants.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name} ({r.city})
                  </option>
                ))
              )}
            </select>
          </div>
          <Button
            onClick={() => setCreating(true)}
            disabled={!selectedRestaurantId}
            className="bg-orange hover:bg-hoverOrange"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Item
          </Button>
        </div>
      </div>

      {/* ==================== SEARCH + REFRESH ==================== */}
      {selectedRestaurantId && (
        <Card>
          <CardContent className="p-4 flex gap-3">
            <div className="relative flex-1">
              <Utensils className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by item name"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                // Force-refresh by re-setting the selected restaurant id to the same value
                const current = selectedRestaurantId;
                setSelectedRestaurantId("");
                setTimeout(() => setSelectedRestaurantId(current), 0);
              }}
              disabled={itemsLoading}
            >
              {itemsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ==================== TABLE / STATES ==================== */}
      <Card>
        <CardContent className="p-0">
          {!selectedRestaurantId ? (
            <EmptyState
              icon={<Utensils className="w-12 h-12 text-gray-300 mx-auto mb-3" />}
              title="Select a restaurant"
              description="Pick a restaurant from the dropdown above to see its menu."
            />
          ) : itemsLoading ? (
            <LoadingState />
          ) : visibleItems.length === 0 ? (
            searchQuery ? (
              <EmptyState
                icon={<Utensils className="w-12 h-12 text-gray-300 mx-auto mb-3" />}
                title={`No items match "${searchQuery}"`}
                description="Try a different search or add a new item."
                actionLabel="Clear search"
                onAction={() => setSearchQuery("")}
              />
            ) : (
              <EmptyState
                icon={<Utensils className="w-12 h-12 text-gray-300 mx-auto mb-3" />}
                title={`${selectedRestaurant?.name || "This restaurant"} has no menu items yet`}
                description="Add the first item to get started."
                actionLabel="Add Item"
                onAction={() => setCreating(true)}
              />
            )
          ) : (
            <MenuTable
              items={visibleItems}
              onEdit={(item) => setEditing(item)}
              onDelete={(id) => setDeletingId(id)}
            />
          )}
        </CardContent>
      </Card>

      {/* ==================== MODALS ==================== */}
      {creating && selectedRestaurantId && (
        <MenuFormModal
          mode="create"
          restaurantId={selectedRestaurantId}
          onClose={() => setCreating(false)}
          onSaved={(item) => {
            handleSaved(item);
            setCreating(false);
            toast.success(`"${item.name}" added to menu`);
          }}
        />
      )}

      {editing && (
        <MenuFormModal
          mode="edit"
          restaurantId={selectedRestaurantId}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(item) => {
            handleSaved(item);
            setEditing(null);
            toast.success(`"${item.name}" updated`);
          }}
        />
      )}

      {deletingId && (
        <DeleteConfirmModal
          item={items.find((i) => i._id === deletingId) || null}
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

export default MenuManagement;

// ============================================================
// TABLE
// ============================================================
const MenuTable = ({
  items,
  onEdit,
  onDelete,
}: {
  items: MenuItem[];
  onEdit: (i: MenuItem) => void;
  onDelete: (id: string) => void;
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="text-left text-gray-500 border-b bg-gray-50">
        <tr>
          <th className="py-3 px-4 font-medium">Item</th>
          <th className="py-3 px-4 font-medium">Category</th>
          <th className="py-3 px-4 font-medium">Price</th>
          <th className="py-3 px-4 font-medium">Availability</th>
          <th className="py-3 px-4 font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item._id} className="border-b hover:bg-gray-50">
            {/* Image + name + description */}
            <td className="py-3 px-4">
              <div className="flex items-center gap-3">
                <img
                  src={item.imageUrl || "https://placehold.co/60x60/orange/white?text=F"}
                  alt={item.name}
                  className="w-12 h-12 rounded-md object-cover bg-gray-100"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{item.name}</p>
                  {item.description && (
                    <p className="text-xs text-gray-500 truncate max-w-[300px]">
                      {item.description}
                    </p>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {item.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </td>

            {/* Category badge */}
            <td className="py-3 px-4">
              <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 text-xs px-2 py-0.5 rounded-md border border-orange-200">
                <Tag className="w-3 h-3" />
                {item.category}
              </span>
            </td>

            {/* Price */}
            <td className="py-3 px-4 font-semibold text-gray-900">
              <div className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                Rs. {item.price.toFixed(2)}
              </div>
            </td>

            {/* Available / Sold out */}
            <td className="py-3 px-4">
              {item.available ? (
                <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-md border border-green-200">
                  <Eye className="w-3 h-3" />
                  Available
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-md border border-gray-200">
                  <EyeOff className="w-3 h-3" />
                  Sold out
                </span>
              )}
            </td>

            {/* Actions */}
            <td className="py-3 px-4 text-right">
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDelete(item._id)}
                  aria-label={`Delete ${item.name}`}
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

// ============================================================
// LOADING / EMPTY STATES (reusable)
// ============================================================
const LoadingState = () => (
  // Skeleton grid for menu items — 6 placeholder cards (3 per row × 2 rows)
  // so the layout doesn't shift when the real data arrives.
  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="border border-gray-200 rounded-md p-3 space-y-2">
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex justify-between items-center">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({
  icon, title, description, actionLabel, onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <div className="text-center py-16 px-4">
    {icon}
    <p className="text-lg text-gray-700 font-medium">{title}</p>
    <p className="text-sm text-gray-500 mt-1">{description}</p>
    {actionLabel && onAction && (
      <Button onClick={onAction} className="mt-4 bg-orange hover:bg-hoverOrange">
        {actionLabel}
      </Button>
    )}
  </div>
);

// ============================================================
// FORM MODAL — handles both create and edit, with image upload
// ============================================================
const MenuFormModal = ({
  mode,
  restaurantId,
  item,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  restaurantId: string;
  item?: MenuItem;
  onClose: () => void;
  onSaved: (i: MenuItem) => void;
}) => {
  // Form state
  const [form, setForm] = useState({
    name: item?.name || "",
    description: item?.description || "",
    price: item?.price ?? 0,
    imageUrl: item?.imageUrl || "",
    category: item?.category || "",
    tags: item?.tags?.join(", ") || "",
    available: item?.available ?? true,
  });
  const [saving, setSaving] = useState(false);
  // `compressing` is true while the in-browser image resize +
  // JPEG re-encode is running. We use it to disable the upload
  // button and show a small spinner so the user doesn't think
  // nothing is happening (compression on a 5MB iPhone photo
  // takes ~200-500ms on a modern laptop).
  const [compressing, setCompressing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Update one field + clear that field's error
  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key as string]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  };

  // ============================================================
  // Image upload: compress in the browser, then read as base64
  // ============================================================
  // Why compress here (not on the server):
  //   - Vercel's serverless function hard cap is 4.5 MB on the
  //     request body. A raw 5 MB iPhone photo → ~6.7 MB base64 →
  //     Vercel edge returns 413 BEFORE the request hits Express.
  //   - Compressing to 1200px / JPEG q=0.85 brings a 5 MB photo
  //     down to ~200 KB, well under the cap.
  //   - Compression runs in the browser via canvas + toBlob — no
  //     new dependencies, no server CPU cost, no new endpoint.
  //
  // The output is the same shape the old code produced: a
  // `data:image/jpeg;base64,...` URL stored in the imageUrl
  // field. The server, the database, and the rest of the
  // pipeline don't need to know the image was compressed.
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset the input so the SAME file can be re-picked
    // later (otherwise selecting a file, removing it, then
    // re-selecting the same file would fire no change event).
    e.target.value = "";

    // Sanity check: refuse if the source isn't an image. The
    // browser's accept="image/*" attribute filters the file
    // picker, but a determined user can pick "All files" and
    // bypass that.
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }

    setCompressing(true);
    try {
      const result = await compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.85,
        // Force JPEG for predictable size. PNG is opt-in (the
        // user can ask for it if they have transparency needs).
        mimeType: "image/jpeg",
      });
      update("imageUrl", result.dataUrl);

      // Log the compression ratio so future debugging is
      // easier. We round to KB for readability.
      const originalKb = Math.round(file.size / 1024);
      const compressedKb = Math.round(result.size / 1024);
      console.log(
        `[image] ${file.name}: ${originalKb}KB → ${compressedKb}KB ` +
          `(${result.width}×${result.height})`
      );
    } catch (err) {
      // The compressor throws on load/encoding failures. We
      // show a friendly toast — the rest of the form stays
      // usable so the user can try a different file.
      toast.error(
        err instanceof Error
          ? `Couldn't process image: ${err.message}`
          : "Couldn't process image. Please try a different file."
      );
    } finally {
      setCompressing(false);
    }
  };

  const clearImage = () => update("imageUrl", "");

  // ============================================================
  // Client-side validation
  // ============================================================
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim())                newErrors.name = "Name is required";
    else if (form.name.length > 80)       newErrors.name = "Max 80 characters";
    if (!form.category.trim())            newErrors.category = "Category is required";
    if (form.price < 0)                   newErrors.price = "Price can't be negative";
    if (form.description.length > 300)   newErrors.description = "Max 300 characters";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      // Convert "spicy, bestseller" → ["spicy", "bestseller"], dropping empty strings
      const payload = {
        ...form,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      };

      const res = mode === "create"
        ? await api.post(`/restaurants/${restaurantId}/menu`, payload)
        : await api.put(`/restaurants/${restaurantId}/menu/${item!._id}`, payload);

      onSaved(res.data.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title={mode === "create" ? "Add Menu Item" : "Edit Menu Item"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ==================== IMAGE UPLOAD ==================== */}
        <FormField label="Food image" hint="Upload an image or paste a URL">
          {/* Hidden file input — triggered by the buttons below */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {form.imageUrl ? (
            // Preview when an image is set
            <div className="relative w-full h-48 bg-gray-100 rounded-md overflow-hidden">
              <img src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" />
              {/* Translucent overlay while the next image is
                  being compressed — keeps the old preview
                  visible but signals "wait, something's
                  happening". */}
              {compressing && (
                <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-gray-700 bg-white px-3 py-1.5 rounded-full shadow">
                    <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                    Compressing…
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={clearImage}
                disabled={compressing}
                className="absolute top-2 right-2 p-1.5 bg-white rounded-full shadow hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Remove image"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            // Empty state — buttons to upload or paste URL
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={compressing}
                className="w-full h-32 border-2 border-dashed border-gray-300 rounded-md flex flex-col items-center justify-center gap-1 hover:border-orange hover:bg-orange-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {compressing ? (
                  // Compressing state — show a spinner so the
                  // user knows something is happening. A 5MB
                  // iPhone photo can take ~200-500ms to resize
                  // + re-encode.
                  <>
                    <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                    <span className="text-sm text-gray-600">Compressing image…</span>
                    <span className="text-xs text-gray-400">This usually takes less than a second</span>
                  </>
                ) : (
                  <>
                    <ImagePlus className="w-6 h-6 text-gray-400" />
                    <span className="text-sm text-gray-600">Click to upload an image</span>
                    <span className="text-xs text-gray-400">Any size — we'll optimize it for you</span>
                  </>
                )}
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">or paste URL:</span>
                <Input
                  value={form.imageUrl.startsWith("data:") ? "" : form.imageUrl}
                  onChange={(e) => update("imageUrl", e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                />
              </div>
            </div>
          )}
        </FormField>

        {/* ==================== NAME + PRICE ==================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Item name" required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Margherita Pizza"
              maxLength={80}
            />
          </FormField>
          <FormField label="Price (Rs.)" required error={errors.price}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) => update("price", Number(e.target.value))}
              placeholder="12.99"
            />
          </FormField>
        </div>

        {/* ==================== CATEGORY + TAGS ==================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Category" required error={errors.category} hint="Type your own or pick a suggestion">
            <Input
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
              placeholder="Pizza"
              list="category-suggestions"
            />
            <datalist id="category-suggestions">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </FormField>
          <FormField label="Tags" hint="Comma-separated, e.g. spicy, bestseller">
            <Input
              value={form.tags}
              onChange={(e) => update("tags", e.target.value)}
              placeholder="spicy, vegetarian"
            />
          </FormField>
        </div>

        {/* ==================== DESCRIPTION ==================== */}
        <FormField label="Description" error={errors.description} hint="Optional — max 300 characters">
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Classic tomato, mozzarella, fresh basil"
            maxLength={300}
            rows={2}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </FormField>

        {/* ==================== AVAILABILITY TOGGLE ==================== */}
        <div className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
          <div className="flex items-center gap-2">
            {form.available ? (
              <Eye className="w-4 h-4 text-green-600" />
            ) : (
              <EyeOff className="w-4 h-4 text-gray-500" />
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">Available to customers</p>
              <p className="text-xs text-gray-500">
                Turn off to mark as "sold out" without deleting the item
              </p>
            </div>
          </div>
          {/* Toggle switch (just a styled checkbox) */}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={form.available}
              onChange={(e) => update("available", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange"></div>
          </label>
        </div>

        {/* ==================== FOOTER ==================== */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="bg-orange hover:bg-hoverOrange">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {saving ? "Saving..." : mode === "create" ? "Add to menu" : "Save changes"}
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
  item,
  onClose,
  onDeleted,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) => {
  const [deleting, setDeleting] = useState(false);
  if (!item) return null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // The endpoint is /api/restaurants/:restaurantId/menu/:itemId
      await api.delete(`/restaurants/${item.restaurant}/menu/${item._id}`);
      toast.success(`"${item.name}" deleted`);
      onDeleted(item._id);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title="Delete menu item?" width="max-w-md">
      <div className="space-y-4">
        <div className="flex gap-3 p-3 bg-red-50 border border-red-200 rounded-md">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-medium">This cannot be undone.</p>
            <p className="mt-1">
              Deleting <strong>{item.name}</strong> will remove it from this restaurant's menu
              permanently. Any current carts with this item will lose it.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
            {deleting ? "Deleting..." : "Yes, delete"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
};

// ============================================================
// REUSABLE: ModalShell + FormField (same as RestaurantManagement)
// ============================================================
const ModalShell = ({
  children, onClose, title, width = "max-w-2xl",
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  width?: string;
}) => (
  <div
    className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
    onClick={onClose}
  >
    <div
      className={`bg-white rounded-lg shadow-xl w-full ${width} max-h-[90vh] overflow-y-auto`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white z-10">
        <h2 className="text-xl font-bold">{title}</h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

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