/**
 * Fetches health + RCA for the selected device (PR-9, items 3.3/3.6).
 *
 * One `useOwnedAsync` keyed on `asset`: changing the selection re-runs it; a `null` asset (no
 * selection yet) resolves to `null` rather than fetching. Health and RCA are fetched together so
 * the RCA a judge reads is for the same window the health number describes.
 */
import { useCallback } from "react";

import { useOwnedAsync } from "@/features/pipeline/ownedHooks";

import { fetchHealth, fetchRca } from "./predictiveClient";
import type { HealthResponse, RcaResponse } from "./types";

export interface DeviceInsight {
  readonly health: HealthResponse;
  readonly rca: RcaResponse;
}

export interface UseDeviceInsightResult {
  readonly insight: DeviceInsight | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly stale: boolean;
}

export function useDeviceInsight(asset: string | null): UseDeviceInsightResult {
  const task = useCallback(
    async (signal: AbortSignal): Promise<DeviceInsight | null> => {
      if (asset == null) return null;
      const [health, rca] = await Promise.all([
        fetchHealth(asset, signal),
        fetchRca(asset, signal),
      ]);
      return { health, rca };
    },
    [asset],
  );
  const { data, loading, error, stale } = useOwnedAsync(task);
  // NEVER expose data for a different asset than the one requested. `useOwnedAsync` keeps the
  // PREVIOUS result until the new one settles, so during an A→B selection the retained value is
  // A's — and if B's request fails it stays A's. Masking by the response's own `asset_id` makes a
  // mismatch resolve to null (an empty/loading panel) instead of labelling A's RCA as B or
  // submitting A's health as B's feedback.
  const insight =
    data != null && data.health.asset_id === asset && data.rca.asset_id === asset ? data : null;
  return { insight, loading, error, stale };
}
