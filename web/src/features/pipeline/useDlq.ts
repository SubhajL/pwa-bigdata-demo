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
  readonly error: string | null;
  readonly stale: boolean;
  readonly setOffset: (offset: number) => void;
  readonly reload: () => void;
}

export function useDlq(): UseDlqResult {
  const [offset, setOffset] = useState(0);
  // Stable per-offset so useOwnedAsync re-runs exactly when the page changes.
  const task = useCallback(
    (signal: AbortSignal) => fetchDlq(PIPELINE_CONFIG.dlqPageSize, offset, signal),
    [offset],
  );
  const { data, loading, error, stale, reload } = useOwnedAsync<DlqResponse>(task);
  const clampedSetOffset = useCallback((next: number) => setOffset(Math.max(0, next)), []);
  return { page: data, offset, loading, error, stale, setOffset: clampedSetOffset, reload };
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
  const { offset, loading, reload } = dlq;
  const prevTotal = useRef<number | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    if (liveTotal == null) return;
    const prev = prevTotal.current;
    prevTotal.current = liveTotal;
    if (prev == null || prev === liveTotal || offset !== 0) return;
    if (loading) pending.current = true;
    else reload();
  }, [liveTotal, offset, loading, reload]);
  useEffect(() => {
    if (!loading && pending.current) {
      pending.current = false;
      if (offset === 0) reload();
    }
  }, [loading, offset, reload]);
}
