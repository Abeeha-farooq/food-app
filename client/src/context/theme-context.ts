// src/context/theme-context.ts
// ===============================
// Purpose: Define the Theme context object and its value shape.
//          Kept separate from the provider component so Fast Refresh
//          doesn't complain about non-component exports living in the
//          same file as a component.
// ===============================

import { createContext } from "react";
import type { ResolvedTheme, Theme } from "./theme-types";

export interface ThemeContextValue {
  /**
   * The user's current preference. May be "light", "dark", or "system".
   * This is what the user PICKED, not what's currently rendered.
   */
  theme: Theme;
  /**
   * The theme actually being rendered right now — "light" or "dark"
   * (never "system"). Useful for the toggle icon and dropdown label.
   */
  resolvedTheme: ResolvedTheme;
  /** Update the user's preference. Persists to localStorage and updates
   *  the <html> class immediately. */
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
