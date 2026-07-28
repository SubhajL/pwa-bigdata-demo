// App configuration (Codex 2.5: a config file + separated components).
export const APP_CONFIG = {
  apiBase: import.meta.env.VITE_API_BASE ?? "http://localhost:8000",
  wsTwin: "/ws/twin",
  brand: "PWA Analytics",
} as const;
