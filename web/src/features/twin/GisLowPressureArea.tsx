import { Waves } from "lucide-react";

import { SimulatedBadge } from "@/components/SimulatedBadge";

import { lowPressureAreaName } from "./impactView";
import type { ImpactResponse } from "./types";

/** The SVG hatch pattern id — a NON-colour encoding of the footprint (tokens.map.md: status is
 *  never colour alone). Only one ImpactPanel renders at a time, so one stable id is safe. */
const HATCH_ID = "lpz-hatch";

export interface GisLowPressureAreaProps {
  /** The active enriched impact, or null. The footprint renders only when `zone` is present. */
  readonly impact: ImpactResponse | null;
  readonly onOpen: () => void;
}

/**
 * The clickable low-pressure footprint affordance (PR-J, source step 3/4). A native `<button>`
 * (so Enter/Space are native), whose identity is carried in TEXT — the accessible name names the
 * zone + affected count + จำลอง — and whose visual encoding is a HATCH PATTERN + a Lucide icon +
 * the SIMULATED marker, never colour alone. Clicking opens the affected-customer drawer.
 *
 * Renders null in basic mode (`impact.zone == null`, i.e. the customer feature is off) — the
 * footprint is an enriched-only surface.
 */
export function GisLowPressureArea({ impact, onOpen }: GisLowPressureAreaProps): JSX.Element | null {
  const zone = impact?.zone;
  if (impact == null || zone == null) return null;
  return (
    <button
      type="button"
      data-testid="low-pressure-area"
      aria-label={lowPressureAreaName(zone, impact.count)}
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-card border border-status-warning bg-surface-container px-3 py-2 text-left text-status-warning transition-colors duration-[var(--anim-fast)] hover:bg-surface-container-lowest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
        <defs>
          <pattern
            id={HATCH_ID}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="2" />
          </pattern>
        </defs>
        <rect
          x="1"
          y="1"
          width="38"
          height="38"
          rx="4"
          fill={`url(#${HATCH_ID})`}
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      <span className="flex flex-col">
        <span className="flex items-center gap-1 text-dense font-semibold text-on-surface">
          <Waves className="h-4 w-4" aria-hidden="true" />
          พื้นที่แรงดันต่ำจำลอง
        </span>
        <span className="text-xs text-on-surface-variant">
          {zone} · ผู้ใช้น้ำ {impact.count} ราย
        </span>
      </span>
      <SimulatedBadge className="ml-auto" />
    </button>
  );
}
