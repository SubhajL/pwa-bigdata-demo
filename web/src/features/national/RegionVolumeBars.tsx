import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import { regionHref, regionLabelTh } from "./national.config";
import { regionBars } from "./nationalClient";
import type { RegionRollup } from "./types";

export interface RegionVolumeBarsProps {
  readonly rollup: RegionRollup;
}

/**
 * Water sold by region (Stitch S1 §B), ranked, REAL data. ONE hue — magnitude is the bar LENGTH,
 * not a categorical colour. Each row is a drill link to that region's league table, PRESERVING the
 * sticky month (INTERACTIONS.md §Drill-down); a route change, not a modal, so it is linkable.
 *
 * No status is shown: the curated dataset carries water sold only, and inventing a per-region
 * "status" from volume would be a fabricated KPI. Region status belongs to the (deferred) map's
 * simulated overlay, not here.
 */
export function RegionVolumeBars({ rollup }: RegionVolumeBarsProps): JSX.Element {
  const bars = regionBars(rollup);
  return (
    <Card>
      <CardHeader>
        <CardTitle>ปริมาณจำหน่ายน้ำรายภูมิภาค</CardTitle>
      </CardHeader>
      <CardContent>
        {bars.length === 0 ? (
          <p data-testid="region-bars-empty" className="text-dense text-on-surface-variant">
            ไม่มีข้อมูลสำหรับเดือนนี้ · กรุณาเลือกเดือนอื่น
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="ปริมาณจำหน่ายน้ำรายภูมิภาค">
            {bars.map((bar) => (
              <li key={bar.region}>
                <Link
                  to={regionHref(bar.region, rollup.month)}
                  aria-label={`${regionLabelTh(bar.region)} · ดูรายสาขา`}
                  className="grid grid-cols-[4rem_1fr_9rem] items-center gap-3 rounded-md px-1 py-1 hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="text-dense text-on-surface-variant">
                    {regionLabelTh(bar.region)}
                  </span>
                  <span className="h-3 overflow-hidden rounded-pill bg-surface-container">
                    <span
                      className="block h-full rounded-pill bg-primary"
                      style={{ width: `${bar.widthPct}%` }}
                    />
                  </span>
                  <span className="text-right text-dense tabular text-on-surface">
                    <Num kind="m3" value={bar.waterSoldM3} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
