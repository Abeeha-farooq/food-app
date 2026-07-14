// src/components/ui/page-header.tsx
// ===============================
// Purpose: Reusable page header (the big title + subtitle row at the top of
//          most pages).
//
// Why this exists:
//   Every data-driven page (Cart, Checkout, Orders, Dashboard, ...) has a
//   header like "🛒 My Cart / 3 items in your cart" with an icon, a title,
//   and a subtitle. Without a shared component, each page writes its own
//   markup — which means inconsistent icon sizes, inconsistent typography,
//   inconsistent mobile wrapping, and no good place to slot in an action
//   button (e.g. "Refresh" on the admin pages).
//
// Design:
//   - Icon (optional) on the left
//   - Title (big) + subtitle (small, gray) stacked
//   - Right-side slot for an action (e.g. "Clear cart", "Refresh", "Add new")
//   - On mobile, the action wraps to a new line below the title
// ===============================

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Optional icon (lucide-react, etc.). Rendered next to the title. */
  icon?: ReactNode;
  /** Big page title. Required. */
  title: string;
  /** Small gray subtitle below the title. Accepts a string OR a React node
   *  (so callers can pass a <Skeleton /> while data is loading). */
  subtitle?: ReactNode;
  /** Optional right-side action — usually a Button. */
  action?: ReactNode;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

export const PageHeader = ({
  icon,
  title,
  subtitle,
  action,
  className,
}: PageHeaderProps) => {
  return (
    <div
      className={cn(
        // flex-wrap lets the action drop to a new line on narrow screens
        "flex items-start justify-between flex-wrap gap-2",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <h1
          className={cn(
            "text-2xl md:text-3xl font-bold text-gray-900",
            "flex items-center gap-2"
          )}
        >
          {icon && (
            // Keep the icon at a fixed size even if the caller passes a giant
            // SVG (lucide icons default to w-6 h-6 unless overridden)
            <span className="flex-shrink-0 w-7 h-7 [&_svg]:w-7 [&_svg]:h-7">
              {icon}
            </span>
          )}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        )}
      </div>

      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
};
