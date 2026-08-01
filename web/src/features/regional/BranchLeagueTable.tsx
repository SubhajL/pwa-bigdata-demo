import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { StatusChip } from "@/components/StatusChip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { cn } from "@/lib/utils";

import { branchHref } from "./regional.config";
import { sortBranchBars, type LeagueSortKey, type SortDir } from "./regionalClient";
import type { BranchBar } from "./types";

export interface BranchLeagueTableProps {
  readonly bars: readonly BranchBar[];
  readonly month: string;
}

interface SortState {
  readonly key: LeagueSortKey;
  readonly dir: SortDir;
}

interface HeaderProps {
  readonly sort: SortState | null;
  readonly onSort: (key: LeagueSortKey) => void;
}

/** A sortable (right-aligned) column header: a real button that cycles none → desc → asc → none,
 *  with `aria-sort` on the `<th>` and a glyph (not colour) marking the active direction. */
function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: HeaderProps & { readonly label: ReactNode; readonly sortKey: LeagueSortKey }): JSX.Element {
  const active = sort?.key === sortKey;
  const ariaSort = active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none";
  const Icon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th aria-sort={ariaSort} className="py-2 pr-2 text-right font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex flex-row-reverse items-center gap-1 transition-colors duration-[var(--anim-fast)] ease-standard hover:text-primary",
          active && "text-primary",
        )}
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", !active && "text-on-surface-variant")} aria-hidden="true" />
      </button>
    </th>
  );
}

/** The league header row — the `#` and สาขา columns are static; the four numeric columns are sortable
 *  (NRW keeps its SIMULATED badge, and สถานะ is not a numeric sort). */
function LeagueHeader({ sort, onSort }: HeaderProps): JSX.Element {
  return (
    <thead>
      <tr className="border-b border-outline-variant text-left text-on-surface-variant">
        <th className="py-2 pr-2 font-medium">#</th>
        <th className="py-2 pr-2 font-medium">สาขา</th>
        <SortableHeader label="ปริมาณจำหน่าย (ลบ.ม.)" sortKey="volume" sort={sort} onSort={onSort} />
        <SortableHeader label="MoM" sortKey="mom" sort={sort} onSort={onSort} />
        <SortableHeader label="YoY" sortKey="yoy" sort={sort} onSort={onSort} />
        <SortableHeader
          label={<span className="inline-flex items-center gap-1">NRW <SimulatedBadge /></span>}
          sortKey="nrw"
          sort={sort}
          onSort={onSort}
        />
        <th className="py-2 font-medium">
          <span className="inline-flex items-center gap-1">สถานะ <SimulatedBadge /></span>
        </th>
      </tr>
    </thead>
  );
}

/**
 * The branch league table (Stitch S2). Ranked by REAL water sold (the endpoint's order), each row
 * drilling to that branch (month preserved). Water sold / MoM / YoY are REAL; the NRW column and
 * status are SIMULATED under a badged header — status via icon + Thai label, never colour-alone.
 *
 * Path D (PR-D2): the numeric columns are tri-state sortable (none → desc → asc → none). The `#`
 * column always shows the endpoint's original rank, so a client re-sort renumbers nothing.
 */
export function BranchLeagueTable({ bars, month }: BranchLeagueTableProps): JSX.Element {
  const [sort, setSort] = useState<SortState | null>(null);
  const rows = sort ? sortBranchBars(bars, sort.key, sort.dir) : bars;

  const onSort = (key: LeagueSortKey): void => {
    setSort((cur) => {
      if (cur?.key !== key) return { key, dir: "desc" };
      if (cur.dir === "desc") return { key, dir: "asc" };
      return null; // asc → back to the endpoint's rank order
    });
  };

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
              <LeagueHeader sort={sort} onSort={onSort} />
              <tbody>
                {rows.map((bar) => (
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
