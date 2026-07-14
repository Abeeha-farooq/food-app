// server.js
// ===============================
// Purpose: Entry point — starts the whole server.
// ===============================

// 1) Load env vars FIRST. dotenv reads .env and puts values into process.env.
//    Must be at the very top, before any code that uses process.env.
import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import restaurantRoutes from "./routes/restaurant.route.js";
import orderRoutes from "./routes/order.route.js";
import adminRoutes from "./routes/admin.route.js";
import ApiError from "./utils/apiError.js";

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// GLOBAL MIDDLEWARE (runs on EVERY request)
// ============================================================

// CORS — allow our frontend to talk to this backend
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,    // allow cookies to be sent
  })
);

// IMPORTANT: Stripe webhook must receive the RAW request body
// (signature verification fails on parsed JSON). We mount it BEFORE
// the json() middleware so the body stream is still intact.
import paymentRoutes from "./routes/payment.route.js";
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
// START THE SERVER
// ============================================================

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

start();
