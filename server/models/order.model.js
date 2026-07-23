// models/order.model.js
// ===============================
// Purpose: Define what an Order looks like.
//          One order = one user + one restaurant + many menu items.
// ===============================

import mongoose from "mongoose";

// Each item INSIDE an order. We embed it (not reference) because:
//   - It's part of the order (won't exist without the order)
//   - It saves a database query when reading the order
const orderItemSchema = new mongoose.Schema(
  {
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    name: { type: String, required: true },     // snapshot in case menu item changes later
    price: { type: Number, required: true },    // snapshot of price at order time
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }  // we don't need a separate ID for each line item
);

const orderSchema = new mongoose.Schema(
  {
    // Who placed the order
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Which restaurant
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },

    // Items in the cart at the moment of ordering
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(arr) => arr.length > 0, "Order must have at least one item"],
    },

    // Money
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },

    // ----- Coupon / promo code (denormalized for historical accuracy) -----
    // We store BOTH the code AND the discount amount that was actually
    // applied at order placement time. Even if the admin later edits
    // or deletes the coupon, the historical record on this order is
    // intact — the customer and admin can still see "this order was
    // placed with WELCOME20 for Rs. 100 off" years later.
    //
    // couponCode is the normalized (uppercase, trimmed) code.
    // couponDiscount is the Rupee amount that was deducted from
    // totalPrice. 0 if no coupon was used.
    couponCode: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
    },
    couponDiscount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Delivery details
    deliveryAddress: { type: String, required: true },

    // ----- Geocoded delivery location -----
    // The lat/lng of the customer's delivery address. Populated
    // at order placement time via Nominatim (see utils/geocode.js).
    // Used by:
    //   1. The rider earnings system (distance from restaurant
    //      → here, multiplied by the per-km rate)
    //   2. The "Track your order" map (future — once we put a
    //      separate customer pin on the map, this is the coordinate)
    // Nullable: if geocoding fails (Nominatim down, address too
    // vague), the earnings system falls back to a flat fee so the
    // feature still works.
    deliveryLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      geocodedAt: { type: Date, default: null },
    },

    // Order lifecycle:
    //   placed → confirmed → preparing → out_for_delivery → delivered
    //   (or "cancelled" at any point by admin, or "refused" at the
    //   delivery address by the rider)
    //
    // "refused" is a rider-set terminal state used when the rider
    // arrives at the delivery address but the customer refuses to
    // accept the food (changed their mind, too late, wrong order,
    // etc.). Distinct from "cancelled" which is an admin action
    // before delivery. Like "delivered", "refused" is RESERVED
    // FOR THE RIDER — see updateOrderStatus in order.controller.js.
    status: {
      type: String,
      enum: [
        "placed",
        "confirmed",
        "preparing",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refused",
      ],
      default: "placed",
    },

    // ----- Delivery rider assignment (admin-only operation) -----
    // When an admin assigns a rider, we store who it is + when + which
    // admin did it (audit trail). Customer queries (getMyOrders,
    // getOrderById) populate this with fullname + contact so the
    // customer can see "their" rider immediately upon assignment.
    //
    // null = no rider assigned yet. The order can still progress
    // through statuses without a rider; assignment is independent.
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    riderAssignedAt: {
      type: Date,
      default: null,
    },
    riderAssignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // ----- Rider acknowledgement -----
    // Set when the assigned rider clicks "Accept Order" in their
    // dashboard. Independent of the order's `status` — the rider
    // acknowledges the assignment before the kitchen hands the food
    // over. Used by the rider UI to show "Accepted" vs "New
    // assignment" badges.
    riderAcceptedAt: {
      type: Date,
      default: null,
    },
    // ----- Rider live location (for active deliveries) -----
    // The rider's browser reports their GPS position every ~15s
    // while on an active delivery (status = preparing, confirmed,
    // or out_for_delivery). The customer's "Track order" map
    // reads this to show the rider's current position.
    //
    // Privacy: location is ONLY stored while the rider is on an
    // active delivery. Once status reaches "delivered" or
    // "cancelled", this stays as-is (kept for the customer's
    // "last known location" display until the page refreshes).
    // We never request location unless the rider has an active
    // order — see rider.controller.js updateRiderLocation.
    riderLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      // Server timestamp of the last location update. Used by
      // the client to decide if the cached location is "fresh"
      // (e.g. < 60s old) or stale.
      updatedAt: { type: Date, default: null },
    },

    // ----- Rider snapshot (frozen at delivery time) -----
    // The `rider` field above is a live ObjectId reference — if the
    // rider's account later changes (name edit, phone change, deletion,
    // blacklist), the populated value would reflect the new data. That
    // breaks the historical record: a delivered order's "delivered by"
    // info should NOT silently change after the fact.
    //
    // When the order's status transitions to "delivered" (in the
    // updateOrderStatus controller), we copy the rider's name +
    // phone + a timestamp into this subdoc. The customer-facing views
    // display the snapshot for delivered orders so the displayed
    // name/phone is always the same as the moment of delivery.
    //
    // This field is ONLY set by the server (via the delivery transition)
    // — clients never write to it. The shape mirrors what we populate
    // on the live rider (fullname + contact) so the two are swappable
    // in the UI.
    riderSnapshot: {
      fullname: { type: String, default: null },
      contact: { type: String, default: null },
      // When the snapshot was captured (= when the order was marked
      // delivered). Useful for audit / debugging.
      capturedAt: { type: Date, default: null },
    },

    // Payment status — separate from order status because they update independently.
    // Example: an order can be "delivered" with payment still "pending" (cash on delivery),
    // or "out_for_delivery" with payment "paid" (online).
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },

    // ----- Review (only set after the order is delivered) -----
    // We store the review directly on the order rather than in a separate
    // Review model because:
    //   1. Each order can have AT MOST one review (1-to-1) — embedding is natural
    //   2. Reviews are intrinsically tied to a specific purchase (the order)
    //   3. Avoids creating a new collection just for a few fields
    // All three fields are optional — they're set when the customer submits
    // a review for a delivered order, and stay undefined otherwise.
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    reviewComment: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },

    // ----- Rider review (only set after the order is delivered) -----
    // Same one-shot pattern as the food review above, but for the
    // delivery rider. The customer can rate the rider independently
    // of the food (e.g. they loved the food but the rider was late).
    //
    // Only set if the order had a rider assigned at the time of
    // delivery — if `rider` is null, these stay null. The submitReview
    // endpoint enforces this rule.
    riderRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    riderReviewComment: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    riderReviewedAt: {
      type: Date,
      default: null,
    },

    // ----- Payment processor linkage -----
    // We track WHICH processor the order paid through so refunds,
    // reconciliation, and disputes all go to the right system.
    //
    //   - "stripe" → stripePaymentIntentId is set
    //   - "paypal" → paypalOrderId + paypalCaptureId are set
    //   - "cash"     → none of the above (order paid on delivery)
    //   - "safepay"  → Safepay hosted checkout (full-page redirect)
    paymentMethod: {
      type: String,
      enum: ["stripe", "paypal", "cash", "safepay"],
      default: "cash",
    },

    // ----- Safepay payment linkage -----
    // The order's own _id is sent to Safepay as the `order_id`
    // (which Safepay uses to identify the order on the redirect
    // back), so we don't need a separate "basket id" field.
    //
    // safepayTransactionId is the gateway's transaction reference
    // (Safepay calls it the "tracker") returned after payment
    // completes. It's set by the webhook (or the success-page
    // callback if there's no webhook). We index it so refunds /
    // lookups by txid are fast.
    safepayTransactionId: {
      type: String,
      default: "",
      index: true,
    },

    // ----- Stripe payment linkage -----
    // We store Stripe's PaymentIntent ID for orders paid online so we
    // can look up / refund / verify the charge later. Cash-on-delivery
    // orders leave this empty.
    stripePaymentIntentId: {
      type: String,
      default: "",
      index: true,        // indexed — lookups by intent ID happen on refunds
    },

    // ----- PayPal payment linkage -----
    // Three IDs because PayPal's flow has three distinct resources:
    //   - paypalOrderId:    the "order" the customer approved (lifecycle: CREATED → APPROVED → COMPLETED)
    //   - paypalPayerId:    the buyer's PayPal account ID (for refunds + disputes)
    //   - paypalCaptureId:  the actual "capture" (the money-moving event) — needed for refunds
    // All three are populated ONLY when the order was paid via PayPal.
    paypalOrderId: {
      type: String,
      default: "",
      index: true,        // indexed — lookups happen on refunds and webhook reconciliation
    },
    paypalPayerId: {
      type: String,
      default: "",
    },
    paypalCaptureId: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// When fetching a user's order history, we usually want newest first
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ restaurant: 1, status: 1 });

const Order = mongoose.model("Order", orderSchema);
export default Order;