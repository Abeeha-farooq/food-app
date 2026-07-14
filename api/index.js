// api/index.js
// ===============================
// Purpose: Vercel serverless entry point.
//
// Vercel looks for files in `/api/*` at the project root. This file
// imports the Express app we built in `server/server.js` and hands it
// to Vercel's serverless runtime. Every request to your Vercel URL that
// doesn't match a static asset gets routed here.
//
// Why this works:
//   - Vercel's serverless runtime supports Node's `req, res` pattern,
//     which is what Express expects.
//   - The Express app already handles all the routes (`/api/...`),
//     middleware, error handling, and DB connection caching.
//   - The `vercel.json` at the project root configures Vercel to build
//     the client AND treat this file as the serverless function.
//
// The Stripe webhook is still correctly handled — Express's
// `express.raw({ type: "application/json" })` middleware on the
// `/api/payments/webhook` route receives the raw body before any
// JSON parsing, so signature verification still works.
// ===============================

import app from "../server/server.js";

// Vercel expects a default export that is `(req, res) => any`.
// Express's `app` is itself such a function, so we can export it directly.
export default app;
