/**
 * Regional Dashboard configuration (PR-11, Stitch S2). The single place the screen's tunables
 * live, so none is a literal buried in a component (CLAUDE.md). The SIMULATED economics
 * assumptions live in the SHARED `@/config/waterEconomicsScenario`, not here.
 */

/** PWA regional offices are numbered เขต 1..10 (not geographic names — matches S1). */
export function regionLabelTh(region: number): string {
  return `เขต ${region}`;
}

/** Drill href from a region to a branch, PRESERVING the sticky month (INTERACTIONS.md). PR-12
 *  owns `/branches`; until it lands this resolves to the honest PlaceholderScreen. */
export function branchHref(branchCode: string, month: string): string {
  return `/branches?branch=${encodeURIComponent(branchCode)}&month=${encodeURIComponent(month)}`;
}

/** Back-up href to the national view, month preserved (breadcrumb). */
export function nationalHref(month: string): string {
  return `/national?month=${encodeURIComponent(month)}`;
}

export const REGIONAL_CONFIG = {
  /** Valid PWA region ids. A URL region outside this set is treated as "no region selected". */
  minRegion: 1,
  maxRegion: 10,
  /**
   * SIMULATED per-branch NRW (S2 shows this column). These are ILLUSTRATIVE mock figures for the
   * demo — not measured PWA data — spread over [min,max]% deterministically per branch_code, and
   * always rendered behind a SimulatedBadge. The thresholds mirror the alert rule in design S7
   * ("NRW > 35% → แจ้ง ผอ.เขต").
   */
  simNrw: {
    // Spread so a realistic MIX results — most branches normal (<30%), some warning, a few
    // critical — rather than everything red. Thresholds mirror design S7 ("NRW > 35% → แจ้ง ผอ.เขต").
    minPct: 15,
    maxPct: 40,
    warnAtPct: 30,
    criticalAtPct: 35,
  },
} as const;
