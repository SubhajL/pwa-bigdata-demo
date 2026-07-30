import { StatusChip, STATUS_LABEL_TH, type StatusKind } from "@/components/StatusChip";
import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

/** Order shown, and the reason `nodata` is included: it is a first-class status the topology
 *  defaults unknown devices to, so a total that omitted it would disagree with the parts. */
const ORDER: readonly StatusKind[] = ["normal", "warning", "critical", "nodata"];

export interface StatusCountersProps {
  /** Every placed device's current (merged) status. */
  readonly statuses: readonly StatusKind[];
  /** Whether the underlying topology is simulated (from the API flag). */
  readonly simulated: boolean;
}

/**
 * The KPI row: total devices and a per-status count. Statuses are SIMULATED, so the row carries
 * a marker; each count uses `StatusChip` (icon + Thai label, never colour alone). By including
 * `nodata`, total == the sum of the four.
 */
export function StatusCounters({ statuses, simulated }: StatusCountersProps): JSX.Element {
  const counts: Record<StatusKind, number> = { normal: 0, warning: 0, critical: 0, nodata: 0 };
  for (const s of statuses) counts[s] += 1;

  return (
    <Card className="flex flex-wrap items-center gap-6 p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-metric tabular">
          <Num value={statuses.length} />
        </span>
        <span className="text-dense text-on-surface-variant">อุปกรณ์ทั้งหมด</span>
        {simulated && <SimulatedBadge />}
      </div>
      {ORDER.map((kind) => (
        <div key={kind} className="flex items-center gap-2" aria-label={`${STATUS_LABEL_TH[kind]} ${counts[kind]}`}>
          <StatusChip kind={kind} />
          <span className="text-title tabular">
            <Num value={counts[kind]} />
          </span>
        </div>
      ))}
    </Card>
  );
}
