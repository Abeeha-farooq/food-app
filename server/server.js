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

import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import restaurantRoutes from "./routes/restaurant.route.js";
import orderRoutes from "./routes/order.route.js";
import adminRoutes from "./routes/admin.route.js";
import paymentRoutes from "./routes/payment.route.js";
import ApiError from "./utils/apiError.js";

const app = express();
const PORT = process.env.PORT || 5000;

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
  // === DEBUG LOGGING (delete after 504 is fixed) ===
  const reqStart = Date.now();
  console.log(`[mw] ${req.method} ${req.path} — entering connectDB middleware`);
  // === END DEBUG LOGGING ===

  // Health check — Vercel pings this for cold-start detection
  if (req.path === "/" && req.method === "GET") return next();
  // Stripe webhook — must receive the raw body for signature verification
  if (req.path === "/api/payments/webhook" && req.method === "POST") return next();
  try {
    await connectDB();
    // === DEBUG LOGGING ===
    console.log(`[mw] ${req.method} ${req.path} — connectDB done in ${Date.now() - reqStart}ms, calling next()`);
    // === END DEBUG LOGGING ===
    next();
  } catch (err) {
    // === DEBUG LOGGING ===
    console.error(`[mw] ${req.method} ${req.path} — connectDB THREW after ${Date.now() - reqStart}ms: ${err.message}`);
    // === END DEBUG LOGGING ===
    next(err);
  }
});

// ============================================================
// GLOBAL MIDDLEWARE
// ============================================================

// CORS — only matters in dev (localhost) and on Vercel preview deploys
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

// IMPORTANT: Stripe webhook must receive the RAW request body
// (signature verification fails on parsed JSON). We mount it BEFORE
// the json() middleware so the body stream is still intact.
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentRoutes
);

// Parse JSON request bodies (req.body becomes an object, not raw text)
app.use(express.json({ limit: "16kb" }));

// Parse URL-encoded form data (rare, but nice to have)
app.use(express.urlencoded({ extended: true }));

// Parse cookies (req.cookies becomes an object)
app.use(cookieParser());

// Simple request logger — useful while developing
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

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentRoutes);

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
