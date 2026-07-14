// src/pages/RestaurantDetailPage.tsx
// ===============================
// Purpose: Show ONE restaurant's full menu. This is the missing page that
//          the "View Menu" button on SearchPage has been pointing at.
//
// Architecture:
//   - Public route (no auth required) — anyone can browse menus, even
//     before they log in. The cart works the same way (localStorage).
//   - Single API call: GET /api/restaurants/:id returns { restaurant, menu }
//     in one round-trip. The backend already filters to `available: true`.
//   - Menu items are grouped by `category` and sorted within each category
//     by name. This matches how most real food apps (Uber Eats, DoorDash,
//     etc.) display menus — by section, not one long list.
//   - "Add to cart" reuses the existing useCart().addItem() — no new
//     cart logic. The cart's id is `${menuItemId}__${restaurantId}` so
//     re-adding the same item just bumps the quantity.
//
// Why this is a "no duplicate APIs" win:
//   The data we need is already in the existing endpoint. The user's
//   previous "Add to cart demo page" was a stopgap that used hardcoded
//   fake IDs (e.g. "pizza-palace" instead of a real ObjectId). With this
//   page, the demo page can be retired (or kept for testing).
// ===============================

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StarRating } from "@/components/ui/StarRating";
import { useCart } from "@/context/useCart";
import { useAuth } from "@/context/useAuth";
import api, { getErrorMessage } from "@/lib/api";
import {
  type Restaurant,
  type MenuItem,
  type Review,
  type RestaurantWithReviews,
  formatRating,
  ratingColor,
} from "@/lib/review";
import {
  ArrowLeft,
  Clock,
  MapPin,
  Plus,
  Search,
  ShoppingBag,
  Utensils,
  X,
  ChefHat,
  Check,
  Store,
  Wallet,
  Star,
  MessageSquareQuote,
  SearchX,
} from "lucide-react";

// Price-range display: "low" → "Rs. Rs." (cheap), "high" → "Rs. Rs. Rs." (expensive)
const PRICE_DOTS: Record<Restaurant["priceRange"], string> = {
  low: "Rs.",
  medium: "Rs. Rs.",
  high: "Rs. Rs. Rs.",
};

// ============================================================
// MAIN COMPONENT
// ============================================================
const RestaurantDetailPage = () => {
  // `:id` comes from the URL pattern `/restaurant/:id`
  const { id } = useParams<{ id: string }>();
  const { addItem, items: cartItems } = useCart();
  const { isAuthenticated } = useAuth();

  // ----- State -----
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which item IDs the user has just added (for the green "Added!" checkmark)
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  // Search query for filtering the menu items (client-side, instant).
  // Reset to "" when the user navigates to a different restaurant (handled
  // by the useEffect on `id` that also re-fetches).
  const [menuSearch, setMenuSearch] = useState("");

  // ----- Fetch restaurant + menu + reviews in one call -----
  // We extract the function so the ErrorState "Try again" button can re-run it.
  const fetchRestaurant = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/restaurants/${id}`);
      // Backend returns ApiResponse<200, RestaurantWithReviews, "Restaurant fetched">
      // The shape is { restaurant, menu, reviews, averageRating, totalReviews }.
      const { restaurant, menu, reviews, averageRating, totalReviews } =
        res.data.data as RestaurantWithReviews;
      setRestaurant(restaurant);
      setMenu(menu);
      setReviews(reviews);
      setAverageRating(averageRating);
      setTotalReviews(totalReviews);
    } catch (err) {
      // 404 → "Restaurant not found" (or similar). Surface to the user.
      const message = getErrorMessage(err) || "Failed to load this restaurant";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRestaurant();
    // Reset the menu search when navigating to a different restaurant —
    // otherwise the new restaurant's menu would be filtered by a query
    // typed for the previous one.
    setMenuSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ----- Filter the menu by the search query (client-side, instant) -----
  // We do this in JS rather than hitting the backend because:
  //   1. The full menu is already loaded (one API call)
  //   2. Per-restaurant menus are small (5-30 items typically)
  //   3. Filtering locally = instant feedback as the user types
  // Matches against name + description + category, case-insensitive.
  // We don't search tags (internal metadata) or price (numbers need parsing).
  const filteredMenu = useMemo(() => {
    const query = menuSearch.trim().toLowerCase();
    if (!query) return menu;
    return menu.filter((item) => {
      return (
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      );
    });
  }, [menu, menuSearch]);

  // ----- Group filtered menu items by category, sorted within each group by name -----
  // useMemo so we don't re-compute on every render
  const groupedMenu = useMemo(() => {
    const groups = new Map<string, MenuItem[]>();
    for (const item of filteredMenu) {
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    // Sort each category's items by name
    for (const [, list] of groups) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    // Return categories sorted alphabetically
    return Array.from(groups.entries())
      .map(([category, items]) => ({ category, items }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [filteredMenu]);

  // ----- Add item to cart -----
  // We map the backend's menu item shape to the CartItem shape expected by useCart().
  const handleAddToCart = (item: MenuItem) => {
    if (!restaurant) return;
    addItem(
      {
        menuItemId: item._id,
        restaurantId: restaurant._id,
        restaurantName: restaurant.name,
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl,
      },
      1  // quantity — cart will increment if already present
    );
    // Show a brief "Added!" checkmark on the button (1.5s)
    setJustAdded((prev) => new Set(prev).add(item._id));
    setTimeout(() => {
      setJustAdded((prev) => {
        const next = new Set(prev);
        next.delete(item._id);
        return next;
      });
    }, 1500);
  };

  // Total items in cart (for the floating "View cart" pill, if added later)
  const cartItemCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);

  // ============================================================
  // RENDER: loading skeleton
  // ============================================================
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <Skeleton className="h-4 w-24" />  {/* back link placeholder */}
        <Skeleton className="h-48 md:h-64 w-full rounded-lg" />  {/* hero image */}
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="border rounded-md p-3 space-y-2">
                <Skeleton className="h-32 w-full rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER: error (404, network, etc.) with retry
  // ============================================================
  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        <Link
          to="/filterPage"
          className="inline-flex items-center text-sm text-orange-600 hover:text-orange-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to restaurants
        </Link>
        <ErrorState
          title="Couldn't load this restaurant"
          message={error}
          onRetry={fetchRestaurant}
        />
      </div>
    );
  }

  // Should never happen (loading and error handled above) but TypeScript likes it
  if (!restaurant) return null;

  // ============================================================
  // RENDER: restaurant detail page
  // ============================================================
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* ----- Back link ----- */}
      <Link
        to="/filterPage"
        className="inline-flex items-center text-sm text-gray-600 hover:text-orange-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        All restaurants
      </Link>

      {/* ----- Restaurant hero (image + info side-by-side on desktop) ----- */}
      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* Image */}
          <div className="relative h-64 md:h-80 bg-gray-100">
            {restaurant.imageUrl ? (
              <img
                src={restaurant.imageUrl}
                alt={restaurant.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <Store className="w-16 h-16" />
              </div>
            )}
          </div>

          {/* Info */}
          <CardContent className="p-6 flex flex-col justify-center space-y-3">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              {restaurant.name}
            </h1>

            {/* Cuisines (as small chips) */}
            {restaurant.cuisines.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {restaurant.cuisines.map((c) => (
                  <span
                    key={c}
                    className="inline-block px-2.5 py-0.5 text-xs font-medium bg-orange-50 text-orange-700 rounded-full"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            {/* Meta info row */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {restaurant.city}, {restaurant.country}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {restaurant.estimatedDeliveryTime} min delivery
              </span>
              <span className="flex items-center gap-1">
                <Wallet className="w-4 h-4" />
                <span className="tracking-wider">
                  {PRICE_DOTS[restaurant.priceRange]}
                </span>
              </span>
            </div>

            {restaurant.address && (
              <p className="text-xs text-gray-500">{restaurant.address}</p>
            )}

            {/* ----- Aggregate rating row (only if there are reviews) -----
                Shown prominently in the hero so users can see at a glance
                whether this restaurant is highly rated. The "no reviews"
                case is handled gracefully below the menu. */}
            {totalReviews > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                <span className={`text-2xl font-bold ${ratingColor(averageRating)}`}>
                  {formatRating(averageRating)}
                </span>
                <div className="flex flex-col">
                  <StarRating value={averageRating} size="sm" />
                  <span className="text-xs text-gray-500">
                    {totalReviews} review{totalReviews === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </div>
      </Card>

      {/* ----- Menu section ----- */}
      {menu.length === 0 ? (
        // Restaurant has no menu items at all
        <EmptyState
          icon={<Utensils />}
          title="No menu items yet"
          description={`${restaurant.name} hasn't added any menu items yet. Check back later!`}
        />
      ) : (
        <div className="space-y-5">
          {/* ----- Search bar -----
              Filters the menu client-side as the user types.
              Hides itself if the search is active and produced 0 results
              (we show a different empty state below). */}
          <div className="space-y-2">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none"
              />
              <Input
                type="text"
                placeholder={`Search ${restaurant.name}'s menu...`}
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                className="pl-9 pr-10"
                aria-label="Search menu items"
              />
              {/* Clear button (X) — only when there's something to clear */}
              {menuSearch && (
                <button
                  type="button"
                  onClick={() => setMenuSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* "X of Y items" feedback — only show when filtering is active */}
            {menuSearch && (
              <p className="text-xs text-gray-500 pl-1">
                {groupedMenu.reduce((s, g) => s + g.items.length, 0)} of {menu.length}{" "}
                item{menu.length === 1 ? "" : "s"} match
                {groupedMenu.reduce((s, g) => s + g.items.length, 0) === 1 ? "es" : ""}
              </p>
            )}
          </div>

          {/* ----- No results (when search filters everything out) ----- */}
          {groupedMenu.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title="No items match your search"
              description={`We couldn't find any menu items matching "${menuSearch}". Try a different keyword or clear the search.`}
              variant="muted"
              ctaLabel="Clear search"
              onCtaClick={() => setMenuSearch("")}
            />
          ) : (
            /* ----- Category sections (with items) ----- */
            <div className="space-y-8">
              {groupedMenu.map(({ category, items }) => (
                <section key={category}>
                  {/* Category header (styled like a section divider) */}
                  <div className="flex items-center gap-2 mb-3">
                <ChefHat className="w-5 h-5 text-orange-600" />
                <h2 className="text-xl font-bold text-gray-900">{category}</h2>
                <span className="text-sm text-gray-500">
                  ({items.length} item{items.length === 1 ? "" : "s"})
                </span>
              </div>

              {/* Items grid — 1 col on mobile, 2 on tablet, 3 on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                  <MenuItemCard
                    key={item._id}
                    item={item}
                    justAdded={justAdded.has(item._id)}
                    onAdd={() => handleAddToCart(item)}
                    isAuthenticated={isAuthenticated}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
        </div>
      )}

      {/* ----- Reviews section -----
          Shown below the menu. Displays the most recent 10 reviews. If the
          restaurant has no reviews yet, show a friendly empty state. */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquareQuote className="w-5 h-5 text-orange-600" />
          <h2 className="text-xl font-bold text-gray-900">Customer Reviews</h2>
        </div>

        {reviews.length === 0 ? (
          <EmptyState
            icon={<MessageSquareQuote />}
            title="No reviews yet"
            description={`Be the first to share your experience at ${restaurant.name}!`}
            variant="muted"
          />
        ) : (
          <div className="space-y-3">
            {reviews.slice(0, 10).map((review) => (
              <Card
                key={review._id}
                className="hover:shadow-sm transition-shadow"
              >
                <CardContent className="p-4 space-y-2">
                  {/* Header row: name + stars + date */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      {/* Avatar circle with initials */}
                      <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-orange-700">
                          {review.user.fullname
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">
                          {review.user.fullname}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(review.reviewedAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <StarRating value={review.rating} size="sm" />
                  </div>
                  {/* Comment (only if present) */}
                  {review.comment && (
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {review.comment}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
            {reviews.length > 10 && (
              <p className="text-center text-sm text-gray-500 pt-2">
                Showing 10 of {reviews.length} reviews
              </p>
            )}
          </div>
        )}
      </section>

      {/* ----- Auth nudge (only for guests) -----
          If the user isn't logged in, show a friendly banner explaining
          that they can browse but need to log in to actually order. */}
      {!isAuthenticated && groupedMenu.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <ShoppingBag className="w-5 h-5 text-orange-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-orange-900">Ready to order?</p>
              <p className="text-sm text-orange-800">
                You can add items to your cart now. You'll need to log in
                before placing the order.
              </p>
            </div>
            <Link to="/login">
              <Button
                size="sm"
                className="bg-orange hover:bg-hoverOrange whitespace-nowrap"
              >
                Log in
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* ----- Floating cart pill (only if items in cart) -----
          A small bottom-right indicator that shows total items and links
          to /cart. Hidden if cart is empty. */}
      {cartItemCount > 0 && (
        <Link
          to="/cart"
          className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 inline-flex items-center gap-2 bg-orange hover:bg-hoverOrange text-white font-semibold py-3 px-5 rounded-full shadow-lg transition-colors"
        >
          <ShoppingBag className="w-5 h-5" />
          View cart
          <span className="bg-white text-orange-600 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
            {cartItemCount}
          </span>
        </Link>
      )}
    </div>
  );
};

// ============================================================
// SUB-COMPONENT: One menu item card
// Renders the item's image, name, description, price, and an
// "Add to cart" button (with a brief "Added!" success state).
// ============================================================
interface MenuItemCardProps {
  item: MenuItem;
  justAdded: boolean;
  onAdd: () => void;
  isAuthenticated: boolean;
}

const MenuItemCard = ({ item, justAdded, onAdd, isAuthenticated }: MenuItemCardProps) => {
  return (
    <Card className="overflow-hidden flex flex-col hover:shadow-md hover:border-orange-200 transition-all duration-200">
      {/* Item image (16:9 ratio). Falls back to a food icon if no image. */}
      <div className="relative aspect-video bg-gray-100">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <Utensils className="w-12 h-12" />
          </div>
        )}
        {/* Tags (e.g. "vegetarian", "bestseller") as a chip in the corner */}
        {item.tags && item.tags.length > 0 && (
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {item.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[10px] font-medium bg-white/90 text-gray-700 rounded-md shadow-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Item details */}
      <CardContent className="p-4 flex flex-col flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900 line-clamp-1">
            {item.name}
          </h3>
          <p className="text-lg font-bold text-orange-600 whitespace-nowrap">
            Rs. {item.price.toFixed(2)}
          </p>
        </div>
        {item.description && (
          <p className="text-sm text-gray-600 line-clamp-2 flex-1">
            {item.description}
          </p>
        )}

        {/* Add to cart button.
            Shows "Added!" with a checkmark for 1.5s after a successful add. */}
        <Button
          onClick={onAdd}
          disabled={justAdded}
          className={`w-full mt-2 ${
            justAdded
              ? "bg-green-600 hover:bg-green-600"
              : "bg-orange hover:bg-hoverOrange"
          } transition-colors`}
        >
          {justAdded ? (
            <>
              <Check className="w-4 h-4 mr-1" />
              Added!
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-1" />
              Add to cart
            </>
          )}
        </Button>

        {/* Subtle hint for guests — they can add but must log in to order */}
        {!isAuthenticated && (
          <p className="text-[10px] text-gray-400 text-center">
            Login required to place order
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default RestaurantDetailPage;
