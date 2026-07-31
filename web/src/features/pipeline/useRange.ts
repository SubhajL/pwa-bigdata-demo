/**
 * Loads the range-query evidence for scored item 1.4 (PR-8 S2): the readings for the configured
 * asset over the look-back window, proving time-range retrieval (ordered, not just a row count).
 */
import { useCallback } from "react";

import { fetchRange } from "./pipelineClient";
import { useOwnedAsync } from "./ownedHooks";
import { PIPELINE_CONFIG } from "./pipeline.config";
import type { RangeResponse } from "./types";

export interface UseRangeResult {
  readonly data: RangeResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly stale: boolean;
  readonly reload: () => void;
}

export function useRange(): UseRangeResult {
  const task = useCallback(
    (signal: AbortSignal) => fetchRange(PIPELINE_CONFIG.rangeAsset, PIPELINE_CONFIG.rangeMinutes, signal),
    [],
  );
  return useOwnedAsync<RangeResponse>(task);
}
