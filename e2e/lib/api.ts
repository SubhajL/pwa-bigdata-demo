/**
 * Helpers the E2E specs share: direct API reads, scenario control (via the demo scripts / compose),
 * and a poll-until. The scenario controls shell out to Docker, so a spec never fakes state — it
 * drives the same mechanism a judge would.
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const API_BASE = process.env.API_BASE ?? "http://localhost:8000";
export const WEB_BASE = process.env.WEB_BASE ?? "http://localhost:5173";

/** Repo root (…/e2e/lib/api.ts → ../../). */
export const REPO = fileURLToPath(new URL("../..", import.meta.url));
const COMPOSE = `${REPO}/infra/docker-compose.yml`;

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
  execSync(`FAULT_MODE=${mode} docker compose -f "${COMPOSE}" up -d simulator`, { stdio: "ignore" });
}

/** Restart the MQTT broker (item 1.2 disconnect). */
export function restartBroker(): void {
  execSync(`docker compose -f "${COMPOSE}" restart mosquitto`, { stdio: "ignore" });
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

/** Parse the `db;dur=<ms>` metric out of a Server-Timing header value (item 1.3). */
export function dbDur(serverTiming: string | null): number | null {
  if (!serverTiming) return null;
  const m = serverTiming.match(/db;dur=([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}
