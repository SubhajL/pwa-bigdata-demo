/**
 * Fetches GET /api/model once on mount (PR-9, items 3.1/3.2).
 *
 * The card is a per-process constant (the loaded artifact does not change at runtime), so a
 * fetch-on-mount `useOwnedAsync` is the whole story — no polling.
 */
import { useCallback } from "react";

import { useOwnedAsync } from "@/features/pipeline/ownedHooks";

import { fetchModelCard } from "./predictiveClient";
import type { ModelCardResponse } from "./types";

export interface UseModelCardResult {
  readonly card: ModelCardResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
}

export function useModelCard(): UseModelCardResult {
  const task = useCallback((signal: AbortSignal) => fetchModelCard(signal), []);
  const { data, loading, error } = useOwnedAsync(task);
  return { card: data, loading, error };
}
