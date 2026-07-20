// api/handler.js
// ===============================
// Purpose: Vercel serverless entry point. Handles ALL /api/* requests
// via an explicit rewrite in vercel.json.
// ===============================

import app from "./server/server.js";

export default (req, res) => app(req, res);
