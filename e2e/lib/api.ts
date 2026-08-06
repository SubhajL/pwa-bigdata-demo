/**
 * Helpers the E2E specs share: direct API reads, scenario control (via the demo scripts / compose),
 * and a poll-until. The scenario controls shell out to Docker, so a spec never fakes state — it
 * drives the same mechanism a judge would.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const API_BASE = process.env.API_BASE ?? "http://localhost:8000";
export const WEB_BASE = process.env.WEB_BASE ?? "http://localhost:5173";

/** Repo root (…/e2e/lib/api.ts → ../../). */
export const REPO = fileURLToPath(new URL("../..", import.meta.url));
export const COMPOSE_FILE_PATH = process.env.COMPOSE_FILE_PATH ?? `${REPO}/infra/docker-compose.yml`;
export const COMPOSE_PROJECT_NAME = process.env.COMPOSE_PROJECT_NAME ?? "pwa-demo";

export function composeArgs(...args: string[]): string[] {
  return ["compose", "--file", COMPOSE_FILE_PATH, "--project-name", COMPOSE_PROJECT_NAME, ...args];
}

function runCompose(args: string[], env: NodeJS.ProcessEnv = process.env): void {
  execFileSync("docker", composeArgs(...args), { stdio: "ignore", env });
}

export type FaultMode = "normal" | "anomaly" | "pressure_drop" | "bad_asset" | "malformed";

/**
 * fetch with a small retry. Node's undici keeps HTTP connections alive and occasionally reuses one
 * the server has closed ("other side closed"); a single retry with a fresh, non-keep-alive
 * connection turns that transient into a non-event without masking a real outage.
 */
async function robustFetch(url: string, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetch(url, { headers: { connection: "close" } });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw lastErr;
}

export async function apiJson<T = unknown>(path: string): Promise<T> {
  const res = await robustFetch(API_BASE + path);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export async function apiOk(path: string): Promise<boolean> {
  try {
    return (await robustFetch(API_BASE + path)).ok;
  } catch {
    return false;
  }
}

export async function webOk(path = "/"): Promise<boolean> {
  try {
    return (await robustFetch(WEB_BASE + path)).ok;
  } catch {
    return false;
  }
}

/** Recreate the simulator with a fault mode (the demo's real scenario mechanism). */
export function setFault(mode: FaultMode): void {
  runCompose(["up", "-d", "simulator"], { ...process.env, FAULT_MODE: mode });
}

// ── P0 demo-scenario API (the deterministic director; no docker round-trip) ──────────────

export type DemoMode = "anomaly" | "pressure_drop" | "bad_asset" | "normal" | "bearing_anomaly";

export interface DemoScenarioResult {
  run_id: string;
  mode: DemoMode;
  target: string;
  injected_readings: number;
  dead_letters: number;
  removed_rows: number;
  simulated: boolean;
}

/** POST /api/demo/scenario — inject a targeted scenario NOW (DEMO_CONTROLS=1 stacks only). */
export async function postScenario(mode: DemoMode, target = "P-2"): Promise<DemoScenarioResult> {
  const res = await fetch(`${API_BASE}/api/demo/scenario`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ mode, target }),
  });
  if (!res.ok) throw new Error(`POST /api/demo/scenario(${mode}) → ${res.status}`);
  return (await res.json()) as DemoScenarioResult;
}

/** GET /api/demo/scenario — {enabled, active_run_id}. */
export function demoStatus(): Promise<{ enabled: boolean; active_run_id: string | null }> {
  return apiJson("/api/demo/scenario");
}

// ── PR-J: Map Ta Phut low-pressure impact (read-only probes for the same-DOM journey) ──

export interface ImpactPreview {
  count: number;
  zone: string | null;
  type_breakdown: { type_1: number; type_2: number; type_3: number } | null;
  customers: Array<{ customer_id: string; account_no?: string | null; type_code?: number | null }>;
  simulated: boolean;
}

/** GET /api/twin/impact/{pipe_id} — enriched only when MTP_CUSTOMER_IMPACT_ENABLED=1. */
export function impactFor(pipeId: string): Promise<ImpactPreview> {
  return apiJson<ImpactPreview>(`/api/twin/impact/${encodeURIComponent(pipeId)}`);
}

export interface CustomerDetailProbe {
  customer_id: string;
  pressure_zone_id: string;
  readings: Array<{
    period: string;
    previous_reading_m3: number;
    reading_m3: number;
    usage_m3: number;
  }>;
  [k: string]: unknown;
}

/** GET /api/twin/customers/{id} — one SIMULATED account + its 12 readings (404 when the flag is off). */
export function customerDetail(customerId: string): Promise<CustomerDetailProbe> {
  return apiJson<CustomerDetailProbe>(`/api/twin/customers/${encodeURIComponent(customerId)}`);
}

/** GET /api/twin/gis/impact-zones — the SIMULATED low-pressure footprint GeoJSON. */
export function impactZones(): Promise<{ provenance: string; zone_id: string; features: unknown[] }> {
  return apiJson("/api/twin/gis/impact-zones");
}

/** Restart the MQTT broker (item 1.2 disconnect). */
export function restartBroker(): void {
  runCompose(["restart", "mosquitto"]);
}

/** Stop the MQTT broker — a controlled outage long enough to be judge-visible (item 1.2). */
export function stopBroker(): void {
  runCompose(["stop", "mosquitto"]);
}

/** Start the MQTT broker again after `stopBroker()` (idempotent when already up). */
export function startBroker(): void {
  runCompose(["start", "mosquitto"]);
}

export interface PipelineStatus {
  state: string;
  received: number;
  conservation?: { ledger: number; telemetry: number; dead_letter: number; holds: boolean };
  [k: string]: unknown;
}

export function pipelineStatus(): Promise<PipelineStatus> {
  return apiJson<PipelineStatus>("/api/pipeline/status");
}

/** The current DLQ total (all runs). */
export async function dlqTotal(): Promise<number> {
  const s = await pipelineStatus();
  return s.conservation?.dead_letter ?? 0;
}

export async function pollUntil(
  predicate: () => Promise<boolean> | boolean,
  { timeoutMs = 30_000, intervalMs = 1000, label = "condition" } = {},
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await predicate()) return;
    if (Date.now() - start >= timeoutMs) throw new Error(`timed out waiting for ${label} (${timeoutMs}ms)`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ── item 3.4: bounded feedback verification (PR-E) ───────────────────────────────────────
//
// There is deliberately no GET /api/feedback, so persistence is verified the way an
// operator's DBA would: a bounded, read-only count in the database, keyed on the marker
// note the test itself submitted. The cleanup deletes ONLY rows carrying that marker —
// the harness removes exactly the test feedback it persisted, nothing else.
//
// Injection surface (both review tiers): markers cross a shell AND a SQL boundary, so the
// command is argv-based (no shell string) and the marker must match a strict grammar
// BEFORE it is spliced into the SQL literal — a marker with a quote, backtick, or space
// is a harness bug and fails loudly here rather than broadening a DELETE.

const MARKER_GRAMMAR = /^[a-z0-9][a-z0-9-]{0,80}$/;

function feedbackSql(sql: string): string {
  return execFileSync(
    "docker",
    composeArgs(
      "exec", "-T", "timescaledb", "timeout", "8", "psql", "-U", "pwa", "-d", "pwa",
      "-tA", "-c", sql,
    ),
    { encoding: "utf8" },
  ).trim();
}

function assertMarker(note: string): void {
  if (!MARKER_GRAMMAR.test(note)) {
    throw new Error(`feedback marker ${JSON.stringify(note)} violates the harness grammar`);
  }
}

/** Rows in `feedback` whose note equals the marker (exact match, bounded probe). */
export function feedbackCountByNote(note: string): number {
  assertMarker(note);
  return Number(feedbackSql(`SELECT count(*) FROM feedback WHERE note = '${note}'`));
}

/** The persisted row's id for the marker note (or null) — proves the ack id IS a DB row. */
export function feedbackIdByNote(note: string): number | null {
  assertMarker(note);
  const out = feedbackSql(`SELECT id FROM feedback WHERE note = '${note}' ORDER BY id DESC LIMIT 1`);
  return out === "" ? null : Number(out);
}

/** Delete the harness's own persisted test feedback; returns the rows removed. */
export function deleteFeedbackByNote(note: string): number {
  assertMarker(note);
  return Number(
    feedbackSql(
      `WITH d AS (DELETE FROM feedback WHERE note = '${note}' RETURNING 1) SELECT count(*) FROM d`,
    ),
  );
}

/** Parse the `db;dur=<ms>` metric out of a Server-Timing header value (item 1.3). */
export function dbDur(serverTiming: string | null): number | null {
  if (!serverTiming) return null;
  const m = serverTiming.match(/db;dur=([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}
