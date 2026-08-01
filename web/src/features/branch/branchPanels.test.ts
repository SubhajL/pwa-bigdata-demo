/**
 * PR-D3 (Path D) — the Branch sub-panel derivations. `peerTopPercentile` is REAL (rank/branchCount);
 * `simProduction`/`simForecast` synthesise and must be null-safe on missing/invalid inputs.
 */
import { describe, expect, it } from "vitest";

import { peerTopPercentile, simForecast, simProduction, SIM_AVG_M3_PER_CUSTOMER } from "./branchPanels";

describe("peerTopPercentile", () => {
  it("maps rank/branchCount to a top-% (rank 1 is the smallest %)", () => {
    expect(peerTopPercentile(1, 20)).toBeCloseTo(5, 9);
    expect(peerTopPercentile(10, 20)).toBeCloseTo(50, 9);
    expect(peerTopPercentile(20, 20)).toBeCloseTo(100, 9);
  });

  it("is null when the rank or the peer set is unknown", () => {
    expect(peerTopPercentile(null, 20)).toBeNull();
    expect(peerTopPercentile(1, 0)).toBeNull();
  });
});

describe("simProduction", () => {
  it("derives produced > sold and a positive loss from a valid NRW", () => {
    const p = simProduction(1000, 20); // produced = 1000 / 0.8 = 1250
    expect(p.producedM3).toBeCloseTo(1250, 6);
    expect(p.soldM3).toBe(1000);
    expect(p.lossM3).toBeCloseTo(250, 6);
    expect(p.customers).toBe(Math.round(1000 / SIM_AVG_M3_PER_CUSTOMER));
  });

  it("nulls produced/loss (never Infinity) when NRW is absent or out of range", () => {
    expect(simProduction(1000, null).producedM3).toBeNull();
    expect(simProduction(1000, 100).producedM3).toBeNull();
    expect(simProduction(1000, 0).lossM3).toBeNull();
  });

  it("returns all nulls for a missing or negative volume", () => {
    expect(simProduction(null, 20)).toEqual({ producedM3: null, soldM3: null, lossM3: null, customers: null });
    expect(simProduction(-5, 20).customers).toBeNull();
  });
});

describe("simForecast", () => {
  it("projects next month from MoM with a ±3% band", () => {
    const f = simForecast(1000, 10);
    expect(f.nextM3).toBeCloseTo(1100, 6);
    expect(f.lowM3).toBeCloseTo(1067, 0);
    expect(f.highM3).toBeCloseTo(1133, 0);
  });

  it("treats a missing MoM as flat, and a missing/negative volume as no forecast", () => {
    expect(simForecast(1000, null).nextM3).toBeCloseTo(1000, 6);
    expect(simForecast(null, 10)).toEqual({ nextM3: null, lowM3: null, highM3: null });
    expect(simForecast(-5, 10)).toEqual({ nextM3: null, lowM3: null, highM3: null });
  });
});
