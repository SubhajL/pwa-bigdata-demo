import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import { rcaBars } from "./predictiveClient";
import { SIGNAL_LABEL_TH } from "./predictive.config";
import type { RcaResponse } from "./types";

export interface RcaPanelProps {
  readonly asset: string | null;
  readonly rca: RcaResponse | null;
}

/**
 * Root-cause analysis for the selected device (item 3.6): the signals contributing most to its
 * current health, largest first. Horizontal bars share ONE axis and ONE hue — magnitude is the
 * bar LENGTH, so colour is not asked to encode it too; the signed contribution is shown as text.
 */
export function RcaPanel({ asset, rca }: RcaPanelProps): JSX.Element {
  const { bars } = rcaBars(rca?.contributions ?? []);
  return (
    <Card className="flex flex-col gap-4" data-testid="rca-panel">
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle>การวิเคราะห์สาเหตุ · Root Cause{asset != null ? ` — ${asset}` : ""}</CardTitle>
        <SimulatedBadge />
      </CardHeader>
      {bars.length === 0 ? (
        <p className="text-dense text-on-surface-variant">
          {asset == null
            ? "เลือกอุปกรณ์เพื่อดูการวิเคราะห์สาเหตุ"
            : (rca?.detail ?? "ไม่มีข้อมูลเพียงพอสำหรับการวิเคราะห์")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="ปัจจัยที่มีผลต่อสุขภาพอุปกรณ์">
          {bars.map((bar) => (
            // data-signal: the machine-readable identity of each ranked bar, so the E2E
            // can prove the TOP rendered cause tracks the model's local attribution and
            // CHANGES between two different induced anomalies (PR-E, item 3.6).
            <li
              key={bar.signal}
              data-signal={bar.signal}
              className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-3"
            >
              <span className="truncate text-dense text-on-surface-variant">
                {SIGNAL_LABEL_TH[bar.signal]}
              </span>
              <div className="h-3 overflow-hidden rounded-pill bg-surface-container">
                <div className="h-full rounded-pill bg-primary" style={{ width: `${bar.widthPct}%` }} />
              </div>
              <span className="text-right text-dense tabular text-on-surface">
                <Num kind="decimal" digits={2} value={bar.contribution} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
