/**
 * Typed contracts for the National Executive Dashboard (PR-10, Stitch S1).
 *
 * The wire types MIRROR the REAL curated responses in `api/app/models.py`
 * (`RegionRollup`, `RegionTotal`, `CuratedMonths`, `NationalSeries`). Water-sold figures are
 * REAL PWA data and must NEVER be marked simulated.
 *
 * `EconomicsVM` is different: NRW / energy cost / cost-per-m³ are definitionally synthetic
 * (POC_SPEC §3.2 — the produced-water numerator is not in open data), derived on the client by
 * `simulatedEconomics` and rendered ONLY beside a `SimulatedBadge`.
 */

/** One region's share of a month's national total (mirrors `models.RegionTotal`). REAL. */
export interface RegionTotal {
  readonly region: number;
  readonly water_sold_m3: number;
  readonly branch_count: number;
}

/** National roll-up for one month — GET /api/curated/national (mirrors `models.RegionRollup`). */
export interface RegionRollup {
  readonly month: string;
  readonly total_m3: number;
  readonly branch_count: number;
  /** Sorted by water_sold_m3 descending. */
  readonly regions: readonly RegionTotal[];
}

/** GET /api/curated/months (mirrors `models.CuratedMonths`). */
export interface CuratedMonths {
  readonly months: readonly string[];
  readonly count: number;
}

/** One month of the national series (mirrors `models.NationalSeriesPoint`). REAL. */
export interface NationalSeriesPoint {
  readonly month: string;
  readonly total_m3: number;
  readonly branch_count: number;
}

/** GET /api/curated/national/series (mirrors `models.NationalSeries`). REAL. */
export interface NationalSeries {
  readonly points: readonly NationalSeriesPoint[];
}

// ── view models (derived; never on the wire) ──────────────────────────────────────────

/** National month-over-month / year-over-year change. `null` — never 0 — when the comparison
 *  month is absent or its baseline is 0 (a zero baseline has no defined percentage change). */
export interface NationalDelta {
  readonly momPct: number | null;
  readonly yoyPct: number | null;
}

/** SIMULATED national economics derived from the REAL sold volume. Renders behind a
 *  SimulatedBadge only. Fields are `null` — never a fake 0 — when undefined: an invalid scenario,
 *  a non-positive/non-finite sold volume, or (for cost-per-m³) a zero sold volume. `simulated` is
 *  a literal `true` so a consumer cannot forget the marker. */
export interface EconomicsVM {
  readonly nrwPct: number | null;
  readonly producedM3: number | null;
  readonly energyCostThb: number | null;
  readonly costPerM3Thb: number | null;
  readonly simulated: true;
}

/** One region's bar in the "top regions by volume" chart. REAL. `widthPct` is magnitude vs the
 *  largest region (one hue, magnitude by length — never a categorical colour). */
export interface RegionBar {
  readonly region: number;
  readonly waterSoldM3: number;
  readonly branchCount: number;
  readonly widthPct: number;
}
