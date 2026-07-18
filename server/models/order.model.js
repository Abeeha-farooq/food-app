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

    // Delivery details
    deliveryAddress: { type: String, required: true },

    // Order lifecycle: placed -> confirmed -> preparing -> out_for_delivery -> delivered
    // (or "cancelled" at any point)
    status: {
      type: String,
      enum: ["placed", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"],
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
    //   - "cash"   → none of the above (order paid on delivery)
    paymentMethod: {
      type: String,
      enum: ["stripe", "paypal", "cash"],
      default: "cash",
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