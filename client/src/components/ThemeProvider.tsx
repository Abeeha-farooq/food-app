// src/components/ThemeProvider.tsx
// ===============================
// Purpose: Owns the theme state for the whole app.
//
// What it does:
//   1. Reads the saved theme from localStorage on mount (or "system" by default)
//   2. Listens to OS-level prefers-color-scheme changes when theme = "system"
//   3. Toggles the `dark` class on <html> whenever the resolved theme changes
//   4. Exposes the current theme + a setter via React context
//
// Why a single component, not a hook:
//   We need a useEffect on mount to set up the listener, and we need
//   the listener to be torn down on unmount. That's a component's job.
//   The hook (useTheme) is just a thin consumer wrapper.
// ===============================

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { ThemeContext, type ThemeContextValue } from "@/context/theme-context";
import { THEME_STORAGE_KEY, type ResolvedTheme, type Theme } from "@/context/theme-types";

// ============================================================
// HELPERS
// ============================================================

/**
 * Resolve a Theme preference to the actual theme being shown.
 *   "light"  -> "light"
 *   "dark"   -> "dark"
 *   "system" -> "light" or "dark" based on prefers-color-scheme
 *
 * Falls back to "light" if `matchMedia` is unavailable (e.g. SSR).
 */
const resolveTheme = (theme: Theme): ResolvedTheme => {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

/**
 * Apply the resolved theme to the <html> element by toggling the `dark`
 * class. Tailwind's `darkMode: ["class"]` config means the `dark` class
 * on <html> is the only thing that activates the `dark:` variants.
 *
 * Also sets `color-scheme` so native UI (scrollbars, form controls)
 * matches the theme — without it you get light scrollbars in dark mode,
 * which is jarring.
 */
const applyTheme = (resolved: ResolvedTheme) => {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
};

/**
 * Read the saved theme from localStorage. Returns "system" if nothing is
 * saved or the value is invalid. Wrapped in try/catch because private
 * browsing modes can throw on `localStorage.getItem`.
 */
const readSavedTheme = (): Theme => {
  if (typeof window === "undefined") return "system";
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch {
    // Storage might be disabled — fall through to "system".
  }
  return "system";
};

interface Props {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: Props) => {
  // ----- State -----
  // theme: the user's saved preference (or "system" by default)
  // resolvedTheme: what we're actually rendering right now
  // We use the lazy initializer for the initial state so we read
  // localStorage exactly once, on the first render. After that, state
  // changes drive the class toggle.
  const [theme, setThemeState] = useState<Theme>(readSavedTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(readSavedTheme()));

  // ----- Apply the theme to <html> whenever the resolved theme changes -----
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // ----- Listen to OS-level color-scheme changes when theme = "system" -----
  // If the user has "system" selected, we need to follow the OS. The
  // matchMedia change event fires when the user changes their system
  // appearance (e.g. macOS dark mode toggle), and we re-resolve.
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setResolvedTheme(e.matches ? "dark" : "light");
    };
    // The `addEventListener` API is the modern one; older Safari used
    // `addListener` (deprecated). The `addEventListener` form works
    // everywhere we care about (Chrome 39+, Firefox 6+, Safari 14+).
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // ----- setTheme: the public API -----
  // Memoized so the context value object stays referentially stable when
  // the rest of the tree re-renders. Without useCallback, every parent
  // re-render creates a new function reference, which re-renders every
  // context consumer unnecessarily.
  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setResolvedTheme(resolveTheme(next));
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage might be unavailable (private browsing, quota).
      // The theme still works for the current session — we just can't
      // persist. This is fine; it would be a worse UX to throw.
    }
  }, []);

  // ----- Build the context value -----
  // useMemo so the value object is referentially stable across renders
  // that don't change `theme` or `resolvedTheme`.
  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
