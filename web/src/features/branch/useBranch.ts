/**
 * The Branch Dashboard's data hook (PR-12). ONE task, keyed on (code, month): fetches the month
 * list + the branch's REAL series, resolves the effective month, then fetches that month's REGION
 * league so the branch's SIMULATED NRW/status/rank are IDENTICAL to the Regional screen's (sourced
 * from the same `branchBars`), plus the region median for the trend reference. When no branch is
 * selected it fetches nothing. Reuses `useOwnedAsync` (keep-last + stale on transient failure).
 */
import { useCallback } from "react";

import { useOwnedAsync } from "@/features/pipeline/ownedHooks";
import { branchBars, fetchRegion } from "@/features/regional/regionalClient";

import { branchVitals, fetchBranch, fetchMonths, median } from "./branchClient";
import type { BranchSeries, BranchStanding, BranchVitals } from "./types";

export interface BranchData {
  /** The branch this data is FOR (null when none selected) — lets the screen detect a switch. */
  readonly code: string | null;
  readonly months: readonly string[];
  readonly month: string;
  readonly series: BranchSeries | null;
  readonly vitals: BranchVitals | null;
  readonly standing: BranchStanding | null;
}

export interface UseBranchResult {
  readonly data: BranchData | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly stale: boolean;
}

const EMPTY_STANDING: BranchStanding = {
  nrwPct: null,
  status: null,
  rank: null,
  branchCount: 0,
  regionMedianM3: null,
};

async function standingFor(
  series: BranchSeries,
  code: string,
  month: string,
  signal: AbortSignal,
): Promise<BranchStanding> {
  try {
    const bars = branchBars(await fetchRegion(series.region, month, signal));
    const bar = bars.find((b) => b.branchCode === code) ?? null;
    return {
      nrwPct: bar?.nrwPct ?? null,
      status: bar?.status ?? null,
      rank: bar?.rank ?? null,
      branchCount: bars.length,
      regionMedianM3: median(bars.map((b) => b.waterSoldM3)),
    };
  } catch (err) {
    // The region league is a SECONDARY (simulated-NRW) source. Any failure there — a 404 for a
    // region with no rows, a 500, a transient network blip — must degrade to an empty standing and
    // let the REAL branch series/trend/vitals still render, not blank the whole dashboard behind an
    // error. But NEVER swallow an abort: that would let a superseded run setState.
    if (signal.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err;
    return EMPTY_STANDING;
  }
}

export function useBranch(code: string | null, requestedMonth: string | null): UseBranchResult {
  const task = useCallback(
    async (signal: AbortSignal): Promise<BranchData> => {
      if (code == null) {
        return { code: null, months: [], month: requestedMonth ?? "", series: null, vitals: null, standing: null };
      }
      const [monthsResp, series] = await Promise.all([fetchMonths(signal), fetchBranch(code, signal)]);
      const months = monthsResp.months;
      const month =
        requestedMonth != null && months.includes(requestedMonth)
          ? requestedMonth
          : (months[months.length - 1] ?? "");
      const standing = await standingFor(series, code, month, signal);
      return { code, months, month, series, vitals: branchVitals(series, month), standing };
    },
    [code, requestedMonth],
  );
  const { data, loading, error, stale } = useOwnedAsync(task);
  return { data, loading, error, stale };
}
