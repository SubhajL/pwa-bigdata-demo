import { CheckCircle2, type LucideIcon } from "lucide-react";

import { SEVERITY_META, type AlertSeverity } from "./alerts.config";
import type { AlertCounts } from "./alertsModel";

export interface AlertSummaryProps {
  readonly counts: AlertCounts;
}

interface Tile {
  readonly key: string;
  readonly labelTh: string;
  readonly count: number;
  readonly icon: LucideIcon;
  readonly textToken: string;
}

/** Build the four summary tiles from the derived counts (three severities + acknowledged). */
function tilesFrom(counts: AlertCounts): readonly Tile[] {
  const severities: readonly AlertSeverity[] = ["critical", "warning", "info"];
  const sevTiles = severities.map((s) => ({
    key: s,
    labelTh: SEVERITY_META[s].labelTh,
    count: counts[s],
    icon: SEVERITY_META[s].icon,
    textToken: SEVERITY_META[s].textToken,
  }));
  return [
    ...sevTiles,
    { key: "acknowledged", labelTh: "รับทราบแล้ว", count: counts.acknowledged, icon: CheckCircle2, textToken: "text-on-surface-variant" },
  ];
}

/**
 * The four S7 summary tiles. Count colour carries severity, but never alone — each tile also states an
 * icon and a Thai label, the required secondary encoding (CLAUDE.md dataviz rule).
 */
export function AlertSummary({ counts }: AlertSummaryProps): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="alert-summary">
      {tilesFrom(counts).map((tile) => (
        <div key={tile.key} data-testid={`alert-tile-${tile.key}`} className="flex flex-col gap-1 rounded-card border border-outline-variant bg-surface-container-lowest p-4">
          <span className="flex items-center gap-2 text-xs text-on-surface-variant">
            <tile.icon className={`h-4 w-4 ${tile.textToken}`} aria-hidden="true" /> {tile.labelTh}
          </span>
          <span className={`text-2xl font-semibold tabular ${tile.textToken}`}>{tile.count}</span>
        </div>
      ))}
    </div>
  );
}
