/**
 * National Executive Dashboard configuration (PR-10, Stitch S1). The single place the screen's
 * tunables live, so none is a literal buried in a component (CLAUDE.md).
 *
 * The SIMULATED economics assumptions live in the SHARED `@/config/waterEconomicsScenario` (so
 * PR-10/11/12 cannot drift into three incompatible synthetic stories), not here.
 */

import type { ChartDims } from "@/features/pipeline/types";

export const NATIONAL_CONFIG = {
  /** Geometry for the 39-month national trend line (reuses the pipeline SVG line pattern). */
  trendDims: { w: 640, h: 200, pad: 24 } satisfies ChartDims,
  /** Number of regions shown in the "top regions by volume" bar chart (all ten fit). */
  topRegions: 10,
  /** SVG viewBox for the national office map. */
  mapDims: { w: 360, h: 480, pad: 16 } satisfies ChartDims,
} as const;

export type NationalConfig = typeof NATIONAL_CONFIG;

/** PWA regional offices are numbered เขต 1..10 (not geographic names — see design S1). */
export function regionLabelTh(region: number): string {
  return `เขต ${region}`;
}

/** Drill href from the national view to a region, PRESERVING the sticky month (INTERACTIONS.md
 *  §Drill-down: "Drilling never silently resets the period"). */
export function regionHref(region: number, month: string): string {
  return `/regions?region=${region}&month=${encodeURIComponent(month)}`;
}
