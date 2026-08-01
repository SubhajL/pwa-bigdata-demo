/**
 * The National Executive Dashboard's read client and pure reducers (PR-10, Stitch S1).
 *
 * HTTP reuses PR-6's `getJson`. The reducers carry the load-bearing view logic and are
 * unit-tested without a DOM (nationalClient.test.ts). `regionBars`/`momYoyFromSeries` operate on
 * REAL curated data; `simulatedEconomics` SYNTHESISES the figures open data cannot supply and is
 * rendered only beside a SimulatedBadge.
 */
import { getJson } from "@/api/client";
import {
  isValidScenario,
  WATER_ECONOMICS_SCENARIO,
  type WaterEconomicsScenario,
} from "@/config/waterEconomicsScenario";

import { NATIONAL_CONFIG } from "./national.config";
import type {
  CuratedMonths,
  EconomicsVM,
  NationalDelta,
  NationalSeries,
  RegionBar,
  RegionRollup,
} from "./types";

// ── HTTP clients ──────────────────────────────────────────────────────────────────────

export function fetchMonths(signal?: AbortSignal): Promise<CuratedMonths> {
  return getJson<CuratedMonths>("/api/curated/months", { signal });
}

export function fetchNational(month: string, signal?: AbortSignal): Promise<RegionRollup> {
  return getJson<RegionRollup>(`/api/curated/national?month=${encodeURIComponent(month)}`, {
    signal,
  });
}

export function fetchNationalSeries(signal?: AbortSignal): Promise<NationalSeries> {
  return getJson<NationalSeries>("/api/curated/national/series", { signal });
}

// ── pure reducers ─────────────────────────────────────────────────────────────────────

/** The month `offset` months before `month` (YYYY-MM). Mirrors `curated._month_offset`. */
export function monthOffset(month: string, offset: number): string {
  const year = parseInt(month.slice(0, 4), 10);
  let m = parseInt(month.slice(5, 7), 10) - offset;
  let y = year;
  while (m <= 0) {
    y -= 1;
    m += 12;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

/**
 * National MoM / YoY change for `month`, computed from the real series.
 *
 * Returns `null` — never 0 — for a comparison whose baseline month is absent from the series or
 * whose baseline is 0 (a zero baseline has no defined percentage change). Matches the backend's
 * per-branch mom/yoy null rule so national and regional views agree on "unknown ≠ no change".
 */
export function momYoyFromSeries(series: NationalSeries, month: string): NationalDelta {
  const totals = new Map(series.points.map((p) => [p.month, p.total_m3]));
  const current = totals.get(month);
  if (current == null) return { momPct: null, yoyPct: null };
  const pct = (baseline: number | undefined): number | null =>
    baseline == null || baseline === 0 ? null : ((current - baseline) / baseline) * 100;
  return { momPct: pct(totals.get(monthOffset(month, 1))), yoyPct: pct(totals.get(monthOffset(month, 12))) };
}

/**
 * SIMULATED national economics from the REAL sold volume `totalM3` and a documented scenario.
 *
 * Open data publishes water SOLD but not water PRODUCED, so NRW — (produced − sold)/produced —
 * and everything downstream is synthesised (POC_SPEC §3.2). Deterministic (no RNG), so the demo
 * is stable:
 *   produced             = sold / (1 − r)
 *   NRW %                = 100 · r
 *   energy cost          = produced · kWh/m³ · ฿/kWh
 *   energy cost / sold m³ = energy cost / sold
 * `null` — never a fake 0 — when the scenario is invalid or the sold volume is non-positive/
 * non-finite; cost-per-sold-m³ is additionally `null` at exactly 0 sold (no division).
 */
export function simulatedEconomics(
  totalM3: number,
  scenario: WaterEconomicsScenario = WATER_ECONOMICS_SCENARIO,
): EconomicsVM {
  const allNull: EconomicsVM = {
    nrwPct: null,
    producedM3: null,
    energyCostThb: null,
    costPerM3Thb: null,
    simulated: true,
  };
  // A usable model needs a valid scenario AND a positive, finite sold volume. Anything else — an
  // invalid scenario, or a non-finite / negative / ZERO volume — leaves EVERY figure (NRW included,
  // since NRW = 0/0 at zero throughput) undefined. Return `null`s, not a plausible-looking 30% next
  // to an unavailable total, and never leak a fake 0.
  if (!isValidScenario(scenario) || !Number.isFinite(totalM3) || totalM3 <= 0) return allNull;
  const nrwPct = scenario.nrwRate * 100;
  const producedM3 = totalM3 / (1 - scenario.nrwRate);
  const energyCostThb = producedM3 * scenario.kwhPerProducedM3 * scenario.thbPerKwh;
  const costPerM3Thb = energyCostThb / totalM3;
  // Even a valid scenario can overflow to Infinity at an absurd volume; surface `null`, not Infinity.
  const finite = (value: number): number | null => (Number.isFinite(value) ? value : null);
  return {
    nrwPct,
    producedM3: finite(producedM3),
    energyCostThb: finite(energyCostThb),
    costPerM3Thb: finite(costPerM3Thb),
    simulated: true,
  };
}

/**
 * Top regions by volume as bar geometry. Regions arrive already sorted descending; `widthPct` is
 * each region's magnitude relative to the largest (ONE hue, magnitude by length). `[]` → `[]`.
 */
export function regionBars(rollup: RegionRollup, topN: number = NATIONAL_CONFIG.topRegions): RegionBar[] {
  const regions = rollup.regions.slice(0, topN);
  if (regions.length === 0) return [];
  const max = Math.max(...regions.map((r) => r.water_sold_m3), Number.MIN_VALUE);
  return regions.map((r) => ({
    region: r.region,
    waterSoldM3: r.water_sold_m3,
    branchCount: r.branch_count,
    // Clamp to [0,100]: a negative/out-of-contract volume must never render a negative-width bar.
    widthPct: Math.max(0, Math.min(100, Math.round((r.water_sold_m3 / max) * 100))),
  }));
}
