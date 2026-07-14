// config/db.js
// ===============================
// Purpose: Open the connection to MongoDB once, when the server starts.
// Every other file just imports "connectDB" and trusts that the connection is alive.
// ===============================

import mongoose from "mongoose";

/**
 * Connect to MongoDB using the connection string from .env (MONGO_URI).
 * If it fails, log the error and exit the process — there's no point starting
 * a server that can't reach its database.
 */
const connectDB = async () => {
  try {
    // mongoose.connect returns a promise. We wait for it with `await`.
    const conn = await mongoose.connect(process.env.MONGO_URI);

    console.log(` MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(` MongoDB connection error: ${error.message}`);
    // Exit with failure code 1. The `process.exit` ends the Node process entirely.
    // It's the right move here because the server is useless without the DB.
    process.exit(1);
  }
};

export default connectDB;