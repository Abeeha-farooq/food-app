// smoke-test.js
// ===============================
// Self-contained smoke test:
//   - Spawns the server as a child process
//   - Waits for it to start
//   - Hits a few endpoints with Node's built-in http module
//   - Reports pass/fail
//   - Always kills the child process at the end (even on failure)
// ===============================

import { spawn } from "child_process";
import http from "http";


const SERVER = "http://localhost:5000";

// --- helpers ----------------------------------------------------

// Tiny HTTP client using only Node's built-in `http` module
// (avoids needing axios/fetch installed)
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(SERVER + path);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { "Content-Type": "application/json", ...headers },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function log(emoji, label, info) {
  console.log(`${emoji}  ${label}${info ? "  →  " + info : ""}`);
}

// --- start server ------------------------------------------------

console.log("Starting server...\n");

const child = spawn("node", ["server.js"], {
  cwd: "D:\\food app\\server",
  env: { ...process.env, NODE_ENV: "development" },
  stdio: ["ignore", "pipe", "pipe"],
});

// capture startup output for debugging
let startupLog = "";
child.stdout.on("data", (d) => (startupLog += d.toString()));
child.stderr.on("data", (d) => (startupLog += d.toString()));

// wait for the server to actually accept HTTP requests
// (more reliable than parsing stdout, which spawn can buffer)
async function waitForServer(maxMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await request("GET", "/");
      if (res.status === 200) return true;
    } catch {
      // not ready yet — keep trying
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

let failed = false;
const randomEmail = `test_${Date.now()}@foodapp.test`;

try {
  const ready = await waitForServer();
  if (!ready) {
    console.error("❌ Server did not start in time. Output so far:");
    console.error(startupLog);
    failed = true;
  } else {
    log("🚀", "Server is up and accepting requests", "http://localhost:5000");

    // 1) Health check (root)
    const root = await request("GET", "/");
    log(root.status === 200 ? "✅" : "❌", `GET /`, `status ${root.status} • ${JSON.stringify(root.body)}`);

    // 2) Unknown route -> 404
    const notFound = await request("GET", "/api/does-not-exist");
    log(notFound.status === 404 ? "✅" : "❌", `GET /api/does-not-exist (expect 404)`, `status ${notFound.status}`);

    // 3) Signup
    const signup = await request("POST", "/api/auth/signup", {
      fullname: "Test User",
      email: randomEmail,
      password: "secret123",
      contact: "03001234567",
    });
    log(signup.status === 201 ? "✅" : "❌", `POST /api/auth/signup`, `status ${signup.status} • ${signup.body?.message || ""}`);

    // 4) Login with same creds
    const login = await request("POST", "/api/auth/login", {
      email: randomEmail,
      password: "secret123",
    });
    const token = login.body?.data?.token;
    log(login.status === 200 && token ? "✅" : "❌", `POST /api/auth/login`, `status ${login.status} • token ${token ? "received" : "MISSING"}`);

    // 5) /api/user/me with token
    if (token) {
      const me = await request("GET", "/api/user/me", null, { Authorization: `Bearer ${token}` });
      log(me.status === 200 ? "✅" : "❌", `GET /api/user/me (auth)`, `status ${me.status} • email ${me.body?.data?.email || "n/a"}`);
    } else {
      log("⏭️ ", "GET /api/user/me", "skipped (no token)");
    }

    // 6) /api/user/me WITHOUT token -> 401
    const meNoAuth = await request("GET", "/api/user/me");
    log(meNoAuth.status === 401 ? "✅" : "❌", `GET /api/user/me (no token, expect 401)`, `status ${meNoAuth.status}`);

    // 7) List restaurants (public, empty list is fine)
    const list = await request("GET", "/api/restaurants");
    log(list.status === 200 ? "✅" : "❌", `GET /api/restaurants`, `status ${list.status} • total ${list.body?.data?.total ?? "?"}`);

    // 8) Bad signup validation
    const bad = await request("POST", "/api/auth/signup", { email: "not-an-email", password: "1" });
    log(bad.status === 400 ? "✅" : "❌", `POST /api/auth/signup (bad input, expect 400)`, `status ${bad.status} • ${bad.body?.message || ""}`);
  }
} catch (err) {
  console.error("\n❌ Test crashed:", err.message);
  failed = true;
} finally {
  // ALWAYS kill the server, even if tests crashed
  child.kill("SIGTERM");
  // give it a moment to release the port
  await new Promise((r) => setTimeout(r, 500));
  if (!child.killed) child.kill("SIGKILL");
}

console.log("\n" + (failed ? "❌ SMOKE TEST FAILED" : "✅ SMOKE TEST COMPLETE"));
process.exit(failed ? 1 : 0);