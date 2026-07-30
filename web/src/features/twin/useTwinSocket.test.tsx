/**
 * useTwinSocket lifecycle + reducer (DREP-PR7c R3/R4/R5, FN4).
 *
 * Uses a controllable fake WebSocket and fake timers. jsdom cannot run a real socket; what this
 * proves is the REDUCER and the LIFECYCLE (generation ownership, backoff, no timer leak, control
 * frames) — the live browser→proxy→FastAPI flow is PR-17's Playwright, stated not pretended.
 *
 * Authored by Claude; the implementer must not modify this file (DREP §10).
 */
import { StrictMode } from "react";

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyFrame, parseFrame, useTwinSocket } from "./useTwinSocket";
import type { DeviceLiveState, TwinEventFrame } from "./types";

// ── a controllable fake WebSocket ─────────────────────────────────────────────────────
class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
  // test helpers
  open(): void {
    this.onopen?.();
  }
  message(frame: object): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  drop(): void {
    this.onclose?.();
  }
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket as unknown as typeof WebSocket);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("parseFrame", () => {
  it("keeps status/health data frames and control frames, drops the rest", () => {
    expect(parseFrame({ kind: "status", asset_id: "P-2", status: "warning" })?.kind).toBe("status");
    expect(parseFrame({ kind: "disabled", detail: "MQTT_ENABLED=0" })?.kind).toBe("disabled");
    expect(parseFrame({ kind: "busy" })?.kind).toBe("busy");
    expect(parseFrame({ kind: "status" })).toBeNull(); // no asset/status
    expect(parseFrame({ kind: "nonsense" })).toBeNull();
    expect(parseFrame(null)).toBeNull();
    expect(parseFrame("x")).toBeNull();
  });
});

describe("applyFrame — reducer (R5, ordering)", () => {
  const empty = new Map<string, DeviceLiveState>();
  const f = (over: Partial<TwinEventFrame>): TwinEventFrame => ({
    kind: "status",
    asset_id: "P-2",
    status: "warning",
    signal: "pressure_bar",
    value: 1,
    observed_at: "2026-01-02T00:00:00Z",
    ...over,
  });

  it("keeps different signals separate (pressure not masked by flow)", () => {
    let m = applyFrame(empty, f({ signal: "pressure_bar", status: "warning" }));
    m = applyFrame(m, f({ signal: "flow_m3h", status: "normal" }));
    expect(m.get("P-2")!.perSignal.pressure_bar.status).toBe("warning");
    expect(m.get("P-2")!.perSignal.flow_m3h.status).toBe("normal");
  });

  it("keeps health separate from per-signal frames", () => {
    let m = applyFrame(empty, f({ kind: "health", signal: null, status: "critical" }));
    m = applyFrame(m, f({ signal: "flow_m3h", status: "normal" }));
    expect(m.get("P-2")!.health!.status).toBe("critical");
  });

  it("rejects an older same-signal frame (out-of-order delivery)", () => {
    let m = applyFrame(empty, f({ status: "warning", observed_at: "2026-01-02T00:00:00Z" }));
    m = applyFrame(m, f({ status: "normal", observed_at: "2026-01-01T00:00:00Z" })); // older
    expect(m.get("P-2")!.perSignal.pressure_bar.status).toBe("warning");
  });

  it("accepts a newer same-signal frame (recovery)", () => {
    let m = applyFrame(empty, f({ status: "warning", observed_at: "2026-01-01T00:00:00Z" }));
    m = applyFrame(m, f({ status: "normal", observed_at: "2026-01-02T00:00:00Z" }));
    expect(m.get("P-2")!.perSignal.pressure_bar.status).toBe("normal");
  });
});

describe("useTwinSocket — lifecycle", () => {
  it("opens a socket and reduces a pushed frame with no refetch (R3)", () => {
    const { result } = renderHook(() => useTwinSocket());
    expect(FakeSocket.instances).toHaveLength(1);
    act(() => FakeSocket.instances[0].open());
    expect(result.current.connection).toBe("open");
    act(() => FakeSocket.instances[0].message({ kind: "status", asset_id: "P-2", status: "critical", signal: "pressure_bar", value: 1 }));
    expect(result.current.byAsset.get("P-2")!.perSignal.pressure_bar.status).toBe("critical");
  });

  it("reconnects with backoff after a close it did not initiate (R4)", () => {
    const { result } = renderHook(() => useTwinSocket());
    act(() => FakeSocket.instances[0].open());
    act(() => FakeSocket.instances[0].drop());
    expect(result.current.connection).toBe("reconnecting");
    act(() => vi.advanceTimersByTime(600)); // > reconnectBaseMs
    expect(FakeSocket.instances).toHaveLength(2); // a new socket was opened
  });

  it("does not double-schedule when onerror and onclose both fire", () => {
    renderHook(() => useTwinSocket());
    const s = FakeSocket.instances[0];
    act(() => s.open());
    act(() => {
      s.onerror?.();
      s.onclose?.(); // the first handler nulled the others, so this is inert
    });
    act(() => vi.advanceTimersByTime(600));
    expect(FakeSocket.instances).toHaveLength(2); // exactly one reconnect, not two
  });

  it("stops on a `disabled` control frame instead of hammering", () => {
    const { result } = renderHook(() => useTwinSocket());
    act(() => FakeSocket.instances[0].open());
    act(() => FakeSocket.instances[0].message({ kind: "disabled", detail: "MQTT_ENABLED=0" }));
    expect(result.current.connection).toBe("disabled");
    act(() => FakeSocket.instances[0].drop()); // the close that follows must NOT reconnect
    act(() => vi.advanceTimersByTime(10_000));
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("closes the socket and cancels the retry on unmount — no timer leak (R4)", () => {
    const { unmount } = renderHook(() => useTwinSocket());
    act(() => FakeSocket.instances[0].open());
    act(() => FakeSocket.instances[0].drop()); // schedules a reconnect
    unmount();
    act(() => vi.advanceTimersByTime(60_000)); // long past the cap
    // No new socket after unmount, and the first was closed.
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0].closed).toBe(true);
  });

  it("clears accumulated live state on a reopen so a stale status cannot persist (HIGH-2)", () => {
    const { result } = renderHook(() => useTwinSocket());
    act(() => FakeSocket.instances[0].open());
    act(() => FakeSocket.instances[0].message({ kind: "health", asset_id: "P-2", status: "critical" }));
    expect(result.current.byAsset.get("P-2")!.health!.status).toBe("critical");
    // Disconnect and reconnect: the reopened socket must present a CLEAN slate, so the screen
    // resyncs from fresh topology (a recovery missed while disconnected is not stuck critical).
    act(() => FakeSocket.instances[0].drop());
    act(() => vi.advanceTimersByTime(600));
    act(() => FakeSocket.instances[1].open());
    expect(result.current.byAsset.size).toBe(0);
    // ...and the generation bumped, which is what tells the screen to refetch topology.
    expect(result.current.generation).toBeGreaterThanOrEqual(2);
  });

  it("a retained socket-1 callback is rejected by generation after a reconnect (HIGH-1)", () => {
    const { result } = renderHook(() => useTwinSocket());
    const s1 = FakeSocket.instances[0];
    act(() => s1.open());
    // Retain socket-1's message handler BEFORE it is nulled, to prove the GENERATION check —
    // not just the handler-nulling — rejects it.
    const s1message = s1.onmessage!;
    act(() => s1.drop()); // schedules reconnect (and nulls s1's handlers)
    act(() => vi.advanceTimersByTime(600)); // socket 2 opens
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => FakeSocket.instances[1].open());
    const before = result.current.byAsset.size;
    // Invoke the RETAINED socket-1 handler directly. Its generation is stale → ignored.
    act(() => s1message({ data: JSON.stringify({ kind: "status", asset_id: "GHOST", status: "critical", signal: "pressure_bar", value: 1 }) }));
    expect(result.current.byAsset.has("GHOST")).toBe(false);
    expect(result.current.byAsset.size).toBe(before);
  });

  it("under StrictMode, a stale socket's late callbacks cannot mutate state", () => {
    const { result } = renderHook(() => useTwinSocket(), { wrapper: StrictMode });
    // StrictMode mounts, unmounts, remounts → more than one socket created; the last is live.
    expect(FakeSocket.instances.length).toBeGreaterThanOrEqual(2);
    const stale = FakeSocket.instances[0];
    const live = FakeSocket.instances[FakeSocket.instances.length - 1];
    act(() => live.open());
    // A late message on the STALE socket must be ignored.
    act(() => stale.message({ kind: "status", asset_id: "GHOST", status: "critical", signal: "pressure_bar", value: 1 }));
    expect(result.current.byAsset.has("GHOST")).toBe(false);
  });
});
