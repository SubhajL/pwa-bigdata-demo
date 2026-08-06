import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import type { ImpactResponse } from "./types";

export interface ImpactPanelProps {
  /** The impact of the current pressure drop, or null when no drop is active. */
  readonly impact: ImpactResponse | null;
  readonly loading: boolean;
}

/**
 * The customers downstream of a dropped pipe (scored item 2.4). The count is the API's real
 * value (PR-I: 200 upstream of the Map Ta Phut line, 80 for the last leg) — NEVER the Stitch
 * mockup's fabricated "1,204". Every value here is API-derived SIMULATED data (a generated
 * topology and generated customer ids), so the panel carries a SIMULATED marker and uses `Num`.
 */
export function ImpactPanel({ impact, loading }: ImpactPanelProps): JSX.Element {
  return (
    <Card aria-live="polite">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-title">ผู้ใช้น้ำที่ได้รับผลกระทบ</CardTitle>
        {(impact?.simulated ?? true) && <SimulatedBadge />}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-on-surface-variant">กำลังคำนวณ…</p>
        ) : impact == null ? (
          <p className="text-on-surface-variant">ไม่มีเหตุแรงดันตกในขณะนี้</p>
        ) : (
          <>
            <p className="mb-3 text-headline tabular">
              <Num value={impact.count} /> <span className="text-dense text-on-surface-variant">ราย</span>
            </p>
            <ul className="flex flex-col gap-1">
              {impact.customers.map((c) => (
                <li key={c.customer_id} data-testid="impact-customer" className="flex justify-between text-dense">
                  <span className="text-on-surface">{c.customer_id}</span>
                  <span className="text-on-surface-variant">{c.area}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
