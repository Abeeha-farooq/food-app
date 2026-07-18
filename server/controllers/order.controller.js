// controllers/order.controller.js
// ===============================
// Purpose: Place orders, list them, update status.
// ===============================

import Order from "../models/order.model.js";
import MenuItem from "../models/menu.model.js";
import Restaurant from "../models/restaurant.model.js";
import User from "../models/user.model.js";
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
    .populate("restaurant", "name city imageUrl")
    // Populate the assigned rider's name + phone so the customer can
    // see "their" rider on each order. Only fullname + contact are
    // pulled — no email / address / etc. (less PII on the wire).
    // If no rider is assigned, `rider` stays null on the order doc.
    .populate("rider", "fullname contact");

  return res.status(200).json(new ApiResponse(200, orders, "Your orders fetched"));
});

// GET /api/orders/:id — single order detail
export const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("restaurant", "name city address imageUrl")
    .populate("user", "fullname email contact")
    // Populate rider same as getMyOrders — name + contact only.
    .populate("rider", "fullname contact");

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
    .populate("restaurant", "name city")
    // Admin view populates rider too — same fields as the customer view
    // (name + contact) so the OrdersPage table can show who's delivering.
    .populate("rider", "fullname contact");

  return res.status(200).json(new ApiResponse(200, orders, "All orders fetched"));
});

// PATCH /api/orders/:id/status — update status (admin/restaurant_owner)
//
// Side effect: when the new status is "delivered" AND the order has
// an assigned rider AND no snapshot has been captured yet, we copy
// the rider's current name + phone into `riderSnapshot`. This freezes
// the historical "who delivered this" record on the order so it
// can't drift if the rider's account changes later (rename, phone
// change, deletion, blacklist, etc.).
//
// Idempotency: the `!order.riderSnapshot` guard means re-applying
// "delivered" to an already-delivered order does NOT overwrite the
// existing snapshot — first delivery wins.
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ["placed", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];
  if (!allowed.includes(status)) {
    throw new ApiError(400, `Invalid status. Allowed: ${allowed.join(", ")}`);
  }

  // Find first (we need the current state to decide whether to snapshot).
  const existing = await Order.findById(req.params.id);
  if (!existing) throw new ApiError(404, "Order not found");

  // Build the update payload. Default = just the new status.
  const update = { status };

  // ----- Snapshot the rider on delivery -----
  // Conditions:
  //   1. Transitioning TO "delivered" (any other target status is
  //      a no-op for the snapshot)
  //   2. Order has a rider assigned
  //   3. No snapshot has been captured yet (idempotency)
  if (
    status === "delivered" &&
    existing.rider &&
    !existing.riderSnapshot?.capturedAt
  ) {
    const rider = await User.findById(existing.rider).select("fullname contact");
    if (rider) {
      update.riderSnapshot = {
        fullname: rider.fullname,
        contact: rider.contact,
        capturedAt: new Date(),
      };
    }
    // If the rider was hard-deleted between assignment and delivery,
    // we silently skip the snapshot. The order still progresses to
    // delivered; there's just nothing to freeze. Rare edge case.
  }

  const order = await Order.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );

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
//
// The body may include EITHER or BOTH:
//   - { rating, comment }       → food review (backward compatible)
//   - { riderRating, riderReviewComment } → rider review (only if order has a rider)
//
// We accept both at once so the customer can rate food + rider in a
// single round-trip. Either can be omitted — only the fields the
// client provides get saved. This lets the UI show one combined
// "How was your order?" modal that handles both ratings.
export const submitReview = asyncHandler(async (req, res) => {
  const { rating, comment, riderRating, riderReviewComment } = req.body;

  // ----- Find the order + verify ownership/status -----
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, "Order not found");

  if (order.user.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Forbidden — you can only review your own orders");
  }

  if (order.status !== "delivered") {
    throw new ApiError(400, "You can only review delivered orders");
  }

  // Build the update object field-by-field so we only write what's
  // actually being set in this request. This keeps the endpoint
  // flexible — the client can submit a food-only review, a rider-only
  // review, or both in one go.
  const update = {};

  // ----- Food review -----
  // Only update the food review if the client actually provided a rating.
  // We treat `rating === undefined` as "don't touch the food review"
  // (it might already be set, or the client just wants to rate the rider).
  if (rating !== undefined) {
    if (order.rating) {
      throw new ApiError(400, "This order has already been reviewed");
    }
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      throw new ApiError(400, "Rating must be an integer between 1 and 5");
    }
    update.rating = ratingNum;
    update.reviewComment = typeof comment === "string" ? comment.trim().slice(0, 1000) : "";
    update.reviewedAt = new Date();
  }

  // ----- Rider review -----
  // Only allowed if:
  //   1. The order actually has a rider assigned (otherwise there's
  //      no one to rate — the spec for the rider feature includes
  //      this safeguard so we don't get orphaned ratings).
  //   2. The client provided a riderRating in the body
  //   3. The rider rating hasn't been set yet (one-shot pattern)
  if (riderRating !== undefined) {
    if (!order.rider) {
      throw new ApiError(
        400,
        "This order has no rider assigned — there's no one to rate"
      );
    }
    if (order.riderRating) {
      throw new ApiError(400, "The rider for this order has already been rated");
    }
    const riderRatingNum = Number(riderRating);
    if (!Number.isInteger(riderRatingNum) || riderRatingNum < 1 || riderRatingNum > 5) {
      throw new ApiError(400, "Rider rating must be an integer between 1 and 5");
    }
    update.riderRating = riderRatingNum;
    update.riderReviewComment = typeof riderReviewComment === "string"
      ? riderReviewComment.trim().slice(0, 1000)
      : "";
    update.riderReviewedAt = new Date();
  }

  // If neither field was provided, there's nothing to do — but instead
  // of silently succeeding (which would hide a client bug), throw a
  // 400. The endpoint should always be called with at least one rating.
  if (Object.keys(update).length === 0) {
    throw new ApiError(
      400,
      "Provide at least one of: rating (food) or riderRating"
    );
  }

  const updated = await Order.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );

  return res.status(200).json(new ApiResponse(200, updated, "Review submitted"));
});

// ============================================================
// ASSIGN RIDER TO ORDER
// ============================================================
// PATCH /api/orders/:id/rider
//
// Body: { riderId: string | null }
//   - riderId = some User._id  → assign that rider to the order
//   - riderId = null           → unassign the current rider
//
// Admin-only (mounted under requireRole("admin") in order.route.js).
//
// Validation rules for assignment:
//   1. Order must exist
//   2. Order must NOT be "delivered" or "cancelled" — no point
//      reassigning a finished order
//   3. The target user must exist, have role="rider", be approved,
//      and not be blacklisted
//
// On assignment we record riderAssignedAt + riderAssignedBy for audit.
// On unassignment we clear all three rider fields.
export const assignRider = asyncHandler(async (req, res) => {
  const { riderId } = req.body;
  const { id } = req.params;

  // ----- 1. Find the order -----
  const order = await Order.findById(id);
  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  // ----- 2. Order status sanity check -----
  // We block assignment for terminal states — once delivered or
  // cancelled, the order is done. Re-assigning is meaningless and
  // could overwrite the audit trail.
  const terminal = ["delivered", "cancelled"];
  if (terminal.includes(order.status)) {
    throw new ApiError(
      400,
      `Cannot (re)assign a rider for an order with status "${order.status}"`
    );
  }

  // ----- 3a. UNASSIGN path -----
  // riderId explicitly null → clear the rider fields.
  if (riderId === null) {
    // Idempotent: if no rider was assigned, return success without writing.
    if (order.rider === null) {
      return res
        .status(200)
        .json(new ApiResponse(200, order, "No rider was assigned"));
    }
    order.rider = null;
    order.riderAssignedAt = null;
    order.riderAssignedBy = null;
    await order.save();
    // Populate before returning so the client gets the same shape as
    // a "with rider" response (rider field is just null).
    const updated = await Order.findById(id).populate("rider", "fullname contact");
    return res
      .status(200)
      .json(new ApiResponse(200, updated, "Rider unassigned"));
  }

  // ----- 3b. ASSIGN path -----
  // Validate the riderId is a usable string + lookup the rider.
  if (!riderId || typeof riderId !== "string") {
    throw new ApiError(400, "riderId is required (string) or null to unassign");
  }
  const rider = await User.findById(riderId);
  if (!rider) {
    throw new ApiError(404, "Rider not found");
  }
  if (rider.role !== "rider") {
    throw new ApiError(400, "This user is not a rider");
  }
  if (!rider.isApproved) {
    throw new ApiError(400, "This rider has not been approved yet");
  }
  if (rider.isBlacklisted) {
    throw new ApiError(400, "This rider is currently suspended");
  }

  // Idempotent: assigning the same rider to the same order is a no-op.
  if (order.rider && order.rider.toString() === riderId) {
    const same = await Order.findById(id).populate("rider", "fullname contact");
    return res
      .status(200)
      .json(new ApiResponse(200, same, "Rider is already assigned to this order"));
  }

  // ----- 4. Persist the assignment -----
  order.rider = riderId;
  order.riderAssignedAt = new Date();
  order.riderAssignedBy = req.user._id;
  await order.save();

  // Populate before returning so the client gets the rider's name +
  // contact in the same response (saves a round-trip on the client).
  const updated = await Order.findById(id).populate("rider", "fullname contact");
  return res
    .status(200)
    .json(new ApiResponse(200, updated, "Rider assigned successfully"));
});
