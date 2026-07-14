// src/lib/api.ts
// ===============================
// Purpose: A pre-configured axios instance with all our defaults baked in.
//          Every page imports `api` instead of using axios directly.
// ===============================

import axios, { AxiosError } from "axios";

// Read the API URL from the .env file. If it's missing, fall back to "/api".
// Vite injects import.meta.env.* at build time.
const BASE_URL = import.meta.env.VITE_API_URL || "/api";

// Create ONE axios instance that every request will use.
// Think of it as a pre-tuned "phone" — you don't have to dial the number each time.
const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,           // send cookies (we use httpOnly JWT cookies)
  headers: {
    "Content-Type": "application/json",
  },
});

// ============================================================
// REQUEST INTERCEPTOR
// Runs BEFORE every request leaves the browser.
// We use it to attach the JWT token from localStorage if it exists.
// ============================================================
api.interceptors.request.use(
  (config) => {
    // We support BOTH storage strategies:
    //   1. localStorage (token persists across browser restarts, simple)
    //   2. httpOnly cookie (more secure, set automatically by server)
    // The cookie alone is enough for our backend, but localStorage makes it
    // easy for axios to also send the token in the Authorization header —
    // useful for debugging and for clients that don't share a cookie domain.
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ============================================================
// RESPONSE INTERCEPTOR
// Runs AFTER every response comes back.
// We use it to handle 401 (token expired) globally — log out + redirect.
// ============================================================
api.interceptors.response.use(
  // If the response is OK, just return it unchanged.
  (response) => response,

  // If the response has an error, handle it here.
  // AxiosError gives us proper typing for `error.response`, `error.request`,
  // and `error.message` so we don't have to use `any`.
  (error: AxiosError) => {
    // 401 = the server says "you're not authorized"
    // This usually means the token expired or was tampered with.
    if (error.response?.status === 401) {
      // Clear the bad token so we don't keep sending it.
      localStorage.removeItem("token");
      // Only redirect if we're not already on the login page (avoid loops).
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ============================================================
// Helper: extract a friendly error message from any thrown value.
// We accept `unknown` (not `any`) so callers must handle the
// possibility that the value isn't a proper Error. The narrowing
// inside keeps the runtime behavior identical.
// ============================================================
export const getErrorMessage = (error: unknown): string => {
  // Narrow the unknown to something we can inspect.
  // `error instanceof Error` covers real Error objects, plus AxiosError
  // (which extends Error) and any wrapped errors.
  if (error instanceof Error) {
    // Axios puts the server's response on `error.response.data`.
    // The type isn't on the base Error class, so we cast to a structural type.
    const axiosLike = error as Error & {
      response?: { data?: { message?: string } };
    };
    if (axiosLike.response?.data?.message) {
      return axiosLike.response.data.message;
    }
    // Network error (server down, no internet, etc.)
    if (error.message === "Network Error") {
      return "Cannot reach the server. Is it running?";
    }
    // Anything else with a message
    return error.message || "Something went wrong";
  }
  // Non-Error throw (e.g. someone called `throw "string"`). Be safe.
  return "Something went wrong";
};
