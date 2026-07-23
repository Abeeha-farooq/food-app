// models/riderEarning.model.js
// ===============================
// Purpose: One document per earning a rider accumulates from
//          a delivery. Created automatically when an admin
//          assigns a rider to an order. Status moves through
//          pending → earned → paid (or pending → cancelled if
//          the customer refuses the delivery).
//
// Lifecycle:
//   1. Admin assigns a rider to an order
//      → status: "pending"
//      → createdAt: now
//   2. Rider marks the order "delivered" (or "refused")
//      → "delivered" → status: "earned"   + earnedAt: now
//      → "refused"   → status: "cancelled" (no pay)
//   3. Admin marks the earning as paid (pays the rider out of
//      band — cash, bank transfer, wallet, etc.)
//      → status: "paid"
//      → paidAt: now
//      → paidBy: admin User._id
//      → paidMethod: "cash" | "bank" | "wallet" (optional)
//
// Why a separate model (not a subdoc on Order):
//   - Earnings have their own lifecycle — they outlive the order
//     in some sense (the "paid" state can happen weeks later)
//   - The admin needs to query / aggregate / filter / pay them
//     independently of orders
//   - One earning per (rider, order) — unique compound index
//     prevents duplicates if the rider gets reassigned
// ===============================

import mongoose from "mongoose";

const riderEarningSchema = new mongoose.Schema(
  {
    // The rider this earning belongs to.
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,        // indexed for the rider's "my earnings" query
    },

    // The order this earning was generated from. One earning per
    // (rider, order) — see unique compound index below.
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    // ----- Money -----
    // The actual amount owed to the rider, in WHOLE RUPEES. We
    // store integers (not floats) to avoid rounding bugs — the
    // calculation in utils/earnings.js already rounds to the
    // nearest rupee.
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // ----- Distance audit trail -----
    // We store the distance + the rate used so the admin can
    // audit any individual earning. ("This rider got Rs. 86 for
    // a 7-km delivery — does that match the formula?")
    distanceMeters: {
      type: Number,
      default: null,        // null = distance unknown, fell back to flat fee
    },
    baseFee: { type: Number, required: true },
    ratePerKm: { type: Number, required: true },

    // ----- Status machine -----
    //   pending   — order assigned to rider, not yet delivered
    //   earned    — order delivered, money is owed to the rider
    //   paid      — admin has paid out
    //   cancelled — order refused by customer, no payment
    status: {
      type: String,
      enum: ["pending", "earned", "paid", "cancelled"],
      default: "pending",
      index: true,         // indexed for the admin's "show pending payouts" filter
    },

    // ----- Timestamps for the lifecycle -----
    createdAt: { type: Date, default: Date.now },    // when order was assigned
    earnedAt:  { type: Date, default: null },       // when order was delivered
    paidAt:    { type: Date, default: null },       // when admin paid
    cancelledAt: { type: Date, default: null },     // when order was refused

    // ----- Payout audit -----
    // Which admin marked this as paid, and via which channel.
    // "channel" is freeform for now (cash / bank / wallet / etc.) —
    // we don't actually transfer money, we just record that it
    // happened out-of-band.
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    paidMethod: {
      type: String,
      default: "",
      maxlength: 50,
    },
    paymentNote: {
      type: String,
      default: "",
      maxlength: 500,
    },
  },
  { timestamps: false }    // we manage createdAt/updatedAt manually for clarity
);

// ----- Indexes -----
// One earning per (rider, order). If the admin reassigns the
// order to the same rider, the upsert below hits this constraint
// instead of creating a duplicate.
riderEarningSchema.index({ rider: 1, order: 1 }, { unique: true });

// Common query: "show me all PAID earnings for rider X, newest first"
riderEarningSchema.index({ rider: 1, status: 1, createdAt: -1 });
// Common query: "show me all PENDING payouts (across all riders), oldest first"
riderEarningSchema.index({ status: 1, createdAt: 1 });

const RiderEarning = mongoose.model("RiderEarning", riderEarningSchema);
export default RiderEarning;
