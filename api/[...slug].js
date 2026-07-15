// api/[...slug].js
// ===============================
// Purpose: Vercel serverless catch-all entry point for /api/*
//
// The single-bracket [...slug] is Vercel's required catch-all pattern:
//   - matches /api/foo        (slug is ["foo"])
//   - matches /api/foo/bar    (slug is ["foo", "bar"])
//   - matches /api/a/b/c/d    (slug is ["a", "b", "c", "d"])
//
// Every /api/* request gets routed to this single function. We hand the
// (req, res) pair to the Express app imported from server/server.js —
// Express then routes based on the full req.url (e.g. /api/auth/login
// routes through `app.use("/api/auth", authRoutes)`).
//
// Why the URL reconstruction:
//   Vercel's catch-all may set req.url to just the function's base path
//   (e.g. "/api") instead of the full request path. The actual path
//   segments live in req.query.slug. We rebuild req.url from the slug
//   so Express's route matching (which is prefix-based: app.use("/api/
//   auth", ...)) works correctly.
//
// The Stripe webhook is still correctly handled — Express's
// `express.raw({ type: "application/json" })` middleware on the
// `/api/payments/webhook` route receives the raw body before any
// JSON parsing, so signature verification still works.
// ===============================

import app from "../server/server.js";

export default (req, res) => {
  // Rebuild req.url from the slug so Express can match its /api/*
  // route prefixes. If Vercel already passed the full URL, this is
  // effectively a no-op (the rebuild produces the same string).
  const slug = req.query?.slug;
  if (Array.isArray(slug) && slug.length > 0) {
    req.url = "/api/" + slug.join("/");
  } else if (Array.isArray(slug) && slug.length === 0) {
    req.url = "/api";
  }
  return app(req, res);
};
