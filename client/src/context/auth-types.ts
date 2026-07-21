// src/context/auth-types.ts
// ===============================
// Purpose: Type definitions for the auth system.
//
// Why a separate file:
//   The AuthContext.tsx file is a React component (Provider + hook).
//   Fast Refresh (Vite's HMR for React) requires that component files
//   export ONLY components — not types, not constants, not helper
//   functions. Putting `User` here keeps AuthContext.tsx clean for HMR
//   while still allowing `User` to be imported by other files.
//
// This is a pure type file (`.ts`, not `.tsx`) because it has no JSX
// and no runtime exports. Type-only files are erased at build time.
// ===============================

/**
 * What an authenticated user looks like in our system.
 * Mirrors the backend's `User` model — keep these in sync.
 */
export interface User {
  _id: string;
  fullname: string;
  email: string;
  contact?: string;
  role: "user" | "admin" | "restaurant_owner" | "rider";
  isVerified: boolean;
  profilePicture?: string;
  address?: string;
  city?: string;
  country?: string;
}
