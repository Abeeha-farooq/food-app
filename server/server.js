// server.js
// ===============================
// Purpose: Build the Express app. Works in BOTH:
//   - Traditional long-running Node server (dev / `npm start`)
//   - Vercel serverless function (production)
//
// In dev, this file calls `app.listen(PORT)` directly.
// In production on Vercel, the `api/index.js` shim imports `app` from here
// and hands it to Vercel's serverless runtime — `start()` is never called.
// ===============================

// 1) Load env vars FIRST. dotenv reads .env and puts values into process.env.
//    On Vercel, env vars come from the dashboard, so this is a no-op there
//    (Vercel never has a .env file at runtime).
import "dotenv/config";
import { pathToFileURL } from "node:url";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { authLimiter, authVerifyLimiter, generalLimiter } from "./utils/rateLimiter.js";

import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import restaurantRoutes from "./routes/restaurant.route.js";
import orderRoutes from "./routes/order.route.js";
import adminRoutes from "./routes/admin.route.js";
import paymentRoutes from "./routes/payment.route.js";
import couponRoutes from "./routes/coupon.route.js";
import riderRoutes from "./routes/rider.route.js";
import ApiError from "./utils/apiError.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Tell Express to trust the X-Forwarded-* headers from the Vercel
// proxy. Required for express-rate-limit to see the real client IP
// instead of the proxy's IP (which would lump every user behind the
// proxy into one bucket and break rate limiting).
// `1` = trust the FIRST hop (Vercel's edge). NOT `true` — trusting
// all hops would let clients spoof their IP via headers.
app.set("trust proxy", 1);

// ============================================================
// MIDDLEWARE: connect to MongoDB before every request
// ============================================================
// In a traditional server, we'd connect ONCE at startup. In serverless,
// each invocation may be a fresh container, so we connect LAZILY on
// each request. The connection is cached on `global` (see config/db.js)
// so the actual TCP handshake only happens once per container.
//
// We skip this for the Stripe webhook (it doesn't need DB and we want
// the request body to be a raw stream, not parsed) and the root health
// check. We do this by mounting connectDB AFTER those routes, below.
app.use(async (req, res, next) => {
  // Health check — Vercel pings this for cold-start detection
  if (req.path === "/" && req.method === "GET") return next();
  // Stripe webhook — must receive the raw body for signature verification
  if (req.path === "/api/payments/webhook" && req.method === "POST") return next();
  // PayPal webhook — same reason
  if (req.path === "/api/payments/paypal/webhook" && req.method === "POST") return next();
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GLOBAL MIDDLEWARE
// ============================================================
// The middleware below runs in this fixed order on EVERY request:
//   1. helmet          — security response headers (very first, so
//                        they're present on 404s, errors, CORS
//                        preflights — every response, no exceptions)
//   2. cors            — cross-origin checks (only matters in dev
//                        and Vercel preview deploys; same-origin in
//                        production)
//   3. webhooks        — Stripe + PayPal need the raw body for
//                        signature verification, so they're mounted
//                        BEFORE express.json() below
//   4. express.json    — parse JSON request bodies (16kb limit)
//   5. express.urlencoded
//   6. cookieParser    — parse cookies (JWT lives in an httpOnly cookie)
//   7. request logger  — development aid; remove or quiet in prod

// ----- 1. Helmet: security response headers -----
// Helmet sets sane defaults: X-Content-Type-Options: nosniff,
// X-Frame-Options: SAMEORIGIN, Strict-Transport-Security (in prod),
// Referrer-Policy, etc. We disable CSP (no useful default for an
// API server — the SPA is hosted separately and has its own CSP
// if needed) and keep the rest of the defaults intact.
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// ----- 2. CORS -----
// Only matters in dev (localhost) and on Vercel preview deploys
// (where the frontend and API live on the same domain, CORS is a no-op).
// In production on a single Vercel project, both the client and the API
// share the same origin (https://yourapp.vercel.app) so CORS does nothing.
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin / curl / no-origin requests (e.g. Stripe
      // webhook receivers, server-to-server) by passing no origin.
      if (!origin) return callback(null, true);

      // Allow if explicitly listed
      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Allow all Vercel preview URLs of this project
      // (e.g. https://foodapp-git-feature-xyz.vercel.app)
      try {
        const host = new URL(origin).host;
        if (host.endsWith(".vercel.app")) return callback(null, true);
      } catch {
        // not a valid URL — fall through
      }

      // Otherwise: reject
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,    // allow cookies (JWT) to be sent
  })
);

// ----- 3. Webhook raw-body handlers -----
// IMPORTANT: Stripe and PayPal webhooks must receive the RAW request
// body (signature verification fails on parsed JSON). We mount them
// BEFORE the json() middleware so the body stream is still intact.
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentRoutes
);
app.post(
  "/api/payments/paypal/webhook",
  express.raw({ type: "application/json" }),
  paymentRoutes
);

// ----- 4. JSON body parser -----
// Parse JSON request bodies (req.body becomes an object, not raw text).
//
// `limit: "5mb"` — this used to be "16kb", which silently broke
// any image upload (menu item photos are sent as base64 data
// URLs inside the JSON body, and base64 inflates a 2 MB photo
// to ~2.7 MB). The 16 kb limit was originally chosen to defend
// against malicious giant payloads, but the practical effect
// was to 413 every real image upload.
//
// We now allow up to 5 MB per request, which:
//   - Comfortably fits a compressed menu photo (~200-400 KB
//     after client-side resize — see client/src/lib/imageCompress.ts)
//   - Still defends against runaway payloads (no legit endpoint
//     sends a 5 MB JSON body)
//
// IMPORTANT — Vercel's edge cap:
//   Vercel serverless functions have a 4.5 MB hard limit on
//   the request body. If a request exceeds that, Vercel's
//   edge returns 413 BEFORE the function is invoked. Our 5 MB
//   Express limit is intentionally ABOVE 4.5 MB so that we
//   don't get a confusing "413 from inside Express" — instead,
//   anything over 4.5 MB gets a clean 413 from Vercel, and
//   anything under 4.5 MB (the typical case) is accepted by
//   Express.
//
// For larger uploads (raw files in the tens of MB), move to
// direct-to-storage (S3 / Cloudinary / UploadThing) — those
// don't go through the serverless function body at all.
app.use(express.json({ limit: "5mb" }));

// ----- 5. URL-encoded form data -----
// Parse URL-encoded form data (rare, but nice to have)
app.use(express.urlencoded({ extended: true }));

// ----- 6. Cookies -----
// Parse cookies (req.cookies becomes an object)
app.use(cookieParser());

// ----- 7. Request logger (dev aid) -----
// Simple request logger — useful while developing. In serverless prod
// (Vercel), every request shows up in the function logs anyway, so
// the duplicate line here mostly helps local dev.
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method}  ${req.originalUrl}`);
  next();
});

// ============================================================
// ROUTES — group by feature
// ============================================================

app.get("/", (_req, res) => {
  res.json({ message: "FoodApp API is running 🚀" });
});

// ============================================================
// ROUTES — group by feature
// ============================================================
// Rate-limiter application order:
//   1. /api/auth       — authLimiter (10/15min, broader bucket)
//   2. (verify-email,
//      verify-reset-otp,
//      reset-password)  — authVerifyLimiter (5/15min, tighter for OTP)
//   3. everything else — generalLimiter (100/15min, global safety net)
//
// The auth route uses authLimiter as the default for its endpoints,
// but authVerifyLimiter is mounted INSIDE auth.route.js on the
// specific verify-* / reset-* paths (where the OTP-attack surface
// is highest). Both limiters share the same 429 JSON shape so the
// client gets a consistent error.

app.use("/api/auth", authLimiter, authRoutes);
app.use(generalLimiter);   // applies to every route mounted AFTER this
app.use("/api/user", userRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/rider", riderRoutes);

// 404 — no route matched
app.use((req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
});

// ============================================================
// GLOBAL ERROR HANDLER
// (Express knows this is an error handler because it has 4 params)
// ============================================================

app.use((err, _req, res, _next) => {
  // Default to 500 if no status code was set
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  // In development, also send the stack trace so you can debug
  const response = {
    success: false,
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  };

  // Log server-side errors loudly
  if (statusCode >= 500) {
    console.error(" SERVER ERROR:", err);
  }

  res.status(statusCode).json(response);
});

// ============================================================
// EXPORT THE APP
// ============================================================
// Vercel imports this and hands it to the serverless runtime.
// Dev (`npm run dev`) imports this AND calls `start()` below.
export default app;

// ============================================================
// START THE SERVER (dev only)
// ============================================================
// `require.main === module` is true only when this file is run directly
// (node server.js). When it's imported (e.g. by api/index.js on Vercel),
// this block is skipped. This lets the same file work in both modes.

const start = async () => {
  try {
    // Open the DB connection FIRST. If it fails, the function throws and we exit.
    await connectDB();

    app.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`   Allow CORS from: ${process.env.CLIENT_URL || "http://localhost:5173"}\n`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

// Detect "run directly" vs "imported as module".
// We use pathToFileURL so Windows backslashes are handled correctly.
// Wrapped in try/catch because process.argv[1] is undefined when this
// file is loaded via `node -e "..."` or some test runners.
const isMainModule = (() => {
  try {
    return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  start();
}
