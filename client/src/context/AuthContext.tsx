// src/context/AuthContext.tsx
// ===============================
// Purpose: Global auth state shared by every component.
//
// How it works (the radio station analogy):
//   - <AuthProvider> is the "radio station" — it broadcasts the user info
//   - useAuth() is the "radio" — any component can tune in
//   - When login() is called, the station updates its broadcast
//     and every tuned-in component re-renders automatically.
//
// Auth model: JWT-based, stored in an httpOnly cookie (set by the
// server) and ALSO mirrored in localStorage so the axios interceptor
// can attach it as an Authorization: Bearer header (some requests
// don't include cookies, e.g. cross-origin without credentials).
// ===============================

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import api from "@/lib/api";
import { type User } from "./auth-types";
import { AuthContext, type AuthContextValue } from "./auth-context";

// ============================================================
// AuthProvider — the actual "radio station"
// Wraps the entire app (in main.tsx) so everything inside can use useAuth()
// ============================================================
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);   // true until we check "is user logged in?"

  // ------------------------------------------------------------
  // On app mount: check if the user is already logged in
  // (they might have a valid JWT cookie from a previous session)
  // ------------------------------------------------------------
  useEffect(() => {
    const checkAuth = async () => {
      // Check if we have a token in localStorage from a previous session
      const token = localStorage.getItem("token");
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        // Ask the server "who am I?" using the token
        const res = await api.get("/user/me");
        setUser(res.data.data);
      } catch {
        // Token is bad/expired — interceptor already cleared it
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  // ------------------------------------------------------------
  // LOGIN
  // ------------------------------------------------------------
  const login = async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    // Backend returns: { _id, fullname, email, role, isVerified, profilePicture, token }
    // We use REST destructuring to pull out the token, and the rest becomes userData.
    // Old code did `const { user: userData, token } = ...` — wrong, no `user` key.
    const { token, ...userData } = res.data.data;
    localStorage.setItem("token", token);   // persist for page refreshes
    setUser(userData as User);
  };

  // ------------------------------------------------------------
  // SET CURRENT USER
  // Used by the verify-email flow to auto-login the user right after
  // they verify their OTP. The backend has already set the httpOnly
  // cookie + returned the token — we just need to stash the user in
  // context so the rest of the app (NavBar, etc.) updates immediately.
  //
  // (We name it "setCurrentUser" to avoid shadowing React's internal
  // setUser setter.)
  // ------------------------------------------------------------
  const setCurrentUser = useCallback((newUser: User) => {
    setUser(newUser);
  }, []);

  // ------------------------------------------------------------
  // SIGNUP
  // ------------------------------------------------------------
  const signup = async (data: { fullname: string; email: string; password: string; contact: string }) => {
    await api.post("/auth/signup", data);
    // Note: we don't auto-login after signup — user needs to verify email first.
    // They can log in after verification.
  };

  // ------------------------------------------------------------
  // LOGOUT
  // ------------------------------------------------------------
  const logout = async () => {
    try {
      await api.post("/auth/logout");    // tell server to clear cookie
    } catch {
      // even if server fails, clear local state
    }
    localStorage.removeItem("token");
    setUser(null);
  };

  // ------------------------------------------------------------
  // UPDATE USER (after profile edit)
  // Updates the local cache so the NavBar etc. show the new info.
  //
  // We wrap this in useCallback so its reference is stable across
  // renders. This matters for components (like Profile) that include
  // it in a useEffect dependency array — otherwise the effect would
  // re-fire on every render and cause an infinite loop.
  // ------------------------------------------------------------
  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  // ------------------------------------------------------------
  // REFRESH USER (refetch from /api/user/me)
  // ------------------------------------------------------------
  const refreshUser = async () => {
    try {
      const res = await api.get("/user/me");
      setUser(res.data.data);
    } catch {
      // Silently fail — interceptor handles logout if 401
    }
  };

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    signup,
    logout,
    updateUser,
    refreshUser,
    setCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
// Note: getErrorMessage is no longer re-exported from this file.
// Import it directly from "@/lib/api" in any file that needs it.
