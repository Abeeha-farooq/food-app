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
    cached.promise = mongoose
      .connect(process.env.MONGO_URI)
      .then((m) => m.connection);
  }

  try {
    cached.conn = await cached.promise;
    console.log(
      ` MongoDB connected: ${cached.conn.host}/${cached.conn.name}`
    );
    return cached.conn;
  } catch (error) {
    // Reset the promise so the next call can retry with a fresh attempt.
    // (We do NOT process.exit — in serverless that would kill the container
    // and Vercel would return a generic 500 to the client.)
    cached.promise = null;
    console.error(` MongoDB connection error: ${error.message}`);
    throw error;
  }
};

export default connectDB;
