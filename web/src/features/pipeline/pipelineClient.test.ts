/**
 * T1–T9 — the pipeline client's pure reducers + latency probe (PR-8 slice S1).
 *
 * Authored by Claude; the implementer must NOT modify this file (DREP §10). Every oracle here
 * is written to fail a plausible-but-wrong implementation, per the Codex adversarial pass:
 * a median latency impl (T4), a counter-only rate impl ignoring run-id (T3), a string-`raw`
 * assumption (T7), a "a path exists" chart oracle (T9), and a getJson-based probe (T6).
 */
import { describe, it, expect } from "vitest";

import { apiUrl } from "@/api/client";

import {
  buildChartPath,
  computeIngestRate,
  connectionKind,
  conservationHolds,
  latencySummary,
  probeLatency,
  toCsv,
} from "./pipelineClient";
import type { DlqItem, LatencyResult } from "./types";

// ── helpers ─────────────────────────────────────────────────────────────────────────
function res(over: Partial<LatencyResult> & { ok: boolean }): LatencyResult {
  return { path: "/x", roundTripMs: 0, dbMs: null, status: over.ok ? 200 : 500, ...over };
}

/** A minimal Response stand-in for probeLatency (only the surface it consumes). */
function mockResponse(opts: { status?: number; serverTiming?: string | null; body?: string }): Response {
  const status = opts.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === "server-timing" ? opts.serverTiming ?? null : null) },
    text: async () => opts.body ?? "{}",
  } as unknown as Response;
}

/** now() that returns t0 then t1 on successive calls. */
function clock(t0: number, t1: number): () => number {
  const seq = [t0, t1];
  let i = 0;
  return () => seq[Math.min(i++, seq.length - 1)];
}

// ── T1 ──────────────────────────────────────────────────────────────────────────────
describe("T1 connectionKind maps all states", () => {
  it("maps each backend state, disabled, and the unknown fallback", () => {
    expect(connectionKind("connected")).toBe("ok");
    expect(connectionKind("connecting")).toBe("pending");
    expect(connectionKind("subscribing")).toBe("pending"); // NOT ok — SUBACK not yet granted
    expect(connectionKind("disconnected")).toBe("down");
    expect(connectionKind("disabled")).toBe("disabled"); // distinct, not "unknown"
    expect(connectionKind("wat")).toBe("unknown");
  });
});

// ── T2 ──────────────────────────────────────────────────────────────────────────────
describe("T2 computeIngestRate — delta, first, dt", () => {
  it("derives msg/s from the counter delta over elapsed seconds", () => {
    expect(computeIngestRate({ received: 100, runId: "a", t: 1000 }, { received: 110, runId: "a", t: 2000 })).toBe(10);
    // A SECOND, different delta — proves derivation, not a constant 10.
    expect(computeIngestRate({ received: 110, runId: "a", t: 2000 }, { received: 170, runId: "a", t: 5000 })).toBe(20);
  });
  it("returns null for the first sample and for non-positive dt", () => {
    expect(computeIngestRate(null, { received: 5, runId: "a", t: 1000 })).toBeNull();
    expect(computeIngestRate({ received: 5, runId: "a", t: 2000 }, { received: 9, runId: "a", t: 2000 })).toBeNull();
  });
});

// ── T3 ──────────────────────────────────────────────────────────────────────────────
describe("T3 computeIngestRate — run-id reset never negative", () => {
  it("returns null on a run-id change (new process) rather than a cross-run delta", () => {
    // received is per-process; a restarted process can report a SMALLER count.
    expect(computeIngestRate({ received: 900, runId: "a", t: 1000 }, { received: 12, runId: "b", t: 2000 })).toBeNull();
  });
  it("returns null (not negative) when the counter goes backwards within a run", () => {
    expect(computeIngestRate({ received: 900, runId: "a", t: 1000 }, { received: 12, runId: "a", t: 2000 })).toBeNull();
  });
});

// ── T4 ──────────────────────────────────────────────────────────────────────────────
describe("T4 latencySummary — mean, inclusive budget, boundary", () => {
  it("uses the MEAN (not median) and an inclusive <=500 budget", () => {
    const s = latencySummary([res({ ok: true, roundTripMs: 100 }), res({ ok: true, roundTripMs: 200 }), res({ ok: true, roundTripMs: 600 })]);
    expect(s.meanMs).toBe(300); // median would be 200 — this distinguishes them
    expect(s.underBudget).toBe(true);
    expect(latencySummary([res({ ok: true, roundTripMs: 500 })]).underBudget).toBe(true); // exactly 500 is under
    expect(latencySummary([res({ ok: true, roundTripMs: 600 }), res({ ok: true, roundTripMs: 700 })]).underBudget).toBe(false);
  });
  it("returns a zeroed, not-under summary for no results", () => {
    expect(latencySummary([])).toMatchObject({ meanMs: 0, count: 0, underBudget: false });
  });
});

// ── T5 ──────────────────────────────────────────────────────────────────────────────
describe("T5 latencySummary — excludes failed calls", () => {
  it("averages successes only; a fast failure does not count as under budget", () => {
    const s = latencySummary([res({ ok: true, roundTripMs: 200, dbMs: 1.2 }), res({ ok: false, roundTripMs: 5, status: 404 })]);
    expect(s.meanMs).toBe(200); // the fast 404 is NOT averaged in
    expect(s.count).toBe(1);
    expect(s.failures).toBe(1);
    expect(s.dbMs).toBe(1.2);
    expect(s.underBudget).toBe(true);
  });
  it("is not under budget when every call failed", () => {
    const s = latencySummary([res({ ok: false, roundTripMs: 5 }), res({ ok: false, roundTripMs: 8 })]);
    expect(s.count).toBe(0);
    expect(s.failures).toBe(2);
    expect(s.underBudget).toBe(false);
  });
});

// ── T6 ──────────────────────────────────────────────────────────────────────────────
describe("T6 probeLatency — measures, parses, never throws (except abort)", () => {
  it("measures round-trip, parses a multi-entry Server-Timing, and requests apiUrl(path)", async () => {
    let calledUrl: string | URL = "";
    const fetchImpl = ((url: string | URL) => {
      calledUrl = url;
      return Promise.resolve(mockResponse({ status: 200, serverTiming: "cache;dur=2, db;dur=1.36" }));
    }) as unknown as typeof fetch;
    const r = await probeLatency("/api/telemetry/P-2/latest", { now: clock(0, 12), fetchImpl });
    expect(r).toMatchObject({ roundTripMs: 12, dbMs: 1.36, ok: true, status: 200 });
    expect(calledUrl).toBe(apiUrl("/api/telemetry/P-2/latest"));
  });
  it("returns ok:false with the round-trip measured on a non-2xx", async () => {
    const fetchImpl = (() => Promise.resolve(mockResponse({ status: 500 }))) as unknown as typeof fetch;
    const r = await probeLatency("/api/dlq", { now: clock(0, 9), fetchImpl });
    expect(r).toMatchObject({ ok: false, status: 500, roundTripMs: 9 });
  });
  it("returns ok:false status 0 on a transport rejection, without throwing", async () => {
    const fetchImpl = (() => Promise.reject(new TypeError("network"))) as unknown as typeof fetch;
    const r = await probeLatency("/api/dlq", { now: clock(0, 4), fetchImpl });
    expect(r).toMatchObject({ ok: false, status: 0 });
  });
  it("re-throws an AbortError so cancellation stays distinguishable", async () => {
    const fetchImpl = (() => Promise.reject(new DOMException("aborted", "AbortError"))) as unknown as typeof fetch;
    await expect(probeLatency("/api/dlq", { now: clock(0, 4), fetchImpl })).rejects.toMatchObject({ name: "AbortError" });
  });
});

// ── T7 ──────────────────────────────────────────────────────────────────────────────
describe("T7 toCsv — object raw, escaping, formula-guard", () => {
  const header = "message_id,run_id,asset_id,reason,raw";
  it("escapes commas/quotes, empties nulls, sorts raw keys deterministically", () => {
    const row: DlqItem = { message_id: "m2", run_id: null, asset_id: null, reason: 'a,b"c', raw: { b: 2, a: 1 } };
    const csv = toCsv([row]);
    const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
    expect(lines[0]).toBe(header);
    expect(lines.some((l) => l.startsWith("m2,,,"))).toBe(true); // null run_id + asset_id -> empty fields
    expect(csv).toContain('"a,b""c"'); // reason quoted, internal quote doubled
    expect(csv).toContain('{""a"":1,""b"":2}'); // raw serialised with SORTED keys, then CSV-escaped
  });
  it("guards CSV formula injection (incl. leading tab) and emits header-only for no rows", () => {
    const row: DlqItem = { message_id: "m3", run_id: "r", asset_id: "=cmd()", reason: "x", raw: {} };
    expect(toCsv([row])).toContain("'=cmd()"); // leading = neutralised with a single quote
    // a spreadsheet trims the leading tab and evaluates the formula after it — guard it too.
    const tabbed: DlqItem = { message_id: "m5", run_id: "r", asset_id: "A", reason: "\t=HYPERLINK(2)", raw: {} };
    expect(toCsv([tabbed])).toContain("'\t=HYPERLINK");
    expect(toCsv([]).split(/\r?\n/).filter((l) => l.length > 0)).toEqual([header]);
  });
  it("preserves NESTED raw keys with a deterministic deep sort", () => {
    // The DLQ raw envelope can be nested. A JSON.stringify array-replacer sort silently DROPS
    // nested keys; a deep sort must keep them. Deep-sorted: {"outer":{"x":3,"y":2},"z":1}.
    const row: DlqItem = { message_id: "m4", run_id: "r", asset_id: "A", reason: "x", raw: { z: 1, outer: { y: 2, x: 3 } } };
    const csv = toCsv([row]);
    expect(csv).toContain('""outer"":{""x"":3,""y"":2}'); // nested keys survive, sorted
    expect(csv).toContain('""z"":1');
  });
});

// ── T8 ──────────────────────────────────────────────────────────────────────────────
describe("T8 conservationHolds", () => {
  it("recomputes ledger === telemetry + dead_letter from a Pick (no `holds` needed)", () => {
    expect(conservationHolds({ ledger: 5, telemetry: 5, dead_letter: 0 })).toBe(true);
    expect(conservationHolds({ ledger: 5, telemetry: 4, dead_letter: 0 })).toBe(false);
  });
});

// ── T9 ──────────────────────────────────────────────────────────────────────────────
describe("T9 buildChartPath — single axis, exact geometry", () => {
  it("maps samples to exact polyline coordinates with one y-axis", () => {
    // dims: plot area x in [pad, w-pad]=[5,95], y in [pad, h-pad]=[5,45]; max=max(...,1)=10.
    // x_i = 5 + 90*i/(n-1); y_i = 45 - (v/10)*40  ->  (5,45)(50,25)(95,5)
    const g = buildChartPath([0, 5, 10], { w: 100, h: 50, pad: 5 });
    expect(g.max).toBe(10);
    expect(g.axis).toEqual({ x: 5, y0: 5, y1: 45 });
    expect(g.d).toBe("M5,45 L50,25 L95,5");
  });
  it("handles a single sample without NaN and an empty series with an empty path", () => {
    expect(buildChartPath([7], { w: 100, h: 50, pad: 5 }).d).toBe("M5,5"); // n=1 -> x at pad, y at top (v==max)
    expect(buildChartPath([], { w: 100, h: 50, pad: 5 })).toMatchObject({ d: "", max: 1 });
  });
});
