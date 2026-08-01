/**
 * Branch Dashboard configuration (PR-12, Stitch S3). The single place the screen's tunables live.
 * The SIMULATED economics assumptions live in the shared `@/config/waterEconomicsScenario`.
 */
import type { ChartDims } from "@/features/pipeline/types";

/** เขต N label — matches S1/S2. */
export function regionLabelTh(region: number): string {
  return `เขต ${region}`;
}

/** Breadcrumb hrefs, month preserved (INTERACTIONS.md §Drill-down). */
export function nationalHref(month: string): string {
  return `/national?month=${encodeURIComponent(month)}`;
}

export function regionHref(region: number, month: string): string {
  return `/regions?region=${region}&month=${encodeURIComponent(month)}`;
}

export const BRANCH_CONFIG = {
  /** Geometry for the branch water-sold trend line. */
  trendDims: { w: 720, h: 220, pad: 28 } satisfies ChartDims,
} as const;
