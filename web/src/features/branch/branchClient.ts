/**
 * The Branch Dashboard's read client and pure reducers (PR-12, Stitch S3).
 *
 * HTTP reuses PR-6's `getJson`. The reducers are unit-tested without a DOM (branchClient.test.ts).
 * `branchVitals` operates on the REAL branch series; `median` supports the REAL "vs region median"
 * reference. The branch's SIMULATED NRW/status are NOT computed here — they are sourced from the
 * region league (via the Regional feature) so they match the Regional screen exactly.
 */
import { getJson } from "@/api/client";
import type { ChartDims } from "@/features/pipeline/types";
import { monthOffset } from "@/features/national/nationalClient";

import type { BranchSeries, BranchVitals, CuratedMonths, SeriesPoint } from "./types";

// ── HTTP clients ──────────────────────────────────────────────────────────────────────

export function fetchMonths(signal?: AbortSignal): Promise<CuratedMonths> {
  return getJson<CuratedMonths>("/api/curated/months", { signal });
}

export function fetchBranch(branchCode: string, signal?: AbortSignal): Promise<BranchSeries> {
  return getJson<BranchSeries>(`/api/curated/branches/${encodeURIComponent(branchCode)}`, { signal });
}

// ── pure reducers ─────────────────────────────────────────────────────────────────────

/**
 * REAL headline figures for the SELECTED `month`: that month's volume, and MoM/YoY against the
 * adjacent and year-ago months. Reading the selected month (not always the latest) keeps the KPI
 * headline consistent with the selected-month rank/median/NRW — mixing months would compare, e.g., a
 * December volume against a September median. `null` (never 0) when the branch has no row for the
 * month, or when the comparison month is absent / its baseline is 0.
 */
export function branchVitals(series: BranchSeries, month: string): BranchVitals {
  const byMonth = new Map(series.points.map((p) => [p.month, p.water_sold_m3]));
  const current = byMonth.get(month);
  if (current == null) return { month, m3: null, momPct: null, yoyPct: null };
  const pct = (baseline: number | undefined): number | null =>
    baseline == null || baseline === 0 ? null : ((current - baseline) / baseline) * 100;
  return {
    month,
    m3: current,
    momPct: pct(byMonth.get(monthOffset(month, 1))),
    yoyPct: pct(byMonth.get(monthOffset(month, 12))),
  };
}

/** Median of a numeric list. `[]` → null. Even length → mean of the two middle values. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface BranchTrendGeometry {
  /** SVG path for the branch series polyline. */
  readonly d: string;
  /** y of the region-median reference line, or null when there is no median. */
  readonly medianY: number | null;
  /** The axis max, in millions of m³ (for the y-axis label). */
  readonly maxMillion: number;
}

/**
 * Geometry for the branch trend line. Unlike the pipeline `buildChartPath` (which floors its max at
 * 1, squashing a small branch that sells ~0.2M m³/month), this scales to the ACTUAL data max — and
 * INCLUDES the region median in that max, so a below-median branch's reference line still fits on
 * the chart. Values are in millions of m³. `[]` → empty path, null median line.
 */
export function buildBranchTrend(
  points: readonly SeriesPoint[],
  regionMedianM3: number | null,
  dims: ChartDims,
): BranchTrendGeometry {
  const { w, h, pad } = dims;
  const sorted = [...points].sort((a, b) => a.month.localeCompare(b.month));
  const samples = sorted.map((p) => p.water_sold_m3 / 1_000_000);
  const medianMillion = regionMedianM3 != null ? regionMedianM3 / 1_000_000 : null;
  const max = Math.max(...samples, medianMillion ?? 0, Number.MIN_VALUE);
  const plotW = w - 2 * pad;
  const plotH = h - 2 * pad;
  const y = (value: number): number => h - pad - (value / max) * plotH;
  const n = samples.length;
  const verts = samples.map((v, i) => `${pad + plotW * (n <= 1 ? 0 : i / (n - 1))},${y(v)}`);
  const d = n === 0 ? "" : "M" + verts[0] + (verts.length > 1 ? " L" + verts.slice(1).join(" L") : "");
  return { d, medianY: medianMillion != null ? y(medianMillion) : null, maxMillion: max };
}
