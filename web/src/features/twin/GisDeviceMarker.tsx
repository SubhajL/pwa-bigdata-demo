import { SimulatedBadge } from "@/components/SimulatedBadge";
import { STATUS_LABEL_TH, StatusChip, type StatusKind } from "@/components/StatusChip";

export interface GisDeviceMarkerProps {
  readonly assetId: string;
  readonly status: StatusKind;
  /** Optional: inside GisNetworkView the click is handled by a NATIVE listener on the marker's
   *  portal host (so it can stopPropagation before maplibre's canvas-container listener); standalone
   *  callers may still pass a React handler. */
  readonly onClick?: () => void;
}

/**
 * The scenario asset's marker on the GIS map (PR-H). The map position comes from the
 * manifest's demo binding, which is a DEMO DECISION — so the marker itself says
 * "ตำแหน่งจำลอง" (simulated placement); no verified station coordinate exists. Status
 * is icon + Thai text via StatusChip, never colour alone (CLAUDE.md).
 */
export function GisDeviceMarker({ assetId, status, onClick }: GisDeviceMarkerProps): JSX.Element {
  return (
    <button
      type="button"
      data-testid="gis-device-marker"
      data-status={status}
      onClick={onClick}
      aria-label={`${assetId} · ${STATUS_LABEL_TH[status]} · ตำแหน่งจำลอง`}
      className="flex flex-col items-center gap-0.5 rounded-lg border border-outline-variant
        bg-surface-container-lowest px-2 py-1 shadow-md"
    >
      <span className="flex items-center gap-1 text-dense font-medium text-on-surface">
        {assetId} <StatusChip kind={status} />
      </span>
      <span className="flex items-center gap-1 text-[11px] leading-tight text-on-surface-variant">
        <SimulatedBadge /> ตำแหน่งจำลอง
      </span>
    </button>
  );
}
