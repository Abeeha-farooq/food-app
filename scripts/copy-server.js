// scripts/copy-server.js
// ===============================
// Purpose: Copy the server source files into api/server/ so Vercel's
// function bundler can find them via a SAME-DIRECTORY relative import
// (./server/server.js) instead of a cross-directory import
// (../server/server.js).
//
// Why this is needed:
//   Vercel's function bundler bundles files in the /api directory and
//   follows their imports. Cross-directory imports (../something) often
//   cause the bundle to fail silently — the function then isn't deployed
//   at all, and every /api/* URL returns a 404 NOT_FOUND from Vercel.
//
// What this copies:
//   server/  →  api/server/
//   Skips node_modules, .env, and log files (those are env-specific
//   and come from the function's own /api install).
//
// What runs this:
//   The vercel.json "buildCommand" runs `node scripts/copy-server.js`
//   BEFORE `cd client && npm run build`. The output (api/server/) is
//   gitignored — it's a build artifact, not source.
// ===============================

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "server");
const DEST = path.join(ROOT, "api", "server");

// Names that should NEVER be copied (env-specific or huge).
const SKIP_NAMES = new Set([
  "node_modules",
  ".env",
  ".env.local",
  ".env.production",
  "backend.log",
  "backend-err.log",
  "server.log",
  "server.err.log",
  "dev.log",
  "dev.err.log",
  "frontend.log",
  "package-lock.json", // not needed in the bundle
]);

function shouldSkip(name) {
  return SKIP_NAMES.has(name) || name.endsWith(".log");
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Clean dest first so stale files don't linger from previous builds.
if (fs.existsSync(DEST)) {
  fs.rmSync(DEST, { recursive: true, force: true });
}

copyDir(SRC, DEST);
console.log(`[copy-server] ${SRC}  ->  ${DEST}`);
