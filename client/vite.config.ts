// vite.config.ts
// ===============================
// Purpose: Configure Vite (the dev server + build tool).
//          Adds a proxy so /api requests go to our backend.
// ===============================

import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Proxy = Vite secretly forwards certain requests to another server.
    // Why: Without this, calling /api/login would go to localhost:5173/api/login
    // which doesn't exist. With the proxy, Vite catches /api/* requests and
    // forwards them to our backend at localhost:5000 — the browser never knows.
    // This sidesteps CORS completely during development.
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
})