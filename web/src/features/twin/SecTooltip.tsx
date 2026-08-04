import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DASH, formatDecimal } from "@/lib/format";

import type { SecResponse } from "./types";

export interface SecTooltipProps {
  readonly assetId: string;
  readonly sec: SecResponse | null;
  readonly loading: boolean;
}

/**
 * Specific Energy Consumption for the selected pump (scored item 2.3), in kWh/m³.
 *
 * Rendered through `formatDecimal` (NOT `Num`, which only does integers/percent and would print
 * a real 0.25 as "0"). A null `sec_kwh_per_m3` — a known pump with no usable power/flow pair —
 * renders "—" with the API's `detail`, never 0 and never NaN. Every value is SIMULATED.
 *
 * With a computed value the card also renders the DERIVATION (PR-C): both inputs, both
 * observation timestamps, and the pair skew, so a judge can recompute the quotient from
 * what is on screen. The data-* attributes carry the raw API values for the E2E gate and
 * are ABSENT when there is no usable pair — automation must never read a fake input.
 */
export function SecTooltip({ assetId, sec, loading }: SecTooltipProps): JSX.Element {
  const value = sec?.sec_kwh_per_m3 ?? null;
  return (
    <Card
      data-testid="sec-card"
      data-sec={value ?? undefined}
      data-power-kw={value != null ? (sec?.power_kw ?? undefined) : undefined}
      data-flow-m3h={value != null ? (sec?.flow_m3h ?? undefined) : undefined}
      data-skew-s={value != null ? (sec?.skew_s ?? undefined) : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-title">
          อัตราการใช้พลังงานจำเพาะ · {assetId}
        </CardTitle>
        {(sec?.simulated ?? true) && <SimulatedBadge />}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-on-surface-variant">กำลังโหลด…</p>
        ) : (
          <>
            <p className="text-metric tabular">
              {value == null ? DASH : formatDecimal(value, 3)}
              <span className="ms-2 text-dense text-on-surface-variant">kWh/m³</span>
            </p>
            {value == null && sec?.detail && (
              <p className="mt-1 text-dense text-on-surface-variant">{sec.detail}</p>
            )}
            {value != null && sec != null && <SecDerivation sec={sec} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Pure display derivation: the inputs and freshness behind the quotient, never NaN. */
function SecDerivation({ sec }: { readonly sec: SecResponse }): JSX.Element {
  const at = (iso: string | null): string => (iso == null ? DASH : iso.slice(11, 19));
  return (
    <div className="mt-2 flex flex-col gap-1 text-dense text-on-surface-variant">
      <p data-testid="sec-formula" className="tabular">
        = กำลังไฟฟ้า {sec.power_kw == null ? DASH : formatDecimal(sec.power_kw, 1)} kW ÷ อัตราการไหล{" "}
        {sec.flow_m3h == null ? DASH : formatDecimal(sec.flow_m3h, 1)} m³/h
      </p>
      <p data-testid="sec-observed" className="tabular">
        วัดเมื่อ · กำลังไฟฟ้า {at(sec.power_observed_at)} · อัตราการไหล {at(sec.flow_observed_at)} ·
        ช่วงห่างของคู่ค่า {sec.skew_s == null ? DASH : formatDecimal(sec.skew_s, 1)} วินาที
      </p>
    </div>
  );
}
