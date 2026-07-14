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

    // ----- Stripe payment linkage -----
    // We store Stripe's PaymentIntent ID for orders paid online so we
    // can look up / refund / verify the charge later. Cash-on-delivery
    // orders leave this empty.
    stripePaymentIntentId: {
      type: String,
      default: "",
      index: true,        // indexed — lookups by intent ID happen on refunds
    },
  },
  { timestamps: true }
);

// When fetching a user's order history, we usually want newest first
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ restaurant: 1, status: 1 });

const Order = mongoose.model("Order", orderSchema);
export default Order;