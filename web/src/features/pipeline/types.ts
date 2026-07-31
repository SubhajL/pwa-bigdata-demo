/**
 * Typed contracts for the Data Pipeline & Quality monitor (PR-8, topic ๑).
 *
 * These mirror the VERIFIED backend JSON (see docs/DREP-PR8-pipeline.md §0). Two shapes are
 * load-bearing and were wrong in the first plan draft:
 *  - `PipelineStatus` is a DISCRIMINATED union on `state`: the route returns a minimal
 *    `{state:"disabled",detail}` with no counters when `MQTT_ENABLED=0`, distinct from the
 *    full enabled snapshot.
 *  - `DlqItem.raw` is an OBJECT (`dict[str,Any]` server-side, scalars wrapped as `{value}`),
 *    never a string — so it is typed `unknown` and serialised, never rendered raw.
 */

/** Subscriber connection state (backend `PipelineState`, ingest.py). */
export type PipelineState = "disconnected" | "connecting" | "subscribing" | "connected";

/** Visual bucket a pill maps a state (or "disabled") into. Never colour-alone at render. */
export type ConnectionKind = "ok" | "pending" | "down" | "disabled" | "unknown";

/** Message-conservation totals — DB-wide across ALL runs (pipeline.py:44), not this session. */
export interface Conservation {
  readonly ledger: number;
  readonly telemetry: number;
  readonly dead_letter: number;
  readonly holds: boolean;
}

/** The enabled subscriber snapshot (MQTT_ENABLED=1). `conservation` is absent when no DB pool. */
export interface EnabledStatus {
  readonly state: PipelineState;
  readonly granted_qos: number | null;
  readonly connected_count: number;
  readonly disconnect_count: number;
  readonly received: number;
  readonly overflowed: number;
  readonly unstored: number;
  readonly last_error: string | null;
  readonly queue_depth: number;
  readonly subscriber_run_id: string | null;
  readonly twin_subscribers: number;
  readonly twin_frames_dropped: number;
  readonly conservation?: Conservation;
}

/** The minimal disabled response (MQTT_ENABLED=0). */
export interface DisabledStatus {
  readonly state: "disabled";
  readonly detail: string;
}

/** GET /api/pipeline/status — discriminated on `state`. */
export type PipelineStatus = EnabledStatus | DisabledStatus;

/** One dead-letter row. `raw` is an object; `asset_id`/`run_id` may be null. */
export interface DlqItem {
  readonly message_id: string;
  readonly run_id: string | null;
  readonly asset_id: string | null;
  readonly reason: string;
  readonly raw: unknown;
}

/** GET /api/dlq — NOTE `count` is the current PAGE length, not the DLQ total. */
export interface DlqResponse {
  readonly count: number;
  readonly limit: number;
  readonly offset: number;
  readonly items: readonly DlqItem[];
}

/** One rolling ingest-rate sample. `runId` = subscriber_run_id; `t` = performance.now() ms. */
export interface IngestSample {
  readonly received: number;
  readonly runId: string;
  readonly t: number;
}

/** One measured latency probe result. */
export interface LatencyResult {
  readonly path: string;
  readonly roundTripMs: number;
  readonly dbMs: number | null;
  readonly ok: boolean;
  readonly status: number;
}

/** Aggregated latency for one endpoint (successful calls only). */
export interface LatencySummary {
  readonly path: string;
  readonly meanMs: number;
  readonly count: number;
  readonly failures: number;
  readonly dbMs: number | null;
  readonly underBudget: boolean;
}

/** One reading from the range endpoint (item 1.4 retrieval evidence). */
export interface RangeReading {
  readonly ts: string;
  readonly signal: string;
  readonly value: number;
  readonly run_id: string | null;
}

/** GET /api/telemetry/{asset}/range — readings ordered oldest-first. */
export interface RangeResponse {
  readonly asset_id: string;
  readonly window_minutes: number;
  readonly count: number;
  readonly simulated?: boolean;
  readonly readings: readonly RangeReading[];
}

/** Pixel box for the hand-rolled ingest-rate chart geometry. */
export interface ChartDims {
  readonly w: number;
  readonly h: number;
  readonly pad: number;
}

/** Output of `buildChartPath`: one polyline `d`, one y-axis, and the scale ceiling. */
export interface ChartGeometry {
  readonly d: string;
  readonly axis: { readonly x: number; readonly y0: number; readonly y1: number };
  readonly max: number;
}
