/**
 * usePipelineStatus / useLatencyProbe / useDlq / useRange + their pure helpers (PR-8 S2).
 * Only the NETWORK functions are mocked; the S1 pure reducers (latencySummary, …) stay real.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DlqResponse, EnabledStatus, LatencyResult, RangeResponse } from "./types";

vi.mock("./pipelineClient", async (importActual) => {
  const actual = await importActual<typeof import("./pipelineClient")>();
  return {
    ...actual,
    fetchPipelineStatus: vi.fn(),
    fetchDlq: vi.fn(),
    fetchRange: vi.fn(),
    probeLatency: vi.fn(),
  };
});

import { fetchDlq, fetchPipelineStatus, fetchRange, probeLatency } from "./pipelineClient";
import { pushSample } from "./usePipelineStatus";
import { runProbeRound } from "./useLatencyProbe";
import { usePipelineStatus } from "./usePipelineStatus";
import { useDlq, useDlqLiveRefresh, type UseDlqResult } from "./useDlq";
import { useRange } from "./useRange";

const mFetchStatus = vi.mocked(fetchPipelineStatus);
const mFetchDlq = vi.mocked(fetchDlq);
const mFetchRange = vi.mocked(fetchRange);
const mProbe = vi.mocked(probeLatency);

function status(received: number, runId = "run-a"): EnabledStatus {
  return {
    state: "connected", granted_qos: 1, connected_count: 1, disconnect_count: 0,
    received, overflowed: 0, unstored: 0, last_error: null, queue_depth: 0,
    subscriber_run_id: runId, twin_subscribers: 0, twin_frames_dropped: 0,
    conservation: { ledger: received, telemetry: received, dead_letter: 0, holds: true },
  };
}
function lat(over: Partial<LatencyResult> & { path: string }): LatencyResult {
  return { roundTripMs: 10, dbMs: 1, ok: true, status: 200, ...over };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe("pushSample (pure)", () => {
  it("appends and caps to the window", () => {
    const s = (n: number) => ({ received: n, runId: "a", t: n });
    expect(pushSample([], s(1), 3)).toEqual([s(1)]);
    expect(pushSample([s(1), s(2), s(3)], s(4), 3)).toEqual([s(2), s(3), s(4)]);
  });
  it("RESETS the window when the run id changes (a process restart, not this session)", () => {
    const a = { received: 900, runId: "a", t: 1 };
    const b = { received: 5, runId: "b", t: 2 };
    expect(pushSample([a], b, 3)).toEqual([b]); // old run's counters dropped, not carried
  });
});

describe("runProbeRound (sequential, per-endpoint summaries)", () => {
  it("probes each endpoint `calls` times in series and summarises per endpoint", async () => {
    const order: string[] = [];
    mProbe.mockImplementation((path: string) => {
      order.push(path);
      return Promise.resolve(lat({ path, roundTripMs: path === "a" ? 100 : 600 }));
    });
    const summaries = await runProbeRound(["a", "b"], 2);
    expect(mProbe).toHaveBeenCalledTimes(4);
    expect(order).toEqual(["a", "a", "b", "b"]); // sequential, endpoint-grouped
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({ path: "a", meanMs: 100, underBudget: true });
    expect(summaries[1]).toMatchObject({ path: "b", meanMs: 600, underBudget: false });
  });
});

describe("usePipelineStatus", () => {
  it("accumulates an ingest sample per successful poll", async () => {
    vi.useFakeTimers();
    let n = 100;
    mFetchStatus.mockImplementation(() => Promise.resolve(status((n += 10))));
    const { result } = renderHook(() => usePipelineStatus());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.status?.state).toBe("connected");
    expect(result.current.samples).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.samples).toHaveLength(2);
    expect(result.current.samples[1].received).toBeGreaterThan(result.current.samples[0].received);
  });

  it("marks stale on a failed poll but keeps the last status", async () => {
    vi.useFakeTimers();
    mFetchStatus.mockResolvedValueOnce(status(50)).mockRejectedValue(new Error("net down"));
    const { result } = renderHook(() => usePipelineStatus());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.status?.state).toBe("connected");
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.stale).toBe(true);
    expect(result.current.status?.state).toBe("connected"); // kept, not blanked
  });
});

describe("useDlq", () => {
  it("loads the first page, and reloads with a new offset on setOffset", async () => {
    const page = (offset: number): DlqResponse => ({ count: 1, limit: 25, offset, items: [] });
    mFetchDlq.mockImplementation((_l?: number, offset = 0) => Promise.resolve(page(offset)));
    const { result } = renderHook(() => useDlq());
    await act(async () => {});
    expect(result.current.page?.offset).toBe(0);
    await act(async () => result.current.setOffset(25));
    await act(async () => {});
    expect(mFetchDlq).toHaveBeenLastCalledWith(25, 25, expect.anything());
    expect(result.current.page?.offset).toBe(25);
  });
});

describe("useRange", () => {
  it("loads the range readings for item 1.4", async () => {
    const range: RangeResponse = { asset_id: "P-2", window_minutes: 15, count: 2, readings: [] };
    mFetchRange.mockResolvedValue(range);
    const { result } = renderHook(() => useRange());
    await act(async () => {});
    expect(result.current.data?.count).toBe(2);
  });
});

// ── useDlqLiveRefresh (PR-B, item 1.5 same-DOM visibility) ────────────────────────────
describe("useDlqLiveRefresh", () => {
  function dlqResult(over: Partial<UseDlqResult> = {}): UseDlqResult {
    return {
      page: null, offset: 0, loading: false, error: null, stale: false,
      setOffset: () => {}, reload: () => {}, ...over,
    };
  }

  it("reloads page 0 when the live total changes — never on the first arrival", () => {
    const reload = vi.fn();
    const { rerender } = renderHook(
      ({ total, dlq }: { total: number | null; dlq: UseDlqResult }) => useDlqLiveRefresh(dlq, total),
      { initialProps: { total: 5 as number | null, dlq: dlqResult({ reload }) } },
    );
    expect(reload).not.toHaveBeenCalled(); // first arrival is not a change
    rerender({ total: 5, dlq: dlqResult({ reload }) });
    expect(reload).not.toHaveBeenCalled(); // unchanged total
    rerender({ total: 6, dlq: dlqResult({ reload }) });
    expect(reload).toHaveBeenCalledTimes(1); // a dead letter landed → page 0 refetch
  });

  it("never reloads while the operator is off page 0", () => {
    const reload = vi.fn();
    const { rerender } = renderHook(
      ({ total, dlq }: { total: number | null; dlq: UseDlqResult }) => useDlqLiveRefresh(dlq, total),
      { initialProps: { total: 5 as number | null, dlq: dlqResult({ reload, offset: 25 }) } },
    );
    rerender({ total: 9, dlq: dlqResult({ reload, offset: 25 }) });
    expect(reload).not.toHaveBeenCalled(); // browsing history is never yanked back
  });

  it("coalesces changes during an in-flight request into ONE follow-up reload", () => {
    const reload = vi.fn();
    const { rerender } = renderHook(
      ({ total, dlq }: { total: number | null; dlq: UseDlqResult }) => useDlqLiveRefresh(dlq, total),
      { initialProps: { total: 5 as number | null, dlq: dlqResult({ reload, loading: true }) } },
    );
    rerender({ total: 6, dlq: dlqResult({ reload, loading: true }) }); // change mid-flight
    rerender({ total: 7, dlq: dlqResult({ reload, loading: true }) }); // another change
    expect(reload).not.toHaveBeenCalled(); // no abort-storm: in-flight page left to settle
    rerender({ total: 7, dlq: dlqResult({ reload, loading: false }) }); // request settled
    expect(reload).toHaveBeenCalledTimes(1); // exactly one catch-up refetch
  });
});
