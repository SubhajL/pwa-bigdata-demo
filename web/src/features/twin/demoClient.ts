/**
 * The demo director's HTTP seam (P0). Types mirror `api/app/models.py` field-for-field.
 *
 * Every scenario is SIMULATED by construction — the endpoint exists only on a stack that
 * set `DEMO_CONTROLS=1`, and `fetchDemoStatus` is how the UI discovers that: anything
 * other than a well-formed `{enabled: true}` means the control must not render.
 */
import { getJson } from "@/api/client";

export type DemoMode = "anomaly" | "pressure_drop" | "bad_asset" | "normal";

export interface DemoStatus {
  readonly enabled: boolean;
  readonly active_run_id: string | null;
  readonly simulated: boolean;
}

export interface DemoScenarioResult {
  readonly run_id: string;
  readonly mode: DemoMode;
  readonly target: string;
  readonly injected_readings: number;
  readonly dead_letters: number;
  readonly removed_rows: number;
  readonly simulated: boolean;
}

export function fetchDemoStatus(): Promise<DemoStatus> {
  return getJson<DemoStatus>("/api/demo/scenario");
}

export function postScenario(mode: DemoMode, target: string): Promise<DemoScenarioResult> {
  return getJson<DemoScenarioResult>("/api/demo/scenario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode, target }),
  });
}
