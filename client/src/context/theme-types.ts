// src/context/theme-types.ts
// ===============================
// Purpose: Type definitions for the theme system.
//          Kept in its own file so the context module can import types
//          without re-exporting them — required by the Fast Refresh
//          `react-refresh/only-export-components` ESLint rule.
//
// Why a "light" / "dark" / "system" triad:
//   "light"   → always light
//   "dark"    → always dark
//   "system"  → follow the OS-level prefers-color-scheme media query
// Most modern apps offer all three; the user can pick what they want.
// ===============================

export type Theme = "light" | "dark" | "system";

/** Resolved theme — what the page is ACTUALLY rendering (never "system"). */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "foodapp-theme";
