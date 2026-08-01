import { describe, expect, it } from "vitest";

import {
  isValidScenario,
  WATER_ECONOMICS_SCENARIO,
  type WaterEconomicsScenario,
} from "@/config/waterEconomicsScenario";

import { momYoyFromSeries, monthOffset, regionBars, simulatedEconomics } from "./nationalClient";
import type { NationalSeries, RegionRollup } from "./types";

function series(points: Array<[string, number]>): NationalSeries {
  return { points: points.map(([month, total_m3]) => ({ month, total_m3, branch_count: 1 })) };
}

function rollup(regions: Array<[number, number]>): RegionRollup {
  const sorted = [...regions].sort((a, b) => b[1] - a[1]);
  return {
    month: "2025-12",
    total_m3: sorted.reduce((s, [, v]) => s + v, 0),
    branch_count: sorted.length,
    regions: sorted.map(([region, water_sold_m3]) => ({ region, water_sold_m3, branch_count: 1 })),
  };
}

describe("monthOffset", () => {
  it("subtracts within a year and rolls back across year and decade boundaries", () => {
    expect(monthOffset("2025-12", 1)).toBe("2025-11");
    expect(monthOffset("2023-01", 1)).toBe("2022-12");
    expect(monthOffset("2025-12", 12)).toBe("2024-12");
    expect(monthOffset("2022-01", 12)).toBe("2021-01");
  });
});

describe("momYoyFromSeries", () => {
  const s = series([
    ["2024-12", 100],
    ["2025-11", 200],
    ["2025-12", 220],
  ]);

  it("computes signed MoM and YoY percentages against the real baselines", () => {
    const d = momYoyFromSeries(s, "2025-12");
    expect(d.momPct).toBeCloseTo((220 - 200) / 200 * 100, 6); // +10%
    expect(d.yoyPct).toBeCloseTo((220 - 100) / 100 * 100, 6); // +120%
  });

  it("returns null (never 0) when the comparison month is absent", () => {
    const d = momYoyFromSeries(series([["2025-12", 220]]), "2025-12");
    expect(d.momPct).toBeNull();
    expect(d.yoyPct).toBeNull();
  });

  it("returns null when the baseline is 0 — a zero baseline has no defined change", () => {
    const d = momYoyFromSeries(series([["2025-11", 0], ["2025-12", 220]]), "2025-12");
    expect(d.momPct).toBeNull();
  });

  it("returns both null when the month itself is not in the series", () => {
    expect(momYoyFromSeries(s, "2099-01")).toEqual({ momPct: null, yoyPct: null });
  });
});

describe("isValidScenario", () => {
  it("accepts the committed scenario and rejects out-of-range assumptions", () => {
    expect(isValidScenario(WATER_ECONOMICS_SCENARIO)).toBe(true);
    expect(isValidScenario({ ...WATER_ECONOMICS_SCENARIO, nrwRate: 1 })).toBe(false);
    expect(isValidScenario({ ...WATER_ECONOMICS_SCENARIO, nrwRate: -0.1 })).toBe(false);
    expect(isValidScenario({ ...WATER_ECONOMICS_SCENARIO, thbPerKwh: -1 })).toBe(false);
    expect(isValidScenario({ ...WATER_ECONOMICS_SCENARIO, kwhPerProducedM3: NaN })).toBe(false);
  });
});

describe("simulatedEconomics", () => {
  it("derives produced > sold, positive energy cost and cost per sold m³, deterministically", () => {
    const a = simulatedEconomics(1_000_000);
    const b = simulatedEconomics(1_000_000);
    expect(a).toEqual(b); // no RNG — the demo is stable
    expect(a.simulated).toBe(true);
    expect(a.nrwPct).toBeCloseTo(WATER_ECONOMICS_SCENARIO.nrwRate * 100, 9);
    expect(a.producedM3 ?? 0).toBeGreaterThan(1_000_000); // produced = sold / (1 - nrw)
    expect(a.energyCostThb ?? 0).toBeGreaterThan(0);
    expect(a.costPerM3Thb ?? 0).toBeGreaterThan(0);
  });

  it("uses produced = sold / (1 - nrw) exactly", () => {
    const e = simulatedEconomics(700_000);
    expect(e.producedM3).toBeCloseTo(700_000 / (1 - WATER_ECONOMICS_SCENARIO.nrwRate), 3);
  });

  const ALL_NULL = {
    nrwPct: null,
    producedM3: null,
    energyCostThb: null,
    costPerM3Thb: null,
    simulated: true,
  };

  it("returns ALL nulls at zero sold — no throughput, no defined economics (NRW is 0/0)", () => {
    expect(simulatedEconomics(0)).toEqual(ALL_NULL);
  });

  it("returns ALL nulls (incl. NRW, never a plausible 30% or Infinity) for negative/non-finite sold", () => {
    for (const bad of [-1, NaN, Infinity, -Infinity]) {
      expect(simulatedEconomics(bad)).toEqual(ALL_NULL);
    }
  });

  it("nulls the derived figures (never Infinity) when the volume overflows the model", () => {
    const e = simulatedEconomics(Number.MAX_VALUE);
    expect(e.producedM3).toBeNull();
    expect(e.energyCostThb).toBeNull();
    expect(e.costPerM3Thb).toBeNull();
  });

  it("returns all nulls for an invalid scenario (nrw >= 1 has no defined produced water)", () => {
    const invalid: WaterEconomicsScenario = { ...WATER_ECONOMICS_SCENARIO, nrwRate: 1 };
    const e = simulatedEconomics(1_000_000, invalid);
    expect(e).toEqual({
      nrwPct: null,
      producedM3: null,
      energyCostThb: null,
      costPerM3Thb: null,
      simulated: true,
    });
  });
});

describe("regionBars", () => {
  it("keeps the descending order and scales width to the largest region", () => {
    const bars = regionBars(rollup([[1, 50], [2, 100], [3, 25]]));
    expect(bars.map((b) => b.region)).toEqual([2, 1, 3]);
    expect(bars[0].widthPct).toBe(100);
    expect(bars[1].widthPct).toBe(50);
    expect(bars[2].widthPct).toBe(25);
  });

  it("returns [] for a month with no regions", () => {
    expect(regionBars(rollup([]))).toEqual([]);
  });

  it("clamps an out-of-contract negative volume to a non-negative width", () => {
    const bars = regionBars(rollup([[1, 100], [2, -50]]));
    expect(bars.every((b) => b.widthPct >= 0 && b.widthPct <= 100)).toBe(true);
    expect(bars.find((b) => b.region === 2)!.widthPct).toBe(0);
  });

  it("caps the number of bars at topN", () => {
    const many = rollup(Array.from({ length: 10 }, (_, i) => [i + 1, (i + 1) * 10] as [number, number]));
    expect(regionBars(many, 3)).toHaveLength(3);
  });
});
