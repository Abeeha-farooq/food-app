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
//   - 1-5 star picker
//   - Optional comment textarea (max 1000 chars to match backend)
//   - Submit + skip buttons
//
// The modal is controlled — parent owns the open/close state. We just emit
// onSubmit / onSkip events; the parent decides what to do next.
// ===============================

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/StarRating";
import { X, Store, Receipt, Loader2, MessageSquare, Sparkles } from "lucide-react";
import { toast } from "sonner";

// ============================================================
// TYPES
// ============================================================

/**
 * The order being reviewed. We accept a minimal shape (not the full Order)
 * so this component is reusable for any "review this thing" use case.
 */
export interface ReviewableOrder {
  _id: string;
  restaurant: { _id: string; name: string };
  items: { name: string; quantity: number; price: number }[];
  totalPrice: number;
}

export interface ReviewModalProps {
  /** The order the user is being asked to review. */
  order: ReviewableOrder | null;
  /** Whether the modal is open. Parent controls this. */
  open: boolean;
  /** Called when the user submits a valid review. */
  onSubmit: (rating: number, comment: string) => Promise<void>;
  /** Called when the user closes the modal without submitting. */
  onSkip: () => void;
}

// ============================================================
// COMPONENT
// ============================================================
export const ReviewModal = ({ order, open, onSubmit, onSkip }: ReviewModalProps) => {
  // ----- Form state -----
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset state whenever the modal opens for a different order
  // (the parent might pass a new order between opens)
  const lastOrderIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (open && order && order._id !== lastOrderIdRef.current) {
      setRating(0);
      setComment("");
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
  const handleSubmit = async () => {
    if (rating < 1) {
      toast.error("Please pick a rating (1-5 stars)");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(rating, comment.trim());
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

            {/* ----- Star picker ----- */}
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-gray-700">Your rating</p>
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
            <div className="space-y-2">
              <label
                htmlFor="review-comment"
                className="text-sm font-medium text-gray-700 flex items-center gap-1"
              >
                <MessageSquare className="w-4 h-4" />
                Add a comment (optional)
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
                disabled={rating < 1 || submitting}
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
