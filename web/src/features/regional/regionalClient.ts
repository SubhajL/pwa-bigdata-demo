/**
 * The Regional Dashboard's read client and pure reducers (PR-11, Stitch S2).
 *
 * HTTP reuses PR-6's `getJson`. The reducers carry the load-bearing view logic and are unit-tested
 * without a DOM (regionalClient.test.ts). Water sold / MoM / YoY are REAL curated data. The S2
 * design also shows a per-branch NRW and status, which are definitionally SIMULATED (produced water
 * is not open data, POC_SPEC §3.2) — computed HERE as illustrative MOCK figures and rendered only
 * behind a SimulatedBadge (mock data is acceptable when clearly marked; honesty is by the badge,
 * not by omission).
 */
import { getJson } from "@/api/client";
import type { StatusKind } from "@/components/StatusChip";

import { REGIONAL_CONFIG } from "./regional.config";
import type { BranchBar, BranchRow, CuratedMonths, RegionSummary } from "./types";

// ── HTTP clients ──────────────────────────────────────────────────────────────────────

export function fetchMonths(signal?: AbortSignal): Promise<CuratedMonths> {
  return getJson<CuratedMonths>("/api/curated/months", { signal });
}

export function fetchRegion(
  region: number,
  month: string,
  signal?: AbortSignal,
): Promise<BranchRow[]> {
  return getJson<BranchRow[]>(
    `/api/curated/regions/${region}?month=${encodeURIComponent(month)}`,
    { signal },
  );
}

// ── pure reducers ─────────────────────────────────────────────────────────────────────

/** FNV-1a hash of a string → a fraction in [0,1) from the high bits (used only for small jitter). */
function fnvFraction(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash >>> 8) / (1 << 24);
}

/** How far the per-code jitter can move NRW, as a fraction of the range (±). */
const NRW_JITTER = 0.08;

/**
 * A SIMULATED per-branch NRW (%). ILLUSTRATIVE mock data for the demo (produced water is not open
 * data, POC_SPEC §3.2), always rendered behind a SimulatedBadge and never presented as measured.
 *
 * It spreads across [minPct, maxPct] by the branch's VOLUME RANK — a plausible scenario in which
 * higher-volume (usually urban) branches carry lower loss and smaller branches higher — plus a
 * small deterministic per-`branchCode` jitter so it is not a perfectly straight line. Rank-based
 * spreading GUARANTEES a believable normal/warning/critical mix every region; a pure per-code hash
 * clustered degenerate on the real (structurally similar) branch codes. Deterministic (no RNG).
 */
export function simulatedBranchNrwPct(branchCode: string, rank: number, branchCount: number): number {
  const { minPct, maxPct } = REGIONAL_CONFIG.simNrw;
  // Finite-safe: a non-finite rank/count (never produced by the real endpoint, but the signature
  // permits it) falls back to the mid-spread rather than yielding NaN, which branchStatus would
  // then mis-classify as "normal".
  const spread =
    branchCount > 1 && Number.isFinite(rank) && Number.isFinite(branchCount)
      ? (rank - 1) / (branchCount - 1)
      : 0.5;
  const jitter = (fnvFraction(branchCode) - 0.5) * 2 * NRW_JITTER;
  const frac = Math.min(1, Math.max(0, spread + jitter));
  return Math.round((minPct + frac * (maxPct - minPct)) * 10) / 10;
}

/** SIMULATED branch status from its (simulated) NRW. Icon+label in the UI, never colour-alone. */
export function branchStatus(nrwPct: number): StatusKind {
  const { warnAtPct, criticalAtPct } = REGIONAL_CONFIG.simNrw;
  if (nrwPct >= criticalAtPct) return "critical";
  if (nrwPct >= warnAtPct) return "warning";
  return "normal";
}

/**
 * The league table's bars, keeping the endpoint's ranked (volume-desc) order. `waterSoldM3`/`momPct`
 * /`yoyPct` are REAL; `widthPct` is magnitude vs the largest (ONE hue), clamped to [0,100] so an
 * out-of-contract volume can never render a negative bar. `nrwPct`/`status` are SIMULATED. `[]`→`[]`.
 */
export function branchBars(rows: readonly BranchRow[]): BranchBar[] {
  if (rows.length === 0) return [];
  const max = Math.max(...rows.map((r) => r.water_sold_m3), Number.MIN_VALUE);
  return rows.map((r) => {
    const nrwPct = simulatedBranchNrwPct(r.branch_code, r.rank, rows.length);
    return {
      rank: r.rank,
      branchCode: r.branch_code,
      branch: r.branch,
      province: r.province,
      waterSoldM3: r.water_sold_m3,
      momPct: r.mom_pct,
      yoyPct: r.yoy_pct,
      widthPct: Math.max(0, Math.min(100, Math.round((r.water_sold_m3 / max) * 100))),
      nrwPct,
      status: branchStatus(nrwPct),
    };
  });
}

/**
 * Region aggregates from the computed bars. `totalM3`/`branchCount` are REAL; `avgNrwPct` (mean of
 * the simulated per-branch NRW) and `watchCount` (branches whose simulated status is not normal)
 * are SIMULATED. `[]` → all zeros.
 */
export function regionSummary(bars: readonly BranchBar[]): RegionSummary {
  if (bars.length === 0) return { totalM3: 0, branchCount: 0, avgNrwPct: 0, watchCount: 0 };
  let totalM3 = 0;
  let nrwSum = 0;
  let watchCount = 0;
  for (const bar of bars) {
    totalM3 += bar.waterSoldM3;
    nrwSum += bar.nrwPct;
    if (bar.status !== "normal") watchCount += 1;
  }
  return { totalM3, branchCount: bars.length, avgNrwPct: nrwSum / bars.length, watchCount };
}
