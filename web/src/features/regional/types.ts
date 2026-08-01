/**
 * Typed contracts for the Regional Dashboard (PR-11, Stitch S2).
 *
 * `BranchRow` MIRRORS the REAL `GET /api/curated/regions/{region}` response (`api/app/models.py`
 * `BranchRow`). Water sold and MoM/YoY are REAL PWA figures and carry NO simulated marker; only
 * the region's average NRW (a scenario figure) is simulated.
 */

/** One row of a region's branch league table — REAL (mirrors `models.BranchRow`). */
export interface BranchRow {
  readonly rank: number;
  readonly branch_code: string;
  readonly branch: string;
  readonly province: string;
  readonly region: number;
  readonly water_sold_m3: number;
  /** `null` — never 0 — when the comparison month has no row for this branch, or baseline 0. */
  readonly mom_pct: number | null;
  readonly yoy_pct: number | null;
}

/** GET /api/curated/months (mirrors `models.CuratedMonths`) — the month picker's options. */
export interface CuratedMonths {
  readonly months: readonly string[];
  readonly count: number;
}

import type { StatusKind } from "@/components/StatusChip";

/**
 * Region-level aggregates. `totalM3`/`branchCount` are REAL (from the branch rows). `avgNrwPct` and
 * `watchCount` are SIMULATED — they come from the per-branch mock NRW (produced water is not open
 * data, POC_SPEC §3.2) and must be rendered only beside a `SimulatedBadge`.
 */
export interface RegionSummary {
  readonly totalM3: number;
  readonly branchCount: number;
  /** SIMULATED mean of the per-branch NRW. */
  readonly avgNrwPct: number;
  /** SIMULATED count of branches whose NRW status is not normal (to-watch). */
  readonly watchCount: number;
}

/**
 * One branch's row in the league table. `waterSoldM3`/`momPct`/`yoyPct`/`widthPct` are REAL; the
 * S2 design also shows a per-branch NRW and a status, which are definitionally SIMULATED — carried
 * here as `nrwPct` (mock) + `status` (derived from it) and rendered under a badged column.
 */
export interface BranchBar {
  readonly rank: number;
  readonly branchCode: string;
  readonly branch: string;
  readonly province: string;
  readonly waterSoldM3: number;
  readonly momPct: number | null;
  readonly yoyPct: number | null;
  readonly widthPct: number;
  /** SIMULATED per-branch NRW (illustrative mock, deterministic per branch_code). */
  readonly nrwPct: number;
  /** SIMULATED status derived from `nrwPct` (icon + label in the UI, never colour-alone). */
  readonly status: StatusKind;
}
