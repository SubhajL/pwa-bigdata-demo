import { describe, expect, it } from "vitest";

import { REGIONAL_CONFIG } from "./regional.config";
import { branchBars, branchStatus, regionSummary, simulatedBranchNrwPct } from "./regionalClient";
import type { BranchRow } from "./types";

function row(overrides: Partial<BranchRow>): BranchRow {
  return {
    rank: 1,
    branch_code: "5551001",
    branch: "สาขา A",
    province: "จังหวัด",
    region: 2,
    water_sold_m3: 1_000_000,
    mom_pct: 1.5,
    yoy_pct: -2.0,
    ...overrides,
  };
}

describe("simulatedBranchNrwPct", () => {
  const { minPct, maxPct } = REGIONAL_CONFIG.simNrw;

  it("is deterministic per (branch_code, rank, count) and within [min, max]", () => {
    expect(simulatedBranchNrwPct("5551001", 3, 10)).toBe(simulatedBranchNrwPct("5551001", 3, 10));
    for (const code of ["5551001", "5551002", "A", "", "เวียงสระ"]) {
      for (const rank of [1, 5, 10]) {
        const v = simulatedBranchNrwPct(code, rank, 10);
        expect(v).toBeGreaterThanOrEqual(minPct);
        expect(v).toBeLessThanOrEqual(maxPct);
      }
    }
  });

  it("rises with volume rank — rank 1 (biggest) reads lower NRW than rank N (smallest)", () => {
    // Averaged over codes so the small per-code jitter cannot invert the intended spread.
    const codes = ["A", "B", "C", "D", "E", "F"];
    const top = codes.map((c) => simulatedBranchNrwPct(c, 1, 30)).reduce((a, b) => a + b) / codes.length;
    const bottom = codes.map((c) => simulatedBranchNrwPct(c, 30, 30)).reduce((a, b) => a + b) / codes.length;
    expect(bottom).toBeGreaterThan(top);
  });

  it("is finite for a single-branch region (spread 0.5, no divide-by-zero)", () => {
    const v = simulatedBranchNrwPct("X", 1, 1);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(REGIONAL_CONFIG.simNrw.minPct);
    expect(v).toBeLessThanOrEqual(REGIONAL_CONFIG.simNrw.maxPct);
  });

  it("never returns NaN for non-finite rank/count (defensive — the endpoint never sends these)", () => {
    for (const [rank, count] of [[NaN, 10], [1, NaN], [Infinity, 10], [1, Infinity]] as const) {
      const v = simulatedBranchNrwPct("X", rank, count);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(REGIONAL_CONFIG.simNrw.minPct);
      expect(v).toBeLessThanOrEqual(REGIONAL_CONFIG.simNrw.maxPct);
    }
  });
});

describe("branchStatus", () => {
  it("maps NRW to critical/warning/normal at the alert thresholds", () => {
    const { warnAtPct, criticalAtPct } = REGIONAL_CONFIG.simNrw;
    expect(branchStatus(criticalAtPct)).toBe("critical");
    expect(branchStatus(criticalAtPct - 0.1)).toBe("warning");
    expect(branchStatus(warnAtPct)).toBe("warning");
    expect(branchStatus(warnAtPct - 0.1)).toBe("normal");
  });
});

describe("branchBars", () => {
  it("keeps REAL fields, scales width to the largest, and attaches simulated nrw + status", () => {
    const bars = branchBars([
      row({ branch_code: "A", rank: 1, water_sold_m3: 100 }),
      row({ branch_code: "B", rank: 2, water_sold_m3: 50 }),
    ]);
    expect(bars.map((b) => b.branchCode)).toEqual(["A", "B"]);
    expect(bars[0].widthPct).toBe(100);
    expect(bars[1].widthPct).toBe(50);
    expect(bars[0].nrwPct).toBe(simulatedBranchNrwPct("A", 1, 2));
    expect(bars[0].status).toBe(branchStatus(bars[0].nrwPct));
  });

  it("clamps an out-of-contract negative volume to a non-negative width", () => {
    const bars = branchBars([
      row({ branch_code: "A", water_sold_m3: 100 }),
      row({ branch_code: "B", water_sold_m3: -20 }),
    ]);
    expect(bars.every((b) => b.widthPct >= 0 && b.widthPct <= 100)).toBe(true);
  });

  it("returns [] for no rows", () => {
    expect(branchBars([])).toEqual([]);
  });
});

describe("regionSummary", () => {
  it("sums REAL volume/count and derives simulated avg NRW + watch count", () => {
    const bars = branchBars([
      row({ branch_code: "A", water_sold_m3: 100 }),
      row({ branch_code: "B", water_sold_m3: 200 }),
    ]);
    const summary = regionSummary(bars);
    expect(summary.totalM3).toBe(300);
    expect(summary.branchCount).toBe(2);
    expect(summary.avgNrwPct).toBeCloseTo((bars[0].nrwPct + bars[1].nrwPct) / 2, 9);
    expect(summary.watchCount).toBe(bars.filter((b) => b.status !== "normal").length);
  });

  it("returns all zeros for an empty region", () => {
    expect(regionSummary([])).toEqual({ totalM3: 0, branchCount: 0, avgNrwPct: 0, watchCount: 0 });
  });
});
