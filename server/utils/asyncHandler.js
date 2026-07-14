// utils/asyncHandler.js
// ===============================
// Purpose: Wrap async route handlers so we don't have to write
//          try/catch in every single one.
//
// Without this, every controller would need:
//   try { await someAsyncCall() } catch (err) { next(err) }
//
// With this, we just write normal async/await and any thrown
// error automatically gets passed to Express's error handler.
// ===============================

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;