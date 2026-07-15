// api/handler.js
// ===============================
// Purpose: Vercel serverless entry point. Handles ALL /api/* requests
// via an explicit rewrite in vercel.json.
// ===============================

import app from "./server/server.js";

export default (req, res) => {
  // === TEMP DEBUG LOGGING (delete after 504 is fixed) ===
  const t0 = Date.now();
  console.log(
    `[handler] ENTER ${req.method} ${req.url} | ` +
    `MONGO_URI set=${Boolean(process.env.MONGO_URI)} | ` +
    `NODE_ENV=${process.env.NODE_ENV}`
  );

  // Wrap res.end to log when the function actually finishes responding
  const origEnd = res.end.bind(res);
  res.end = function (...args) {
    console.log(
      `[handler] EXIT  ${req.method} ${req.url} | ` +
      `status=${res.statusCode} | total=${Date.now() - t0}ms`
    );
    return origEnd(...args);
  };
  // === END DEBUG LOGGING ===

  return app(req, res);
};
