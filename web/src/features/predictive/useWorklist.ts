/**
 * Polls GET /api/worklist and tracks the selected device (PR-9, item 3.5).
 *
 * On a failed poll it sets `stale` and KEEPS the last worklist — never blanks it
 * (INTERACTIONS.md). The selection defaults to the worst-ranked device once, without ever
 * overriding a pick the operator has made. Concurrency/ownership live in the shared
 * `useOwnedPoll` primitive (features/pipeline/ownedHooks), reused rather than reimplemented.
 */
import { useCallback, useState } from "react";

import { nowMs, useOwnedPoll } from "@/features/pipeline/ownedHooks";

import { fetchWorklist } from "./predictiveClient";
import { PREDICTIVE_CONFIG } from "./predictive.config";
import type { WorklistItem } from "./types";

export interface UseWorklistResult {
  readonly items: readonly WorklistItem[];
  readonly error: string | null;
  readonly stale: boolean;
  readonly lastAt: number | null;
  readonly selected: string | null;
  readonly select: (asset: string) => void;
}

export function useWorklist(): UseWorklistResult {
  const [items, setItems] = useState<readonly WorklistItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useOwnedPoll<WorklistItem[]>({
    task: (signal) => fetchWorklist(PREDICTIVE_CONFIG.worklistLimit, signal),
    delayMs: PREDICTIVE_CONFIG.worklistPollMs,
    onResult: (list) => {
      setItems(list);
      setError(null);
      setStale(false);
      setLastAt(nowMs());
      setSelected((prev) => prev ?? list[0]?.asset_id ?? null);
    },
    onError: (e) => {
      setStale(true);
      setError(e instanceof Error ? e.message : String(e));
    },
  });

  const select = useCallback((asset: string) => setSelected(asset), []);
  return { items, error, stale, lastAt, selected, select };
}
