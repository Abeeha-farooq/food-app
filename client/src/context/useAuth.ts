// src/context/useAuth.ts
// ===============================
// Purpose: The `useAuth` hook — the "radio" that components use to
//          tune into the auth radio station.
//
// Why a separate file:
//   Fast Refresh needs AuthContext.tsx (the Provider) to export ONLY
//   components. We split the hook out so the Provider file is clean.
//   The hook imports the context from auth-context.ts.
// ===============================

import { useContext } from "react";
import { AuthContext } from "./auth-context";

/**
 * Access the auth state from any component.
 *
 * Usage:
 *   const { user, login, logout } = useAuth();
 *
 * Returns the default context value if no <AuthProvider> is mounted above
 * in the tree (which shouldn't happen in normal use).
 */
export const useAuth = () => useContext(AuthContext);
