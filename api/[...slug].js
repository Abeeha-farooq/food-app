// api/[...slug].js
// ===============================
// Purpose: Vercel serverless catch-all entry point for /api/*
//
// Matches any /api/<path> request via Vercel's [...slug] catch-all.
// The build step (scripts/copy-server.js) copies server/ → api/server/
// so the Express import is same-directory relative and the bundler is happy.
// ===============================

import app from "./server/server.js";

export default async (req, res) => {
  // === TEMPORARY DEBUG LOGGING (delete after we confirm 404 is fixed) ===
  // Logs the raw request Vercel hands us so we can see what req.url and
  // req.query.slug look like at runtime. Visible in Vercel Dashboard →
  // Logs → filter by this function.
  console.log(
    `[api] ${req.method} ${req.url} | slug=${JSON.stringify(req.query?.slug)}`
  );
  // === END DEBUG LOGGING ===

  try {
    // Reconstruct req.url from the slug. The catch-all routing pattern
    // means Vercel may or may not set req.url to the full original path
    // (behavior varies by Vercel version). We rebuild defensively so
    // Express's /api/* route prefixes always match.
    //
    //   POST /api/auth/login
    //     → Vercel matches [...slug], slug = ["auth", "login"]
    //     → we set req.url = "/api/auth/login"
    //     → app.use("/api/auth", authRoutes) → /login handler
    const slug = req.query?.slug;
    if (Array.isArray(slug) && slug.length > 0) {
      req.url = "/api/" + slug.join("/");
    } else if (Array.isArray(slug) && slug.length === 0) {
      req.url = "/api";
    }
    // If no slug at all (function called some other way), req.url is
    // used as-is.

    return app(req, res);
  } catch (err) {
    // Surface any startup/runtime error as a 500 with a message,
    // so the failure mode is obvious in the browser AND in the logs.
    console.error("[api] HANDLER ERROR:", err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Server error",
        error: err?.message || String(err),
      });
    }
  }
};
