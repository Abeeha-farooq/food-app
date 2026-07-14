// src/context/useTheme.ts
// ===============================
// Purpose: Tiny consumer wrapper around ThemeContext.
//          Kept in its own file (not next to the provider) so Fast
//          Refresh can reload it independently when the provider
//          implementation changes — the project-wide convention
//          (see auth/cart contexts) is one file per export.
//
//          Also throws a clear error if a component uses the hook
//          outside the provider — much friendlier than the default
//          `undefined.theme` crash.
// ===============================

import { useContext } from "react";
import { ThemeContext } from "./theme-context";

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error(
      "useTheme() must be used inside a <ThemeProvider>. " +
      "Wrap your app in ThemeProvider in main.tsx."
    );
  }
  return ctx;
};
