// src/components/FilterPage.tsx
// ===============================
// Purpose: Filter sidebar for the Restaurants page.
//          Lifted-state pattern: filter selection lives in the parent
//          (SearchPage) so any change re-triggers the parent's fetch.
//
// Layout:
//   <Card> wrapper
//     ├── Header  (icon + title + active-filter count)
//     ├── Body    (Cuisine section + divider + Price section)
//     └── Footer  (Reset button — only when at least one filter is active)
//
// Why each section is a "mini-card":
//   The single-card-with-internal-dividers pattern keeps the panel feeling
//   like ONE thing (one card) but still gives each filter group its own
//   visual breathing room. It's the pattern used by Amazon, Airbnb, and most
//   e-commerce search pages — familiar to users.
//
// Responsive tokens (kept consistent with SearchPage):
//   - Card radius:    rounded-xl → sm:rounded-2xl
//   - Card padding:   px-5 py-4 → sm:px-6 sm:py-5
//   - Row padding:    px-2 py-2 → sm:px-2.5
//   - Hover/active:   bg-orange-50/60 (subtle) → active: bg-orange-50
//   - Shadow:         shadow-sm (mobile) → sm:shadow (desktop)
//   - Text size:      text-sm → sm:text-[15px] for primary labels
// ===============================

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Utensils, DollarSign, SlidersHorizontal, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
// (The shadcn Card component was removed — we use a plain <div>
// with explicit flex layout so the body can scroll independently
// when the sidebar is too short. See the main return statement
// for details.)

const cuisineOptions = ["Desi", "Pizza", "Burger", "Starter", "Dessert", "Drinks"];
const priceRanges = ["Low", "Medium", "High"];

interface Props {
  selectedCuisines: string[];
  setSelectedCuisines: (value: string[]) => void;
  selectedPrices: string[];
  setSelectedPrices: (value: string[]) => void;
}

const FilterPage = ({
  selectedCuisines,
  setSelectedCuisines,
  selectedPrices,
  setSelectedPrices,
}: Props) => {
  // Total number of currently-applied filters — drives the header badge
  // and the visibility of the "Reset" button in the footer.
  const activeCount = selectedCuisines.length + selectedPrices.length;
  const hasActive = activeCount > 0;

  const handleCuisineToggle = (value: string) => {
    // Single-select, like the price filter below. Clicking a new
    // cuisine REPLACES the previous one — you can only narrow the
    // list to one cuisine at a time. Clicking the already-selected
    // cuisine again clears it (sets to []), so the user can
    // remove the filter without hunting for the "Reset" button.
    //
    // The value is kept in its original capitalized form
    // ("Pizza", "Burger") because:
    //   1. The backend's cuisine filter is case-insensitive, so
    //      case doesn't affect matching.
    //   2. The badge display in SearchPage needs the capitalized
    //      form to look right ("pizza ✕" would be ugly).
    setSelectedCuisines(
      selectedCuisines.includes(value) ? [] : [value]
    );
  };

  const handlePriceToggle = (value: string) => {
    // Price is stored lowercase in the DB (enum: "low" | "medium" | "high"),
    // so we lowercase here. The display is capitalized via the priceRanges
    // array, but the value sent to the API must match the enum.
    //
    // Single-select for the same reason as cuisine: only one
    // price bucket at a time. A cuisine + a price CAN coexist
    // (the two arrays are independent), so you can narrow the
    // list to "Desi + Low" without one resetting the other.
    const lower = value.toLowerCase();
    setSelectedPrices(selectedPrices.includes(lower) ? [] : [lower]);
  };

  const handleReset = () => {
    setSelectedCuisines([]);
    setSelectedPrices([]);
  };

  return (
    // ============== Card ==============
    // We replaced the shadcn <Card> with a plain <div> here because
    // the shadcn CardHeader has `flex flex-col` and CardContent has
    // `p-6 pt-0` baked in — those default classes fight against the
    // `flex-1 min-h-0 overflow-y-auto` layout we need to make the
    // body scrollable when filter badges above shrink the sidebar.
    // A plain div gives us full control:
    //   - h-full + flex flex-col: fill the <aside> height
    //   - header & footer are flex-shrink-0 (pinned)
    //   - body is flex-1 min-h-0 overflow-y-auto (scrollable)
    <div
      className={cn(
        "border border-gray-200 bg-white",
        "rounded-xl sm:rounded-2xl",
        "shadow-sm sm:shadow",
        "h-full flex flex-col overflow-hidden"
      )}
    >
      {/* ============== Header ==============
          Compact vertical padding (py-3 instead of py-4 sm:py-5) so the
          entire filter card fits in the desktop sidebar without
          overflowing. Combined with the tighter row + section padding
          below, the filter card shrinks from ~640px to ~480px tall,
          which fits comfortably in 1280x800+ viewports. */}
      <div className="flex-shrink-0 px-5 sm:px-6 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-orange-500" />
            Filters
          </h2>
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-orange-500 text-white text-xs font-semibold">
              {activeCount}
            </span>
          )}
        </div>
      </div>

      {/* ============== Body ==============
          flex-1 + overflow-y-auto: the body takes whatever vertical
          space is left after the header (and footer, if present),
          and scrolls internally if the filter sections are taller
          than the available height. This prevents the bottom options
          (e.g. "High" under Price range) from being clipped when
          active-filter badges above steal vertical space from the
          sidebar. */}
      <div className="flex-1 min-h-0 overflow-y-auto p-0">
        {/* ----- Cuisine section ----- */}
        <FilterSection
          icon={<Utensils className="w-3.5 h-3.5" />}
          title="Cuisine"
          count={selectedCuisines.length}
        >
          <div className="flex flex-col gap-0.5 sm:gap-1">
            {cuisineOptions.map((cuisine) => {
              const checked = selectedCuisines.includes(cuisine);
              return (
                <FilterRow
                  key={cuisine}
                  label={cuisine}
                  checked={checked}
                  onToggle={() => handleCuisineToggle(cuisine)}
                />
              );
            })}
          </div>
        </FilterSection>

        {/* Thin divider between sections — stronger on desktop (gray-200) */}
        <div className="border-t border-gray-100 sm:border-gray-200" />

        {/* ----- Price range section ----- */}
        <FilterSection
          icon={<DollarSign className="w-3.5 h-3.5" />}
          title="Price range"
          count={selectedPrices.length}
        >
          <div className="flex flex-col gap-0.5 sm:gap-1">
            {priceRanges.map((price) => {
              const lower = price.toLowerCase();
              const checked = selectedPrices.includes(lower);
              return (
                <FilterRow
                  key={price}
                  label={price}
                  checked={checked}
                  onToggle={() => handlePriceToggle(price)}
                />
              );
            })}
          </div>
        </FilterSection>
      </div>

      {/* ============== Footer (only when filters are active) ==============
          flex-shrink-0 so the Reset button always stays pinned at the
          bottom of the card and isn't pushed off-screen by the
          scrolling body. */}
      {hasActive && (
        <div className="flex-shrink-0 px-5 sm:px-6 py-2 border-t border-gray-100 sm:border-gray-200 bg-gray-50/50">
          <button
            type="button"
            onClick={handleReset}
            className={cn(
              "w-full inline-flex items-center justify-center gap-1.5",
              "text-sm font-semibold text-gray-700",
              "hover:text-orange-600 hover:bg-white",
              "py-2 rounded-md transition-colors"
            )}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
};

export default FilterPage;

// ============================================================
// FILTER SECTION (sub-component)
// A "mini-card" for each filter group. Header has icon + title + count
// chip; body has the options. Padding is generous on the sides, tighter
// on top/bottom, to feel compact but breathable.
//
// Responsive tokens:
//   - section padding:  px-5 py-4 → sm:px-6 sm:py-5
//   - section gap:      space-y-3 → sm:space-y-4
// ============================================================
const FilterSection = ({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) => (
  <section className="px-5 sm:px-6 py-3">
    <h3 className="text-[11px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
      {icon}
      <span>{title}</span>
      {count > 0 && (
        <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold">
          {count}
        </span>
      )}
    </h3>
    {children}
  </section>
);

// ============================================================
// FILTER ROW (sub-component)
// One checkbox + label. Highlights when selected (orange-tinted background
// + bolder text). Hover state is subtle so the whole sidebar doesn't
// flicker on mouseover.
//
// Responsive tokens:
//   - row padding:    px-2 py-2 → sm:px-2.5 sm:py-2.5
//   - text size:      text-sm → sm:text-[15px]
//   - hover bg:       orange-50/60 (subtle) — consistent across breakpoints
// ============================================================
const FilterRow = ({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) => (
  <Label
    className={cn(
      "flex items-center gap-2.5 cursor-pointer rounded-md",
      "px-2 sm:px-2.5 py-1.5",
      "transition-all duration-150",
      // Hover: subtle orange wash
      "hover:bg-orange-50/60",
      // Active: stronger orange + tiny left border accent
      checked && "bg-orange-50"
    )}
  >
    <Checkbox checked={checked} onCheckedChange={onToggle} />
    <span
      className={cn(
        "text-sm sm:text-[15px] transition-colors",
        checked ? "font-semibold text-gray-900" : "text-gray-700"
      )}
    >
      {label}
    </span>
  </Label>
);
