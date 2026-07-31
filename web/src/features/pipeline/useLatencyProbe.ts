/**
 * In-browser latency probing for the Response-Time table (PR-8 S2, scored item 1.3).
 *
 * Each round probes every configured endpoint `probeCallsPerRound` times SEQUENTIALLY — never
 * concurrently, because parallel probes contend and bias the very latency being measured
 * (Codex §4). The round is scheduled again only after it finishes (`useOwnedPoll`).
 */
import { useState } from "react";

import { latencySummary, probeLatency } from "./pipelineClient";
import { nowMs, useOwnedPoll } from "./ownedHooks";
import { PIPELINE_CONFIG } from "./pipeline.config";
import type { LatencySummary } from "./types";

/**
 * Probe each endpoint `calls` times in series and summarise per endpoint. Pure over `probeLatency`
 * (injected-clock friendly). Aborts between calls if the signal trips.
 */
export async function runProbeRound(
  endpoints: readonly string[],
  calls: number,
  signal?: AbortSignal,
): Promise<LatencySummary[]> {
  const summaries: LatencySummary[] = [];
  for (const path of endpoints) {
    const results = [];
    for (let i = 0; i < calls; i += 1) {
      if (signal?.aborted) break;
      results.push(await probeLatency(path, { signal }));
    }
    summaries.push(latencySummary(results));
  }
  return summaries;
}

export interface UseLatencyProbeResult {
  readonly summaries: readonly LatencySummary[];
  readonly lastAt: number | null;
}

export function useLatencyProbe(): UseLatencyProbeResult {
  const [summaries, setSummaries] = useState<readonly LatencySummary[]>([]);
  const [lastAt, setLastAt] = useState<number | null>(null);

  useOwnedPoll<LatencySummary[]>({
    task: (signal) => runProbeRound(PIPELINE_CONFIG.probeEndpoints, PIPELINE_CONFIG.probeCallsPerRound, signal),
    delayMs: PIPELINE_CONFIG.probeRoundMs,
    onResult: (s) => {
      setSummaries(s);
      setLastAt(nowMs());
    },
  });

  return { summaries, lastAt };
}
