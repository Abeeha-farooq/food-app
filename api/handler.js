// api/handler.js
// ===============================
// Purpose: Vercel serverless entry point. Handles ALL /api/* requests
// via an explicit rewrite in vercel.json (no catch-all pattern, no
// brackets in the filename — maximum compatibility).
//
// How requests reach this file:
//   vercel.json has a rewrite:  /api/:path*  →  /api/handler
//   Vercel preserves the original URL when calling the function, so
//   req.url is the full path (e.g. "/api/auth/login") and Express
//   routes it normally via its /api/* middleware prefixes.
//
// Why a simple filename (not [..slug] or [...slug]):
//   Vercel's catch-all filename patterns are sometimes silently
//   dropped during bundling — no error, just no function. Using a
//   plain filename + explicit rewrite is the most reliable pattern.
//
// Imports:
//   "./server/server.js" resolves to api/server/server.js after the
//   build step (scripts/copy-server.js runs first in buildCommand).
// ===============================

import app from "./server/server.js";

// Vercel runtime expects a default export shaped as (req, res) => any.
export default (req, res) => {
  // TEMP DEBUG (remove after 404 is fixed) — visible in Vercel Logs
  console.log(
    `[api] ${req.method} ${req.url} | host=${req.headers?.host}`
  );

  return app(req, res);
};
