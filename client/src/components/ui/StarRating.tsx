// src/components/ui/StarRating.tsx
// ===============================
// Purpose: Reusable star-rating UI.
//
// Two modes:
//   - READ-ONLY (default): shows filled + empty stars for a given rating
//   - INTERACTIVE (onChange prop): the user can click stars to pick a rating
//
// Used by:
//   - RestaurantDetailPage  (read-only: shows the restaurant's avg rating)
//   - ReviewModal           (interactive: the user picks 1-5 stars)
// ===============================

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StarRatingProps {
  /** The rating to display. 0 = all empty. Decimals are floored. */
  value: number;
  /** Max stars (default 5). */
  max?: number;
  /** Visual size. */
  size?: "sm" | "md" | "lg";
  /** Color for filled stars. Default amber. */
  color?: string;
  /** If provided, the stars become clickable and this fires with the picked value. */
  onChange?: (value: number) => void;
  /** Disable interaction (e.g. while submitting). */
  disabled?: boolean;
  /** Extra classes for the container. */
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<StarRatingProps["size"]>, string> = {
  sm: "w-3 h-3",
  md: "w-5 h-5",
  lg: "w-7 h-7",
};

export const StarRating = ({
  value,
  max = 5,
  size = "md",
  color = "text-yellow-400",
  onChange,
  disabled = false,
  className,
}: StarRatingProps) => {
  // Floor to the nearest integer for display (we don't show half-stars here).
  // 4.7 -> 4 filled, 1 empty. 0 -> all empty.
  const filledCount = Math.max(0, Math.min(max, Math.floor(value)));

  // If onChange is provided, we're an interactive picker.
  const isInteractive = !!onChange;

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      // For accessibility: announce as a radiogroup when interactive
      role={isInteractive ? "radiogroup" : undefined}
      aria-label={isInteractive ? "Rating" : `Rating: ${value} out of ${max}`}
    >
      {Array.from({ length: max }, (_, i) => {
        const starValue = i + 1;
        const isFilled = starValue <= filledCount;
        const Icon = (
          <Star
            className={cn(
              SIZE_CLASSES[size],
              // Filled stars use the chosen color; empty stars are gray
              isFilled ? color : "text-gray-300",
              // Interactive stars get hover + cursor
              isInteractive && !disabled && "transition-colors"
            )}
            // Use solid fill only when interactive (hover preview) or when this
            // star IS the current value. Otherwise show outline.
            fill={isFilled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
          />
        );

        if (!isInteractive || disabled) {
          return <span key={i}>{Icon}</span>;
        }

        // Interactive star — wrap in a button so it's keyboard-focusable
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange!(starValue)}
            // Preview effect: when hovering, color all stars up to the hovered
            // one with the hover color. We use CSS group/peer for this.
            className={cn(
              "p-0.5 rounded transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-yellow-300",
              "group/star"
            )}
            aria-label={`${starValue} star${starValue === 1 ? "" : "s"}`}
            role="radio"
            aria-checked={starValue === Math.round(value)}
          >
            <span
              className={cn(
                "block",
                // When hovering THIS star, color all stars from 1..i with the
                // hover color. We achieve this by giving each star a class
                // that responds to the parent's hover state.
                "group-hover/star:[&_svg]:text-yellow-400"
              )}
            >
              {Icon}
            </span>
          </button>
        );
      })}
    </div>
  );
};
