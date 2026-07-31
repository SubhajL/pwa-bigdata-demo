import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import type { LatencySummary, PipelineStatus } from "./types";

export interface KpiRowProps {
  readonly status: PipelineStatus;
  readonly rates: readonly number[];
  readonly summaries: readonly LatencySummary[];
}

/**
 * KPI tiles (item 1.x headline): throughput msg/s (latest rate, THIS-SESSION scope), mean response
 * ms, rows written (conservation.telemetry, ALL-RUNS), DLQ total (conservation.dead_letter,
 * ALL-RUNS). Every value derived (no literal). Per-scope labels distinguish session vs all-runs;
 * SimulatedBadge on each SIMULATED-feed tile (throughput, rows, dlq). Latency is MEASURED and gets
 * a demo-env note instead of a violet badge. SEAM — fill against KpiRow.test.tsx.
 */
export function KpiRow({ status, rates, summaries }: KpiRowProps): JSX.Element {
  const throughput = rates.length > 0 ? rates[rates.length - 1] : null;

  // Success-weighted mean: sum(s.meanMs * s.count) / sum(s.count) over count>0.
  const successSummaries = summaries.filter((s) => s.count > 0);
  const totalWeight = successSummaries.reduce((acc, s) => acc + s.count, 0);
  const latencyMean =
    totalWeight > 0
      ? successSummaries.reduce((acc, s) => acc + s.meanMs * s.count, 0) / totalWeight
      : null;

  const hasConservation = status.state !== "disabled" && status.conservation != null;
  const rows = hasConservation ? status.conservation!.telemetry : null;
  const dlq = hasConservation ? status.conservation!.dead_letter : null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiTile
        testId="kpi-throughput"
        label="อัตราการรับข้อมูล"
        scope="เซสชันนี้"
        value={throughput}
        valueKind="decimal"
        valueDigits={1}
        unit="msg/s"
        badge={<SimulatedBadge />}
      />
      <KpiTile
        testId="kpi-latency"
        label="เวลาตอบสนองเฉลี่ย"
        value={latencyMean}
        valueKind="decimal"
        valueDigits={1}
        unit="ms"
        note="สภาพแวดล้อมสาธิต"
      />
      <KpiTile
        testId="kpi-rows"
        label="แถวที่เขียนลง DB"
        scope="สะสมทุกรอบ"
        value={rows}
        valueKind="int"
        badge={<SimulatedBadge />}
      />
      <KpiTile
        testId="kpi-dlq"
        label="DLQ สะสม"
        value={dlq}
        valueKind="int"
        badge={<SimulatedBadge />}
      />
    </div>
  );
}

/** Pure helper: a single KPI tile. */
function KpiTile({
  testId,
  label,
  scope,
  value,
  valueKind,
  valueDigits,
  unit,
  badge,
  note,
}: {
  readonly testId: string;
  readonly label: string;
  readonly scope?: string;
  readonly value: number | null;
  readonly valueKind: "int" | "decimal";
  readonly valueDigits?: number;
  readonly unit?: string;
  readonly badge?: JSX.Element;
  readonly note?: string;
}): JSX.Element {
  return (
    <Card data-testid={testId} className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-dense text-on-surface-variant">{label}</span>
        {badge != null && badge}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-title tabular font-semibold text-on-surface">
          <Num kind={valueKind} digits={valueDigits} value={value} />
        </span>
        {unit != null && (
          <span className="text-dense text-on-surface-variant">{unit}</span>
        )}
      </div>
      {scope != null && (
        <span className="text-label text-on-surface-variant">{scope}</span>
      )}
      {note != null && (
        <span className="text-label text-on-surface-variant">{note}</span>
      )}
    </Card>
  );
}
