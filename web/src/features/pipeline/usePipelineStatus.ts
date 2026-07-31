/**
 * Polls GET /api/pipeline/status and keeps a rolling window of ingest-rate samples (PR-8 S2).
 *
 * Per-poll it appends an `IngestSample` (received counter + subscriber_run_id + wall clock) so the
 * chart can difference them into msg/s. On a failed poll it sets `stale` and KEEPS the last status
 * — never blanks the pill (INTERACTIONS.md). Concurrency/ownership live in `useOwnedPoll`.
 */
import { useState } from "react";

import { fetchPipelineStatus } from "./pipelineClient";
import { nowMs, useOwnedPoll } from "./ownedHooks";
import { PIPELINE_CONFIG } from "./pipeline.config";
import type { IngestSample, PipelineStatus } from "./types";

/**
 * Append `sample` and keep only the newest `cap` (pure; the chart differences the window). A
 * change of `runId` means the API process restarted: the earlier run's counters are meaningless
 * for "this session", so the window RESETS to the new sample rather than carrying stale rates.
 */
export function pushSample(prev: readonly IngestSample[], sample: IngestSample, cap: number): IngestSample[] {
  if (prev.length > 0 && prev[prev.length - 1].runId !== sample.runId) {
    return [sample];
  }
  const next = [...prev, sample];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export interface UsePipelineStatusResult {
  readonly status: PipelineStatus | null;
  readonly samples: readonly IngestSample[];
  readonly error: string | null;
  readonly stale: boolean;
  readonly lastAt: number | null;
}

export function usePipelineStatus(): UsePipelineStatusResult {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [samples, setSamples] = useState<readonly IngestSample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);

  useOwnedPoll<PipelineStatus>({
    task: (signal) => fetchPipelineStatus(signal),
    delayMs: PIPELINE_CONFIG.statusPollMs,
    onResult: (s) => {
      setStatus(s);
      setError(null);
      setStale(false);
      setLastAt(nowMs());
      // A per-process sample only when the enabled snapshot carries a run id and counter.
      if (s.state !== "disabled" && s.subscriber_run_id != null) {
        setSamples((prev) =>
          pushSample(
            prev,
            { received: s.received, runId: s.subscriber_run_id as string, t: performance.now() },
            PIPELINE_CONFIG.rateWindowSamples,
          ),
        );
      }
    },
    onError: (e) => {
      setStale(true);
      setError(e instanceof Error ? e.message : String(e));
    },
  });

  return { status, samples, error, stale, lastAt };
}
