import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
// From `vitest/config`, not `vite`: the plain vite `defineConfig` has no `test` key, so a
// triple-slash reference alone leaves `test` a type error under `tsc --noEmit`.
import { defineConfig } from "vitest/config";

/**
 * Where the dev server forwards `/api` and `/ws`.
 *
 * `http://localhost:8000` is right for a host-side `pnpm dev`; compose overrides it to
 * `http://api:8000`, which only resolves inside the compose network. Nothing else in the
 * app knows the API's address — `app.config.ts` ships a RELATIVE base precisely so this
 * proxy is the single place it is configured.
 */
const PROXY_TARGET = process.env.VITE_PROXY_TARGET ?? "http://localhost:8000";

export default defineConfig({
  // Tailwind before React so the generated stylesheet exists by the time JSX transforms
  // reference its classes.
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      // ABSOLUTE. A tsconfig `paths` entry configures the type-checker only — Vite and
      // vitest resolve through this alias, and a relative value would break depending on
      // the process's cwd.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      // Without these a browser on :5173 sends /api and /ws to VITE, not FastAPI, and
      // every request 404s against the dev server. Nothing could connect before this.
      "/api": { target: PROXY_TARGET, changeOrigin: true },
      // `ws: true` is what makes the twin socket (scored item 2.2) upgrade rather than
      // being served as a failed HTTP request.
      "/ws": { target: PROXY_TARGET, changeOrigin: true, ws: true },
      // Swagger UI (scored item 3.4) and its spec, so the predictive panel's "เปิด Swagger"
      // link reaches FastAPI from the web origin rather than 404ing against Vite.
      "/docs": { target: PROXY_TARGET, changeOrigin: true },
      "/openapi.json": { target: PROXY_TARGET, changeOrigin: true },
      "/redoc": { target: PROXY_TARGET, changeOrigin: true },
    },
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test-setup.ts"] },
});
