// src/components/ui/error-state.tsx
// ===============================
// Purpose: Reusable error-state block.
//
// Why this exists:
//   Pages that fetch from the API can fail (network, 500, auth, etc.).
//   The current pattern across the app is "toast + leave the page empty" —
//   which is bad UX because the user has no idea what went wrong and no
//   clear way to recover. A dedicated error block with a Retry button
//   gives them both: a clear cause and a clear next action.
//
// Design:
//   - Same shell as EmptyState (Card + centered icon + text) for visual
//     consistency between "no data" and "couldn't load data"
//   - Red-tinted icon to signal "something's wrong"
//   - "Try again" button that re-runs the provided callback
//   - Optional: a more technical message for debugging
// ===============================

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export interface ErrorStateProps {
  /** Short title — e.g. "Couldn't load your orders" */
  title?: string;
  /** Longer description — e.g. "Check your internet connection and try again." */
  message: string;
  /** Optional callback to retry. When provided, shows a "Try again" button. */
  onRetry?: () => void;
  /** Optional icon override. Defaults to AlertCircle. */
  icon?: ReactNode;
  /** Optional retry button label. Defaults to "Try again". */
  retryLabel?: string;
}

export const ErrorState = ({
  title = "Something went wrong",
  message,
  onRetry,
  icon,
  retryLabel = "Try again",
}: ErrorStateProps) => {
  return (
    <Card>
      <CardContent className="p-8 md:p-12 text-center">
        <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4 text-red-500">
          <div className="w-10 h-10">
            {icon ?? <AlertCircle className="w-10 h-10" />}
          </div>
        </div>

        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
          {title}
        </h2>
        <p className="text-gray-500 mb-6 max-w-md mx-auto">{message}</p>

        {onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            className="border-orange-300 text-orange-700 hover:bg-orange-50"
          >
            <RefreshCw className="mr-2 w-4 h-4" />
            {retryLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
