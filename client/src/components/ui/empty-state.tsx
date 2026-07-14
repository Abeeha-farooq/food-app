// src/components/ui/empty-state.tsx
// ===============================
// Purpose: Reusable empty-state block.
//
// Why this exists:
//   Every data-driven page (cart, orders, restaurants, etc.) needs a "no data
//   yet" view. Without a shared component, each page invents its own version
//   — which means inconsistent layouts, repeated code, and visual drift.
//   Centralizing it here means every "empty" looks like part of the same app.
//
// Design:
//   - Centered card layout
//   - Soft colored icon (orange/gray/red depending on `variant`)
//   - Big title + small description
//   - Optional CTA button
//   - Responsive: same on all breakpoints
// ===============================

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** The icon element (from lucide-react or similar). Shown above the title. */
  icon: ReactNode;
  /** Big heading. Keep it short — one line if possible. */
  title: string;
  /** One or two sentences explaining what the user can do next. */
  description: string;
  /**
   * Color theme for the icon background.
   * - "default" = orange (the app's brand color, used for neutral empties)
   * - "muted"   = gray (used for "you have nothing here yet")
   * - "warning" = red/orange (used for "something is off")
   */
  variant?: "default" | "muted" | "warning";
  /** Optional CTA button label. Requires `ctaTo` or `onClick`. */
  ctaLabel?: string;
  /** Where the CTA navigates (react-router link). */
  ctaTo?: string;
  /** Optional callback if the CTA should run a function instead of navigating. */
  onCtaClick?: () => void;
  /** Extra classes for the outer Card. */
  className?: string;
}

const VARIANT_BG: Record<NonNullable<EmptyStateProps["variant"]>, string> = {
  default: "bg-orange-50 text-orange-500",
  muted:   "bg-gray-100 text-gray-400",
  warning: "bg-red-50 text-red-500",
};

export const EmptyState = ({
  icon,
  title,
  description,
  variant = "default",
  ctaLabel,
  ctaTo,
  onCtaClick,
  className,
}: EmptyStateProps) => {
  return (
    <Card className={className}>
      <CardContent className="p-8 md:p-12 text-center">
        {/* Icon in a soft circle — the universal "empty state" visual cue */}
        <div
          className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4",
            VARIANT_BG[variant]
          )}
        >
          <div className="w-10 h-10">{icon}</div>
        </div>

        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
          {title}
        </h2>
        <p className="text-gray-500 mb-6 max-w-md mx-auto">{description}</p>

        {/* CTA — only rendered if a label is provided */}
        {ctaLabel && (ctaTo || onCtaClick) && (
          <>
            {ctaTo ? (
              <Link to={ctaTo}>
                <Button className="bg-orange hover:bg-hoverOrange">
                  {ctaLabel}
                </Button>
              </Link>
            ) : (
              <Button
                onClick={onCtaClick}
                className="bg-orange hover:bg-hoverOrange"
              >
                {ctaLabel}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
