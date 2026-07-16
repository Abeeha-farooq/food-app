// api/seed.js
// ===============================
// Purpose: One-time seed endpoint for the production database.
//          Run via: POST /api/seed?secret=YOUR_SECRET
//          DELETE this file after the prod DB is seeded.
// ===============================

import { execSync } from "node:child_process";

export default async (req, res) => {
  // Protect with a secret query param so random people can't trigger it
  if (req.query.secret !== process.env.SEED_SECRET) {
    return res.status(403).json({ message: "forbidden" });
  }

  try {
    console.log("[seed] starting prod DB seed...");
    // Vercel bundles api/server/* so we can run seed.js from there
    const output = execSync("cd /var/task/api/server && node seed.js", {
      env: { ...process.env, NODE_ENV: "production" },
      timeout: 25000, // Vercel's max function timeout is 10s for Hobby, 60s Pro.
    }).toString();
    console.log("[seed] output:", output);
    return res.json({ success: true, output });
  } catch (err) {
    console.error("[seed] FAILED:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
      stdout: err.stdout?.toString(),
      stderr: err.stderr?.toString(),
    });
  }
};
