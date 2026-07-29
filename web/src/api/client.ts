/**
 * The HTTP/WebSocket seam between the browser and FastAPI.
 *
 * Everything here exists because the app ships a RELATIVE api base (`app.config.ts`) and
 * lets the Vite dev proxy decide where the API actually lives. These helpers are the only
 * place that decision is turned into a URL.
 */
import { APP_CONFIG } from "@/config/app.config";

/** A non-2xx response, or a transport failure (status 0). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`${status}: ${detail}`);
    this.name = "ApiError";
  }
}

/**
 * Resolve an HTTP URL for an API path.
 *
 * @param path must start with "/".
 * @param base "" (default) leaves the path relative, so the page's own origin serves it
 *   and the dev proxy forwards it. An absolute http(s) base is joined with exactly one
 *   "/" per boundary, PRESERVING any path prefix the base carries
 *   (`https://h/root` + `/api/x` -> `https://h/root/api/x`).
 * @throws TypeError when `path` has no leading "/", or when `base` is neither "" nor a
 *   parseable absolute http(s) URL, or when `base` carries credentials, a query or a
 *   fragment (silently dropping them would send requests somewhere unintended).
 */
function validateUrlBase(base: string): URL | null {
  if (base === "") return null;
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new TypeError(`base is not a parseable absolute URL: "${base}"`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new TypeError(`base must be http(s), got ${u.protocol}`);
  }
  if (u.username || u.password || u.search || u.hash) {
    throw new TypeError("base must not carry credentials, query, or fragment");
  }
  return u;
}

export function apiUrl(path: string, base: string = APP_CONFIG.apiBase): string {
  if (!path.startsWith("/")) {
    throw new TypeError(`path must start with "/", got "${path}"`);
  }
  const parsed = validateUrlBase(base);
  if (!parsed) return path;
  // Join preserving path prefix: strip trailing / on base path, keep leading / on path.
  const basePath = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${basePath}${path}`;
}

/**
 * Resolve an absolute WebSocket URL.
 *
 * @param path must start with "/".
 * @param base "" (default) derives host and scheme from `loc`; an absolute http(s) base
 *   has its scheme swapped to ws(s) and keeps its host and path prefix.
 * @param loc injected rather than read off the global so tests need no jsdom surgery.
 * @throws TypeError when `path` has no leading "/".
 * @throws TypeError when the page is https: but the resolved scheme would be ws:. We fail
 *   loudly instead of returning a URL the browser blocks as mixed content — a silently
 *   dead twin socket is the worst outcome for scored item 2.2, because the UI looks fine.
 */
export function wsUrl(
  path: string,
  base: string = APP_CONFIG.apiBase,
  loc: Pick<Location, "protocol" | "host"> = window.location,
): string {
  if (!path.startsWith("/")) {
    throw new TypeError(`path must start with "/", got "${path}"`);
  }
  if (base === "") {
    // Derive from loc.
    const pageSecure = loc.protocol === "https:";
    const scheme = pageSecure ? "wss:" : "ws:";
    return `${scheme}//${loc.host}${path}`;
  }
  const parsed = validateUrlBase(base)!;
  const wsScheme = parsed.protocol === "https:" ? "wss:" : "ws:";
  const pageSecure = loc.protocol === "https:";
  if (pageSecure && wsScheme === "ws:") {
    throw new TypeError("cannot emit ws: URL from an https: page (mixed content blocked)");
  }
  const basePath = parsed.pathname.replace(/\/+$/, "");
  return `${wsScheme}//${parsed.host}${basePath}${path}`;
}

/**
 * GET (or `init.method`) a path and parse JSON.
 *
 * @returns the parsed body on 2xx. A 204/empty body resolves `undefined`, so such callers
 *   must type `T` accordingly. `T` is a caller ASSERTION, not runtime validation — a JSON
 *   `null` is returned as-is.
 * @throws ApiError(status, detail) on a non-2xx, with `detail` normalised to a string
 *   from FastAPI's three shapes: a bare string, `{detail: string}`, and the 422 validation
 *   array.
 * @throws ApiError(0, message) on a transport failure.
 * @throws the original DOMException on abort, untouched, so a cancellation stays
 *   distinguishable from a failure.
 * @throws ApiError(status, "malformed JSON") when a 2xx body will not parse.
 */
async function parseApiError(response: Response): Promise<ApiError> {
  const detail = await extractDetail(response);
  return new ApiError(response.status, detail);
}

async function extractDetail(response: Response): Promise<string> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (typeof obj.detail === "string") return obj.detail;
    // FastAPI 422 validation array.
    if (Array.isArray(obj.detail)) {
      const parts = (obj.detail as Array<{ msg?: string }>)
        .map((d: { msg?: string }) => d.msg ?? "")
        .filter(Boolean);
      if (parts.length > 0) return parts.join("; ");
      return JSON.stringify(obj.detail);
    }
  }
  return `HTTP ${response.status}`;
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  // Resolved OUTSIDE the try on purpose. `apiUrl` throws TypeError for a malformed path
  // or a bad configured base — a programming/configuration error, not a transport one.
  // Inside the try it was being caught and re-reported as ApiError(0, …), which reads as
  // "the network failed" and sends a debugger looking in entirely the wrong place.
  const url = apiUrl(path);
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return Promise.reject(new ApiError(0, err instanceof Error ? err.message : String(err)));
  }
  if (!response.ok) {
    throw await parseApiError(response);
  }
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, "malformed JSON");
  }
}
