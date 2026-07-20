// config/db.js
// ===============================
// Purpose: Open the connection to MongoDB and CACHE it for reuse.
//
// Why caching matters on Vercel serverless:
//   - Each serverless invocation may use a fresh container
//   - Opening a Mongoose connection takes 200-500ms (TCP + handshake + auth)
//   - We cache the connection on `global` so the same container reuses it
//   - When the container is destroyed (idle), the cache dies with it
//     and the next invocation re-connects cleanly
// ===============================

import mongoose from "mongoose";

/**
 * Cache the Mongoose connection across invocations of this serverless
 * function instance. We attach it to `global` (which is the same object
 * for every code module within a single Node process) so subsequent
 * imports of this file get the same connection back.
 */
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

/**
 * Connect to MongoDB using the connection string from .env (MONGO_URI).
 * Returns the cached connection on subsequent calls.
 *
 * Behavior:
 *   - First call: opens a new connection, caches it, returns it
 *   - Subsequent calls (in the same container): returns the cached connection
 *   - On failure: throws (does NOT call process.exit — in serverless that
 *     would kill the function instance and prevent retries)
 */
const connectDB = async () => {
  // If we already have a live connection, reuse it
  if (cached.conn) {
    return cached.conn;
  }

  // If a connection attempt is already in flight (rare race), wait for it
  if (!cached.promise) {
    if (!process.env.MONGODB_URI) {
      console.error("[db] FATAL: MONGODB_URI env var is missing");
      throw new Error("MONGODB_URI env var is not set");
    }
    cached.promise = mongoose
      .connect(process.env.MONGODB_URI, {
        // Cap the connection attempt at 8 seconds — Vercel gives us 10s
        // total, so we want to fail fast and let the function return
        // a proper error instead of timing out.
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
      })
      .then((m) => m.connection);
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    // Reset the promise so the next call can retry with a fresh attempt.
    cached.promise = null;
    console.error(`[db] MongoDB connection FAILED: ${error.message}`);
    throw error;
  }
};

export default connectDB;
