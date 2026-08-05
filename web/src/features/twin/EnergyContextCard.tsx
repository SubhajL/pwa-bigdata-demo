import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DASH, formatDecimal } from "@/lib/format";

import { energyDelta } from "./gisAdapter";
import type { EnergyReference, SecResponse } from "./types";

export interface EnergyContextCardProps {
  /** The bound pump's live SEC (same source as scored item 2.3), or null. */
  readonly sec: SecResponse | null;
  readonly loading: boolean;
  readonly reference: EnergyReference;
}

/**
 * Simulated live SEC beside East Water's official system reference (PR-H, decisions
 * 9–10). The two figures NEVER merge: the live value is per-pump simulation, the
 * official one is an annual, system-wide disclosure — so the reference is constant,
 * separately boxed, and precisely attributed. Their difference renders as arithmetic
 * only: no colour, no icon, no target/threshold language, because comparing an
 * instantaneous simulated pump value against an annual grid figure supports no
 * judgement about health.
 */
export function EnergyContextCard({ sec, loading, reference }: EnergyContextCardProps): JSX.Element {
  const value = sec?.sec_kwh_per_m3 ?? null;
  const delta = energyDelta(sec, reference);
  return (
    <Card data-testid="energy-context-card">
      <CardHeader>
        {/* NO card-level SimulatedBadge: this card mixes evidence classes, and a header
            badge would scope the OFFICIAL East Water figure as simulated. The badge
            sits INSIDE the live-SEC block — exactly the values it is true of. */}
        <CardTitle className="text-title">พลังงานจำเพาะ (SEC)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div data-testid="energy-sec-live">
          <p className="flex items-center gap-1.5 text-dense text-on-surface-variant">
            ค่าขณะนี้ของ {sec?.asset_id ?? "ปั๊มที่เลือก"} · จำลอง <SimulatedBadge />
          </p>
          <p className="text-metric tabular">
            {loading ? "…" : value == null ? DASH : formatDecimal(value, 3)}
            <span className="ms-2 text-dense text-on-surface-variant">kWh/m³</span>
          </p>
          {!loading && value == null && sec?.detail != null && (
            <p className="text-dense text-on-surface-variant">{sec.detail}</p>
          )}
        </div>
        <div
          data-testid="energy-official-reference"
          className="rounded-lg border border-outline-variant p-2"
        >
          <p className="text-dense text-on-surface-variant">
            ค่าอ้างอิงทางการ · OFFICIAL REFERENCE
          </p>
          <p className="text-title tabular text-on-surface">
            {formatDecimal(reference.value_kwh_per_m3, 2)} {reference.unit}
          </p>
          <p className="text-dense text-on-surface-variant">
            {reference.operator} · ระบบโครงข่ายน้ำทั้งระบบ · ปี {reference.year} ·{" "}
            <a
              href={reference.source_url}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              ที่มา
            </a>
          </p>
          <p className="text-[11px] leading-tight text-on-surface-variant">
            ค่าเฉลี่ยรายปีระดับระบบ ไม่ใช่ค่าของสถานีมาบตาพุด และไม่ใช่ค่าที่วัดสด
          </p>
        </div>
        {delta != null && (
          <p data-testid="energy-delta" className="text-dense text-on-surface-variant">
            ผลต่างเชิงเลขคณิตจากค่าอ้างอิง: {delta > 0 ? "+" : ""}
            {formatDecimal(delta, 3)} kWh/m³ (เทียบคนละมาตราส่วน — ไม่ใช้ตัดสินสถานะ)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
