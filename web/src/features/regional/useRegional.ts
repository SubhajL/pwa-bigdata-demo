/**
 * The Regional Dashboard's data hook (PR-11). ONE task, keyed on (region, month), fetches the
 * month list, resolves the effective month (URL month if real, else the latest), then fetches that
 * region's branch league table. When no valid region is selected it fetches nothing and returns an
 * empty result, so the screen can show an honest "pick a region" prompt without a wasted request.
 * Reuses `useOwnedAsync` — a transient failure keeps the last data and flags `stale`, never blanks.
 */
import { useCallback } from "react";

import { ApiError } from "@/api/client";
import { useOwnedAsync } from "@/features/pipeline/ownedHooks";

import { fetchMonths, fetchRegion } from "./regionalClient";
import type { BranchRow } from "./types";

export interface RegionalData {
  /** The region this data is FOR (null when no region is selected). Lets the screen detect a
   *  region switch in progress and avoid rendering the old region's rows under the new heading. */
  readonly region: number | null;
  readonly months: readonly string[];
  /** The month actually loaded (URL month if valid, else the latest available). */
  readonly month: string;
  readonly rows: readonly BranchRow[];
}

export interface UseRegionalResult {
  readonly data: RegionalData | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly stale: boolean;
}

export function useRegional(region: number | null, requestedMonth: string | null): UseRegionalResult {
  const task = useCallback(
    async (signal: AbortSignal): Promise<RegionalData> => {
      if (region == null) return { region: null, months: [], month: requestedMonth ?? "", rows: [] };
      const { months } = await fetchMonths(signal);
      if (months.length === 0) throw new Error("dataset has no months");
      const month =
        requestedMonth != null && months.includes(requestedMonth)
          ? requestedMonth
          : months[months.length - 1];
      // The curated route returns 404 (not []) for a region with no rows this month. That is an
      // EMPTY result, not a failure — translate it so the screen shows the honest empty state
      // rather than the error alert. Any other error propagates to `useOwnedAsync`.
      try {
        const rows = await fetchRegion(region, month, signal);
        return { region, months, month, rows };
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return { region, months, month, rows: [] };
        }
        throw err;
      }
    },
    [region, requestedMonth],
  );
  const { data, loading, error, stale } = useOwnedAsync(task);
  return { data, loading, error, stale };
}
