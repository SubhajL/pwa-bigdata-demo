/**
 * Generation-owned async primitives (PR-8 S2). Authored by Claude; implemented by Claude (Q0 —
 * concurrency correctness has no cheap oracle). These pin the two hazards Codex flagged CRITICAL:
 * a superseded/aborted round must never win a state write, and two schedulers must never overlap.
 */
import { StrictMode, useCallback } from "react";

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useOwnedAsync, useOwnedPoll } from "./ownedHooks";

afterEach(() => vi.useRealTimers());

/** A promise plus its resolver, for driving out-of-order settles deterministically. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useOwnedAsync", () => {
  it("loads, and reloads with the new arg when deps change", async () => {
    const task = vi.fn((n: number) => Promise.resolve(`v${n}`));
    const { result, rerender } = renderHook(
      ({ n }) => {
        const t = useCallback(() => task(n), [n]);
        return useOwnedAsync(t);
      },
      { initialProps: { n: 1 } },
    );
    await act(async () => {});
    expect(result.current.data).toBe("v1");
    rerender({ n: 2 });
    await act(async () => {});
    expect(result.current.data).toBe("v2");
    expect(task).toHaveBeenLastCalledWith(2);
  });

  it("drops a SUPERSEDED run's result — last generation wins even if it settles first", async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const tasks = [d1.promise, d2.promise];
    const { result, rerender } = renderHook(
      ({ n }) => {
        const t = useCallback(() => tasks[n - 1], [n]);
        return useOwnedAsync(t);
      },
      { initialProps: { n: 1 } },
    );
    rerender({ n: 2 }); // supersedes the first run
    await act(async () => d2.resolve("second"));
    await act(async () => d1.resolve("first")); // the stale run settles LATER
    expect(result.current.data).toBe("second"); // must NOT be overwritten by the stale "first"
  });

  it("keeps last-known data and marks stale on a failed reload (never blanks)", async () => {
    let mode: "ok" | "fail" = "ok";
    const task = vi.fn(() => (mode === "ok" ? Promise.resolve("good") : Promise.reject(new Error("boom"))));
    const { result } = renderHook(() => {
      const t = useCallback(() => task(), []);
      return useOwnedAsync(t);
    });
    await act(async () => {});
    expect(result.current.data).toBe("good");
    mode = "fail";
    await act(async () => result.current.reload());
    await act(async () => {});
    expect(result.current.data).toBe("good"); // kept, not blanked
    expect(result.current.stale).toBe(true);
    expect(result.current.error).toContain("boom");
  });

  it("is StrictMode-safe: a double-mount applies exactly one result and emits no warnings", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deferred<string>();
    const { result, unmount } = renderHook(
      () => {
        const t = useCallback(() => d.promise, []);
        return useOwnedAsync(t);
      },
      { wrapper: StrictMode },
    );
    // StrictMode ran the effect twice (mount → cleanup → mount); only the live generation applies.
    await act(async () => d.resolve("value"));
    expect(result.current.data).toBe("value");
    expect(result.current.error).toBeNull();
    expect(errSpy).not.toHaveBeenCalled(); // no "not wrapped in act" / unmounted-setState warning
    unmount();
    await act(async () => {});
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("useOwnedPoll", () => {
  it("runs immediately, re-runs only AFTER each delay, and stops on cleanup", async () => {
    vi.useFakeTimers();
    const onResult = vi.fn();
    const task = vi.fn(() => Promise.resolve("x"));
    const { unmount } = renderHook(() => useOwnedPoll({ task, delayMs: 1000, onResult }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(onResult).toHaveBeenCalledTimes(1); // immediate
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(onResult).toHaveBeenCalledTimes(1); // not yet — recursive schedule, not interval
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onResult).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(onResult).toHaveBeenCalledTimes(2); // no polling after cleanup
  });

  it("does not poll when disabled", async () => {
    vi.useFakeTimers();
    const onResult = vi.fn();
    renderHook(() => useOwnedPoll({ task: () => Promise.resolve("x"), delayMs: 1000, onResult, enabled: false }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(onResult).not.toHaveBeenCalled();
  });

  it("never overlaps rounds — the next starts only after the current settles (max concurrency 1)", async () => {
    vi.useFakeTimers();
    const releases: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    const task = vi.fn(() => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise<string>((resolve) => releases.push(() => { active -= 1; resolve("x"); }));
    });
    const onResult = vi.fn();
    renderHook(() => useOwnedPoll({ task, delayMs: 1000, onResult }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(task).toHaveBeenCalledTimes(1); // round 1 is in flight
    // A setInterval implementation would fire ~5 more rounds here; a recursive one does not.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(task).toHaveBeenCalledTimes(1);
    await act(async () => releases[0]()); // settle round 1
    expect(onResult).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(task).toHaveBeenCalledTimes(2); // round 2 only after settle + delay
    expect(maxActive).toBe(1); // never two rounds in flight at once
  });

  it("reports a failed round via onError but keeps polling", async () => {
    vi.useFakeTimers();
    const onResult = vi.fn();
    const onError = vi.fn();
    let mode: "ok" | "fail" = "fail";
    const task = vi.fn(() => (mode === "fail" ? Promise.reject(new Error("down")) : Promise.resolve("x")));
    renderHook(() => useOwnedPoll({ task, delayMs: 1000, onResult, onError }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(onError).toHaveBeenCalledTimes(1);
    mode = "ok";
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(onResult).toHaveBeenCalledTimes(1); // recovered on the next round
  });
});
