// src/context/auth-context.ts
// ===============================
// Purpose: The shared AuthContext object (and its value type).
//
// Why a separate file:
//   Fast Refresh needs component files to export ONLY components.
//   We split the auth system across 3 files:
//     1. auth-context.ts  — this file: the context + value type
//     2. useAuth.ts       — the `useAuth` hook (consumes the context)
//     3. AuthContext.tsx  — the `AuthProvider` component (provides the context)
//
//   This is a "context" file (no React components, no hooks) — it just
//   holds the shared state shape. The Fast Refresh rule only flags
//   files that MIX components with non-component exports, so a pure
//   utility file like this one is fine.
// ===============================

import { createContext } from "react";
import { type User } from "./auth-types";

/**
 * Shape of the value the AuthContext provides to consumers.
 * Kept here (not in AuthContext.tsx) so the hook can import it.
 */
export interface AuthContextValue {
  user: User | null;                // null = logged out
  isLoading: boolean;                // true while we're checking "are they logged in?"
  isAuthenticated: boolean;          // convenience flag

  login: (email: string, password: string) => Promise<void>;
  signup: (data: { fullname: string; email: string; password: string; contact: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;  // for profile updates
  refreshUser: () => Promise<void>;              // refetch from /api/user/me
  setCurrentUser: (newUser: User) => void;       // for verify-email auto-login
}

/**
 * The shared context object. Default values are placeholders so
 * TypeScript is happy; the real values come from <AuthProvider>.
 */
export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  signup: async () => {},
  logout: async () => {},
  updateUser: () => {},
  refreshUser: async () => {},
  setCurrentUser: () => {},
});
