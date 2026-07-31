/**
 * The predictive panel's read/write clients and pure reducers (PR-9, topic ๓).
 *
 * HTTP reuses PR-6's `getJson`. The reducers carry the load-bearing view logic and are
 * unit-tested without a DOM (predictiveClient.test.ts). All model outputs are SIMULATED.
 */
import { getJson } from "@/api/client";

import { PREDICTIVE_CONFIG } from "./predictive.config";
import type {
  FeedbackAck,
  FeedbackRequest,
  HealthResponse,
  HealthStatus,
  ModelCardResponse,
  RcaGeometry,
  RcaResponse,
  SignalContribution,
  WorklistItem,
  WorklistKpis,
} from "./types";

// ── HTTP clients ──────────────────────────────────────────────────────────────────────

export function fetchWorklist(
  limit: number = PREDICTIVE_CONFIG.worklistLimit,
  signal?: AbortSignal,
): Promise<WorklistItem[]> {
  return getJson<WorklistItem[]>(`/api/worklist?limit=${limit}`, { signal });
}

export function fetchHealth(asset: string, signal?: AbortSignal): Promise<HealthResponse> {
  return getJson<HealthResponse>(`/api/health/${encodeURIComponent(asset)}`, { signal });
}

export function fetchRca(asset: string, signal?: AbortSignal): Promise<RcaResponse> {
  return getJson<RcaResponse>(`/api/rca/${encodeURIComponent(asset)}`, { signal });
}

export function fetchModelCard(signal?: AbortSignal): Promise<ModelCardResponse> {
  return getJson<ModelCardResponse>("/api/model", { signal });
}

/**
 * POST a technician's verdict and return the persisted ack (item 3.4).
 *
 * Uses `getJson` with an explicit method/body/header: the real `getJson(path, init)` forwards
 * `RequestInit` untouched, so a JSON POST must serialise the body and set Content-Type itself.
 */
export function submitFeedback(req: FeedbackRequest, signal?: AbortSignal): Promise<FeedbackAck> {
  return getJson<FeedbackAck>("/api/feedback", {
    method: "POST",
    body: JSON.stringify(req),
    headers: { "Content-Type": "application/json" },
    signal,
  });
}

// ── pure reducers ─────────────────────────────────────────────────────────────────────

/**
 * KPI-row aggregates from the worklist. `avgHealth` is null (never NaN) on an empty list;
 * `atRisk` counts warning+critical only; `pttfUnder` counts rows whose PTTF is a known value
 * strictly below `pttfHoursThreshold` (a null PTTF is unknown, not "soon").
 */
export function kpiFromWorklist(
  items: readonly WorklistItem[],
  pttfHoursThreshold: number,
): WorklistKpis {
  const total = items.length;
  if (total === 0) return { atRisk: 0, avgHealth: null, pttfUnder: 0, total: 0 };
  let atRisk = 0;
  let pttfUnder = 0;
  let healthSum = 0;
  for (const it of items) {
    if (it.status === "warning" || it.status === "critical") atRisk += 1;
    if (it.pttf_hours != null && it.pttf_hours < pttfHoursThreshold) pttfUnder += 1;
    healthSum += it.health_score;
  }
  return { atRisk, avgHealth: healthSum / total, pttfUnder, total };
}

/**
 * Horizontal RCA bar geometry (item 3.6). Bars stay in the API's ranked order; each width is
 * `|contribution| / maxAbs * 100`, so the single largest magnitude fills the track — ONE shared
 * axis, magnitude by length, sign carried separately. `[]` → `{ bars: [], maxAbs: 1 }`.
 */
export function rcaBars(contributions: readonly SignalContribution[]): RcaGeometry {
  if (contributions.length === 0) return { bars: [], maxAbs: 1 };
  const maxAbs = Math.max(...contributions.map((c) => Math.abs(c.contribution)), Number.MIN_VALUE);
  const bars = contributions.map((c) => ({
    signal: c.signal,
    contribution: c.contribution,
    widthPct: Math.round((Math.abs(c.contribution) / maxAbs) * 100),
  }));
  return { bars, maxAbs };
}

/** Hours → days. `null` passes through, so an unknown PTTF never renders as "0 days". */
export function pttfDays(hours: number | null): number | null {
  return hours == null ? null : hours / 24;
}

/**
 * Band an AGGREGATE health value (e.g. the average-health KPI) the same way the model does —
 * `< CRITICAL` → critical, `< WARNING` → warning, else normal. Per-device status is taken from
 * the API and never routed through here.
 */
export function healthBand(health: number): HealthStatus {
  if (health < PREDICTIVE_CONFIG.healthCriticalBelow) return "critical";
  if (health < PREDICTIVE_CONFIG.healthWarningBelow) return "warning";
  return "normal";
}
