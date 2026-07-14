// utils/apiError.js
// ===============================
// Purpose: A custom Error class that carries an HTTP status code.
//
// Why not just `throw new Error("User not found")`?
// Because then we don't know if it's a 400 (bad request), 404 (not found),
// or 500 (server error). This class lets us say "this is a 404 error"
// and the global error handler picks it up and sends the right status.
// ===============================

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);                          // standard Error message
    this.statusCode = statusCode;
    this.success = false;
    // Captures the line where this error was thrown (for debugging)
    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;