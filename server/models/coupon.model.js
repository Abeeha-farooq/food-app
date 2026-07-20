// models/coupon.model.js
// ===============================
// Purpose: Define a Coupon (a.k.a. promo code / discount code) that
//          customers can apply at checkout for a discount on their order.
//
// Lifecycle of a coupon:
//   1. Admin creates the coupon (POST /api/admin/coupons)
//   2. Customer types the code at checkout
//   3. Server validates the code (active, in date range, under usage
//      limit, meets min order amount) and returns the discount amount
//   4. Customer places the order with the coupon code in the body
//   5. Server atomically increments usageCount ONLY IF the coupon is
//      still under its limit (prevents race conditions where two
//      users redeem the same limited coupon at the same time)
//   6. Order stores couponCode + couponDiscount (denormalized so the
//      historical record survives even if the coupon is later edited
//      or deleted)
// ===============================

import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    // The code the customer types at checkout (e.g. "WELCOME20").
    // We uppercase + trim on the model so users typing "welcome20" or
    // "  WELCOME20  " still match a stored "WELCOME20".
    code: {
      type: String,
      required: [true, "Coupon code is required"],
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },

    // Short description shown to the customer (e.g. "Welcome 20% off
    // your first order"). Optional — many coupons are self-explanatory
    // (the discount value is right there in the code).
    description: {
      type: String,
      default: "",
      maxlength: 200,
    },

    // The kind of discount:
    //   - "percentage": discountValue is a number 1–100. The discount
    //     amount is `subtotal * (discountValue / 100)`, capped by
    //     maxDiscountAmount if set.
    //   - "fixed":      discountValue is a money amount in the same
    //     units as the order (Rs.). The discount is exactly that amount.
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },

    // The raw value:
    //   - percentage: 1–100 (e.g. 20 = 20% off)
    //   - fixed:      money amount in Rs. (e.g. 100 = Rs. 100 off)
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },

    // Minimum order subtotal (in Rs.) for the coupon to apply.
    // 0 = no minimum (the default — any order qualifies).
    minOrderAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Cap on the discount amount for PERCENTAGE coupons.
    // Example: 20% off with maxDiscountAmount=500 means the discount
    // is min(subtotal * 0.20, 500). Useful for "20% off, up to Rs. 500".
    // null = no cap (the default).
    maxDiscountAmount: {
      type: Number,
      default: null,
    },

    // When the coupon becomes valid. Defaults to "right now" so an
    // admin creating a coupon can use it immediately. Set in the past
    // to make the coupon always-on (e.g. for a permanent code).
    validFrom: {
      type: Date,
      default: Date.now,
    },

    // When the coupon stops working. REQUIRED — every coupon must have
    // an expiry to prevent abandoned codes from staying active forever.
    validUntil: {
      type: Date,
      required: [true, "Coupon expiry is required"],
    },

    // Total redemption cap across ALL customers.
    // null = unlimited. The atomic increment in order.controller.js
    // uses this with $inc + a conditional check to prevent over-redemption.
    usageLimit: {
      type: Number,
      default: null,
      min: 0,
    },

    // Per-customer redemption cap. The validation endpoint reads the
    // customer's order history to count past uses of THIS specific
    // coupon by THIS specific user. 1 is the default (most coupons
    // are "one per customer").
    usageLimitPerUser: {
      type: Number,
      default: 1,
      min: 1,
    },

    // Current redemption count. Atomically incremented when an order
    // with this coupon is placed. NEVER write to this from the client
    // — only the server's place-order path mutates it.
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Admin toggle to disable a coupon WITHOUT deleting it. Useful
    // for "pause this promo for a few days" without losing the
    // usage history.
    active: {
      type: Boolean,
      default: true,
    },

    // Audit — which admin created the coupon. Useful for support
    // ("who set up WELCOME20?").
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true, // adds createdAt + updatedAt automatically
  }
);

// ============================================================
// INDEXES
// ============================================================
// `code` is already indexed via `unique: true` — that's enough for
// the validate endpoint's lookup. We DON'T index on usageCount
// because the atomic increment query already filters on it and we
// don't have a "list coupons by usage" view.

const Coupon = mongoose.model("Coupon", couponSchema);

export default Coupon;
