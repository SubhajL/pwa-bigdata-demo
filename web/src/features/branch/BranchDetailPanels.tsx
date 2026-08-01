import { Sparkles } from "lucide-react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import { peerTopPercentile, simForecast, simProduction } from "./branchPanels";

/** Where this branch stands among its region peers — REAL (rank/branchCount), so NO SimulatedBadge. */
export function BranchPeerCard({
  rank,
  branchCount,
}: {
  readonly rank: number | null;
  readonly branchCount: number;
}): JSX.Element {
  const pct = peerTopPercentile(rank, branchCount);
  const fill = rank != null && branchCount > 0 ? ((branchCount - rank + 1) / branchCount) * 100 : 0;
  return (
    <Card data-testid="branch-peer">
      <CardHeader>
        <CardTitle className="text-base">อันดับเทียบเพื่อนร่วมเขต</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {pct == null ? (
          <p className="text-sm text-on-surface-variant">ไม่มีข้อมูลอันดับ</p>
        ) : (
          <>
            <p className="text-sm text-on-surface">
              อันดับ <Num kind="int" value={rank} /> จาก <Num kind="int" value={branchCount} /> สาขา — อยู่ในกลุ่ม{" "}
              <Num kind="int" value={Math.round(pct)} />% แรก
            </p>
            <div className="h-2 rounded-pill bg-surface-container">
              <div className="h-full rounded-pill bg-primary" style={{ width: `${fill}%` }} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Produced / non-revenue-water / customers — all SIMULATED (produced needs NRW; customers assume a
 *  per-connection rate). Water sold itself is on the KPI row, so it is omitted here to keep the whole
 *  card genuinely simulated under a single badge. */
export function BranchProductionCard({
  soldM3,
  nrwPct,
}: {
  readonly soldM3: number | null;
  readonly nrwPct: number | null;
}): JSX.Element {
  const p = simProduction(soldM3, nrwPct);
  return (
    <Card data-testid="branch-production">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          การผลิตและจ่ายน้ำ <SimulatedBadge />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm text-on-surface-variant">
        <Metric label="ผลิตน้ำ" value={p.producedM3} unit="ลบ.ม." />
        <Metric label="น้ำสูญเสีย (NRW)" value={p.lossM3} unit="ลบ.ม." />
        <Metric label="ผู้ใช้น้ำ" value={p.customers} unit="ราย" />
      </CardContent>
    </Card>
  );
}

/** A naive next-month projection from the MoM trend — SIMULATED, not a trained model. */
export function BranchForecastCard({
  m3,
  momPct,
}: {
  readonly m3: number | null;
  readonly momPct: number | null;
}): JSX.Element {
  const f = simForecast(m3, momPct);
  return (
    <Card data-testid="branch-forecast">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> พยากรณ์เดือนถัดไป (AI) <SimulatedBadge />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm text-on-surface-variant">
        <span className="text-on-surface">
          คาดการณ์ปริมาณจำหน่าย <span className="font-semibold tabular"><Num kind="int" value={f.nextM3} /></span> ลบ.ม.
        </span>
        <span>
          ช่วงประมาณการ <Num kind="int" value={f.lowM3} /> – <Num kind="int" value={f.highM3} /> ลบ.ม.
        </span>
        <span className="text-xs">ประมาณการเชิงสาธิตจากแนวโน้ม MoM — ไม่ใช่แบบจำลองจริง</span>
      </CardContent>
    </Card>
  );
}

/** One "label … value unit" row; the unit hides when the value is missing so "—" reads as unknown. */
function Metric({
  label,
  value,
  unit,
}: {
  readonly label: string;
  readonly value: number | null;
  readonly unit: string;
}): JSX.Element {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span>{label}</span>
      <span className="tabular text-on-surface">
        <Num kind="int" value={value} />
        {value != null && <span className="ml-1 text-xs text-on-surface-variant">{unit}</span>}
      </span>
    </span>
  );
}
