import { SimulatedBadge } from "@/components/SimulatedBadge";
import { StatusChip } from "@/components/StatusChip";
import { Card } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import type { BranchStanding, BranchVitals } from "./types";

export interface BranchKpiRowProps {
  readonly vitals: BranchVitals;
  readonly standing: BranchStanding;
}

/**
 * Branch KPI tiles (Stitch S3). WATER SOLD (latest month + MoM/YoY), rank-in-region, and "vs region
 * median" are REAL. NRW + status are SIMULATED (sourced from the region league so they match the
 * Regional screen) and carry a `SimulatedBadge`. Missing values render "—", never a fake 0.
 */
export function BranchKpiRow({ vitals, standing }: BranchKpiRowProps): JSX.Element {
  const vsMedianPct =
    vitals.m3 != null && standing.regionMedianM3 != null && standing.regionMedianM3 !== 0
      ? ((vitals.m3 - standing.regionMedianM3) / standing.regionMedianM3) * 100
      : null;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="branch-kpis">
      <WaterTile vitals={vitals} />
      <NrwTile standing={standing} />
      <RankTile standing={standing} />
      <MedianTile vsMedianPct={vsMedianPct} />
    </div>
  );
}

function Metric({ value, unit, kind, digits }: {
  readonly value: number | null;
  readonly unit?: string;
  readonly kind: "int" | "decimal" | "percent";
  readonly digits?: number;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1">
      <span className="whitespace-nowrap text-xl font-semibold text-on-surface tabular">
        <Num kind={kind} digits={digits} value={value} />
      </span>
      {value != null && unit != null && <span className="text-sm text-on-surface-variant">{unit}</span>}
    </div>
  );
}

function WaterTile({ vitals }: { readonly vitals: BranchVitals }): JSX.Element {
  return (
    <Card data-testid="bkpi-water" className="flex flex-col gap-1.5 p-4">
      <span className="text-dense leading-snug text-on-surface-variant">ปริมาณน้ำจำหน่าย · WATER SOLD</span>
      <Metric kind="int" value={vitals.m3} unit="ลบ.ม." />
      <span className="text-label text-on-surface-variant">
        MoM <Num kind="percent" digits={1} value={vitals.momPct} /> · YoY <Num kind="percent" digits={1} value={vitals.yoyPct} />
      </span>
    </Card>
  );
}

function NrwTile({ standing }: { readonly standing: BranchStanding }): JSX.Element {
  return (
    <Card data-testid="bkpi-nrw" className="flex flex-col gap-1.5 p-4">
      <div className="flex min-h-[2.5rem] items-start justify-between gap-2">
        <span className="text-dense leading-snug text-on-surface-variant">อัตราน้ำสูญเสีย · NRW</span>
        <SimulatedBadge className="shrink-0" />
      </div>
      <span className="whitespace-nowrap text-xl font-semibold text-on-surface tabular">
        <Num kind="decimal" digits={1} value={standing.nrwPct} />
        {standing.nrwPct != null && "%"}
      </span>
      {standing.status != null && <StatusChip kind={standing.status} />}
    </Card>
  );
}

function RankTile({ standing }: { readonly standing: BranchStanding }): JSX.Element {
  return (
    <Card data-testid="bkpi-rank" className="flex flex-col gap-1.5 p-4">
      <span className="text-dense leading-snug text-on-surface-variant">อันดับปริมาณจำหน่ายในเขต</span>
      <div className="flex flex-wrap items-baseline gap-x-1">
        <span className="whitespace-nowrap text-xl font-semibold text-on-surface tabular">
          <Num kind="int" value={standing.rank} />
        </span>
        {standing.rank != null && standing.branchCount > 0 && (
          <span className="text-sm text-on-surface-variant">จาก {standing.branchCount} สาขา</span>
        )}
      </div>
    </Card>
  );
}

function MedianTile({ vsMedianPct }: { readonly vsMedianPct: number | null }): JSX.Element {
  return (
    <Card data-testid="bkpi-median" className="flex flex-col gap-1.5 p-4">
      <span className="text-dense leading-snug text-on-surface-variant">เทียบค่ากลางเขต</span>
      <span className="whitespace-nowrap text-xl font-semibold text-on-surface tabular">
        <Num kind="percent" digits={1} value={vsMedianPct} />
      </span>
      <span className="text-label text-on-surface-variant">ปริมาณจำหน่ายเทียบค่ากลางของเขต</span>
    </Card>
  );
}
