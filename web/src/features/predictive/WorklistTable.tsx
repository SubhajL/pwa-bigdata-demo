import { SimulatedBadge } from "@/components/SimulatedBadge";
import { StatusChip } from "@/components/StatusChip";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { cn } from "@/lib/utils";

import { HealthMeter } from "./HealthMeter";
import { pttfDays } from "./predictiveClient";
import type { WorklistItem } from "./types";

export interface WorklistTableProps {
  readonly items: readonly WorklistItem[];
  readonly selected: string | null;
  readonly onSelect: (asset: string) => void;
}

/**
 * The prioritized worklist (item 3.5): worst predicted health first. Status is an icon + Thai
 * label (StatusChip), never colour alone; every numeral is tabular and right-aligned. Selecting a
 * device (the asset button — keyboard-accessible) drives the RCA panel and feedback form.
 */
export function WorklistTable({ items, selected, onSelect }: WorklistTableProps): JSX.Element {
  return (
    <Card className="flex flex-col gap-4" data-testid="worklist">
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle>Health Score &amp; PTTF รายอุปกรณ์</CardTitle>
        <SimulatedBadge />
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-dense">
          <thead>
            <tr className="border-b border-outline-variant text-label text-on-surface-variant">
              <th className="px-3 py-2 font-medium">อันดับ</th>
              <th className="px-3 py-2 font-medium">อุปกรณ์</th>
              <th className="px-3 py-2 font-medium">สาขา</th>
              <th className="w-56 px-3 py-2 font-medium">Health Score</th>
              <th className="px-3 py-2 text-right font-medium">PTTF (วัน)</th>
              <th className="px-3 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <WorklistRow
                key={item.asset_id}
                item={item}
                selected={item.asset_id === selected}
                onSelect={onSelect}
              />
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="px-3 py-6 text-dense text-on-surface-variant">ยังไม่มีผลการให้คะแนน</p>
        )}
      </div>
    </Card>
  );
}

function WorklistRow({
  item,
  selected,
  onSelect,
}: {
  readonly item: WorklistItem;
  readonly selected: boolean;
  readonly onSelect: (asset: string) => void;
}): JSX.Element {
  return (
    <tr
      data-testid={`worklist-row-${item.asset_id}`}
      data-selected={selected}
      // The exact served values, untouched by display formatting: the E2E compares the
      // first three RENDERED rows to /api/worklist string-for-string (PR-E, item 3.5).
      data-rank={item.rank}
      data-asset={item.asset_id}
      data-health-score={item.health_score}
      className={cn("border-b border-outline-variant", selected && "bg-surface-container")}
    >
      <td className="px-3 py-2 tabular text-on-surface-variant">{item.rank}</td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() => onSelect(item.asset_id)}
          aria-pressed={selected}
          className="rounded-control font-medium text-primary hover:underline focus-visible:ring-2 ring-offset-2"
        >
          {item.asset_id}
        </button>
      </td>
      <td className="px-3 py-2 text-on-surface-variant">{item.branch ?? "—"}</td>
      {/* The testid marks the JUDGE-VISIBLE health numeral (the meter's rendered int),
          so the E2E can tie what a judge reads to the API value — the data-health-score
          attribute alone never proved the rendered digit (review-workflow MEDIUM). */}
      <td className="px-3 py-2" data-testid="worklist-health-cell">
        <HealthMeter value={item.health_score} status={item.status} />
      </td>
      <td className="px-3 py-2 text-right tabular text-on-surface">
        <Num kind="decimal" digits={1} value={pttfDays(item.pttf_hours)} />
      </td>
      <td className="px-3 py-2">
        <StatusChip kind={item.status} />
      </td>
    </tr>
  );
}
