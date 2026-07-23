// controllers/earnings.controller.js
// ===============================
// Purpose: Endpoints for the rider earnings system.
//   - Rider side: list my earnings + summary totals
//   - Admin side:  list all earnings (across riders), mark as paid
//   - Admin side:  cancel an earning (for overrides on refused orders)
//
// The RiderEarning model is the single source of truth for who
// owes what. We don't re-derive it from orders — the admin's
// "mark as paid" action updates the model, not the order.
// ===============================

import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import RiderEarning from "../models/riderEarning.model.js";
import { summarizeEarnings, EARNINGS_CONFIG } from "../utils/earnings.js";

// ============================================================
// GET /api/rider/earnings — list + summary for the current rider
// ============================================================
// Returns:
//   - earnings: full list of earnings for this rider, newest first
//   - summary:  { total, pending, earned, paid, cancelled, count }
// The rider dashboard uses this to render the summary cards
// and the per-earning list.
// ============================================================
export const getRiderEarnings = asyncHandler(async (req, res) => {
  if (req.user.role !== "rider") {
    throw new ApiError(403, "Only riders can view their earnings");
  }

  // Populate the order so the UI can show order id + restaurant
  // name + status. We only need the fields the UI displays.
  const earnings = await RiderEarning.find({ rider: req.user._id })
    .sort({ createdAt: -1 })
    .populate({
      path: "order",
      select: "_id status totalPrice deliveryAddress restaurant createdAt",
      populate: { path: "restaurant", select: "name" },
    });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        earnings,
        summary: summarizeEarnings(earnings),
        // Echo the formula config so the UI can show "Earned at
        // Rs. 30 + Rs. 8/km" without duplicating the constants.
        config: EARNINGS_CONFIG,
      },
      "Earnings fetched"
    )
  );
});

// ============================================================
// GET /api/admin/earnings — admin view of all pending payouts
// ============================================================
// Returns every earning for every rider, plus a per-rider
// rollup (total pending, total paid, etc.). The admin can see
// who to pay next and how much.
// ============================================================
export const getAllEarnings = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError(403, "Only admins can view all earnings");
  }

  const earnings = await RiderEarning.find({})
    .sort({ createdAt: -1 })
    .populate({
      path: "rider",
      select: "fullname email contact",
    })
    .populate({
      path: "order",
      select: "_id status totalPrice deliveryAddress",
    });

  // Per-rider rollup. Map<riderId, { rider, total, pending, earned, paid, count }>
  const byRider = new Map();
  for (const e of earnings) {
    const key = e.rider?._id?.toString() || "unknown";
    if (!byRider.has(key)) {
      byRider.set(key, {
        rider: e.rider,
        total: 0,
        pending: 0,
        earned: 0,
        paid: 0,
        count: 0,
      });
    }
    const r = byRider.get(key);
    r.total += e.amount || 0;
    r.count += 1;
    if (e.status === "pending") r.pending += e.amount || 0;
    else if (e.status === "earned") r.earned += e.amount || 0;
    else if (e.status === "paid") r.paid += e.amount || 0;
  }
  const riderRollup = Array.from(byRider.values());

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        earnings,
        summary: summarizeEarnings(earnings),
        riderRollup,
        config: EARNINGS_CONFIG,
      },
      "All earnings fetched"
    )
  );
});

// ============================================================
// PATCH /api/admin/earnings/:id/pay — mark a single earning as paid
// ============================================================
// Body (all optional):
//   { method?: "cash" | "bank" | "wallet" | <string>,
//     note?:   string }
// Auth: admin only.
//
// The earning transitions to "paid" with paidAt + paidBy +
// paidMethod. We don't actually transfer money — the admin
// does that out-of-band (hand cash, bank transfer, etc.) and
// records the channel here for the audit trail.
// ============================================================
export const markEarningPaid = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError(403, "Only admins can mark earnings as paid");
  }

  const { method, note } = req.body || {};
  const earning = await RiderEarning.findById(req.params.id);
  if (!earning) throw new ApiError(404, "Earning not found");

  // Idempotency: if already paid, return success without
  // overwriting the original paidAt timestamp. The admin might
  // have double-clicked the "Pay" button.
  if (earning.status === "paid") {
    return res
      .status(200)
      .json(new ApiResponse(200, earning, "Earning was already paid"));
  }

  // Don't allow paying a cancelled earning (the customer refused
  // the delivery, no money owed). Admin can override with a new
  // earning via a separate flow (not implemented yet).
  if (earning.status === "cancelled") {
    throw new ApiError(
      400,
      "This earning was cancelled (order was refused). " +
        "Create a new compensation earning if you want to pay the rider anyway."
    );
  }

  earning.status = "paid";
  earning.paidAt = new Date();
  earning.paidBy = req.user._id;
  earning.paidMethod = typeof method === "string" ? method.slice(0, 50) : "";
  earning.paymentNote = typeof note === "string" ? note.slice(0, 500) : "";
  await earning.save();

  return res
    .status(200)
    .json(new ApiResponse(200, earning, "Earning marked as paid"));
});

// ============================================================
// PATCH /api/admin/earnings/:id/cancel — cancel an earning
// ============================================================
// Used when the admin wants to retroactively cancel an earning
// (e.g. dispute resolution, fraud, the order was actually
// refunded and the rider shouldn't be paid). Cancelled earnings
// stay in the DB for the audit trail — they're not deleted.
// ============================================================
export const cancelEarning = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError(403, "Only admins can cancel earnings");
  }
  const earning = await RiderEarning.findById(req.params.id);
  if (!earning) throw new ApiError(404, "Earning not found");

  // Don't cancel a paid earning — the money already went out.
  // The admin would have to issue a reversal separately.
  if (earning.status === "paid") {
    throw new ApiError(
      400,
      "Cannot cancel a paid earning. Issue a reversal out-of-band if needed."
    );
  }
  if (earning.status === "cancelled") {
    return res
      .status(200)
      .json(new ApiResponse(200, earning, "Earning was already cancelled"));
  }

  const { note } = req.body || {};
  earning.status = "cancelled";
  earning.cancelledAt = new Date();
  earning.paymentNote = typeof note === "string" ? note.slice(0, 500) : "";
  await earning.save();

  return res
    .status(200)
    .json(new ApiResponse(200, earning, "Earning cancelled"));
});
