/**
 * Pipeline-monitor configuration (PR-8). Also the "config file" half of the source-structure
 * story. A stable module constant: `probeEndpoints` MUST NOT be reconstructed per render, or
 * the probe effect restarts every tick (DREP §4 / Codex §4 identity hazard).
 *
 * Durations are plain millisecond NUMBERS, never duration strings — the eslint token rule bans raw
 * duration string literals in production code; CSS transitions use var(--anim-*).
 */
export const PIPELINE_CONFIG = {
  /** How often to poll GET /api/pipeline/status. */
  statusPollMs: 2000,
  /** Rolling window length for the ingest-rate chart. */
  rateWindowSamples: 30,
  /** Endpoints the in-browser Response-Time table measures (item 1.3). */
  probeEndpoints: [
    "/api/telemetry/P-2/latest",
    "/api/pipeline/status",
    "/api/dlq?limit=1",
  ],
  /** Successful calls averaged per endpoint per round. */
  probeCallsPerRound: 5,
  /** Delay between probe rounds. */
  probeRoundMs: 5000,
  /** Item 1.3 budget; verdict is meanMs <= this (INCLUSIVE). */
  latencyBudgetMs: 500,
  /** DLQ page size (overflow pagination). */
  dlqPageSize: 25,
  /** Asset + window for the retrieval-evidence panel (item 1.4). */
  rangeAsset: "P-2",
  rangeMinutes: 15,
} as const;

export type PipelineConfig = typeof PIPELINE_CONFIG;
