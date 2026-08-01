import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card } from "@/components/ui/card";
import { Num, type NumKind } from "@/components/ui/num";

import type { RegionSummary } from "./types";

export interface RegionalKpiRowProps {
  readonly summary: RegionSummary;
}

/**
 * The regional KPI tiles (Stitch S2). ปริมาณจำหน่ายรวมเขต and จำนวนสาขา are REAL (from the branch
 * rows). อัตราน้ำสูญเสียเฉลี่ย (avg NRW) and สาขาที่ต้องเฝ้าระวัง (to-watch count) are SIMULATED — they
 * come from the per-branch mock NRW (POC_SPEC §3.2) — so each carries a `SimulatedBadge`.
 */
export function RegionalKpiRow({ summary }: RegionalKpiRowProps): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="regional-kpis">
      <Tile testId="rkpi-total" label="ปริมาณจำหน่ายรวมเขต" kind="int" value={summary.totalM3} unit="ลบ.ม." />
      <Tile testId="rkpi-branches" label="จำนวนสาขา" kind="int" value={summary.branchCount} unit="สาขา" />
      <Tile testId="rkpi-nrw" label="อัตราน้ำสูญเสียเฉลี่ย · NRW" badge kind="decimal" digits={1} value={summary.avgNrwPct} unit="%" />
      <Tile testId="rkpi-watch" label="สาขาที่ต้องเฝ้าระวัง" badge kind="int" value={summary.watchCount} unit="สาขา" />
    </div>
  );
}

/** One KPI tile: label (+ optional badge), a non-wrapping numeral, and a small unit. */
function Tile({
  testId,
  label,
  badge,
  kind,
  digits,
  value,
  unit,
}: {
  readonly testId: string;
  readonly label: string;
  readonly badge?: boolean;
  readonly kind: NumKind;
  readonly digits?: number;
  readonly value: number | null;
  readonly unit: string;
}): JSX.Element {
  return (
    <Card data-testid={testId} className="flex flex-col gap-1.5 p-4">
      <div className="flex min-h-[2.5rem] items-start justify-between gap-2">
        <span className="text-dense leading-snug text-on-surface-variant">{label}</span>
        {badge === true && <SimulatedBadge className="shrink-0" />}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1">
        <span className="whitespace-nowrap text-xl font-semibold leading-tight text-on-surface tabular">
          <Num kind={kind} digits={digits} value={value} />
        </span>
        {value != null && <span className="text-sm text-on-surface-variant">{unit}</span>}
      </div>
    </Card>
  );
}
