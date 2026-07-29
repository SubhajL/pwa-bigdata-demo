// App configuration (Codex 2.5: a config file + separated components).
export const APP_CONFIG = {
  /**
   * RELATIVE BY DEFAULT — this is the fix for the defect recorded in SESSION-HANDOFF §3.
   *
   * An empty base means every request is issued as `/api/...` against the page's own
   * origin, where the Vite dev proxy (`vite.config.ts`) forwards it to FastAPI. The
   * previous default of `http://localhost:8000` sent the browser cross-origin to an API
   * that had no CORS middleware, and sent the twin WebSocket to Vite rather than to
   * FastAPI — so nothing could connect at all.
   *
   * Set `VITE_API_BASE` only to bypass the proxy deliberately (e.g. a static `dist/`
   * build served from an origin other than the API's).
   */
  apiBase: import.meta.env.VITE_API_BASE ?? "",
  wsTwin: "/ws/twin",
  brand: "PWA Analytics",
  brandSub: "Big Data Platform",
} as const;
