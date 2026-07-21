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
import { tryRedeemCoupon } from "./coupon.controller.js";
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
    paymentMethod,           // "stripe" | "paypal" | "cash" | "safepay"
    stripePaymentIntentId,   // set when paymentMethod === "stripe"
    paypalOrderId,           // set when paymentMethod === "paypal"
    paypalPayerId,           // set when paymentMethod === "paypal"
    paypalCaptureId,         // set when paymentMethod === "paypal" (from /capture response)
    safepayTransactionId,    // set when paymentMethod === "safepay" (gateway tracker, set by webhook later)
    couponCode,              // optional: a promo code the customer entered at checkout
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

  // ----- COUPON REDEMPTION -----
  // We attempt the redemption HERE (atomically) and apply the discount
  // to the total. The amount we then verify against Stripe/PayPal is
  // already the discounted total, so the client cannot pay the
  // pre-discount amount and then claim the post-discount total.
  //
  // tryRedeemCoupon returns:
  //   { ok: false, reason: string }   — coupon missing/expired/used-up/etc
  //   { ok: true, discount, code }    — atomic increment succeeded
  //
  // If the client sent a coupon code and it's invalid, we treat that
  // as a hard error — better to reject the order than to silently
  // drop the discount. The UI already showed a preview via
  // /api/coupons/validate, so a sudden "coupon invalid" at place-order
  // time means the coupon expired/ran-out between preview and submit.
  let appliedCoupon = null;
  if (couponCode && String(couponCode).trim()) {
    // tryRedeemCoupon takes 3 positional args: (rawCode, userId, subtotal).
    // (Earlier we passed an object — that got assigned to `rawCode` and
    // produced the literal string "[object Object]" inside normalizeCode,
    // which is why every order with a coupon 400'd with "Coupon not found"
    // even though the validate endpoint found the coupon a second earlier.)
    const redemption = await tryRedeemCoupon(
      couponCode,
      req.user._id,
      subtotal,
    );

    if (!redemption.ok) {
      // Rollback: nothing was actually decremented (tryRedeemCoupon is
      // atomic — either it incremented or it didn't), so there's no
      // state to undo. Just tell the client why the order was refused.
      throw new ApiError(400, `Coupon not applied: ${redemption.reason}`);
    }

    appliedCoupon = {
      code: redemption.code,
      discount: redemption.discount,
    };
  }

  // Apply discount AFTER coupon redemption. We deliberately do NOT
  // let the discount make the order negative — cap at subtotal + deliveryFee.
  const discount = appliedCoupon ? appliedCoupon.discount : 0;
  const totalPrice = Math.max(0, subtotal + deliveryFee - discount);

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

  // ----- AUTO-ACCEPT for online-paid orders -----
  // If the customer has already paid (Stripe / PayPal), we auto-accept
  // the order: status goes "placed" → "confirmed" in the same create
  // call. This matches the Safepay flow (where the verify endpoint
  // auto-accepts on payment confirmation). Without this, paid orders
  // would still appear at the top of the admin's order list under
  // "placed" (the action queue), making the admin's job harder — they'd
  // have to filter out already-paid orders before they could see what
  // actually needs attention.
  //
  // Cash and "pending" Safepay orders stay at "placed" so the admin
  // still gets a chance to review them before they're confirmed.
  const autoAccepted =
    finalPaymentStatus === "paid" &&
    (paymentMethod === "stripe" || paymentMethod === "paypal");
  const initialStatus = autoAccepted ? "confirmed" : "placed";

  const order = await Order.create({
    user: req.user._id,
    restaurant: restaurantId,
    items: orderItems,
    subtotal,
    deliveryFee,
    totalPrice,
    deliveryAddress,
    status: initialStatus,
    paymentStatus: finalPaymentStatus,
    // Coupon snapshot — see comment on the order model. Both fields
    // are denormalized so historical orders stay readable even if
    // the coupon is later edited or deleted.
    couponCode: appliedCoupon ? appliedCoupon.code : null,
    couponDiscount: appliedCoupon ? appliedCoupon.discount : 0,
    // Payment processor linkage — exactly one of these is populated
    // depending on paymentMethod. "cash" orders leave them all empty.
    // "safepay" orders are placed with paymentStatus="pending"
    // (the gateway handles payment on its own hosted page) and the
    // transactionId is set later by the verify endpoint after the
    // user is redirected back.
    paymentMethod: paymentMethod || "cash",
    stripePaymentIntentId: stripePaymentIntent?.id || "",
    paypalOrderId: paypalOrderId || "",
    paypalPayerId: paypalPayerId || "",
    paypalCaptureId: paypalCaptureId || "",
    safepayTransactionId: safepayTransactionId || "",
  });

  if (autoAccepted) {
    console.log(
      `[Order] Auto-accepted order ${order._id} (${paymentMethod}, paymentStatus=paid)`
    );
  }

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

// ============================================================
// ACCEPT ORDER (admin approves the placed order)
// ============================================================
// POST /api/orders/:id/accept
//
// Transitions an order from "placed" → "confirmed". Only valid in
// the "placed" state — once the order is past that, the admin uses
// the regular status update endpoint (preparing, out_for_delivery,
// delivered, cancelled).
//
// Why a dedicated endpoint (vs. letting the admin set status via the
// generic PATCH /:id/status)?
//   1. Clearer audit trail — the URL says "this is an acceptance
//      decision" vs. "this is a status change"
//   2. Future-proof — if we later add accept-specific fields (e.g.
//      estimated prep time, internal notes) they live here without
//      crowding the generic status endpoint
//   3. The status update endpoint can stay admin + restaurant_owner
//      (kitchen staff can advance the order through preparing →
//      delivered), while accept/reject is admin-only (acceptance is
//      a business decision, not a kitchen task)
//
// Idempotent: if the order is already "confirmed" (or past it), the
// endpoint returns success without re-saving.
export const acceptOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, "Order not found");

  // Idempotency: if already past "placed" (i.e. confirmed or later),
  // we treat the accept as a no-op success. Re-accepting a delivered
  // order would be nonsensical, so we return the same shape.
  if (order.status !== "placed") {
    if (order.status === "cancelled") {
      throw new ApiError(
        400,
        "Cannot accept a cancelled order. The customer will need to place a new one."
      );
    }
    return res
      .status(200)
      .json(new ApiResponse(200, order, `Order is already "${order.status}"`));
  }

  order.status = "confirmed";
  await order.save();

  return res
    .status(200)
    .json(new ApiResponse(200, order, "Order accepted"));
});

// ============================================================
// REJECT ORDER (admin declines the placed order)
// ============================================================
// POST /api/orders/:id/reject
//
// Transitions an order from "placed" → "cancelled". This is the
// customer-facing equivalent of "your order was rejected" — they
// can place a new one.
//
// Same justification as acceptOrder: dedicated endpoint for audit
// trail + future expansion (rejection reason field, etc.).
//
// Only valid in the "placed" state. Once accepted, the order can
// still be cancelled (via the generic status update) but it's
// "cancelled" not "rejected" semantically.
export const rejectOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, "Order not found");

  // Idempotency: already cancelled → no-op success.
  if (order.status === "cancelled") {
    return res
      .status(200)
      .json(new ApiResponse(200, order, "Order is already cancelled"));
  }

  // If the order is past "placed" (e.g. already preparing), rejecting
  // is no longer the right semantic — the admin should cancel with a
  // different reason via the status endpoint. We block here to keep
  // the "reject" action scoped to the initial decision.
  if (order.status !== "placed") {
    throw new ApiError(
      400,
      `Cannot reject an order with status "${order.status}". Use the status update to cancel it instead.`
    );
  }

  order.status = "cancelled";
  await order.save();

  return res
    .status(200)
    .json(new ApiResponse(200, order, "Order rejected"));
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
  // Block rider assignment for two kinds of states:
  //   - "placed": admin hasn't accepted the order yet. Assignment is
  //     meaningless before acceptance (the customer can't even see
  //     the rider until the order is in the post-accept flow).
  //   - "delivered" / "cancelled": terminal states. Re-assigning is
  //     meaningless and could overwrite the audit trail.
  const blocked = ["placed", "delivered", "cancelled"];
  if (blocked.includes(order.status)) {
    // Special-case message for "placed" — tells the admin exactly
    // what to do (accept the order first).
    const message =
      order.status === "placed"
        ? "Cannot assign a rider before the order is accepted. Accept the order first."
        : `Cannot (re)assign a rider for an order with status "${order.status}"`;
    throw new ApiError(400, message);
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
