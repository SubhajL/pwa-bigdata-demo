/**
 * Typed contracts for the Branch Dashboard (PR-12, Stitch S3).
 *
 * `BranchSeries`/`SeriesPoint` MIRROR the REAL `GET /api/curated/branches/{code}` response
 * (`api/app/models.py`). The water-sold history is REAL PWA data (no badge); the branch NRW/status
 * are SIMULATED (sourced from the region league so they match the Regional screen exactly).
 */
import type { StatusKind } from "@/components/StatusChip";

/** One month of a branch's history — REAL (mirrors `models.SeriesPoint`). */
export interface SeriesPoint {
  readonly month: string;
  readonly water_sold_m3: number;
}

/** A branch's full monthly history — REAL (mirrors `models.BranchSeries`). */
export interface BranchSeries {
  readonly branch_code: string;
  readonly branch: string;
  readonly province: string;
  readonly region: number;
  readonly points: readonly SeriesPoint[];
}

/** GET /api/curated/months (mirrors `models.CuratedMonths`) — the month picker's options. */
export interface CuratedMonths {
  readonly months: readonly string[];
  readonly count: number;
}

// ── view models (derived) ─────────────────────────────────────────────────────────────

/** REAL headline figures for the SELECTED month (not merely the latest), so the KPI headline stays
 *  consistent with the selected-month rank/median/NRW. `null` — never 0 — when the branch has no row
 *  for that month, or when the comparison (prev/year-ago) month is absent. */
export interface BranchVitals {
  readonly month: string | null;
  readonly m3: number | null;
  readonly momPct: number | null;
  readonly yoyPct: number | null;
}

/** SIMULATED branch NRW + status (from the region league, so identical to the Regional screen), and
 *  the branch's REAL rank/percentile within its region. `nrwPct`/`status` are `null` when the branch
 *  has no row in the selected month's league. */
export interface BranchStanding {
  readonly nrwPct: number | null;
  readonly status: StatusKind | null;
  readonly rank: number | null;
  readonly branchCount: number;
  /** REAL median branch volume in the region this month — the "vs ค่ากลางเขต" reference. */
  readonly regionMedianM3: number | null;
}
