import { STATUS_LABEL_TH, type StatusKind } from "@/components/StatusChip";

import type { TwinDeviceView } from "./types";

/**
 * One device drawn on the SVG schematic. Status is conveyed by SHAPE, not colour alone
 * (CLAUDE.md): a circle when normal/nodata, a rounded-square warning, a diamond critical — plus
 * a token-coloured stroke and an accessible name carrying the Thai status word. `StatusChip` is
 * HTML and cannot live inside `<svg>`, so the label vocabulary (`STATUS_LABEL_TH`) is reused
 * here rather than a second map invented.
 *
 * Coordinates come entirely from the topology (`device.x/y`); nothing is hardcoded.
 */
const STROKE: Readonly<Record<StatusKind, string>> = {
  normal: "stroke-status-normal",
  warning: "stroke-status-warning",
  critical: "stroke-status-critical",
  nodata: "stroke-status-nodata",
};

/** A per-status symbol shape, so status reads without colour. `data-symbol` lets tests prove
 *  the shapes differ across statuses. */
function shapeFor(status: StatusKind, x: number, y: number): JSX.Element {
  switch (status) {
    case "critical": // diamond
      return <path data-symbol="diamond" d={`M ${x} ${y - 16} L ${x + 16} ${y} L ${x} ${y + 16} L ${x - 16} ${y} Z`} />;
    case "warning": // rounded square
      return <rect data-symbol="square" x={x - 13} y={y - 13} width={26} height={26} rx={5} />;
    case "nodata": // dashed ring — visually distinct from a solid "normal" circle, so all four
      return <circle data-symbol="ring" cx={x} cy={y} r={14} className="[stroke-dasharray:4_4]" />;
    default: // solid circle for normal
      return <circle data-symbol="circle" cx={x} cy={y} r={14} />;
  }
}

export interface DeviceSymbolProps {
  readonly device: TwinDeviceView;
  readonly status: StatusKind;
  readonly selected: boolean;
  readonly onSelect: (assetId: string) => void;
}

export function DeviceSymbol({ device, status, selected, onSelect }: DeviceSymbolProps): JSX.Element {
  const label = `${device.asset_id} · สถานะ${STATUS_LABEL_TH[status]}`;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      data-asset={device.asset_id}
      data-status={status}
      className={`cursor-pointer fill-surface-container-lowest ${STROKE[status]} ${
        selected ? "stroke-[3px]" : "stroke-2"
      } transition-[stroke-width] duration-[var(--anim-fast)]`}
      onClick={() => onSelect(device.asset_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(device.asset_id);
        }
      }}
    >
      {shapeFor(status, device.x, device.y)}
      <text
        x={device.x}
        y={device.y + 32}
        textAnchor="middle"
        className="fill-on-surface-variant stroke-none text-[13px]"
      >
        {device.asset_id}
      </text>
    </g>
  );
}
