import { describe, expect, it } from "vitest";

import { OFFICE_POINT_TUPLES } from "./officePoints";
import {
  officeBounds,
  parseOfficePoints,
  projectOffice,
  regionFillOpacity,
  regionMarks,
} from "./nationalMap";
import type { RegionRollup } from "./types";

const DIMS = { w: 100, h: 200, pad: 10 };

// [region, lng, lat] — a compact fixture spanning three regions and a known bounding box.
const TUPLES: ReadonlyArray<readonly [number, number, number]> = [
  [1, 100, 10],
  [1, 102, 12],
  [2, 98, 8],
  [3, 104, 14],
];

function rollup(regions: Array<[number, number, number]>): RegionRollup {
  return {
    month: "2025-12",
    total_m3: regions.reduce((s, [, v]) => s + v, 0),
    branch_count: regions.reduce((s, [, , c]) => s + c, 0),
    regions: regions.map(([region, water_sold_m3, branch_count]) => ({
      region,
      water_sold_m3,
      branch_count,
    })),
  };
}

describe("parseOfficePoints", () => {
  it("parses all 234 real offices into regions 1..10", () => {
    const points = parseOfficePoints();
    expect(points).toHaveLength(234);
    expect(points.length).toBe(OFFICE_POINT_TUPLES.length);
    expect(new Set(points.map((p) => p.region))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  });
});

describe("officeBounds + projectOffice", () => {
  it("maps the NW corner to (pad,pad) and the SE corner to (w-pad,h-pad), inverting latitude", () => {
    const points = parseOfficePoints(TUPLES);
    const bounds = officeBounds(points);
    expect(bounds).toEqual({ lngMin: 98, lngMax: 104, latMin: 8, latMax: 14 });
    // Westmost + northmost → top-left; eastmost + southmost → bottom-right.
    expect(projectOffice({ region: 0, lng: 98, lat: 14 }, bounds, DIMS)).toEqual({ x: 10, y: 10 });
    expect(projectOffice({ region: 0, lng: 104, lat: 8 }, bounds, DIMS)).toEqual({ x: 90, y: 190 });
  });
});

describe("regionFillOpacity", () => {
  it("floors non-reporting or degenerate regions and scales the rest by magnitude", () => {
    expect(regionFillOpacity(null, 100)).toBe(0.3);
    expect(regionFillOpacity(50, 0)).toBe(0.3);
    expect(regionFillOpacity(100, 100)).toBe(1);
    expect(regionFillOpacity(0, 100)).toBe(0.3); // real zero → floor, still visible
  });

  it("never escapes [MIN_FILL, 1] for a negative, non-finite, or over-max volume", () => {
    expect(regionFillOpacity(-100, 100)).toBe(0.3); // negative → floor, not -0.4
    expect(regionFillOpacity(NaN, 100)).toBe(0.3);
    expect(regionFillOpacity(200, 100)).toBe(1); // over the max → clamped to 1
  });
});

describe("regionMarks", () => {
  it("emits one mark per region present in the office data, sorted, offices projected", () => {
    const marks = regionMarks(rollup([[1, 200, 2]]), DIMS, TUPLES);
    expect(marks.map((m) => m.region)).toEqual([1, 2, 3]);
    const r1 = marks.find((m) => m.region === 1)!;
    expect(r1.offices).toHaveLength(2);
    expect(r1.offices.every((o) => o.x >= 10 && o.x <= 90 && o.y >= 10 && o.y <= 190)).toBe(true);
  });

  it("distinguishes a reporting region from an absent one (null, not zero)", () => {
    const marks = regionMarks(rollup([[1, 200, 2]]), DIMS, TUPLES);
    expect(marks.find((m) => m.region === 1)!.volumeM3).toBe(200);
    expect(marks.find((m) => m.region === 2)!.volumeM3).toBeNull(); // absent → null, still drawn
    expect(marks.find((m) => m.region === 2)!.fillOpacity).toBe(0.3);
  });
});
