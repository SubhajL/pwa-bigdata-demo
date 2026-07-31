/**
 * The pipeline monitor's read clients and pure reducers (PR-8, slice S1).
 *
 * HTTP reads reuse PR-6's `getJson`. The latency PROBE deliberately does NOT: `getJson`
 * discards status/headers and throws on non-2xx, but item 1.3 needs the round-trip of a
 * FAILED call and the `Server-Timing` header, so `probeLatency` uses `fetch` directly via the
 * exported `apiUrl` resolver.
 *
 * The pure functions carry the load-bearing logic and are unit-tested without a DOM or a
 * socket (pipelineClient.test.ts). Contracts: docs/DREP-PR8-pipeline.md §4 (FN1–FN7).
 *
 * SEAMS (SL-2): signatures + types are fixed by the orchestrator; bodies are the implementer's
 * to fill. Do not change a signature — if one is wrong, STOP and report.
 */
import { apiUrl, getJson } from "@/api/client";

import { PIPELINE_CONFIG } from "./pipeline.config";
import type {
  ChartDims,
  ChartGeometry,
  Conservation,
  ConnectionKind,
  DlqItem,
  DlqResponse,
  IngestSample,
  LatencyResult,
  LatencySummary,
  PipelineStatus,
  RangeResponse,
} from "./types";

// ── HTTP clients ──────────────────────────────────────────────────────────────────────

// The three read wrappers are trivial getJson wiring (pre-done at SL-2). The load-bearing
// logic the delegate fills is the pure reducers + probeLatency below.
export function fetchPipelineStatus(signal?: AbortSignal): Promise<PipelineStatus> {
  return getJson<PipelineStatus>("/api/pipeline/status", { signal });
}

export function fetchDlq(
  limit: number = PIPELINE_CONFIG.dlqPageSize,
  offset = 0,
  signal?: AbortSignal,
): Promise<DlqResponse> {
  return getJson<DlqResponse>(`/api/dlq?limit=${limit}&offset=${offset}`, { signal });
}

export function fetchRange(
  asset: string = PIPELINE_CONFIG.rangeAsset,
  minutes: number = PIPELINE_CONFIG.rangeMinutes,
  signal?: AbortSignal,
): Promise<RangeResponse> {
  return getJson<RangeResponse>(
    `/api/telemetry/${encodeURIComponent(asset)}/range?minutes=${minutes}`,
    { signal },
  );
}

/** Options for {@link probeLatency}; `now`/`fetchImpl` injected so tests need no real clock/net. */
export interface ProbeOptions {
  readonly now?: () => number;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}

/**
 * Measure one GET's round-trip and its `Server-Timing` db portion (item 1.3).
 *
 * Uses `fetch(apiUrl(path))` directly (NOT getJson). Consumes the body so timing includes it.
 * Returns a LatencyResult for BOTH success and non-2xx (ok:false). A transport rejection →
 * {ok:false,status:0,...} — NEVER throws, EXCEPT an AbortError, which is re-thrown so a
 * cancellation stays distinguishable from a failed probe.
 */
export async function probeLatency(
  path: string,
  options: ProbeOptions = {},
): Promise<LatencyResult> {
  const url = apiUrl(path);
  const now = options.now ?? performance.now.bind(performance);
  const fetchImpl = options.fetchImpl ?? fetch;
  const t0 = now();
  try {
    const res = await fetchImpl(url, { signal: options.signal });
    await res.text();
    const t1 = now();
    const dbMs = parseDbMs(res.headers.get("Server-Timing"));
    return { path, roundTripMs: t1 - t0, dbMs, ok: res.ok, status: res.status };
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    const t1 = now();
    return { path, roundTripMs: t1 - t0, dbMs: null, ok: false, status: 0 };
  }
}

/** Parse the `db;dur=<number>` metric out of a Server-Timing header value. */
function parseDbMs(header: string | null): number | null {
  if (!header) return null;
  for (const entry of header.split(",")) {
    const trimmed = entry.trim();
    const semi = trimmed.indexOf(";");
    if (semi === -1) continue;
    const name = trimmed.slice(0, semi).trim();
    if (name !== "db") continue;
    const params = trimmed.slice(semi + 1);
    const durMatch = params.match(/dur=([\d.]+)/);
    if (durMatch) return parseFloat(durMatch[1]);
  }
  return null;
}

// ── pure reducers ─────────────────────────────────────────────────────────────────────

/**
 * msg/s between two samples, or null when it cannot be computed: no prev (first sample), a
 * different `runId` (the API process restarted — a cross-run delta is meaningless), a
 * non-positive dt, or a counter that went backwards within a run (defensive). Never negative.
 */
export function computeIngestRate(prev: IngestSample | null, curr: IngestSample): number | null {
  if (prev == null) return null;
  if (prev.runId !== curr.runId) return null;
  const dt = curr.t - prev.t;
  if (dt <= 0) return null;
  if (curr.received < prev.received) return null;
  return (curr.received - prev.received) / (dt / 1000);
}

/**
 * Aggregate one endpoint's probe results. Mean over SUCCESSFUL results only; failures counted
 * separately; `underBudget = count>0 && meanMs <= latencyBudgetMs` (INCLUSIVE). No successes →
 * {meanMs:0,count:0,underBudget:false} (unknown is not "under budget").
 */
export function latencySummary(results: readonly LatencyResult[]): LatencySummary {
  const ok = results.filter((r) => r.ok);
  const count = ok.length;
  const failures = results.length - count;
  const sum = ok.reduce((acc, r) => acc + r.roundTripMs, 0);
  const meanMs = count > 0 ? sum / count : 0;
  const dbMs = count > 0 ? ok[ok.length - 1].dbMs : null;
  const underBudget = count > 0 && meanMs <= PIPELINE_CONFIG.latencyBudgetMs;
  const path = results[0]?.path ?? "";
  return { path, meanMs, count, failures, dbMs, underBudget };
}

/** Map a status string to its visual bucket. Total function; never throws. */
export function connectionKind(state: string): ConnectionKind {
  switch (state) {
    case "connected":
      return "ok";
    case "connecting":
    case "subscribing":
      return "pending";
    case "disconnected":
      return "down";
    case "disabled":
      return "disabled";
    default:
      return "unknown";
  }
}

/** Recompute the conservation invariant client-side (proves it, rather than trusting `holds`). */
export function conservationHolds(
  c: Pick<Conservation, "ledger" | "telemetry" | "dead_letter">,
): boolean {
  return c.ledger === c.telemetry + c.dead_letter;
}

// A leading =,+,-,@ is a spreadsheet-formula vector; so is a LEADING TAB or CR that a spreadsheet
// trims before evaluating the formula after it (e.g. "\t=HYPERLINK(...)"). Guard all of them.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/** CSV-escape a single field: formula-guard first, then quote if needed. */
function escapeField(value: string): string {
  if (FORMULA_TRIGGER.test(value)) {
    value = "'" + value;
  }
  if (/[",\n\r]/.test(value)) {
    value = '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** Recursively sort object keys at every nesting level so JSON.stringify is deterministic. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** JSON.stringify with deterministically sorted keys at all nesting levels. */
function sortedJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

/**
 * Serialise DLQ rows to CSV. `raw` is JSON-stringified with SORTED keys (deterministic). Every
 * field is CSV-escaped; a field starting with = + - @ is prefixed with `'` (formula-injection
 * guard). Null asset_id/run_id → empty field. [] → header row only.
 */
export function toCsv(rows: readonly DlqItem[]): string {
  const header = "message_id,run_id,asset_id,reason,raw";
  if (rows.length === 0) return header;
  const body = rows.map((row) => {
    const fields = [
      row.message_id,
      row.run_id ?? "",
      row.asset_id ?? "",
      row.reason,
      sortedJson(row.raw),
    ];
    return fields.map(escapeField).join(",");
  });
  return [header, ...body].join("\n");
}

/**
 * Pure geometry for the ingest-rate chart: a single polyline `d` with one vertex per sample,
 * y scaled to [0, max] (max = Math.max(...samples, 1)), x evenly spaced across [pad, w-pad].
 * ONE y-axis only. [] → { d:"", ... }.
 */
export function buildChartPath(samples: readonly number[], dims: ChartDims): ChartGeometry {
  const { w, h, pad } = dims;
  const max = Math.max(...samples, 1);
  const axis = { x: pad, y0: pad, y1: h - pad };
  const n = samples.length;
  if (n === 0) return { d: "", axis, max };
  const plotW = w - 2 * pad;
  const plotH = h - 2 * pad;
  const yBase = h - pad;
  const verts = samples.map((v, i) => {
    const x = pad + plotW * (n === 1 ? 0 : i / (n - 1));
    const y = yBase - (v / max) * plotH;
    return `${x},${y}`;
  });
  return { d: "M" + verts[0] + (verts.length > 1 ? " L" + verts.slice(1).join(" L") : ""), axis, max };
}
