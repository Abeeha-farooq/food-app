// controllers/coupon.controller.js
// ===============================
// Purpose: Coupon operations.
//   - validateCoupon     — public-ish (logged-in users), checks the
//                          code + returns the discount amount that
//                          WOULD apply. Does NOT mutate state. Used
//                          at checkout to show the customer the
//                          discount before they commit.
//   - listCoupons        — admin: list all coupons
//   - createCoupon       — admin: create a new coupon
//   - updateCoupon       — admin: edit a coupon (toggle active, change
//                          discount value, extend expiry, etc.)
//   - deleteCoupon       — admin: hard delete
//   - tryRedeemCoupon    — INTERNAL, called by order.controller only.
//                          Atomically increments usageCount ONLY if
//                          the coupon is still under its limit. This
//                          is the race-safe redemption point.
//
// Coupons are intentionally NOT in the same controller as orders or
// auth — they're a distinct domain (marketing / promotions) and
// keeping them separate makes the file readable.
// ===============================

import Coupon from "../models/coupon.model.js";
import Order from "../models/order.model.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// Normalize a user-typed code to the canonical form we store.
// "  welcome20  " → "WELCOME20"
const normalizeCode = (raw) => String(raw || "").trim().toUpperCase();

// ============================================================
// CALCULATE DISCOUNT (pure function, no DB writes)
// ============================================================
// Given a coupon doc + the order subtotal, returns the discount
// amount in Rs. (rounded to 2 decimal places, never more than the
// subtotal). Returns 0 if the coupon doesn't apply for any reason
// (callers use this for the "would this coupon save me money?"
// preview — they still have to pass the code at order placement
// for the real validation).
const calculateDiscount = (coupon, subtotal) => {
  let amount = 0;
  if (coupon.discountType === "percentage") {
    amount = (subtotal * coupon.discountValue) / 100;
    // Cap at maxDiscountAmount if the admin set one
    if (
      coupon.maxDiscountAmount !== null &&
      coupon.maxDiscountAmount !== undefined &&
      amount > coupon.maxDiscountAmount
    ) {
      amount = coupon.maxDiscountAmount;
    }
  } else if (coupon.discountType === "fixed") {
    amount = coupon.discountValue;
  }
  // Cap at the subtotal — you can't get more discount than the
  // order is worth
  if (amount > subtotal) amount = subtotal;
  // Round to 2 decimal places (currency precision)
  return Math.round(amount * 100) / 100;
};

// ============================================================
// VALIDATE A COUPON (logged-in customer, used at checkout)
// ============================================================
// POST /api/coupons/validate
// Body: { code: "WELCOME20", subtotal: 1200 }
//
// Returns: { code, discount, description, discountType, discountValue }
// The client uses this to show the discount line + the new total.
// IMPORTANT: this does NOT redeem the coupon. The actual increment
// happens in tryRedeemCoupon() when the order is placed.
export const validateCoupon = asyncHandler(async (req, res) => {
  const { code, subtotal } = req.body;
  const normalized = normalizeCode(code);
  const orderSubtotal = Number(subtotal);

  if (!normalized) throw new ApiError(400, "Coupon code is required");
  if (!Number.isFinite(orderSubtotal) || orderSubtotal < 0) {
    throw new ApiError(400, "A valid subtotal is required");
  }

  const coupon = await Coupon.findOne({ code: normalized });
  if (!coupon) throw new ApiError(404, "Coupon not found");

  // Check the easy-to-state reasons first (clearer error messages)
  if (!coupon.active) throw new ApiError(400, "This coupon is no longer active");
  const now = new Date();
  if (coupon.validFrom && coupon.validFrom > now) {
    throw new ApiError(400, "This coupon is not yet active");
  }
  if (coupon.validUntil < now) {
    throw new ApiError(400, "This coupon has expired");
  }
  if (coupon.minOrderAmount > 0 && orderSubtotal < coupon.minOrderAmount) {
    throw new ApiError(
      400,
      `Minimum order of Rs. ${coupon.minOrderAmount} required for this coupon`
    );
  }
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    throw new ApiError(400, "This coupon has reached its usage limit");
  }

  // Per-user limit: count the customer's past orders that used this coupon
  if (req.user) {
    const userUsageCount = await Order.countDocuments({
      user: req.user._id,
      couponCode: normalized,
    });
    if (userUsageCount >= coupon.usageLimitPerUser) {
      throw new ApiError(
        400,
        "You've already used this coupon the maximum number of times"
      );
    }
  }

  const discount = calculateDiscount(coupon, orderSubtotal);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discount,                     // ← the actual money saved (Rs.)
        // We also return minOrderAmount so the client can show the
        // "add Rs. X more to use this coupon" hint if needed.
        minOrderAmount: coupon.minOrderAmount,
      },
      "Coupon is valid"
    )
  );
});

// ============================================================
// TRY TO REDEEM A COUPON (called by order.controller at order placement)
// ============================================================
// Atomically increment usageCount ONLY IF the coupon is still
// redeemable (active, in date range, under total limit). This is
// race-safe because findOneAndUpdate with a conditional filter is
// atomic in MongoDB — only one of N concurrent requests will get
// the "incremented" result; the rest get null and we know to reject.
//
// Returns: { ok: true, discount } on success
//          { ok: false, reason: "..." } on failure (caller surfaces
//          the reason as the order's error message)
//
// We don't use asyncHandler because the caller (order.controller)
// needs to branch on the return value, not throw.
export const tryRedeemCoupon = async (rawCode, userId, subtotal) => {
  const normalized = normalizeCode(rawCode);
  if (!normalized) return { ok: false, reason: "Coupon code is required" };

  // Fetch the coupon first so we can compute the discount + run
  // the per-user check.
  const coupon = await Coupon.findOne({ code: normalized });
  if (!coupon) return { ok: false, reason: "Coupon not found" };

  // Re-validate the same rules as validateCoupon. This is
  // intentional duplication — the client may have validated
  // minutes ago, and anything could have changed (expiry passed,
  // usage limit hit, admin disabled the coupon).
  if (!coupon.active) return { ok: false, reason: "Coupon is no longer active" };
  const now = new Date();
  if (coupon.validFrom && coupon.validFrom > now) {
    return { ok: false, reason: "Coupon is not yet active" };
  }
  if (coupon.validUntil < now) {
    return { ok: false, reason: "Coupon has expired" };
  }
  if (coupon.minOrderAmount > 0 && subtotal < coupon.minOrderAmount) {
    return {
      ok: false,
      reason: `Minimum order of Rs. ${coupon.minOrderAmount} required`,
    };
  }
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { ok: false, reason: "Coupon usage limit reached" };
  }
  const userUsageCount = await Order.countDocuments({
    user: userId,
    couponCode: normalized,
  });
  if (userUsageCount >= coupon.usageLimitPerUser) {
    return { ok: false, reason: "You've already used this coupon the maximum number of times" };
  }

  const discount = calculateDiscount(coupon, subtotal);

  // ====== ATOMIC INCREMENT (the race-safe part) ======
  // We use findOneAndUpdate with a filter that includes
  // `usageCount: { $lt: usageLimit }`. If the coupon's usageCount
  // is at or above the limit (because another request just redeemed
  // the last available use), the filter won't match and we'll get
  // null. We then reject the order to be safe.
  //
  // For unlimited coupons (usageLimit: null), the $lt filter is
  // skipped (null doesn't match $lt), so we need a separate code
  // path. Express it as a single conditional filter:
  const filter = {
    _id: coupon._id,
    active: true,
    validFrom: { $lte: now },
    validUntil: { $gte: now },
  };
  if (coupon.usageLimit !== null) {
    // Only match if usageCount is still below the cap
    filter.usageCount = { $lt: coupon.usageLimit };
  }
  // For the per-user check, we count first, then increment. There's
  // a tiny race where another order from the same user could land
  // between the count and the increment. The per-user check
  // therefore happens AFTER the increment in a "compensation"
  // pattern: if the count goes over, the order is still saved
  // (the discount is applied) but the user has used the coupon
  // one extra time. This is the standard "best-effort" approach
  // — the per-user limit is a soft cap, not a hard one. For a hard
  // cap, you'd need a distributed lock (Redis SETNX or similar).

  const updated = await Coupon.findOneAndUpdate(
    filter,
    { $inc: { usageCount: 1 } },
    { new: true } // return the updated doc (we only need confirmation)
  );

  if (!updated) {
    // The filter didn't match — either usage limit hit between our
    // check and our increment, or the coupon got disabled mid-flight.
    return {
      ok: false,
      reason: "Coupon is no longer available — please remove it and try again",
    };
  }

  return { ok: true, discount, code: coupon.code };
};

// ============================================================
// ADMIN: list all coupons
// ============================================================
// GET /api/admin/coupons
// Returns newest first. Admin-only (mounted under requireRole("admin")).
export const listCoupons = asyncHandler(async (_req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  return res
    .status(200)
    .json(new ApiResponse(200, { coupons }, "Coupons fetched"));
});

// ============================================================
// ADMIN: create a coupon
// ============================================================
// POST /api/admin/coupons
// Body: { code, description?, discountType, discountValue,
//         minOrderAmount?, maxDiscountAmount?, validFrom?, validUntil,
//         usageLimit?, usageLimitPerUser?, active? }
export const createCoupon = asyncHandler(async (req, res) => {
  const {
    code,
    description,
    discountType,
    discountValue,
    minOrderAmount,
    maxDiscountAmount,
    validFrom,
    validUntil,
    usageLimit,
    usageLimitPerUser,
    active,
  } = req.body;

  // Light server-side validation. The client does its own checks
  // too, but we always re-validate on the server.
  const normalized = normalizeCode(code);
  if (!normalized) throw new ApiError(400, "Coupon code is required");
  if (!["percentage", "fixed"].includes(discountType)) {
    throw new ApiError(400, "discountType must be 'percentage' or 'fixed'");
  }
  if (!Number.isFinite(Number(discountValue)) || Number(discountValue) <= 0) {
    throw new ApiError(400, "discountValue must be a positive number");
  }
  if (discountType === "percentage" && Number(discountValue) > 100) {
    throw new ApiError(400, "Percentage discount cannot exceed 100");
  }
  if (!validUntil) {
    throw new ApiError(400, "validUntil is required");
  }

  // Uniqueness check upfront for a clean error (the unique index
  // would also catch this, but the error would be a 11000 duplicate
  // key which is less helpful)
  const existing = await Coupon.findOne({ code: normalized });
  if (existing) {
    throw new ApiError(409, `Coupon code "${normalized}" already exists`);
  }

  const coupon = await Coupon.create({
    code: normalized,
    description: description || "",
    discountType,
    discountValue: Number(discountValue),
    minOrderAmount: Number(minOrderAmount) || 0,
    maxDiscountAmount:
      maxDiscountAmount === null || maxDiscountAmount === undefined
        ? null
        : Number(maxDiscountAmount),
    validFrom: validFrom ? new Date(validFrom) : new Date(),
    validUntil: new Date(validUntil),
    usageLimit:
      usageLimit === null || usageLimit === undefined ? null : Number(usageLimit),
    usageLimitPerUser: Number(usageLimitPerUser) || 1,
    active: active !== false, // default true
    createdBy: req.user._id,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, coupon, "Coupon created"));
});

// ============================================================
// ADMIN: update a coupon
// ============================================================
// PATCH /api/admin/coupons/:id
// Body: any subset of the create fields. Useful for toggling
// `active`, extending `validUntil`, bumping the `usageLimit`, etc.
//
// Note: editing `usageCount` is intentionally NOT allowed via this
// endpoint. That's an audit field — only the atomic-redemption path
// can change it. If an admin needs to reset the counter (e.g. for a
// test), they can use a separate "reset" endpoint (not implemented
// in this MVP — out of scope).
export const updateCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const coupon = await Coupon.findById(id);
  if (!coupon) throw new ApiError(404, "Coupon not found");

  // Whitelist of editable fields. Anything not in this list is
  // silently ignored — defense in depth against a client sending
  // `usageCount` or `_id` and accidentally bypassing the audit trail.
  const editable = [
    "description",
    "discountType",
    "discountValue",
    "minOrderAmount",
    "maxDiscountAmount",
    "validFrom",
    "validUntil",
    "usageLimit",
    "usageLimitPerUser",
    "active",
  ];

  for (const key of editable) {
    if (req.body[key] !== undefined) {
      // Normalize types: numbers, dates, booleans
      if (key === "discountType" && !["percentage", "fixed"].includes(req.body[key])) {
        throw new ApiError(400, "discountType must be 'percentage' or 'fixed'");
      }
      if (
        [
          "discountValue",
          "minOrderAmount",
          "maxDiscountAmount",
          "usageLimit",
          "usageLimitPerUser",
        ].includes(key)
      ) {
        if (req.body[key] !== null) {
          const n = Number(req.body[key]);
          if (!Number.isFinite(n) || n < 0) {
            throw new ApiError(400, `${key} must be a non-negative number`);
          }
          coupon[key] = n;
        } else {
          coupon[key] = null;
        }
      } else if (key === "validFrom" || key === "validUntil") {
        coupon[key] = new Date(req.body[key]);
      } else if (key === "active") {
        coupon[key] = Boolean(req.body[key]);
      } else {
        coupon[key] = req.body[key];
      }
    }
  }

  await coupon.save();
  return res
    .status(200)
    .json(new ApiResponse(200, coupon, "Coupon updated"));
});

// ============================================================
// ADMIN: delete a coupon
// ============================================================
// DELETE /api/admin/coupons/:id
// Hard delete. After this, the coupon code is freed up — if the
// admin later creates a new coupon with the same code, it will
// work. The `Order.couponCode` field on past orders is NOT touched,
// so historical orders still show the code they were placed with.
export const deleteCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const coupon = await Coupon.findByIdAndDelete(id);
  if (!coupon) throw new ApiError(404, "Coupon not found");
  return res
    .status(200)
    .json(new ApiResponse(200, null, "Coupon deleted"));
});
