/**
 * Typed contracts for the Predictive Analytics panel (PR-9, topic ๓, Stitch S10).
 *
 * These mirror the VERIFIED backend JSON in `api/app/models.py` (the predictive responses)
 * and the new `GET /api/model` card (slice S9-A, docs/DREP-PR9-PR17.md §4). Every value the
 * model produces is SIMULATED and carries `simulated: true` on the wire — the UI must render a
 * `SimulatedBadge` beside it, never strip the marker.
 *
 * `HealthStatus` is deliberately the SAME set as `StatusChip`'s `StatusKind`, so a device's
 * server-side status maps straight onto the shared status component (icon + Thai label + colour)
 * with no re-derivation that could disagree with the model.
 */

import type { StatusKind } from "@/components/StatusChip";

/** Server-side health status; identical set to StatusChip's StatusKind (never colour-alone). */
export type HealthStatus = StatusKind;

/** The five observable signals the model scores on (mirrors `pwa_ml.lifecycle.SIGNAL_FIELDS`). */
export type Signal =
  | "pressure_bar"
  | "flow_m3h"
  | "power_kw"
  | "vibration"
  | "bearing_temp_c";

/** A technician's verdict on a prediction (mirrors `models.Verdict` + the DB CHECK constraint). */
export type Verdict = "confirmed" | "false_alarm" | "repaired" | "deferred";

/** One signal's share of a health prediction, for THIS window (item 3.6). */
export interface SignalContribution {
  readonly signal: Signal;
  /** Positive means the signal is pushing health DOWN relative to a nominal device. */
  readonly contribution: number;
}

/** One row of the risk-ranked worklist — GET /api/worklist (item 3.5). */
export interface WorklistItem {
  readonly rank: number;
  readonly asset_id: string;
  readonly branch: string | null;
  readonly health_score: number;
  readonly pttf_hours: number | null;
  readonly status: HealthStatus;
  readonly model_version: string;
  readonly scored_at: string;
  readonly simulated: boolean;
}

/** GET /api/health/{asset_id} — per-device health, PTTF and RCA (items 3.3/3.6). */
export interface HealthResponse {
  readonly asset_id: string;
  readonly status: HealthStatus;
  readonly health_score: number | null;
  readonly pttf_hours: number | null;
  readonly pttf_out_of_range: boolean | null;
  readonly model_version: string | null;
  readonly observed_at: string | null;
  readonly scored_at: string | null;
  readonly contributions: readonly SignalContribution[];
  readonly simulated: boolean;
  /** Why the asset is unscoreable, when it is. Absent on a successful score. */
  readonly detail: string | null;
}

/** GET /api/rca/{asset_id} — ranked contributing signals (item 3.6). */
export interface RcaResponse {
  readonly asset_id: string;
  readonly model_version: string | null;
  readonly observed_at: string | null;
  /** Ranked by |contribution|, largest first. Empty only when unscoreable. */
  readonly contributions: readonly SignalContribution[];
  readonly simulated: boolean;
  readonly detail: string | null;
}

/** POST /api/feedback request body (item 3.4). Only asset_id + verdict are required. */
export interface FeedbackRequest {
  readonly asset_id: string;
  readonly verdict: Verdict;
  readonly note?: string | null;
  readonly submitted_by?: string | null;
  readonly predicted_health?: number | null;
  readonly predicted_pttf_hours?: number | null;
  readonly model_version?: string | null;
}

/** POST /api/feedback response — proof the row was PERSISTED (item 3.4). */
export interface FeedbackAck {
  readonly id: number;
  readonly asset_id: string;
  readonly verdict: Verdict;
  readonly created_at: string;
  readonly stored: boolean;
}

// ── GET /api/model — trained-model card + two-dataset A/B (items 3.1 / 3.2) ──────────────

/** One fitted estimator's public description (item 3.1). */
export interface EstimatorCard {
  readonly estimator_class: string;
  /** Serialisable `get_params()`; values are heterogeneous, hence `unknown`. */
  readonly hyperparameters: Readonly<Record<string, unknown>>;
  readonly target: string;
  readonly units: string;
  readonly preprocessing: readonly string[];
}

/** Held-out error of the model against a dummy baseline (item 3.1/3.2 evidence). */
export interface MetricPair {
  readonly model_mae: number;
  readonly baseline_mae: number;
}

/** Health + PTTF for one reserved demo lifecycle, scored through the shipped artifact (item 3.2). */
export interface DatasetScore {
  readonly name: string;
  readonly lifecycle_id: string;
  readonly health_score: number;
  readonly pttf_hours: number;
  /** True when PTTF is "at least this long" (censored/extrapolated) — must not read as exact. */
  readonly pttf_out_of_range: boolean;
  readonly status: HealthStatus;
}

/** GET /api/model — the whole card. Keyed maps use the target name (`health`, `pttf`). */
export interface ModelCardResponse {
  readonly model_version: string;
  readonly pipelines: Readonly<Record<string, EstimatorCard>>;
  readonly metrics: Readonly<Record<string, MetricPair>>;
  readonly data_sha256: string;
  /** SHA-256 of the loaded `model.pkl` bytes — recomputable with `sha256sum` (item 3.1). */
  readonly artifact_sha256: string;
  readonly created_from: Readonly<Record<string, number>>;
  readonly censoring: Readonly<Record<string, unknown>>;
  readonly limitations: readonly string[];
  /** [healthy, degraded], scored live through the loaded artifact (item 3.2). */
  readonly datasets: readonly DatasetScore[];
  readonly simulated: boolean;
}

// ── view-model shapes produced by the pure reducers (predictiveClient) ──────────────────

/** KPI-row aggregates derived from the worklist. `avgHealth` is null on an empty list, never NaN. */
export interface WorklistKpis {
  readonly atRisk: number;
  readonly avgHealth: number | null;
  readonly pttfUnder: number;
  readonly total: number;
}

/** One horizontal RCA bar: a signal, its signed contribution, and a 0–100 width. */
export interface RcaBar {
  readonly signal: Signal;
  readonly contribution: number;
  readonly widthPct: number;
}

/** Output of `rcaBars`: bars in the API's ranked order + the scale ceiling. ONE axis only. */
export interface RcaGeometry {
  readonly bars: readonly RcaBar[];
  readonly maxAbs: number;
}
