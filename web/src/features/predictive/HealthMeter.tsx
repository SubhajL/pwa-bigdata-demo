import { Num } from "@/components/ui/num";
import { cn } from "@/lib/utils";

import type { HealthStatus } from "./types";

/** Status → fill token. The bar's LENGTH carries the magnitude; the colour reinforces the band
 *  and never stands alone — the numeral is always rendered, and callers pair it with a StatusChip. */
const FILL: Readonly<Record<HealthStatus, string>> = {
  normal: "bg-status-normal",
  warning: "bg-status-warning",
  critical: "bg-status-critical",
  nodata: "bg-status-nodata",
};

export interface HealthMeterProps {
  readonly value: number | null;
  readonly status: HealthStatus;
  readonly className?: string;
}

/**
 * One-axis health meter (0–100): the value as a tabular numeral plus a horizontal bar whose
 * width is the value and whose colour is the status band. `null` renders an em-dash and an empty
 * track (a `nodata` device shows nothing, not a full or zero bar that reads as a real score).
 */
export function HealthMeter({ value, status, className }: HealthMeterProps): JSX.Element {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="w-8 text-sm font-semibold text-on-surface">
        <Num kind="int" value={value} />
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-container">
        <div className={cn("h-full rounded-pill", FILL[status])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
