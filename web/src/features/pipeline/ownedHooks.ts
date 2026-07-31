/**
 * Generation-owned async primitives shared by the pipeline hooks (PR-8 slice S2).
 *
 * These carry the concurrency-hard logic Codex flagged as the top risk (DREP §9): React
 * StrictMode double-mounts in development, and a poll/reload creates a new in-flight request.
 * A stale round's result must NEVER call setState, and two schedulers must never overlap. The
 * pattern mirrors `features/twin/useTwinSocket.ts`: a generation ref, bumped on every effect run
 * and cleanup, with each async op capturing `myGen` and checking it before touching state.
 *
 * `task`/`options` are supplied stable (callers `useCallback` them, or a ref is synced in an
 * effect) so the React-Compiler lint rules — no ref access during render, no synchronous setState
 * in an effect — are satisfied without an escape hatch.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** A monotonic wall clock for `lastAt` timestamps. */
export const nowMs = (): number => Date.now();

export interface OwnedAsyncResult<T> {
  readonly data: T | null;
  readonly loading: boolean;
  readonly error: string | null;
  /** True after a failure while last-known `data` is being kept (never blank on failure). */
  readonly stale: boolean;
  readonly reload: () => void;
}

/**
 * Run `task(signal)` on mount, whenever `task`'s identity changes, and on `reload()`. `task` MUST
 * be stable (a `useCallback` whose deps are the real inputs) — that is how the caller controls
 * re-runs. Generation-owned + AbortController: a superseded or unmounted run's result is dropped,
 * never setState'd; an AbortError is swallowed. On failure the prior `data` is KEPT and `stale` is
 * set (a data component must not blank on a transient error — INTERACTIONS.md). `loading` is true
 * until the first settle only; a reload keeps the last data rather than flashing a skeleton.
 */
export function useOwnedAsync<T>(task: (signal: AbortSignal) => Promise<T>): OwnedAsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [nonce, setNonce] = useState(0);
  const genRef = useRef(0);

  useEffect(() => {
    genRef.current += 1;
    const myGen = genRef.current;
    const controller = new AbortController();
    task(controller.signal).then(
      (result) => {
        if (myGen !== genRef.current) return;
        setData(result);
        setError(null);
        setStale(false);
        setLoading(false);
      },
      (err: unknown) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        if (myGen !== genRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setStale(true);
        setLoading(false);
      },
    );
    return () => {
      genRef.current += 1;
      controller.abort();
    };
  }, [task, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, stale, reload };
}

export interface OwnedPollOptions<T> {
  readonly task: (signal: AbortSignal) => Promise<T>;
  readonly delayMs: number;
  /** Called with each round's result ONLY while the round is still owned. */
  readonly onResult: (value: T) => void;
  /** Called on a non-abort failure ONLY while owned; the hook decides how to reflect it. */
  readonly onError?: (err: unknown) => void;
  /** When false, no polling runs (e.g. ingest disabled server-side). Default true. */
  readonly enabled?: boolean;
}

/**
 * Poll `task` immediately, then re-run `delayMs` AFTER each settle — a recursive setTimeout, NOT
 * setInterval, so a slow round can never overlap the next (Codex §4). Generation-owned + abort: a
 * superseded round's result is dropped and schedules nothing. Cleanup aborts the in-flight round
 * and cancels the pending timer. `options` may be an inline object; it is read through a ref that
 * is synced in an effect, so no ref is accessed during render.
 */
export function useOwnedPoll<T>(options: OwnedPollOptions<T>): void {
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });
  const genRef = useRef(0);
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    genRef.current += 1;
    const myGen = genRef.current;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const run = (): void => {
      if (myGen !== genRef.current) return;
      controller = new AbortController();
      const { task, onResult, onError, delayMs } = optsRef.current;
      task(controller.signal).then(
        (value) => {
          if (myGen !== genRef.current) return;
          onResult(value);
          timer = setTimeout(run, delayMs);
        },
        (err: unknown) => {
          if (controller?.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
          if (myGen !== genRef.current) return;
          onError?.(err);
          timer = setTimeout(run, delayMs);
        },
      );
    };

    run();
    return () => {
      genRef.current += 1;
      if (timer != null) clearTimeout(timer);
      controller?.abort();
    };
  }, [enabled]);
}
