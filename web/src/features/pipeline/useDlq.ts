/**
 * Loads a page of the dead-letter queue (PR-8 S2, scored item 1.5). Offset-based pagination; the
 * DLQ *total* is not in this response (its `count` is the page length) — the screen supplies the
 * total from `conservation.dead_letter`. Ownership/abort live in `useOwnedAsync`.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchDlq } from "./pipelineClient";
import { useOwnedAsync } from "./ownedHooks";
import { PIPELINE_CONFIG } from "./pipeline.config";
import type { DlqResponse } from "./types";

export interface UseDlqResult {
  readonly page: DlqResponse | null;
  readonly offset: number;
  readonly loading: boolean;
  /** True for the initial request and every retained-data reload. */
  readonly refreshing: boolean;
  readonly error: string | null;
  readonly stale: boolean;
  readonly setOffset: (offset: number) => void;
  readonly reload: () => void;
}

export function useDlq(): UseDlqResult {
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  const requestGen = useRef(0);
  // Stable per-offset so useOwnedAsync re-runs exactly when the page changes.
  const task = useCallback(
    async (signal: AbortSignal) => {
      const myGen = ++requestGen.current;
      try {
        return await fetchDlq(PIPELINE_CONFIG.dlqPageSize, offset, signal);
      } finally {
        if (!signal.aborted && myGen === requestGen.current) setRefreshing(false);
      }
    },
    [offset],
  );
  const { data, loading, error, stale, reload: ownedReload } = useOwnedAsync<DlqResponse>(task);
  const clampedSetOffset = useCallback(
    (next: number) => {
      const clamped = Math.max(0, next);
      if (clamped === offset) return;
      setRefreshing(true);
      setOffset(clamped);
    },
    [offset],
  );
  const reload = useCallback(() => {
    setRefreshing(true);
    ownedReload();
  }, [ownedReload]);
  return {
    page: data,
    offset,
    loading,
    refreshing,
    error,
    stale,
    setOffset: clampedSetOffset,
    reload,
  };
}

/**
 * A dead-lettered message must appear on the ALREADY-OPEN page (item 1.5): when the polled
 * `conservation.dead_letter` total moves, refetch DLQ page 0. Guards, in order of intent:
 * never on the first arrival (mounting must not double-fetch), never off page 0 (an operator
 * browsing older pages is not yanked back by background growth), and never while a page
 * request is IN FLIGHT — under sustained growth (e.g. `bad_asset` mode dead-lettering
 * ~5 msg/s against the 2 s status poll) an eager reload would abort its predecessor every
 * poll and no page could ever settle. A change that lands mid-flight is remembered and
 * applied as ONE follow-up reload after the current request settles.
 */
export function useDlqLiveRefresh(dlq: UseDlqResult, liveTotal: number | null): void {
  const { offset, refreshing, reload } = dlq;
  const prevTotal = useRef<number | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    if (liveTotal == null) return;
    const prev = prevTotal.current;
    prevTotal.current = liveTotal;
    if (prev == null || prev === liveTotal || offset !== 0) return;
    if (refreshing) pending.current = true;
    else reload();
  }, [liveTotal, offset, refreshing, reload]);
  useEffect(() => {
    if (!refreshing && pending.current) {
      pending.current = false;
      if (offset === 0) reload();
    }
  }, [refreshing, offset, reload]);
}
