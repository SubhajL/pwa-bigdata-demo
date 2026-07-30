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
 */
export function SecTooltip({ assetId, sec, loading }: SecTooltipProps): JSX.Element {
  const value = sec?.sec_kwh_per_m3 ?? null;
  return (
    <Card>
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
