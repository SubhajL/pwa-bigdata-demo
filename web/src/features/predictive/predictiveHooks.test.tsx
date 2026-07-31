/**
 * useWorklist / useModelCard / useFeedback (PR-9 S9-C). Only the NETWORK functions are mocked;
 * the pure reducers stay real. Mirrors features/pipeline/pipelineHooks.test.tsx.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";

import type { FeedbackAck, ModelCardResponse, WorklistItem } from "./types";

vi.mock("./predictiveClient", async (importActual) => {
  const actual = await importActual<typeof import("./predictiveClient")>();
  return {
    ...actual,
    fetchWorklist: vi.fn(),
    fetchModelCard: vi.fn(),
    fetchHealth: vi.fn(),
    fetchRca: vi.fn(),
    submitFeedback: vi.fn(),
  };
});

import { fetchHealth, fetchModelCard, fetchRca, fetchWorklist, submitFeedback } from "./predictiveClient";
import { useDeviceInsight } from "./useDeviceInsight";
import { useFeedback } from "./useFeedback";
import { useModelCard } from "./useModelCard";
import { useWorklist } from "./useWorklist";
import type { HealthResponse, RcaResponse } from "./types";

const mWorklist = vi.mocked(fetchWorklist);
const mModel = vi.mocked(fetchModelCard);
const mHealth = vi.mocked(fetchHealth);
const mRca = vi.mocked(fetchRca);
const mFeedback = vi.mocked(submitFeedback);

function health(asset: string): HealthResponse {
  return {
    asset_id: asset, status: "critical", health_score: 30, pttf_hours: 0, pttf_out_of_range: false,
    model_version: "v1", observed_at: null, scored_at: null, contributions: [], simulated: true, detail: null,
  };
}
function rca(asset: string): RcaResponse {
  return { asset_id: asset, model_version: "v1", observed_at: null, contributions: [], simulated: true, detail: null };
}

function wItem(over: Partial<WorklistItem>): WorklistItem {
  return {
    rank: 1, asset_id: "P-2", branch: "สมุทรสาคร", health_score: 30,
    pttf_hours: 0, status: "critical", model_version: "v1",
    scored_at: "2026-07-31T00:00:00Z", simulated: true, ...over,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe("useWorklist", () => {
  it("defaults the selection to the worst-ranked device on first load", async () => {
    vi.useFakeTimers();
    mWorklist.mockResolvedValue([wItem({ asset_id: "P-2", rank: 1 }), wItem({ asset_id: "P-7", rank: 2 })]);
    const { result } = renderHook(() => useWorklist());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.items).toHaveLength(2);
    expect(result.current.selected).toBe("P-2");
  });

  it("marks stale on a failed poll but KEEPS the last worklist", async () => {
    vi.useFakeTimers();
    mWorklist.mockResolvedValueOnce([wItem({ asset_id: "P-2" })]).mockRejectedValue(new Error("net down"));
    const { result } = renderHook(() => useWorklist());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.items).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.stale).toBe(true);
    expect(result.current.items).toHaveLength(1); // kept, never blanked
  });
});

describe("useDeviceInsight", () => {
  it("never exposes the previous asset's insight after the selection changes (A→B)", async () => {
    mHealth.mockImplementation((a) => Promise.resolve(health(a)));
    mRca.mockImplementation((a) => Promise.resolve(rca(a)));
    const { result, rerender } = renderHook(({ asset }: { asset: string | null }) => useDeviceInsight(asset), {
      initialProps: { asset: "P-2" as string | null },
    });
    await act(async () => {});
    expect(result.current.insight?.health.asset_id).toBe("P-2");

    rerender({ asset: "P-7" });
    // Before B resolves the primitive still holds A's data — the hook must MASK it, not leak it.
    expect(result.current.insight).toBeNull();
    await act(async () => {});
    expect(result.current.insight?.health.asset_id).toBe("P-7");
  });

  it("keeps the panel empty (never A's) when the new asset's request fails", async () => {
    mHealth.mockImplementation((a) => (a === "P-2" ? Promise.resolve(health(a)) : Promise.reject(new Error("down"))));
    mRca.mockImplementation((a) => Promise.resolve(rca(a)));
    const { result, rerender } = renderHook(({ asset }: { asset: string | null }) => useDeviceInsight(asset), {
      initialProps: { asset: "P-2" as string | null },
    });
    await act(async () => {});
    expect(result.current.insight?.health.asset_id).toBe("P-2");

    rerender({ asset: "P-7" });
    await act(async () => {});
    expect(result.current.insight).toBeNull(); // B failed → NOT A's stale data
  });

  it("masks a SPLIT response — both health and rca must match the asset", async () => {
    mHealth.mockImplementation((a) => Promise.resolve(health(a)));
    mRca.mockResolvedValue(rca("SOME-OTHER-ASSET")); // rca.asset_id never matches the request
    const { result } = renderHook(() => useDeviceInsight("P-2"));
    await act(async () => {});
    // health matched but rca did not → the insight must be null, not a half-matched mix.
    expect(result.current.insight).toBeNull();
  });

  it("does not fetch for a null asset", async () => {
    renderHook(() => useDeviceInsight(null));
    await act(async () => {});
    expect(mHealth).not.toHaveBeenCalled();
    expect(mRca).not.toHaveBeenCalled();
  });
});

describe("useModelCard", () => {
  it("fetches the card once on mount", async () => {
    const card = { model_version: "pwa-health-pttf-v1", datasets: [] } as unknown as ModelCardResponse;
    mModel.mockResolvedValue(card);
    const { result } = renderHook(() => useModelCard());
    await act(async () => {});
    expect(mModel).toHaveBeenCalledTimes(1);
    expect(result.current.card?.model_version).toBe("pwa-health-pttf-v1");
  });
});

describe("useFeedback", () => {
  it("exposes the persisted ack after a resolved POST", async () => {
    const ack: FeedbackAck = {
      id: 42, asset_id: "P-2", verdict: "confirmed",
      created_at: "2026-07-31T01:00:00Z", stored: true,
    };
    mFeedback.mockResolvedValue(ack);
    const { result } = renderHook(() => useFeedback());
    await act(async () => { await result.current.submit({ asset_id: "P-2", verdict: "confirmed" }); });
    expect(result.current.ack?.id).toBe(42);
    expect(result.current.ack?.stored).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("surfaces the API detail on a 404 rather than throwing", async () => {
    mFeedback.mockRejectedValue(new ApiError(404, "unknown asset: NOPE"));
    const { result } = renderHook(() => useFeedback());
    await act(async () => { await result.current.submit({ asset_id: "NOPE", verdict: "confirmed" }); });
    expect(result.current.ack).toBeNull();
    expect(result.current.error).toBe("unknown asset: NOPE");
  });
});
