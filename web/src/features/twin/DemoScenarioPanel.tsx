import { useEffect, useState } from "react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { fetchDemoStatus, postScenario, type DemoMode, type DemoStatus } from "./demoClient";

export interface DemoScenarioPanelProps {
  /** The pump the scenarios steer — the demonstrated pump on the seeded schematic. */
  readonly target?: string;
}

const SCENARIOS: ReadonlyArray<{ mode: DemoMode; label: string }> = [
  { mode: "pressure_drop", label: "จำลองแรงดันตก" },
  { mode: "anomaly", label: "จำลองอุปกรณ์เสื่อมสภาพ" },
  { mode: "bad_asset", label: "จำลองข้อมูลเสีย (DLQ)" },
  { mode: "normal", label: "คืนสู่สภาวะปกติ" },
];

/**
 * "สาธิตเหตุการณ์" — the demo director control (P0).
 *
 * Visibly a demonstration tool: it exists ONLY when `GET /api/demo/scenario` reports
 * `{enabled: true}` (the API is env-gated by DEMO_CONTROLS, so a production-shaped stack
 * simply never shows this), it carries the SIMULATED marker like every other synthetic
 * surface, and it prints the active run_id so each injection is traceable to the exact
 * rows it wrote. The twin itself is NOT touched from here — rows are inserted directly
 * into the database (`api/app/demo.py`): telemetry scenarios steer the same tables the
 * real scoring loop reads (ledger+telemetry pairs stamped `source='DEMO'`, swept by
 * `normal`), and `bad_asset` writes one dead-letter row as a demo visual (its ledger row
 * is `source='DEMO_DLQ'`, deliberately permanent). Nothing here traverses the MQTT
 * consumer — the scored item-1.5 validation proof stays the simulator's real publish
 * (`make demo-scenario MODE=bad_asset`).
 */
export function DemoScenarioPanel({ target = "P-2" }: DemoScenarioPanelProps): JSX.Element | null {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState<DemoMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const probe = await fetchDemoStatus();
        // `enabled === true` exactly: a generic `{}` (or any other shape) must hide the
        // panel — no demo affordance may appear on a stack that has not opted in.
        if (!cancelled && probe.enabled === true) {
          setStatus(probe);
          setRunId(probe.active_run_id ?? null);
        }
      } catch {
        // Disabled (403), unreachable, or malformed: stay hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status == null) return null;

  const trigger = async (mode: DemoMode): Promise<void> => {
    setBusy(mode);
    setError(null);
    try {
      const result = await postScenario(mode, target);
      setRunId(result.run_id);
    } catch {
      setError("ไม่สามารถสั่งสาธิตได้ · โปรดลองใหม่อีกครั้ง");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card data-testid="demo-scenario-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-title">สาธิตเหตุการณ์</CardTitle>
        <SimulatedBadge />
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-dense text-on-surface-variant">
          เครื่องมือสาธิต · ฉีดสัญญาณจำลองไปยัง {target} เพื่อบังคับเหตุการณ์ให้เกิดทันที
        </p>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map(({ mode, label }) => (
            <Button
              key={mode}
              variant="outline"
              size="sm"
              disabled={busy != null}
              onClick={() => void trigger(mode)}
            >
              {label}
            </Button>
          ))}
        </div>
        {error != null && (
          <p role="alert" className="mt-3 text-dense text-status-critical">
            {error}
          </p>
        )}
        <p aria-live="polite" className="mt-3 text-dense text-on-surface-variant">
          รหัสรอบสาธิต:{" "}
          <span data-testid="demo-run-id" className="tabular">
            {runId ?? "—"}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
