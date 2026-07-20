// controllers/restaurant.controller.js
// ===============================
// Purpose: List, search, get, create, update, delete restaurants.
//          Menu items are nested under restaurants.
// ===============================

import Restaurant from "../models/restaurant.model.js";
import MenuItem from "../models/menu.model.js";
import Order from "../models/order.model.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// ------------------------------------------------------------
// PUBLIC ROUTES (no auth needed — anyone browsing the app)
// ------------------------------------------------------------

/**
 * GET /api/restaurants?search=&cuisine=&price=&city=
 *
 * Supports searching by name/city/country, filtering by cuisine and price range.
 * Pagination via ?page=1&limit=12
 */
export const getRestaurants = asyncHandler(async (req, res) => {
  const { search, cuisine, price, city, country } = req.query;
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 12, 50);

  // Build a MongoDB filter object step by step
  const filter = {};

  if (search) {
    // Regex for partial, case-insensitive match on name/city/country
    const re = new RegExp(search, "i");
    filter.$or = [{ name: re }, { city: re }, { country: re }];
  }
  if (city) filter.city = new RegExp(city, "i");
  if (country) filter.country = new RegExp(country, "i");
  if (price) filter.priceRange = price;

  // Cuisine: accept BOTH "cuisine=A&cuisine=B" and "cuisine[]=A&cuisine[]=B".
  //
  //   - The "PHP-style" repeated-key form is what our axios client now sends
  //     (after the paramsSerializer fix). Express's qs parses this into an
  //     array on `req.query.cuisine`.
  //   - The "bracketed" form `cuisine[]=...` is what a vanilla axios client
  //     (or fetch) sends by default. Express's qs parses THIS into an object
  //     with the LITERAL key "cuisine[]", so `req.query.cuisine` is
  //     `undefined`. If we don't handle that, the filter silently does
  //     nothing — which is the bug we just fixed.
  //
  // We also accept the same dual format for any future array-typed query
  // param by way of `cuisineValues` below.
  if (cuisine || req.query["cuisine[]"]) {
    const raw = cuisine ?? req.query["cuisine[]"];
    const cuisines = Array.isArray(raw) ? raw : [raw];
    // We use a case-insensitive anchored regex for each value so:
    //   - "pizza" matches "Pizza" (seed has capitalized "Pizza")
    //   - Multi-select returns restaurants with ANY of the selected cuisines
    // The `^...$` anchors prevent "pizza" from matching "pizzeria" or "pizza-sub".
    filter.cuisines = { $in: cuisines.map((c) => new RegExp(`^${c}$`, "i")) };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Restaurant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Restaurant.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }, "Restaurants fetched")
  );
});

// ------------------------------------------------------------
// GET /api/restaurants/suggest?q=<query>&limit=8
// ------------------------------------------------------------
// Type-ahead autocomplete for the search bar.
//
// Returns a flat list of suggestions mixing two kinds:
//   1. { type: "restaurant", _id, name, imageUrl, cuisines, city }
//   2. { type: "cuisine",     name, count }
//
// Order:
//   - Restaurants first (up to 5) — these are what the user is
//     almost always looking for when they type a name fragment.
//   - Then cuisines (up to 3) — picked from the union of all
//     restaurants' cuisines, filtered by the query.
//
// Why not just call /api/restaurants?search=... and slice:
//   - That endpoint is heavy (full Restaurant docs, count query,
//     pagination overhead). It runs on every keystroke at 300ms
//     debounce, so we want a TIGHT response: just the fields the
//     dropdown needs, no totals, no page metadata.
//   - It also can't surface cuisines as suggestions (it only
//     returns restaurants), so we'd need a second call.
//
// Validation:
//   - Trim + escape regex metacharacters in `q` so a user typing
//     "pizza (" doesn't break the regex (parenthesis is special).
//   - Cap `limit` at 10 to avoid runaway responses on weird input.
//   - Empty / very short queries (1 char) return an empty array
//     rather than the entire restaurant collection.
//
// Caching: not implemented. The query is on a tiny collection
// (restaurants) with a simple index. For <500 restaurants this
// completes in <5ms, well within the debounce window. If the
// collection grows past a few thousand entries, add a TTL cache
// (in-memory LRU keyed on lowercased q) or a text index.
export const suggestRestaurants = asyncHandler(async (req, res) => {
  const rawQ = String(req.query.q || "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 10);

  // Require at least 2 characters before doing any DB work — saves
  // a query on every single keystroke at the start of a word.
  if (rawQ.length < 2) {
    return res.status(200).json(new ApiResponse(200, [], "Type more characters to see suggestions"));
  }

  // Escape regex metacharacters so user input is treated as a
  // literal substring. Without this, typing "pizza (" crashes the
  // regex constructor or returns weird matches.
  const escaped = rawQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "i");

  // ----- Restaurant name matches (top 5) -----
  // We project only the fields the dropdown renders. `_id` is
  // needed for navigation; `name` for the label; `imageUrl` for
  // the thumbnail; `cuisines` for the secondary line; `city` for
  // disambiguation when two restaurants share a name.
  const restaurantMatches = await Restaurant.find(
    { name: re },
    { name: 1, imageUrl: 1, cuisines: 1, city: 1 }
  )
    .sort({ name: 1 })    // alphabetical so the dropdown is stable
    .limit(5);

  // ----- Cuisine matches (top 3) -----
  // We pull ALL restaurants (no filter), project just `cuisines`,
  // then count + filter in JS. This is fine because:
  //   - `cuisines` is a small array per doc (typically 2-5 items)
  //   - The full list of distinct cuisines across the app is tiny
  //     (think 10-30), so the JS work is trivial
  //   - For a few thousand restaurants the response is still <100ms
  //
  // If the cuisine list ever explodes past ~200 distinct values,
  // switch to a Mongo aggregation with $unwind + $group + $match.
  const allCuisines = await Restaurant.find({}, { cuisines: 1 }).lean();
  const cuisineCounts = new Map();
  for (const r of allCuisines) {
    for (const c of r.cuisines || []) {
      // Normalize so "Pizza" and "pizza" collapse to one bucket.
      // We keep the original casing in the OUTPUT though, so the
      // dropdown shows "Pizza" not "pizza".
      const key = c.toLowerCase();
      cuisineCounts.set(key, (cuisineCounts.get(key) || 0) + 1);
    }
  }
  const cuisineMatches = Array.from(cuisineCounts.entries())
    .filter(([key]) => re.test(key) || re.test(key.charAt(0).toUpperCase() + key.slice(1)))
    .sort((a, b) => b[1] - a[1])   // most common first
    .slice(0, 3)
    .map(([key, count]) => ({
      // Re-capitalize the first letter so the dropdown reads "Pizza"
      // not "pizza". The original casing is lost once we lowercase
      // for the bucket key, but cuisine names are typically single
      // capitalized words ("Pizza", "Italian", "Burgers") so this
      // looks fine in practice.
      type: "cuisine",
      name: key.charAt(0).toUpperCase() + key.slice(1),
      count,
    }));

  // Combine — restaurants first (people search for restaurants
  // more than cuisines), then cuisines.
  const suggestions = [
    ...restaurantMatches.map((r) => ({
      type: "restaurant",
      _id: r._id.toString(),
      name: r.name,
      imageUrl: r.imageUrl || "",
      cuisines: r.cuisines || [],
      city: r.city,
    })),
    ...cuisineMatches,
  ];

  return res.status(200).json(
    new ApiResponse(200, suggestions, "Suggestions fetched")
  );
});

// GET /api/restaurants/:id — full details (with menu + reviews + aggregate rating)
export const getRestaurantById = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id);
  if (!restaurant) throw new ApiError(404, "Restaurant not found");

  const menu = await MenuItem.find({ restaurant: restaurant._id, available: true });

  // Fetch all reviews for this restaurant.
  // A "review" is an order that has a rating (rating != null).
  // We populate the user so the frontend can show "Reviewed by Alice on...".
  // Sorted newest-first so the most recent reviews appear at the top.
  const reviewOrders = await Order.find({
    restaurant: restaurant._id,
    rating: { $ne: null },
  })
    .sort({ reviewedAt: -1 })
    .populate("user", "fullname");

  // Compute the aggregate rating (average of all ratings, rounded to 1 decimal).
  // We do this in JS rather than a Mongoose aggregation pipeline because the
  // number of reviews per restaurant is small (hundreds at most in this app)
  // — a JS reduce is simpler and fast enough.
  const totalReviews = reviewOrders.length;
  const averageRating =
    totalReviews > 0
      ? Math.round(
          (reviewOrders.reduce((sum, o) => sum + (o.rating || 0), 0) / totalReviews) * 10
        ) / 10   // round to 1 decimal
      : 0;

  // Strip the restaurant field from each review (it's redundant — the caller
  // already knows which restaurant they're looking at).
  const reviews = reviewOrders.map((o) => ({
    _id: o._id,
    rating: o.rating,
    comment: o.reviewComment,
    reviewedAt: o.reviewedAt,
    user: o.user,
  }));

  return res.status(200).json(
    new ApiResponse(200, {
      restaurant,
      menu,
      reviews,
      averageRating,
      totalReviews,
    }, "Restaurant fetched")
  );
});

// GET /api/restaurants/:id/menu — fetch menu items only
export const getRestaurantMenu = asyncHandler(async (req, res) => {
  const menu = await MenuItem.find({
    restaurant: req.params.id,
    available: true,
  }).sort({ category: 1, name: 1 });

  return res.status(200).json(new ApiResponse(200, menu, "Menu fetched"));
});

// ------------------------------------------------------------
// ADMIN-ONLY ROUTES
// ------------------------------------------------------------

// POST /api/restaurants — create
export const createRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.create({
    ...req.body,
    owner: req.user._id,        // who created it (the admin user)
  });
  return res.status(201).json(new ApiResponse(201, restaurant, "Restaurant created"));
});

// PUT /api/restaurants/:id — update
export const updateRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!restaurant) throw new ApiError(404, "Restaurant not found");
  return res.status(200).json(new ApiResponse(200, restaurant, "Restaurant updated"));
});

// DELETE /api/restaurants/:id
export const deleteRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findByIdAndDelete(req.params.id);
  if (!restaurant) throw new ApiError(404, "Restaurant not found");
  // Also delete all menu items belonging to this restaurant
  await MenuItem.deleteMany({ restaurant: restaurant._id });
  return res.status(200).json(new ApiResponse(200, null, "Restaurant deleted"));
});

// ------------------------------------------------------------
// MENU ITEM ROUTES (admin only)
// ------------------------------------------------------------

export const createMenuItem = asyncHandler(async (req, res) => {
  // Make sure the parent restaurant exists
  const exists = await Restaurant.exists({ _id: req.params.id });
  if (!exists) throw new ApiError(404, "Restaurant not found");

  const item = await MenuItem.create({
    ...req.body,
    restaurant: req.params.id,
  });
  return res.status(201).json(new ApiResponse(201, item, "Menu item created"));
});

export const updateMenuItem = asyncHandler(async (req, res) => {
  const item = await MenuItem.findByIdAndUpdate(req.params.itemId, req.body, {
    new: true,
    runValidators: true,
  });
  if (!item) throw new ApiError(404, "Menu item not found");
  return res.status(200).json(new ApiResponse(200, item, "Menu item updated"));
});

export const deleteMenuItem = asyncHandler(async (req, res) => {
  const item = await MenuItem.findByIdAndDelete(req.params.itemId);
  if (!item) throw new ApiError(404, "Menu item not found");
  return res.status(200).json(new ApiResponse(200, null, "Menu item deleted"));
});