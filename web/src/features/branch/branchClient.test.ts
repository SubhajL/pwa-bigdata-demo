import { describe, expect, it } from "vitest";

import { branchVitals, buildBranchTrend, median } from "./branchClient";
import type { BranchSeries, SeriesPoint } from "./types";

const DIMS = { w: 200, h: 100, pad: 10 };

function points(vals: Array<[string, number]>): SeriesPoint[] {
  return vals.map(([month, water_sold_m3]) => ({ month, water_sold_m3 }));
}

function series(points: Array<[string, number]>): BranchSeries {
  return {
    branch_code: "5551001",
    branch: "สิงห์บุรี",
    province: "สิงห์บุรี",
    region: 2,
    points: points.map(([month, water_sold_m3]) => ({ month, water_sold_m3 })),
  };
}

describe("branchVitals", () => {
  const s = series([["2023-12", 100], ["2024-12", 150], ["2025-11", 200], ["2025-12", 220]]);

  it("reads the SELECTED month's volume + MoM/YoY (not always the latest)", () => {
    const v = branchVitals(s, "2025-12");
    expect(v.month).toBe("2025-12");
    expect(v.m3).toBe(220);
    expect(v.momPct).toBeCloseTo(10, 6); // vs 2025-11 = 200
    expect(v.yoyPct).toBeCloseTo((220 - 150) / 150 * 100, 6); // vs 2024-12
  });

  it("shows a HISTORICAL month's own figures when that month is selected (no month-mixing)", () => {
    const v = branchVitals(s, "2024-12");
    expect(v.m3).toBe(150); // 2024-12's own volume, not December 2025's
    expect(v.yoyPct).toBeCloseTo((150 - 100) / 100 * 100, 6); // vs 2023-12
  });

  it("returns null (never 0) when the comparison month is absent", () => {
    const v = branchVitals(series([["2025-12", 220]]), "2025-12");
    expect(v.momPct).toBeNull();
    expect(v.yoyPct).toBeNull();
  });

  it("returns m3 null when the branch has no row for the selected month", () => {
    const v = branchVitals(s, "2025-06");
    expect(v.m3).toBeNull();
    expect(v.momPct).toBeNull();
  });

  it("returns m3 null for an empty series", () => {
    expect(branchVitals(series([]), "2025-12")).toEqual({ month: "2025-12", m3: null, momPct: null, yoyPct: null });
  });
});

describe("median", () => {
  it("returns the middle value for odd length and the mean of the two middles for even", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns null for an empty list", () => {
    expect(median([])).toBeNull();
  });
});

describe("buildBranchTrend", () => {
  it("scales to the data's own max (a small branch is not squashed at a floor of 1)", () => {
    const geo = buildBranchTrend(points([["2025-11", 200_000], ["2025-12", 220_000]]), null, DIMS);
    expect(geo.maxMillion).toBeCloseTo(0.22, 6); // not 1
    // The largest sample sits at the top of the plot area (y == pad), using the full height.
    expect(geo.d).toContain(`,${DIMS.pad}`);
  });

  it("includes the region median in the max so a below-median branch's line still fits", () => {
    const geo = buildBranchTrend(points([["2025-12", 220_000]]), 300_000, DIMS);
    expect(geo.maxMillion).toBeCloseTo(0.3, 6);
    expect(geo.medianY).toBeCloseTo(DIMS.pad, 6); // median is the max → drawn at the top
  });

  it("returns an empty path and null median for no points", () => {
    expect(buildBranchTrend([], null, DIMS)).toMatchObject({ d: "", medianY: null });
  });
});
