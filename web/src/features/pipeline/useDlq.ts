/**
 * Loads a page of the dead-letter queue (PR-8 S2, scored item 1.5). Offset-based pagination; the
 * DLQ *total* is not in this response (its `count` is the page length) — the screen supplies the
 * total from `conservation.dead_letter`. Ownership/abort live in `useOwnedAsync`.
 */
import { useCallback, useState } from "react";

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
