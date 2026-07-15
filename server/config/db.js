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
  // === DEBUG LOGGING (delete after 504 is fixed) ===
  const startTime = Date.now();
  console.log(
    `[db] connectDB called | MONGO_URI set: ${Boolean(process.env.MONGO_URI)} | ` +
    `MONGO_URI prefix: ${process.env.MONGO_URI?.slice(0, 30)}... | ` +
    `cached.conn: ${Boolean(cached.conn)} | cached.promise: ${Boolean(cached.promise)}`
  );
  // === END DEBUG LOGGING ===

  // If we already have a live connection, reuse it
  if (cached.conn) {
    console.log(`[db] reusing cached connection (saved ${Date.now() - startTime}ms)`);
    return cached.conn;
  }

  // If a connection attempt is already in flight (rare race), wait for it
  if (!cached.promise) {
    if (!process.env.MONGO_URI) {
      console.error("[db] FATAL: MONGO_URI env var is missing");
      throw new Error("MONGO_URI env var is not set");
    }
    console.log("[db] starting new mongoose.connect()...");
    const connectStart = Date.now();
    cached.promise = mongoose
      .connect(process.env.MONGO_URI, {
        // Cap the connection attempt at 8 seconds — Vercel gives us 10s
        // total, so we want to fail fast and let the function return
        // a proper error instead of timing out.
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
      })
      .then((m) => {
        console.log(`[db] mongoose.connect resolved in ${Date.now() - connectStart}ms`);
        return m.connection;
      });
  } else {
    console.log("[db] connection already in flight, waiting for existing promise");
  }

  try {
    cached.conn = await cached.promise;
    console.log(
      `[db] MongoDB connected in ${Date.now() - startTime}ms: ${cached.conn.host}/${cached.conn.name}`
    );
    return cached.conn;
  } catch (error) {
    // Reset the promise so the next call can retry with a fresh attempt.
    cached.promise = null;
    console.error(
      `[db] MongoDB connection FAILED in ${Date.now() - startTime}ms: ${error.message}`
    );
    console.error(`[db] Error name: ${error.name}`);
    throw error;
  }
};

export default connectDB;
