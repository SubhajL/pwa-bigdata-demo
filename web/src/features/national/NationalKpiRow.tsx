import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import { momYoyFromSeries, simulatedEconomics } from "./nationalClient";
import type { NationalSeries, RegionRollup } from "./types";

export interface NationalKpiRowProps {
  readonly rollup: RegionRollup;
  readonly series: NationalSeries;
}

/**
 * The four executive KPI tiles (Stitch S1 §A). WATER SOLD is REAL (roll-up total + MoM/YoY from
 * the real series) and carries NO badge. NRW / ENERGY COST / COST PER m³ are SIMULATED — the
 * produced-water numerator is not open data (POC_SPEC §3.2) — so each carries a `SimulatedBadge`.
 */
export function NationalKpiRow({ rollup, series }: NationalKpiRowProps): JSX.Element {
  const delta = momYoyFromSeries(series, rollup.month);
  const econ = simulatedEconomics(rollup.total_m3);
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="national-kpis">
      <Card data-testid="kpi-water-sold" className="flex flex-col gap-2 p-4">
        <span className="text-dense text-on-surface-variant">ปริมาณน้ำจำหน่าย · WATER SOLD</span>
        <span className="text-2xl font-semibold text-on-surface tabular">
          <Num kind="m3" value={rollup.total_m3} />
        </span>
        <span className="text-label text-on-surface-variant">
          MoM <Num kind="percent" digits={1} value={delta.momPct} /> · YoY{" "}
          <Num kind="percent" digits={1} value={delta.yoyPct} />
        </span>
      </Card>

      <SimTile testId="kpi-nrw" label="อัตราน้ำสูญเสีย · NRW">
        <Num kind="decimal" digits={1} value={econ.nrwPct} />%
      </SimTile>
      <SimTile testId="kpi-energy" label="ต้นทุนพลังงาน · ENERGY COST">
        <Num kind="int" value={econ.energyCostThb == null ? null : econ.energyCostThb / 1_000_000} />{" "}
        ล้านบาท
      </SimTile>
      {/* "energy cost / sold m³" — deliberately NOT "cost per m³": the figure is energy cost only,
          not labour, chemicals or depreciation, so the honest label says so. */}
      <SimTile testId="kpi-cost-per-m3" label="ต้นทุนพลังงานต่อหน่วย · ENERGY COST / m³">
        <Num kind="decimal" digits={2} value={econ.costPerM3Thb} /> บาท/ลบ.ม.
      </SimTile>
    </div>
  );
}

/** A SIMULATED KPI tile: label + top-right SimulatedBadge + the value. */
function SimTile({
  testId,
  label,
  children,
}: {
  readonly testId: string;
  readonly label: string;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <Card data-testid={testId} className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-dense text-on-surface-variant">{label}</span>
        <SimulatedBadge />
      </div>
      <span className="text-2xl font-semibold text-on-surface tabular">{children}</span>
    </Card>
  );
}
