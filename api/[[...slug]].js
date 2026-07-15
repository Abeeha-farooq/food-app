// api/[[...slug]].js
// ===============================
// Purpose: Vercel serverless catch-all entry point for /api/*
//
// The double-bracket [[...slug]] is the Vercel "optional catch-all" pattern:
//   - matches /api          (slug is undefined)
//   - matches /api/auth     (slug is ["auth"])
//   - matches /api/auth/login (slug is ["auth", "login"])
//
// Every /api/* request gets routed to this single function. We hand the
// (req, res) pair to the Express app imported from server/server.js —
// Express then routes based on the full req.url (e.g. /api/auth/login
// routes through `app.use("/api/auth", authRoutes)`).
//
// Why catch-all (not api/index.js):
//   - Vercel exposes api/index.js at the URL /api only. It does NOT
//     automatically catch /api/sub/path requests unless you explicitly
//     route them via rewrites — and rewrites are fragile (we've been
//     fighting 405s caused by rewrite conflicts with the SPA catch-all).
//   - The catch-all pattern is the Vercel-blessed way to say "all
//     /api/* goes here" and Vercel's router handles it BEFORE any
//     rewrites, so it never collides with the SPA fallback.
//
// The Stripe webhook is still correctly handled — Express's
// `express.raw({ type: "application/json" })` middleware on the
// `/api/payments/webhook` route receives the raw body before any
// JSON parsing, so signature verification still works.
// ===============================

import app from "../server/server.js";

// 2-arg wrapper matches Vercel's expected (req, res) handler signature.
export default (req, res) => app(req, res);
