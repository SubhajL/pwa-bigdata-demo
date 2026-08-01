/**
 * PR-D4 (Path D) — the Regional sub-panel data/helper. `topBranchesByNrw` reuses the tested tri-state
 * sort; the Step-Test log must carry both leak and no-leak entries so its icon column encodes state.
 */
import { describe, expect, it } from "vitest";

import { SIM_STEP_TESTS, topBranchesByNrw } from "./regionPanels";
import type { BranchBar } from "./types";

function bar(o: Partial<BranchBar>): BranchBar {
  return {
    rank: 1,
    branchCode: "c1",
    branch: "A",
    province: "P",
    waterSoldM3: 100,
    momPct: 1,
    yoyPct: 1,
    widthPct: 100,
    nrwPct: 20,
    status: "normal",
    ...o,
  };
}

describe("topBranchesByNrw", () => {
  it("returns the n highest-NRW branches, descending", () => {
    const bars = [
      bar({ branchCode: "a", nrwPct: 20 }),
      bar({ branchCode: "b", nrwPct: 40 }),
      bar({ branchCode: "c", nrwPct: 30 }),
    ];
    expect(topBranchesByNrw(bars, 2).map((b) => b.branchCode)).toEqual(["b", "c"]);
  });

  it("returns [] for n<=0 and never more than available", () => {
    const bars = [bar({ branchCode: "a", nrwPct: 20 })];
    expect(topBranchesByNrw(bars, 0)).toEqual([]);
    expect(topBranchesByNrw(bars, 5)).toHaveLength(1);
  });
});

describe("SIM_STEP_TESTS", () => {
  it("carries both leak and no-leak entries so the icon column is not decoration", () => {
    expect(new Set(SIM_STEP_TESTS.map((t) => t.leak)).size).toBe(2);
  });
});
