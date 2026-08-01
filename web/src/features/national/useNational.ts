/**
 * The National Executive Dashboard's data hook (PR-10).
 *
 * ONE month-keyed task fetches the month list, resolves the effective month (the URL's month if
 * it is a real one, else the latest), then fetches that month's national roll-up and the 39-month
 * series together. Folding month-resolution into the task avoids a render-order race between "we
 * know the months" and "we know which month to load". Reuses `useOwnedAsync` — on a transient
 * failure it keeps the last data and flags `stale` (never blanks a KPI — INTERACTIONS.md).
 */
import { useCallback } from "react";

import { useOwnedAsync } from "@/features/pipeline/ownedHooks";

import { fetchMonths, fetchNational, fetchNationalSeries } from "./nationalClient";
import type { NationalSeries, RegionRollup } from "./types";

export interface NationalData {
  /** Every month the dataset offers, ascending — the month picker's options. */
  readonly months: readonly string[];
  /** The month actually loaded (URL month if valid, else the latest available). */
  readonly month: string;
  readonly rollup: RegionRollup;
  readonly series: NationalSeries;
}

export interface UseNationalResult {
  readonly data: NationalData | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly stale: boolean;
}

export function useNational(requestedMonth: string | null): UseNationalResult {
  const task = useCallback(
    async (signal: AbortSignal): Promise<NationalData> => {
      const { months } = await fetchMonths(signal);
      if (months.length === 0) throw new Error("dataset has no months");
      const month =
        requestedMonth != null && months.includes(requestedMonth)
          ? requestedMonth
          : months[months.length - 1];
      const [rollup, series] = await Promise.all([
        fetchNational(month, signal),
        fetchNationalSeries(signal),
      ]);
      return { months, month, rollup, series };
    },
    [requestedMonth],
  );
  const { data, loading, error, stale } = useOwnedAsync(task);
  return { data, loading, error, stale };
}
