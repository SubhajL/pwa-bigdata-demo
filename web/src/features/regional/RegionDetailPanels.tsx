import { AlertTriangle, CheckCircle } from "lucide-react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import { SIM_STEP_TESTS, topBranchesByNrw } from "./regionPanels";
import type { BranchBar } from "./types";

/** Branch comparison by (SIMULATED) NRW — a SINGLE series, so one hue (magnitude = bar width), one
 *  axis, direct value labels. Highlights the branches most in need of attention. */
export function RegionBranchNrwChart({ bars }: { readonly bars: readonly BranchBar[] }): JSX.Element {
  const top = topBranchesByNrw(bars, 6);
  const max = Math.max(...top.map((b) => b.nrwPct), 1);
  return (
    <Card data-testid="region-nrw-chart">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          เปรียบเทียบอัตราน้ำสูญเสียรายสาขา (NRW) <SimulatedBadge />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="text-sm text-on-surface-variant">ไม่มีข้อมูล</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="อัตราน้ำสูญเสียรายสาขา">
            {top.map((b) => (
              <li key={b.branchCode} className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-2">
                <span className="truncate text-xs text-on-surface-variant">{b.branch}</span>
                <span className="h-3 rounded-pill bg-surface-container">
                  <span className="block h-full rounded-pill bg-primary" style={{ width: `${(b.nrwPct / max) * 100}%` }} />
                </span>
                <span className="text-right text-xs tabular text-on-surface">
                  <Num kind="decimal" digits={1} value={b.nrwPct} />%
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** SIMULATED recent Step-Test history (leak detection). Each entry pairs an icon with a Thai result
 *  label, so a leak/no-leak is never signalled by colour alone. */
export function RegionStepTestCard(): JSX.Element {
  return (
    <Card data-testid="region-steptest">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          ประวัติ Step Test (ค้นหาน้ำรั่ว) <SimulatedBadge />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {SIM_STEP_TESTS.map((t) => (
          <div key={`${t.dma}-${t.dateTh}`} className="flex items-start justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              {t.leak ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" aria-hidden="true" />
              ) : (
                <CheckCircle className="h-4 w-4 shrink-0 text-status-normal" aria-hidden="true" />
              )}
              <span>
                <span className="font-medium text-on-surface">{t.dma}</span>{" "}
                <span className="text-on-surface-variant">· {t.resultTh}</span>
              </span>
            </span>
            <span className="shrink-0 text-xs text-on-surface-variant">{t.dateTh}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
