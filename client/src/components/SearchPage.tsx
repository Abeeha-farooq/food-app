// src/components/SearchPage.tsx
// ===============================
// Purpose: Restaurant search / browse page (the "Restaurants" page linked
//          in the navbar). Fetches from /api/restaurants and renders a
//          responsive card grid.
//
// Layout (top → bottom):
//   1. Page header — title, subtitle, result count
//   2. Toolbar — search input, sort dropdown, mobile filter toggle
//   3. Active filter badges (click X to remove)
//   4. Two-column body: filters (left) + results grid (right)
//      - On mobile, filters collapse into a slide-in sheet
//
// Responsive spacing scale (used consistently across the page):
//   ┌───────────┬────────────────┬───────────────┬───────────────┐
//   │ Token     │ Mobile (<640)  │ Tablet (≥640) │ Desktop (≥1024)│
//   ├───────────┼────────────────┼───────────────┼───────────────┤
//   │ Outer X   │ px-4 (16px)    │ sm:px-6 (24)  │ lg:px-10 (40) │
//   │ Outer Y   │ py-6 (24px)    │ md:py-10 (40) │ xl:py-12 (48) │
//   │ Section Y │ mb-6 (24px)    │ md:mb-8 (32)  │ lg:mb-10 (40) │
//   │ Col gap   │ gap-5 (20px)   │ md:gap-6 (24) │ xl:gap-8 (32) │
//   │ Grid gap  │ gap-4 (16px)   │ sm:gap-5 (20) │ lg:gap-6 (24) │
//   └───────────┴────────────────┴───────────────┴───────────────┘
//
// Border-radius scale:
//   - Inputs/buttons → rounded-lg on mobile, rounded-xl on desktop
//   - Cards          → rounded-2xl on mobile, rounded-3xl on desktop
//   - Chips/badges   → rounded-full (consistent)
//
// Shadow scale:
//   - Rest  → shadow-sm on mobile, shadow-md on desktop
//   - Hover → shadow-lg → shadow-2xl as size increases
// ===============================

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AspectRatio } from "@radix-ui/react-aspect-ratio";
import FilterPage from "./FilterPage";
import { Card, CardContent } from "./ui/card";
import { Link } from "react-router-dom";
import {
  MapPin,
  Search as SearchIcon,
  ArrowUpDown,
  SlidersHorizontal,
  X,
  UtensilsCrossed,
  Clock,
  ChevronRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import axios from "axios";
import api, { getErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// What a restaurant document looks like (matches the backend shape)
interface Restaurant {
  _id: string;
  name: string;
  city: string;
  country: string;
  cuisines: string[];
  imageUrl: string;
  priceRange: string;
  estimatedDeliveryTime: number;
}

// Sort options for the toolbar dropdown. Mapped to sort keys that the
// backend GET /api/restaurants endpoint already understands.
type SortKey = "rating" | "deliveryTime" | "name";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "rating", label: "Top rated" },
  { value: "deliveryTime", label: "Fastest delivery" },
  { value: "name", label: "Name (A–Z)" },
];

// ============================================================
// URL <-> state sync helpers
// ============================================================
// The filter state (search, cuisines, price) is mirrored to the URL so:
//   1. Refreshing the page keeps your filters
//   2. The user can share / bookmark a filtered view
//   3. Browser back/forward moves through filter history
//
// We keep React state as the single source of truth for rendering and
// fetching, and treat the URL as a one-way mirror (state -> URL). On
// mount we read the URL once to seed the initial state, then never read
// from it again — that prevents URL changes from triggering refetches
// (which would be a separate listener and is unnecessary complexity).
// ============================================================
const KNOWN_CUISINES = new Set(["Desi", "Pizza", "Burger", "Starter", "Dessert", "Drinks"]);
const KNOWN_PRICES = new Set(["low", "medium", "high"]);

const SearchPage = () => {
  // /search/:text  →  we use :text as the initial search query
  const { text } = useParams<{ text?: string }>();
  // useSearchParams gives us the URL search params as a hook. We use the
  // *setter* to mirror our state into the URL; the *getter* is read once
  // at mount to seed the initial state.
  const [searchParams, setSearchParams] = useSearchParams();

  // ----- Initial state seeded from URL (one-time, on mount) -----
  // We do this with a lazy initializer (the function passed to useState
  // runs once) so the URL is read exactly once, not on every render.
  const initial = useMemo(() => {
    const urlSearch = searchParams.get("search") ?? text ?? "";
    // getAll("cuisine") returns every "cuisine" param, including the
    // repeated-key form (?cuisine=A&cuisine=B). Filter to known values
    // so a stale/bogus param can't pollute the state.
    const urlCuisines = searchParams
      .getAll("cuisine")
      .filter((c) => KNOWN_CUISINES.has(c));
    const urlPriceRaw = searchParams.get("price");
    const urlPrice = urlPriceRaw && KNOWN_PRICES.has(urlPriceRaw) ? [urlPriceRaw] : [];
    return { urlSearch, urlCuisines, urlPrice };
    // searchParams is intentionally omitted from deps — we only want
    // this to run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(initial.urlSearch);
  // We keep a separate "draft" search input so the user can type freely
  // and we only refetch when they press Enter / the search button.
  const [searchDraft, setSearchDraft] = useState(initial.urlSearch);

  // Selected filters from FilterPage (lifted to this component).
  // Seeded from the URL on first render so refresh / shared links work.
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>(initial.urlCuisines);
  const [selectedPrices, setSelectedPrices] = useState<string[]>(initial.urlPrice);

  // Toolbar state
  const [sortBy, setSortBy] = useState<SortKey>("rating");
  // Mobile filter sheet open/closed
  const [filtersOpen, setFiltersOpen] = useState(false);

  // We use a counter that increments on every retry — this re-triggers the useEffect
  const [retryCount, setRetryCount] = useState(0);

  // ----- Mirror state -> URL (one-way, on every filter change) -----
  // We use replace: true so we don't pollute browser history with every
  // checkbox toggle — the user can still use the back button to leave
  // the page entirely, but not to step back through every filter click.
  useEffect(() => {
    const next = new URLSearchParams();
    if (searchTerm) next.set("search", searchTerm);
    selectedCuisines.forEach((c) => next.append("cuisine", c));
    if (selectedPrices.length === 1) next.set("price", selectedPrices[0]);
    // Only update if changed — avoids an unnecessary history entry.
    setSearchParams(next, { replace: true });
    // We intentionally depend on the filter values, not setSearchParams
    // (which is stable across renders).
  }, [searchTerm, selectedCuisines, selectedPrices, setSearchParams]);

  // ----- Fetch whenever any filter or retry counter changes -----
  // AbortController:
  //   If the user toggles a filter before the previous request finishes,
  //   the previous request gets ABORTED. Without this, a slow first
  //   response could overwrite a newer one (race condition) and the UI
  //   would show stale restaurants that don't match the current filters.
  useEffect(() => {
    // Cancel any in-flight request from a previous render. The aborted
    // request's catch block will see an AxiosError with code
    // "ERR_CANCELED" — we silently ignore those.
    const controller = new AbortController();

    const fetchRestaurants = async () => {
      // ----- Keep UI in sync: clear stale data on every filter change -----
      // If we DON'T clear here, the user sees the previous results until
      // the new request resolves — a "flash of stale data" that's
      // especially confusing if the new result set is empty.
      setRestaurants([]);
      setLoading(true);
      setError(null);

      try {
        const params: Record<string, string | string[]> = {};
        if (searchTerm) params.search = searchTerm;
        // Send cuisines as an ARRAY, not comma-joined. Our axios
        // paramsSerializer (see src/lib/api.ts) turns the array into
        // repeated query keys (?cuisine=Pizza&cuisine=Burger), which the
        // backend's $in filter handles. Comma-joining would produce a
        // single string "Pizza,Burger" that matches nothing.
        if (selectedCuisines.length > 0) params.cuisine = selectedCuisines;
        if (selectedPrices.length === 1) params.price = selectedPrices[0];

        const res = await api.get("/restaurants", {
          params,
          signal: controller.signal,
        });
        setRestaurants(res.data.data.items);
      } catch (err) {
        // Ignore the abort — it's the expected outcome when filters
        // change faster than the server can respond. Don't show a toast,
        // don't set an error, don't log.
        if (axios.isCancel(err)) return;

        const message = getErrorMessage(err);
        setError(message);
        toast.error(message);
      } finally {
        // Only flip the loading flag if THIS request was the one that
        // finished (i.e. it wasn't aborted). Aborted requests leave
        // loading=true so the next non-aborted request can flip it.
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    fetchRestaurants();

    // Cleanup: abort the in-flight request if the effect re-runs before
    // this one finished. React calls the cleanup BEFORE the next effect,
    // so the previous fetch gets cancelled exactly when a new filter is
    // applied — the canonical "no stale results" guarantee.
    return () => {
      controller.abort();
    };
  }, [searchTerm, selectedCuisines, selectedPrices, retryCount]);

  // Client-side sort. We do this after the API call so we don't need to
  // change the backend. The backend already returns a default ordering
  // (rating desc), and we just re-order the array in memory.
  const sortedRestaurants = useMemo(() => {
    const copy = [...restaurants];
    switch (sortBy) {
      case "name":
        return copy.sort((a, b) => a.name.localeCompare(b.name));
      case "deliveryTime":
        return copy.sort((a, b) => a.estimatedDeliveryTime - b.estimatedDeliveryTime);
      case "rating":
      default:
        return copy; // backend default
    }
  }, [restaurants, sortBy]);

  const handleRetry = () => setRetryCount((c) => c + 1);

  // Submit handler for the in-page search bar. The NavBar already has a
  // hero search that navigates to /search/:text, but having an input here
  // means the user can refine without going back to the home page.
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(searchDraft.trim());
  };

  // Count of active filters — shown on the mobile "Filters" button so the
  // user knows how many are applied.
  const activeFilterCount = selectedCuisines.length + selectedPrices.length;

  return (
    <div className="w-full">
      <div
        className={cn(
          // Outer container — uses the responsive spacing scale.
          //   - X padding: 16 → 24 → 40 (mobile → sm → lg)
          //   - Y padding: 24 → 40 → 48 (mobile → md → xl)
          //   - The lg:py-12 (48px) gives the page a "hero" feel on big screens
          //     without needing a real hero band.
          "max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10",
          "py-6 md:py-10 xl:py-12"
        )}
      >
        {/* ============== Page header ============== */}
        <PageHeader
          icon={<UtensilsCrossed className="text-orange-500" />}
          title="Restaurants"
          subtitle={
            loading
              ? "Loading restaurants…"
              : `${sortedRestaurants.length} ${
                  sortedRestaurants.length === 1 ? "restaurant" : "restaurants"
                } found`
          }
          // Section Y gap — scales from 24 (mobile) to 40 (desktop).
          // Bigger gap on desktop makes the page feel less cramped and
          // matches the increased outer padding.
          className="mb-6 md:mb-8 lg:mb-10"
        />

        {/* ============== Toolbar (search + sort + mobile filter) ============== */}
        <div
          className={cn(
            // Toolbar row:
            //   - gap-3 on mobile (12px), gap-4 on tablet+ (16px) — slightly
            //     more breathing room as the controls get bigger.
            //   - mb-5 (20px) on mobile, md:mb-7 (28px) on desktop — more
            //     vertical space below the toolbar on bigger screens.
            "flex flex-col sm:flex-row gap-3 sm:gap-4",
            "mb-5 md:mb-7"
          )}
        >
          {/* In-page search */}
          <form
            onSubmit={handleSearchSubmit}
            className="relative flex-1 min-w-0"
            role="search"
          >
            <SearchIcon className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <Input
              type="text"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search by restaurant name…"
              // h-10 (40px) is the thumb-friendly size on mobile.
              // sm:h-11 (44px) feels more solid on tablet+.
              className="pl-9 sm:pl-10 pr-9 sm:pr-10 h-10 sm:h-11 bg-white text-sm sm:text-base rounded-lg sm:rounded-xl border-gray-200 focus-visible:ring-orange-400"
              aria-label="Search restaurants"
            />
            {searchDraft && (
              <button
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  setSearchTerm("");
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>

          {/* Sort dropdown — kept on the right on all sizes */}
          <div className="relative">
            <ArrowUpDown className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Sort restaurants"
              className={cn(
                // h-10 (mobile) → h-11 (tablet+)
                // pr-10 on desktop so the long labels "Fastest delivery" don't
                // collide with the native dropdown arrow.
                "w-full h-10 sm:h-11 pl-9 sm:pl-10 pr-8 sm:pr-10",
                "bg-white border border-gray-200 rounded-lg sm:rounded-xl",
                "text-sm sm:text-base text-gray-700",
                "focus:outline-none focus:ring-2 focus:ring-orange-400",
                "cursor-pointer transition-shadow hover:border-gray-300"
              )}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Mobile filter button — hidden on xl+ where the filter column is visible */}
          <Button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className={cn(
              // Match the search bar height for a tidy toolbar.
              "xl:hidden bg-white text-gray-700 border border-gray-200",
              "hover:bg-gray-50 hover:border-gray-300",
              "h-10 sm:h-11 rounded-lg sm:rounded-xl",
              "relative text-sm sm:text-base font-semibold",
              "transition-colors"
            )}
            aria-label="Open filters"
          >
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-orange-500 text-white text-xs font-semibold">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* ============== Active filter badges ============== */}
        {(selectedCuisines.length > 0 || selectedPrices.length > 0 || searchTerm) && (
          <div className="flex flex-wrap gap-2 mb-6 md:mb-8">
            {searchTerm && (
              <Badge
                onClick={() => {
                  setSearchTerm("");
                  setSearchDraft("");
                }}
                className={cn(
                  "cursor-pointer bg-orange-50 text-orange-700",
                  "border border-orange-200 hover:bg-orange-100 hover:border-orange-300",
                  "rounded-full pl-3 pr-1 py-1",
                  "flex items-center gap-1 text-xs sm:text-sm",
                  "transition-colors shadow-sm"
                )}
                variant="outline"
              >
                "{searchTerm}"
                <X className="w-3 h-3" />
              </Badge>
            )}
            {selectedCuisines.map((c) => (
              <Badge
                key={c}
                onClick={() =>
                  setSelectedCuisines((prev) => prev.filter((x) => x !== c))
                }
                className={cn(
                  "cursor-pointer bg-orange-50 text-orange-700",
                  "border border-orange-200 hover:bg-orange-100 hover:border-orange-300",
                  "rounded-full pl-3 pr-1 py-1",
                  "flex items-center gap-1 text-xs sm:text-sm",
                  "transition-colors shadow-sm"
                )}
                variant="outline"
              >
                {c}
                <X className="w-3 h-3" />
              </Badge>
            ))}
            {selectedPrices.map((p) => (
              <Badge
                key={p}
                onClick={() => setSelectedPrices([])}
                className={cn(
                  "cursor-pointer bg-orange-50 text-orange-700",
                  "border border-orange-200 hover:bg-orange-100 hover:border-orange-300",
                  "rounded-full pl-3 pr-1 py-1",
                  "flex items-center gap-1 text-xs sm:text-sm",
                  "transition-colors shadow-sm"
                )}
                variant="outline"
              >
                {p} price
                <X className="w-3 h-3" />
              </Badge>
            ))}
            <button
              onClick={() => {
                setSearchTerm("");
                setSearchDraft("");
                setSelectedCuisines([]);
                setSelectedPrices([]);
              }}
              className="text-xs sm:text-sm text-gray-500 hover:text-orange-600 hover:bg-orange-50/50 underline px-2 py-1 self-center rounded-md transition-colors"
            >
              Clear all
            </button>
          </div>
        )}

        {/* ============== Two-column body ============== */}
        <div
          className={cn(
            // Two-column body gap:
            //   - mobile: 24px (just stack vertically)
            //   - xl+: 32px between filter sidebar and results
            "flex flex-col xl:flex-row gap-6 xl:gap-8"
          )}
        >
          {/* Filters — sticky on desktop, drawer on mobile.
              The FilterPage is now a self-contained Card with its own
              header, sections, and footer — so we just drop it in. */}
          <aside className="hidden xl:block w-72 2xl:w-80 flex-shrink-0">
            <div className="sticky top-20">
              <FilterPage
                selectedCuisines={selectedCuisines}
                setSelectedCuisines={setSelectedCuisines}
                selectedPrices={selectedPrices}
                setSelectedPrices={setSelectedPrices}
              />
            </div>
          </aside>

          {/* Mobile filter drawer — uses the FilterPage component inside
              a simple fullscreen overlay. We avoid the heavier Sheet
              component to keep things dependency-free. */}
          {filtersOpen && (
            <div
              className="xl:hidden fixed inset-0 z-[60] flex"
              role="dialog"
              aria-modal="true"
            >
              <div
                className="absolute inset-0 bg-black/50 animate-in fade-in"
                onClick={() => setFiltersOpen(false)}
              />
              <div className="relative ml-auto w-full max-w-sm sm:max-w-md bg-white h-full flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-orange-500" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-orange-500 text-white text-xs font-semibold">
                        {activeFilterCount}
                      </span>
                    )}
                  </h2>
                  <button
                    onClick={() => setFiltersOpen(false)}
                    aria-label="Close filters"
                    className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <FilterPage
                    selectedCuisines={selectedCuisines}
                    setSelectedCuisines={setSelectedCuisines}
                    selectedPrices={selectedPrices}
                    setSelectedPrices={setSelectedPrices}
                  />
                </div>
                <div className="border-t border-gray-100 p-4 bg-gray-50/50">
                  <Button
                    onClick={() => setFiltersOpen(false)}
                    className="w-full bg-orange hover:bg-hoverOrange h-11 rounded-xl font-semibold shadow-sm hover:shadow-md transition-all"
                  >
                    Show {sortedRestaurants.length} restaurant
                    {sortedRestaurants.length !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          <div className="flex-1 min-w-0">
            {/* Loading skeleton grid — matches the real card shape so the
                page doesn't jump when data arrives. Grid uses the same
                responsive spacing scale as the real results grid. */}
            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="overflow-hidden rounded-2xl lg:rounded-3xl">
                    <Skeleton className="h-40 sm:h-44 lg:h-48 w-full rounded-none" />
                    <CardContent className="p-4 sm:p-5 lg:p-6 space-y-3">
                      <Skeleton className="h-5 w-2/3" />
                      <Skeleton className="h-4 w-1/2" />
                      <div className="flex gap-2">
                        <Skeleton className="h-6 w-16 rounded-full" />
                        <Skeleton className="h-6 w-16 rounded-full" />
                      </div>
                      <Skeleton className="h-10 w-full mt-4 rounded-xl" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Empty / error state — uses the shared EmptyState component */}
            {!loading && sortedRestaurants.length === 0 && (
              <EmptyState
                variant={error ? "warning" : "muted"}
                icon={error ? <X className="w-10 h-10" /> : <SearchIcon className="w-10 h-10" />}
                title={error ? "Failed to load restaurants" : "No restaurants found"}
                description={
                  error
                    ? error
                    : "Try a different search term or remove some filters to see more results."
                }
                ctaLabel="Try again"
                onCtaClick={handleRetry}
              />
            )}

            {/* Results grid */}
            {!loading && sortedRestaurants.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
                {sortedRestaurants.map((r) => (
                  <RestaurantCard key={r._id} restaurant={r} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// RESTAURANT CARD
// Pulled out as a small sub-component so SearchPage stays focused on
// layout and the card stays focused on a single restaurant's data.
//
// Design goals (responsive + visual hierarchy):
//   - Equal height in a row: h-full + flex-col + mt-auto on the button
//   - Responsive radius: rounded-2xl (mobile) → rounded-3xl (desktop)
//   - Responsive padding: p-4 → sm:p-5 → lg:p-6
//   - Responsive shadow: shadow-sm (rest) → shadow-lg → shadow-2xl (hover)
//     at every breakpoint
//   - Hover: lift (-translate-y-1), border → orange-200, shadow → 2xl,
//     slow image zoom (scale-110, 700ms)
//   - Typography scales: title text-base → lg:text-xl, body text-sm
//   - Button: rounded-xl, shadow-sm → shadow-md on hover, animated arrow
// ============================================================
const RestaurantCard = ({ restaurant: r }: { restaurant: Restaurant }) => {
  const priceLabel = r.priceRange === "low" ? "$" : r.priceRange === "medium" ? "$$" : "$$$";

  return (
    <Card
      // h-full + flex-col is the magic combo: it makes every card stretch
      // to the height of the tallest card in the row, and the mt-auto on
      // the button wrapper below pins the action to the bottom of the card.
      //
      // Responsive tokens:
      //   - radius:     rounded-2xl → lg:rounded-3xl
      //   - shadow:     shadow-sm → lg:shadow-md (rest)
      //                 hover:shadow-lg → lg:hover:shadow-2xl
      //   - border:     border-gray-200 → hover:border-orange-200
      //   - lift:       -translate-y-1 on hover (slight, premium feel)
      className={cn(
        "group h-full flex flex-col bg-white",
        "border border-gray-200 hover:border-orange-200",
        "rounded-2xl lg:rounded-3xl overflow-hidden",
        "shadow-sm lg:shadow-md hover:shadow-lg lg:hover:shadow-2xl",
        "transition-all duration-300 ease-out",
        "hover:-translate-y-1"
      )}
    >
      {/* ============== Image (fixed 16:10, never crops to wrong shape) ============== */}
      <div className="relative overflow-hidden bg-gray-100">
        <AspectRatio ratio={16 / 10}>
          <img
            src={r.imageUrl || "https://placehold.co/600x400/orange/white?text=FoodApp"}
            alt={r.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          />
        </AspectRatio>
        {/* Soft top-to-bottom dark gradient for chip legibility */}
        <div className="absolute inset-x-0 top-0 h-20 sm:h-24 bg-gradient-to-b from-black/30 to-transparent pointer-events-none" />

        {/* Price chip — top-left, glassmorphism.
            Bigger on desktop (text-sm → sm:text-base, padding scales). */}
        <div className="absolute top-3 sm:top-4 left-3 sm:left-4 bg-white/95 backdrop-blur-sm rounded-full px-3 py-1 text-xs sm:text-sm font-bold text-gray-800 shadow-md">
          {priceLabel}
        </div>

        {/* Delivery time chip — top-right */}
        <div className="absolute top-3 sm:top-4 right-3 sm:right-4 bg-black/75 backdrop-blur-sm rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-white shadow-md flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {r.estimatedDeliveryTime} min
        </div>
      </div>

      {/* ============== Body ==============
          Padding scales: p-4 (mobile) → sm:p-5 → lg:p-6
          This gives smaller screens tighter content and bigger screens
          more breathing room. */}
      <CardContent className="flex-1 flex flex-col p-4 sm:p-5 lg:p-6">
        {/* Title — single line, ellipsis if too long. Scales with size:
            text-base (mobile) → sm:text-lg → lg:text-xl.
            leading-tight keeps wrapped (or tall) titles close to body. */}
        <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 truncate leading-tight">
          {r.name}
        </h3>

        {/* Location — single line, ellipsis if too long */}
        <div className="mt-1 sm:mt-1.5 flex items-center gap-1.5 text-xs sm:text-sm text-gray-600 min-w-0">
          <MapPin size={14} className="flex-shrink-0 text-orange-500" />
          <span className="truncate">
            {r.city}, {r.country}
          </span>
        </div>

        {/* Cuisine pills — reserve vertical space (min-h-[28px] sm:min-h-[32px])
            so cards with and without cuisines line up perfectly. */}
        {r.cuisines.length > 0 ? (
          <div className="flex gap-1.5 mt-3 flex-wrap min-h-[28px] sm:min-h-[32px] items-center">
            {r.cuisines.slice(0, 3).map((c) => (
              <span
                key={c}
                className="text-[11px] sm:text-xs font-medium px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100 whitespace-nowrap"
              >
                {c}
              </span>
            ))}
            {r.cuisines.length > 3 && (
              <span className="text-[11px] sm:text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
                +{r.cuisines.length - 3}
              </span>
            )}
          </div>
        ) : (
          <div className="mt-3 min-h-[28px] sm:min-h-[32px]" />
        )}

        {/* mt-auto pushes the button to the bottom of the flex column.
            pt-5/pt-6 scales with screen size. */}
        <div className="mt-auto pt-4 sm:pt-5 lg:pt-6">
          <Link to={`/restaurant/${r._id}`} className="block">
            <Button
              // Responsive button:
              //   - h-10 (mobile) → sm:h-11 → lg:h-12 (taller, more solid on desktop)
              //   - rounded-xl → sm:rounded-xl (consistent)
              //   - shadow-sm → sm:hover:shadow-lg (deeper shadow on bigger screens)
              //   - text-sm → sm:text-base
              className={cn(
                "w-full bg-orange hover:bg-hoverOrange text-white",
                "h-10 sm:h-11 lg:h-12",
                "rounded-xl",
                "text-sm sm:text-base font-semibold",
                "shadow-sm hover:shadow-md sm:hover:shadow-lg",
                "transition-all duration-200 group/btn"
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                View Menu
                <ChevronRight className="w-4 h-4 transition-transform duration-200 group-hover/btn:translate-x-1" />
              </span>
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

export default SearchPage;
