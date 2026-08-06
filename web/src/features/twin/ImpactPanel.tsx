import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import { GisLowPressureArea } from "./GisLowPressureArea";
import { TYPE_LABEL_TH } from "./impactView";
import type { ImpactResponse, TypeBreakdown } from "./types";

export interface ImpactPanelProps {
  /** The impact of the current pressure drop, or null when no drop is active. */
  readonly impact: ImpactResponse | null;
  readonly loading: boolean;
  /** Open the affected-customer drawer. Absent → the enriched affordances are inert. */
  readonly onOpenDrawer?: () => void;
}

/**
 * The customers downstream of a dropped pipe (scored item 2.4). The count is the API's real
 * value (PR-I: 200 upstream of the Map Ta Phut line, 80 for the last leg) — NEVER the Stitch
 * mockup's fabricated "1,204". Every value here is API-derived SIMULATED data, so the panel
 * carries a SIMULATED marker and uses `Num`.
 *
 * In ENRICHED mode (`type_breakdown != null`, i.e. MTP_CUSTOMER_IMPACT_ENABLED) the panel adds
 * the 140/35/25 type breakdown, the zone, the clickable low-pressure footprint, and a drawer
 * trigger (PR-J). The basic `impact-customer` list is kept in BOTH modes so the existing
 * scenario-transitions proof does not regress.
 */
export function ImpactPanel({ impact, loading, onOpenDrawer }: ImpactPanelProps): JSX.Element {
  const breakdown = impact?.type_breakdown ?? null;
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
          <div className="flex flex-col gap-3">
            <p className="text-headline tabular">
              <Num value={impact.count} />{" "}
              <span className="text-dense text-on-surface-variant">ราย</span>
            </p>
            {breakdown != null && (
              <>
                <GisLowPressureArea impact={impact} onOpen={onOpenDrawer ?? (() => {})} />
                <TypeBreakdownList breakdown={breakdown} />
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="open-impact-drawer"
                  onClick={onOpenDrawer}
                  disabled={onOpenDrawer == null}
                >
                  ดูรายชื่อผู้ใช้น้ำที่ได้รับผลกระทบ
                </Button>
              </>
            )}
            <ul className="flex flex-col gap-1">
              {impact.customers.map((c) => (
                <li
                  key={c.customer_id}
                  data-testid="impact-customer"
                  className="flex justify-between text-dense"
                >
                  <span className="text-on-surface">{c.customer_id}</span>
                  <span className="text-on-surface-variant">{c.area}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** The 140/35/25 breakdown by PWA top-level type. Each label is distinct Thai text (not colour). */
export function TypeBreakdownList({
  breakdown,
}: {
  readonly breakdown: TypeBreakdown;
}): JSX.Element {
  const rows: readonly [1 | 2 | 3, number][] = [
    [1, breakdown.type_1],
    [2, breakdown.type_2],
    [3, breakdown.type_3],
  ];
  return (
    <dl data-testid="type-breakdown" className="flex flex-col gap-0.5 text-dense">
      {rows.map(([type, n]) => (
        <div key={type} className="flex items-baseline justify-between gap-2">
          <dt className="text-on-surface-variant">{TYPE_LABEL_TH[type]}</dt>
          <dd className="tabular font-semibold text-on-surface">
            <Num value={n} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
