// controllers/order.controller.js
// ===============================
// Purpose: Place orders, list them, update status.
// ===============================

import Order from "../models/order.model.js";
import MenuItem from "../models/menu.model.js";
import Restaurant from "../models/restaurant.model.js";
import { verifyPayment } from "./payment.controller.js";
import { verifyPayPalPayment } from "./paypal.controller.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// POST /api/orders — place a new order
export const placeOrder = asyncHandler(async (req, res) => {
  const {
    restaurantId,
    items,
    deliveryAddress,
    paymentStatus,
    paymentMethod,           // "stripe" | "paypal" | "cash" — tells us which processor to verify with
    stripePaymentIntentId,   // set when paymentMethod === "stripe"
    paypalOrderId,           // set when paymentMethod === "paypal"
    paypalPayerId,           // set when paymentMethod === "paypal"
    paypalCaptureId,         // set when paymentMethod === "paypal" (from /capture response)
  } = req.body;

  if (!restaurantId || !Array.isArray(items) || items.length === 0 || !deliveryAddress) {
    throw new ApiError(400, "restaurantId, items[], and deliveryAddress are required");
  }

  // ----- PAYMENT VERIFICATION (defense-in-depth) -----
  // If the client claims paymentStatus="paid", we MUST verify with the
  // actual payment processor before saving the order. Never trust the
  // client's word — always re-check with Stripe/PayPal.
  //
  // Why we verify HERE (in addition to the webhook):
  //   1. Webhooks can be delayed/lost — synchronous verification gives
  //      the customer immediate feedback ("payment failed, try again")
  //   2. Defense against a malicious client that fakes a paymentStatus
  //   3. We also catch amount tampering: client claims they paid $18.50
  //      but their order's true total is $185.00
  //
  // The amount we verify against is computed from the server-side menu
  // prices (see below), NEVER from the client's claimed total.
  let stripePaymentIntent = null;
  let paypalOrder = null;

  if (paymentStatus === "paid") {
    // The client MUST tell us which processor they used so we know
    // which verification path to take.
    if (paymentMethod === "stripe") {
      if (!stripePaymentIntentId) {
        throw new ApiError(400, "paymentStatus='paid' with paymentMethod='stripe' requires stripePaymentIntentId");
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
    } else if (paymentMethod === "paypal") {
      if (!paypalOrderId) {
        throw new ApiError(400, "paymentStatus='paid' with paymentMethod='paypal' requires paypalOrderId");
      }
      // Re-fetch the PayPal order to confirm it actually completed.
      // (PayPal capture is synchronous, so by the time /capture returns
      // 200 to the client, the status is COMPLETED. This re-fetch is
      // belt-and-suspenders in case the client lies or the network is weird.)
      paypalOrder = await verifyPayPalPayment(paypalOrderId);

      if (paypalOrder.status !== "COMPLETED") {
        throw new ApiError(
          402,
          `Payment not completed (PayPal status: ${paypalOrder.status}). Please complete payment and try again.`
        );
      }
    } else {
      // paymentStatus="paid" but no recognized processor — reject.
      // This catches both "cash" + "paid" (nonsense) and any unknown
      // paymentMethod value an attacker might inject.
      throw new ApiError(
        400,
        "paymentStatus='paid' requires paymentMethod to be 'stripe' or 'paypal'"
      );
    }
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

  // Same check for PayPal: the captured amount must be at least our
  // computed total. PayPal uses regular currency units (e.g. 18.50
  // dollars), NOT smallest-unit (cents), so we compare directly.
  if (paypalOrder) {
    const capture = paypalOrder.purchase_units?.[0]?.payments?.captures?.[0];
    if (capture) {
      const capturedAmount = parseFloat(capture.amount.value);
      if (capturedAmount < totalPrice) {
        throw new ApiError(
          402,
          `PayPal amount (${capturedAmount} ${capture.amount.currency_code}) is less than order total (${totalPrice}). Possible tampering — order refused.`
        );
      }
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
    // Payment processor linkage — exactly one of these is populated
    // depending on paymentMethod. "cash" orders leave them all empty.
    paymentMethod: paymentMethod || "cash",
    stripePaymentIntentId: stripePaymentIntent?.id || "",
    paypalOrderId: paypalOrderId || "",
    paypalPayerId: paypalPayerId || "",
    paypalCaptureId: paypalCaptureId || "",
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
