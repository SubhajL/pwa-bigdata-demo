import { Link } from "react-router-dom";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { StatusChip } from "@/components/StatusChip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import { branchHref } from "./regional.config";
import type { BranchBar } from "./types";

export interface BranchLeagueTableProps {
  readonly bars: readonly BranchBar[];
  readonly month: string;
}

/**
 * The branch league table (Stitch S2). Ranked by REAL water sold (the endpoint's order), each row
 * drilling to that branch (month preserved). Water sold / MoM / YoY are REAL; the NRW column and
 * the status are SIMULATED (mock, POC_SPEC §3.2) under a badged header — status via icon + Thai
 * label, never colour-alone (fixes the design's `status-column-colour-only` defect).
 */
export function BranchLeagueTable({ bars, month }: BranchLeagueTableProps): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>เปรียบเทียบผลการดำเนินงานรายสาขา</CardTitle>
      </CardHeader>
      <CardContent>
        {bars.length === 0 ? (
          <p data-testid="league-empty" className="text-dense text-on-surface-variant">
            ไม่มีข้อมูลสำหรับเดือนนี้ · กรุณาเลือกเดือนอื่น
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-dense">
              <thead>
                <tr className="border-b border-outline-variant text-left text-on-surface-variant">
                  <th className="py-2 pr-2 font-medium">#</th>
                  <th className="py-2 pr-2 font-medium">สาขา</th>
                  <th className="py-2 pr-2 text-right font-medium">ปริมาณจำหน่าย (ลบ.ม.)</th>
                  <th className="py-2 pr-2 text-right font-medium">MoM</th>
                  <th className="py-2 pr-2 text-right font-medium">YoY</th>
                  <th className="py-2 pr-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1">NRW <SimulatedBadge /></span>
                  </th>
                  <th className="py-2 font-medium">
                    <span className="inline-flex items-center gap-1">สถานะ <SimulatedBadge /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {bars.map((bar) => (
                  <LeagueRow key={bar.branchCode} bar={bar} month={month} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** One branch row: the drill link, the real volume (with a magnitude bar) + MoM/YoY, and the
 *  simulated NRW + status chip (icon + label). */
function LeagueRow({ bar, month }: { readonly bar: BranchBar; readonly month: string }): JSX.Element {
  return (
    <tr className="border-b border-outline-variant/50">
      <td className="py-2 pr-2 tabular text-on-surface-variant">{bar.rank}</td>
      <td className="py-2 pr-2">
        <Link
          to={branchHref(bar.branchCode, month)}
          className="rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {bar.branch}
        </Link>
        <span className="block text-label text-on-surface-variant">{bar.province}</span>
      </td>
      <td className="py-2 pr-2 text-right">
        <div className="tabular text-on-surface">
          <Num kind="int" value={bar.waterSoldM3} />
        </div>
        <div className="mt-1 h-1 rounded-pill bg-surface-container">
          <div className="h-full rounded-pill bg-primary" style={{ width: `${bar.widthPct}%` }} />
        </div>
      </td>
      <td className="py-2 pr-2 text-right tabular text-on-surface-variant">
        <Num kind="percent" digits={1} value={bar.momPct} />
      </td>
      <td className="py-2 pr-2 text-right tabular text-on-surface-variant">
        <Num kind="percent" digits={1} value={bar.yoyPct} />
      </td>
      <td className="py-2 pr-2 text-right tabular text-on-surface">
        <Num kind="decimal" digits={1} value={bar.nrwPct} />%
      </td>
      <td className="py-2">
        <StatusChip kind={bar.status} />
      </td>
    </tr>
  );
}
