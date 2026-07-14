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