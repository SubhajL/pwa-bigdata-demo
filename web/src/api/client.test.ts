/**
 * T9 — relative API base and protocol-matched WebSocket URL (DREP-PR6 R12).
 *
 * This is the test for the defect SESSION-HANDOFF §3 records: a browser on :5173 was
 * sending the twin socket to Vite instead of FastAPI, and the API had no CORS middleware,
 * so nothing could connect at all.
 *
 * Authored by Claude; the implementer must not modify this file (DREP §10).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiUrl, getJson, wsUrl } from "@/api/client";

const AT_5173 = { protocol: "http:", host: "localhost:5173" } as const;
const SECURE = { protocol: "https:", host: "analytics.pwa.co.th" } as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiUrl", () => {
  it("leaves the path relative when called with NO base argument", () => {
    // Deliberately omits `base` so the PRODUCTION DEFAULT is what is under test. Passing
    // base="" explicitly would keep passing even if the default reverted to an absolute
    // URL — which is exactly the regression this guards.
    expect(apiUrl("/api/curated/months")).toBe("/api/curated/months");
  });

  it("joins an absolute base with exactly one slash", () => {
    expect(apiUrl("/api/x", "http://localhost:8000")).toBe("http://localhost:8000/api/x");
    expect(apiUrl("/api/x", "http://localhost:8000/")).toBe("http://localhost:8000/api/x");
  });

  it("preserves a path prefix on the base", () => {
    expect(apiUrl("/api/x", "https://h/root")).toBe("https://h/root/api/x");
  });

  it("rejects a path without a leading slash", () => {
    expect(() => apiUrl("api/x")).toThrow(TypeError);
  });

  it("rejects a base that is neither empty nor an absolute http(s) URL", () => {
    expect(() => apiUrl("/api/x", "localhost:8000")).toThrow(TypeError);
    expect(() => apiUrl("/api/x", "ftp://h")).toThrow(TypeError);
  });

  it("rejects a base carrying credentials, a query or a fragment", () => {
    // Silently dropping these would send requests somewhere the operator did not intend.
    expect(() => apiUrl("/api/x", "http://u:p@h")).toThrow(TypeError);
    expect(() => apiUrl("/api/x", "http://h?a=1")).toThrow(TypeError);
    expect(() => apiUrl("/api/x", "http://h#f")).toThrow(TypeError);
  });
});

describe("wsUrl", () => {
  it("derives ws:// from an http page when the base is relative", () => {
    expect(wsUrl("/ws/twin", "", AT_5173)).toBe("ws://localhost:5173/ws/twin");
  });

  it("derives wss:// from an https page", () => {
    // THE case that matters. An https page opening a ws: socket is blocked as mixed
    // content, the twin never updates, and the UI looks perfectly healthy while scored
    // item 2.2 silently fails.
    expect(wsUrl("/ws/twin", "", SECURE)).toBe("wss://analytics.pwa.co.th/ws/twin");
  });

  it("swaps the scheme of an absolute base", () => {
    expect(wsUrl("/ws/twin", "http://api:8000", AT_5173)).toBe("ws://api:8000/ws/twin");
    expect(wsUrl("/ws/twin", "https://api.example", SECURE)).toBe("wss://api.example/ws/twin");
  });

  it("throws rather than emit an insecure socket URL on a secure page", () => {
    // Failing loudly beats returning a URL the browser will refuse.
    expect(() => wsUrl("/ws/twin", "http://api:8000", SECURE)).toThrow(TypeError);
  });

  it("rejects a path without a leading slash", () => {
    expect(() => wsUrl("ws/twin", "", AT_5173)).toThrow(TypeError);
  });

  it("never returns an http(s) scheme", () => {
    for (const loc of [AT_5173, SECURE]) {
      expect(wsUrl("/ws/twin", "", loc)).toMatch(/^wss?:\/\//);
    }
  });
});

describe("getJson", () => {
  function stubFetch(response: Response | Promise<never>): ReturnType<typeof vi.fn> {
    const fn = vi.fn(() => (response instanceof Promise ? response : Promise.resolve(response)));
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("requests the relative URL and resolves the parsed body", async () => {
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ months: ["2025-12"] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(getJson<{ months: string[] }>("/api/curated/months")).resolves.toEqual({
      months: ["2025-12"],
    });
    // Asserts the exact URL actually issued, not merely that the helper returned a string.
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/curated/months");
  });

  it("fetches the URL apiUrl produced, honouring a configured absolute base", async () => {
    // Regression guard for a real defect: `getJson` called `fetch(path)` directly, so
    // `apiUrl()` was correct while every ACTUAL request ignored the configured base — a
    // static `dist/` deployment set up to bypass the Vite proxy would still call its own
    // origin and 404.
    //
    // The base has to be non-empty for the two to differ at all: with the shipped default
    // `apiUrl(p) === p`, so any assertion under it passes for the broken version too
    // (confirmed by mutation). Hence the module is re-imported over a mocked config.
    vi.resetModules();
    vi.doMock("@/config/app.config", () => ({
      APP_CONFIG: { apiBase: "http://api.test:8000", wsTwin: "/ws/twin", brand: "", brandSub: "" },
    }));
    // Parameters must be declared, or `mock.calls[0][0]` is a type error on an empty tuple.
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getJson: freshGetJson } = await import("@/api/client");
    await freshGetJson("/api/curated/months");

    expect(String(fetchMock.mock.calls[0][0])).toBe("http://api.test:8000/api/curated/months");
    vi.doUnmock("@/config/app.config");
    vi.resetModules();
  });

  it("raises ApiError with FastAPI's string detail", async () => {
    stubFetch(
      new Response(JSON.stringify({ detail: "ไม่พบข้อมูลของเดือนที่ระบุ" }), { status: 404 }),
    );
    await expect(getJson("/api/curated/national")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      detail: "ไม่พบข้อมูลของเดือนที่ระบุ",
    });
  });

  it("flattens FastAPI's 422 validation array into a string detail", async () => {
    stubFetch(
      new Response(
        JSON.stringify({ detail: [{ loc: ["query", "month"], msg: "invalid month" }] }),
        { status: 422 },
      ),
    );
    const err = await getJson("/api/curated/national").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(422);
    expect(typeof (err as ApiError).detail).toBe("string");
    expect((err as ApiError).detail).toContain("invalid month");
  });

  it("reports a transport failure as status 0", async () => {
    stubFetch(Promise.reject(new TypeError("Failed to fetch")));
    await expect(getJson("/api/x")).rejects.toMatchObject({ name: "ApiError", status: 0 });
  });

  it("re-throws an abort untouched so cancellation stays distinguishable", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    stubFetch(Promise.reject(abort));
    await expect(getJson("/api/x")).rejects.toBe(abort);
  });

  it("raises ApiError when a 2xx body will not parse", async () => {
    stubFetch(new Response("<html>not json</html>", { status: 200 }));
    await expect(getJson("/api/x")).rejects.toMatchObject({ status: 200, detail: "malformed JSON" });
  });

  it("resolves undefined for a 204", async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(getJson<void>("/api/x")).resolves.toBeUndefined();
  });
});
