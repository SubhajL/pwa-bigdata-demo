import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card } from "@/components/ui/card";
import { Num, type NumKind } from "@/components/ui/num";

import { momYoyFromSeries, simulatedEconomics } from "./nationalClient";
import type { NationalSeries, RegionRollup } from "./types";

export interface NationalKpiRowProps {
  readonly rollup: RegionRollup;
  readonly series: NationalSeries;
}

/**
 * The four executive KPI tiles (Stitch S1 §A). WATER SOLD is REAL (roll-up total + MoM/YoY from
 * the real series) and carries NO badge. NRW / ENERGY COST / ENERGY COST per sold m³ are
 * SIMULATED — the produced-water numerator is not open data (POC_SPEC §3.2) — so each carries a
 * `SimulatedBadge`. Every tile splits the numeral (large, never wrapping) from its unit (small),
 * so a long figure like 120,999,834 never breaks across lines the way an inline unit forced it to.
 */
export function NationalKpiRow({ rollup, series }: NationalKpiRowProps): JSX.Element {
  const delta = momYoyFromSeries(series, rollup.month);
  const econ = simulatedEconomics(rollup.total_m3);
  const energyMillionThb = econ.energyCostThb == null ? null : econ.energyCostThb / 1_000_000;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="national-kpis">
      <KpiTile
        testId="kpi-water-sold"
        label="ปริมาณน้ำจำหน่าย · WATER SOLD"
        value={rollup.total_m3}
        kind="int"
        unit="ลบ.ม."
        sub={
          <>
            MoM <Num kind="percent" digits={1} value={delta.momPct} /> · YoY{" "}
            <Num kind="percent" digits={1} value={delta.yoyPct} />
          </>
        }
      />
      <KpiTile testId="kpi-nrw" label="อัตราน้ำสูญเสีย · NRW" badge kind="decimal" digits={1} value={econ.nrwPct} unit="%" />
      <KpiTile
        testId="kpi-energy"
        label="ต้นทุนพลังงาน · ENERGY COST"
        badge
        kind="int"
        value={energyMillionThb}
        unit="ล้านบาท"
      />
      {/* "energy cost per sold m³", NOT "cost per m³": it is energy only, not labour/chemicals. */}
      <KpiTile
        testId="kpi-cost-per-m3"
        label="ต้นทุนพลังงานต่อหน่วย · ENERGY / m³"
        badge
        kind="decimal"
        digits={2}
        value={econ.costPerM3Thb}
        unit="บาท/ลบ.ม."
      />
    </div>
  );
}

/** One KPI tile: a label row of fixed min-height (so tiles align despite 1–2 line labels), a
 *  non-wrapping numeral with a small unit (unit hidden when the value is missing, so "—" reads as
 *  unknown, not "— ลบ.ม."), and an optional sub-line (e.g. MoM/YoY). Badge only for simulated tiles. */
function KpiTile({
  testId,
  label,
  badge,
  value,
  kind,
  digits,
  unit,
  sub,
}: {
  readonly testId: string;
  readonly label: string;
  readonly badge?: boolean;
  readonly value: number | null;
  readonly kind: NumKind;
  readonly digits?: number;
  readonly unit?: string;
  readonly sub?: React.ReactNode;
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
        {value != null && unit != null && (
          <span className="text-sm text-on-surface-variant">{unit}</span>
        )}
      </div>
      {sub != null && <div className="text-label text-on-surface-variant">{sub}</div>}
    </Card>
  );
}
