// controllers/order.controller.js
// ===============================
// Purpose: Place orders, list them, update status.
// ===============================

import Order from "../models/order.model.js";
import MenuItem from "../models/menu.model.js";
import Restaurant from "../models/restaurant.model.js";
import { verifyPayment } from "./payment.controller.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// POST /api/orders — place a new order
export const placeOrder = asyncHandler(async (req, res) => {
  const { restaurantId, items, deliveryAddress, paymentStatus, stripePaymentIntentId } = req.body;

  if (!restaurantId || !Array.isArray(items) || items.length === 0 || !deliveryAddress) {
    throw new ApiError(400, "restaurantId, items[], and deliveryAddress are required");
  }

  // ----- STRIPE PAYMENT VERIFICATION -----
  // If the client claims paymentStatus="paid", we MUST have a
  // stripePaymentIntentId AND we MUST verify it with Stripe before
  // saving the order. Never trust the client to tell us payment
  // succeeded — always re-check with the payment provider.
  //
  // The amount we verify against must also match our order total —
  // otherwise a malicious client could pay Rs. 1 and claim a Rs. 1850
  // order was paid. We compute totalPrice BEFORE verifying, so we can
  // check it matches.
  let stripePaymentIntent = null;
  if (paymentStatus === "paid") {
    if (!stripePaymentIntentId) {
      throw new ApiError(400, "paymentStatus='paid' requires a stripePaymentIntentId");
    }
    stripePaymentIntent = await verifyPayment(stripePaymentIntentId);

    // status can be: "requires_payment_method" | "requires_confirmation" |
    //                "requires_action" | "processing" | "requires_capture" |
    //                "canceled" | "succeeded"
    // Only "succeeded" means we actually have the money.
    if (stripePaymentIntent.status !== "succeeded") {
      throw new ApiError(
        402,
        `Payment not completed (Stripe status: ${stripePaymentIntent.status}). Please complete payment and try again.`
      );
    }

    // Defense-in-depth: ensure the intent's currency matches what we
    // expect (PKR) and the amount is at least our total. Stripe
    // returns amount in the smallest currency unit (paisa), same as
    // we sent in. We compare AFTER we compute totalPrice below.
  }

  // Make sure the restaurant exists
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new ApiError(404, "Restaurant not found");

  // Look up all the menu items at once (one DB call instead of N)
  const menuIds = items.map((i) => i.menuItemId);
  const menuDocs = await MenuItem.find({
    _id: { $in: menuIds },
    restaurant: restaurantId,
    available: true,
  });

  // Build a lookup map for quick access
  const menuMap = new Map(menuDocs.map((m) => [m._id.toString(), m]));

  // Build the order items + calculate subtotal using the SERVER's prices (not client's)
  const orderItems = [];
  let subtotal = 0;
  for (const item of items) {
    const menuItem = menuMap.get(item.menuItemId);
    if (!menuItem) {
      throw new ApiError(400, `Menu item ${item.menuItemId} is not available`);
    }
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      throw new ApiError(400, "Each item must have quantity >= 1");
    }
    subtotal += menuItem.price * qty;
    orderItems.push({
      menuItem: menuItem._id,
      name: menuItem.name,           // snapshot — survives menu changes
      price: menuItem.price,
      quantity: qty,
    });
  }

  // Flat delivery fee for simplicity (could be distance-based later)
  const deliveryFee = 50;
  const totalPrice = subtotal + deliveryFee;

  // Validate optional paymentStatus (must be in the enum). Cash on delivery can
  // omit it (defaults to "pending"); card/wallet send "paid" to mark as already settled.
  const allowedPayment = ["pending", "paid", "failed", "refunded"];
  const finalPaymentStatus = paymentStatus && allowedPayment.includes(paymentStatus)
    ? paymentStatus
    : "pending";

  // ----- FINAL AMOUNT CHECK -----
  // If the client paid via Stripe, the intent's amount must match
  // (or exceed, in the case of overpayment) our computed total. This
  // prevents the "paid Rs. 1, claim Rs. 1850" attack.
  if (stripePaymentIntent) {
    const expectedAmountInPaisa = Math.round(totalPrice * 100);
    if (stripePaymentIntent.amount < expectedAmountInPaisa) {
      throw new ApiError(
        402,
        `Payment amount (${stripePaymentIntent.amount} ${stripePaymentIntent.currency}) is less than order total (${expectedAmountInPaisa} pkr). Possible tampering — order refused.`
      );
    }
  }

  const order = await Order.create({
    user: req.user._id,
    restaurant: restaurantId,
    items: orderItems,
    subtotal,
    deliveryFee,
    totalPrice,
    deliveryAddress,
    status: "placed",
    paymentStatus: finalPaymentStatus,
    stripePaymentIntentId: stripePaymentIntent?.id || "",
  });

  return res.status(201).json(new ApiResponse(201, order, "Order placed successfully"));
});

// GET /api/orders/my — list the current user's orders
export const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .populate("restaurant", "name city imageUrl");

  return res.status(200).json(new ApiResponse(200, orders, "Your orders fetched"));
});

// GET /api/orders/:id — single order detail
export const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("restaurant", "name city address imageUrl")
    .populate("user", "fullname email contact");

  if (!order) throw new ApiError(404, "Order not found");

  // Only the order's user OR an admin can view it
  const isOwner = order.user._id.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin";
  if (!isOwner && !isAdmin) {
    throw new ApiError(403, "Forbidden — not your order");
  }

  return res.status(200).json(new ApiResponse(200, order, "Order fetched"));
});

// GET /api/orders — all orders (admin only — for the dashboard)
// Supports ?status= and ?paymentStatus= query params for filtering
export const getAllOrders = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status)        filter.status = req.query.status;
  if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .populate("user", "fullname email")
    .populate("restaurant", "name city");

  return res.status(200).json(new ApiResponse(200, orders, "All orders fetched"));
});

// PATCH /api/orders/:id/status — update status (admin/restaurant_owner)
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ["placed", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];
  if (!allowed.includes(status)) {
    throw new ApiError(400, `Invalid status. Allowed: ${allowed.join(", ")}`);
  }

  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );
  if (!order) throw new ApiError(404, "Order not found");

  return res.status(200).json(new ApiResponse(200, order, "Order status updated"));
});

// PATCH /api/orders/:id/payment — update payment status (admin/restaurant_owner)
// Separate endpoint from the order-status one because they're independent fields.
// An order can be "out_for_delivery" with payment "pending" (cash on delivery),
// or "delivered" with payment "paid" (online), etc.
export const updateOrderPayment = asyncHandler(async (req, res) => {
  const { paymentStatus } = req.body;
  const allowed = ["pending", "paid", "failed", "refunded"];
  if (!allowedPayment.includes(paymentStatus)) {
    throw new ApiError(400, `Invalid payment status. Allowed: ${allowed.join(", ")}`);
  }

  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { paymentStatus },
    { new: true }
  );
  if (!order) throw new ApiError(404, "Order not found");

  return res.status(200).json(new ApiResponse(200, order, "Payment status updated"));
});

// PATCH /api/orders/:id/review — submit a rating + comment for a delivered order
// Rules:
//   - Only the order's owner can review it
//   - Order must be in "delivered" status
//   - One review per order (cannot re-review an already-reviewed order)
export const submitReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;

  // Validate rating (1-5)
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    throw new ApiError(400, "Rating must be an integer between 1 and 5");
  }

  // Find the order and verify ownership + status
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, "Order not found");

  if (order.user.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Forbidden — you can only review your own orders");
  }

  if (order.status !== "delivered") {
    throw new ApiError(400, "You can only review delivered orders");
  }

  if (order.rating) {
    throw new ApiError(400, "This order has already been reviewed");
  }

  // Trim comment (or set to empty string)
  const cleanComment = typeof comment === "string" ? comment.trim().slice(0, 1000) : "";

  const updated = await Order.findByIdAndUpdate(
    req.params.id,
    { rating: ratingNum, reviewComment: cleanComment, reviewedAt: new Date() },
    { new: true }
  );

  return res.status(200).json(new ApiResponse(200, updated, "Review submitted"));
});
