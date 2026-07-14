// api/index.js
// ===============================
// Purpose: Vercel serverless entry point.
//
// Vercel looks for files in `/api/*` at the project root. This file
// imports the Express app we built in `server/server.js` and hands it
// to Vercel's serverless runtime. Every request to your Vercel URL that
// doesn't match a static asset gets routed here.
//
// Why the wrapper:
//   Vercel's serverless runtime expects a default export shaped as
//   `(req, res) => any`. Express's `app` is `(req, res, next) => any`.
//   The 2-arg wrapper below matches Vercel's expected signature and
//   leaves `next` undefined — Express handles a missing `next` as
//   "no further middleware", which is the normal case anyway.
//
//   The `vercel.json` rewrite `{ "source": "/api/:path*", "destination":
//   "/api/index" }` explicitly routes every `/api/...` request to this
//   function, beating the catch-all SPA rewrite (which would otherwise
//   send POST requests to index.html and cause a 405).
//
// The Stripe webhook is still correctly handled — Express's
// `express.raw({ type: "application/json" })` middleware on the
// `/api/payments/webhook` route receives the raw body before any
// JSON parsing, so signature verification still works.
// ===============================

import app from "../server/server.js";

// 2-arg wrapper matches Vercel's expected (req, res) handler signature.
export default (req, res) => app(req, res);
