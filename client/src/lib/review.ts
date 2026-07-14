// src/lib/review.ts
// ===============================
// Purpose: Shared types and helpers for the review/rating system.
//
// Why this file exists:
//   Reviews appear in 3 places:
//     1. RestaurantDetailPage — list of reviews + avg rating
//     2. ReviewModal — submission form
//     3. UserOrdersPage — the order data includes rating/reviewComment/reviewedAt
//   Centralizing the types here keeps the three pages in sync.
//
// A "review" is stored as fields on the Order model (rating, reviewComment,
// reviewedAt) rather than in a separate Review collection. This matches the
// backend's design (1 review per delivered order, no separate model) and
// means the Order type already has the review data attached.
// ===============================

// ============================================================
// TYPES
// ============================================================

/**
 * A single review as returned by GET /api/restaurants/:id.
 * The backend strips the `restaurant` field (redundant — the caller already
 * knows which restaurant they're looking at) and keeps just the public info.
 */
export interface Review {
  _id: string;                          // the order _id (since reviews live on orders)
  rating: number;                       // 1-5
  comment: string;                      // optional, may be empty string
  reviewedAt: string;                   // ISO date string
  user: {
    _id: string;
    fullname: string;
  };
}

/**
 * The public shape of a restaurant (no owner field, no createdAt, etc.).
 * Exported as a named type so consumers (RestaurantDetailPage, etc.)
 * can reference it without redefining inline.
 */
export interface Restaurant {
  _id: string;
  name: string;
  imageUrl: string;
  city: string;
  country: string;
  address: string;
  cuisines: string[];
  priceRange: "low" | "medium" | "high";
  estimatedDeliveryTime: number;
}

/**
 * The shape of a single menu item as returned by GET /api/restaurants/:id/menu
 * or nested inside RestaurantWithReviews.menu. Exported as a named type
 * so pages can type individual items without redefining inline.
 */
export interface MenuItem {
  _id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
  tags: string[];
  available: boolean;
}

/**
 * The shape of the response from GET /api/restaurants/:id (now includes reviews).
 * This is a TypeScript representation of the ApiResponse<200, ...> wrapper.
 */
export interface RestaurantWithReviews {
  restaurant: Restaurant;
  menu: MenuItem[];
  reviews: Review[];
  averageRating: number;   // 0 if no reviews; rounded to 1 decimal otherwise
  totalReviews: number;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Render a star row for a given rating. Pure function — used by both the
 * restaurant page (read-only display) and the modal (interactive star picker).
 *
 * @param rating  - numeric rating 0-5 (0 renders 5 empty stars)
 * @param options.size - "sm" (12px), "md" (16px), "lg" (24px)
 * @param options.className - extra classes for the container
 * @param options.color - fill color for the filled stars (Tailwind text-* class)
 */
export interface StarRowOptions {
  size?: "sm" | "md" | "lg";
  className?: string;
  color?: string;   // e.g. "text-yellow-400"
}

export const formatRating = (rating: number, decimals = 1): string => {
  // Always show 1 decimal place (e.g. "4.3", "5.0", "0.0")
  return rating.toFixed(decimals);
};

/**
 * Determine the color of the aggregate-rating badge based on the value.
 * Used in the restaurant header — green for great, yellow for OK, gray for none.
 */
export const ratingColor = (rating: number): string => {
  if (rating >= 4.5) return "text-green-600";
  if (rating >= 3.5) return "text-yellow-600";
  if (rating >= 1)   return "text-orange-600";
  return "text-gray-400";
};
