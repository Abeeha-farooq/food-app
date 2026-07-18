// src/components/ReviewModal.tsx
// ===============================
// Purpose: A modal that lets the user submit a review for a delivered order.
//
// When does it appear?
//   The parent (UserOrdersPage) opens this modal automatically on mount if
//   there are any delivered orders that haven't been reviewed yet. This is
//   the "popup after delivery" feature — the user doesn't have to navigate
//   anywhere; the modal greets them as soon as they visit their orders.
//
// What it does:
//   - Shows a friendly header explaining WHY they're being asked to review
//   - Displays the order summary (restaurant name, items, total) so they
//     have context for what they're rating
//   - 1-5 star picker (food review) + optional comment
//   - If the order has a rider, a second "Rate your rider" section
//     appears with the rider's name + a separate star picker + comment
//   - Submit + skip buttons
//
// The two ratings are INDEPENDENT — the client can submit only the food
// review, only the rider review, or both. The backend endpoint
// (PATCH /api/orders/:id/review) handles each field independently and
// rejects only when explicitly told to update something already set
// (one-shot per field).
//
// The modal is controlled — parent owns the open/close state. We just emit
// onSubmit / onSkip events; the parent decides what to do next.
// ===============================

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/StarRating";
import { X, Store, Receipt, Loader2, MessageSquare, Sparkles, Bike, Phone } from "lucide-react";
import { toast } from "sonner";

// ============================================================
// TYPES
// ============================================================

/**
 * The order being reviewed. We accept a minimal shape (not the full Order)
 * so this component is reusable for any "review this thing" use case.
 *
 * If `rider` is present, the modal adds a second rating section for the
 * rider. Otherwise only the food rating is shown.
 *
 * `existingFoodRating` and `existingRiderRating` let us pre-fill the
 * stars when the user re-opens the modal to see what they rated
 * (read-only — the one-shot rule is enforced server-side).
 */
export interface ReviewableOrder {
  _id: string;
  restaurant: { _id: string; name: string };
  items: { name: string; quantity: number; price: number }[];
  totalPrice: number;
  rider?: { _id: string; fullname: string; contact?: string } | null;
  // Existing ratings — when the user re-opens the modal, we pre-fill
  // the stars so they can see what they rated. The backend won't let
  // them re-submit the same field, but they CAN rate the other one
  // (e.g. they already rated the food and want to come back to rate
  // the rider).
  existingFoodRating?: number | null;
  existingRiderRating?: number | null;
}

export interface ReviewModalProps {
  /** The order the user is being asked to review. */
  order: ReviewableOrder | null;
  /** Whether the modal is open. Parent controls this. */
  open: boolean;
  /**
   * Called when the user submits. Receives a partial payload — the
   * parent decides which fields to forward to the server.
   *   - foodRating/foodComment are null when the user didn't touch the
   *     food section (already rated OR chose not to rate it now)
   *   - riderRating/riderComment follow the same rule
   */
  onSubmit: (payload: {
    foodRating: number | null;
    foodComment: string;
    riderRating: number | null;
    riderComment: string;
  }) => Promise<void>;
  /** Called when the user closes the modal without submitting. */
  onSkip: () => void;
}

// ============================================================
// COMPONENT
// ============================================================
export const ReviewModal = ({ order, open, onSubmit, onSkip }: ReviewModalProps) => {
  // ----- Form state -----
  // Food review state
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  // Rider review state — only used when the order has a rider
  const [riderRating, setRiderRating] = useState(0);
  const [riderComment, setRiderComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Whether the food / rider sections are read-only (already rated).
  // We still RENDER the section (so the user can see their past
  // rating), but the stars + textarea are disabled and the "Submit"
  // button only submits the OTHER field.
  const foodAlreadyRated = !!order?.existingFoodRating;
  const riderAlreadyRated = !!order?.existingRiderRating;
  // The "submitted" sections are read-only (for display) — if EITHER
  // is already rated, we still show it as a read-only chip so the
  // user has context for what they rated.
  const showFoodAsReadOnly = foodAlreadyRated;
  const showRiderAsReadOnly = !!order?.rider && riderAlreadyRated;

  // Reset state whenever the modal opens for a different order
  // (the parent might pass a new order between opens).
  // We pre-fill the stars from the existing ratings so the user can
  // see what they already rated (but the field is disabled).
  const lastOrderIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (open && order && order._id !== lastOrderIdRef.current) {
      setRating(order.existingFoodRating ?? 0);
      setComment(""); // never re-fill the comment — privacy + it was already submitted
      setRiderRating(order.existingRiderRating ?? 0);
      setRiderComment("");
      lastOrderIdRef.current = order._id;
    }
  }, [open, order]);

  // ----- Close on Escape key (standard modal behavior) -----
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onSkip();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, submitting, onSkip]);

  // Don't render anything if not open or no order
  if (!open || !order) return null;

  // ----- Submit handler -----
  // The button is enabled as long as the user has set AT LEAST ONE
  // rating (food or rider). We send both fields; the parent decides
  // what to forward to the server (or sends all — the server is
  // idempotent for "already rated" fields anyway).
  const handleSubmit = async () => {
    // At least one rating must be set. The disabled state on the
    // button enforces this, but double-check in case keyboard events
    // bypass the disabled attribute.
    if (rating < 1 && riderRating < 1) {
      toast.error("Please rate at least the food or the rider");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        // Only forward the food fields if the user actually changed
        // the rating (and it's not already rated). Empty comment is
        // fine — the server treats it as "no comment".
        foodRating: foodAlreadyRated ? null : rating || null,
        foodComment: foodAlreadyRated ? "" : comment.trim(),
        riderRating: riderAlreadyRated ? null : riderRating || null,
        riderComment: riderAlreadyRated ? "" : riderComment.trim(),
      });
      // Parent closes the modal on success — no need to do it here
    } catch {
      // Parent's onSubmit already toasted the error. Just stay open so
      // the user can retry.
    } finally {
      setSubmitting(false);
    }
  };

  // Total quantity of items in the order (e.g. "3 items")
  const totalItems = order.items.reduce((s, i) => s + i.quantity, 0);

  // Helper: the submit button is enabled when at least one
  // settable rating has a value. The disabled state below uses this.
  const canSubmit = (rating >= 1 || riderRating >= 1) && !submitting;

  return (
    // Fixed overlay — covers the whole screen with a semi-transparent backdrop
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={() => !submitting && onSkip()}
    >
      {/* Modal panel — stop click propagation so clicks inside don't close */}
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="border-0 shadow-none">
          <CardContent className="p-6 space-y-5">
            {/* ----- Header ----- */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-orange-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">How was your order?</h2>
                  <p className="text-sm text-gray-500">
                    Your feedback helps other food lovers
                  </p>
                </div>
              </div>
              {/* Close (X) button — disabled while submitting */}
              <button
                onClick={onSkip}
                disabled={submitting}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded disabled:opacity-30"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ----- Order summary (for context) ----- */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Store className="w-4 h-4 text-orange-600 flex-shrink-0" />
                <span className="font-semibold text-gray-900 truncate">
                  {order.restaurant.name}
                </span>
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                {order.items.slice(0, 3).map((item, i) => (
                  <div key={i} className="truncate">
                    {item.quantity}× {item.name}
                  </div>
                ))}
                {order.items.length > 3 && (
                  <div className="text-gray-400 italic">
                    + {order.items.length - 3} more item
                    {order.items.length - 3 === 1 ? "" : "s"}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-200 text-sm">
                <span className="flex items-center gap-1 text-gray-500">
                  <Receipt className="w-3 h-3" />
                  {totalItems} item{totalItems === 1 ? "" : "s"}
                </span>
                <span className="font-bold text-orange-600">
                  Rs. {order.totalPrice.toFixed(2)}
                </span>
              </div>
            </div>

            {/* ===========================================================
                FOOD RATING SECTION
                Hidden entirely if already rated (we still want to
                show the past rating as a small chip below the rider
                section so the user remembers what they gave).
                =========================================================== */}
            {!showFoodAsReadOnly && (
              <div className="space-y-2">
                <div className="text-center space-y-2">
                  <p className="text-sm font-medium text-gray-700">Rate the food</p>
                  <div className="flex justify-center">
                    <StarRating
                      value={rating}
                      onChange={setRating}
                      size="lg"
                      disabled={submitting}
                    />
                  </div>
                  {/* Hint text below the stars — changes based on the rating */}
                  <p className="text-xs text-gray-500 h-4">
                    {rating === 0
                      ? "Tap a star to rate"
                      : rating === 1
                      ? "We're sorry to hear that"
                      : rating === 2
                      ? "We'll do better next time"
                      : rating === 3
                      ? "Thanks for the feedback"
                      : rating === 4
                      ? "Great! Glad you enjoyed it"
                      : "Amazing! Thank you!"}
                  </p>
                </div>

                {/* ----- Comment textarea ----- */}
                <div className="space-y-2 pt-2">
                  <label
                    htmlFor="review-comment"
                    className="text-sm font-medium text-gray-700 flex items-center gap-1"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Add a comment about the food (optional)
                  </label>
                  <textarea
                    id="review-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value.slice(0, 1000))}
                    disabled={submitting}
                    placeholder="What did you like or dislike?"
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none disabled:opacity-50"
                  />
                  <p className="text-xs text-gray-400 text-right">
                    {comment.length} / 1000
                  </p>
                </div>
              </div>
            )}

            {/* ===========================================================
                RIDER RATING SECTION
                Only shown if the order has a rider.
                =========================================================== */}
            {order.rider && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                {/* Rider identity card (always shown for orders with a rider) */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Bike className="w-5 h-5 text-blue-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-blue-800">Rider</p>
                    <p className="font-semibold text-gray-900 truncate">
                      {order.rider.fullname}
                    </p>
                  </div>
                  {order.rider.contact && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                      <Phone className="w-3 h-3" />
                      {order.rider.contact}
                    </span>
                  )}
                </div>

                {showRiderAsReadOnly ? (
                  // Already rated — show the rating as a small read-only chip
                  <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-600">
                    <span>You rated your rider:</span>
                    <StarRating value={order.existingRiderRating ?? 0} size="sm" />
                  </div>
                ) : (
                  // Active rider rating inputs
                  <>
                    <div className="text-center space-y-2">
                      <p className="text-sm font-medium text-gray-700">Rate your rider</p>
                      <div className="flex justify-center">
                        <StarRating
                          value={riderRating}
                          onChange={setRiderRating}
                          size="lg"
                          disabled={submitting}
                        />
                      </div>
                      <p className="text-xs text-gray-500 h-4">
                        {riderRating === 0
                          ? "Tap a star to rate"
                          : riderRating <= 2
                          ? "We'll work on the delivery experience"
                          : riderRating === 3
                          ? "Thanks for the feedback"
                          : riderRating === 4
                          ? "Great delivery!"
                          : "Amazing delivery — thank you!"}
                      </p>
                    </div>

                    {/* ----- Rider comment ----- */}
                    <div className="space-y-2">
                      <label
                        htmlFor="rider-review-comment"
                        className="text-sm font-medium text-gray-700 flex items-center gap-1"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Add a comment about the rider (optional)
                      </label>
                      <textarea
                        id="rider-review-comment"
                        value={riderComment}
                        onChange={(e) => setRiderComment(e.target.value.slice(0, 1000))}
                        disabled={submitting}
                        placeholder="How was the delivery experience?"
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none disabled:opacity-50"
                      />
                      <p className="text-xs text-gray-400 text-right">
                        {riderComment.length} / 1000
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ----- Past-rating chips (when the user re-opens the modal) -----
                Shows the existing ratings as a small summary so the user
                remembers what they gave (and why the section might be
                hidden as read-only above). */}
            {(showFoodAsReadOnly || showRiderAsReadOnly) && (
              <div className="border-t border-gray-100 pt-3 space-y-2">
                {showFoodAsReadOnly && (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                    <span>You rated the food:</span>
                    <StarRating value={order.existingFoodRating ?? 0} size="sm" />
                  </div>
                )}
              </div>
            )}

            {/* ----- Action buttons ----- */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                variant="outline"
                onClick={onSkip}
                disabled={submitting}
                size="lg"
              >
                Skip for now
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="bg-orange hover:bg-hoverOrange"
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit review"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
