import { describe, expect, it } from "vitest";

import { healthBand, kpiFromWorklist, pttfDays, rcaBars } from "./predictiveClient";
import type { SignalContribution, WorklistItem } from "./types";

function item(overrides: Partial<WorklistItem>): WorklistItem {
  return {
    rank: 1,
    asset_id: "P-1",
    branch: "สมุทรสาคร",
    health_score: 80,
    pttf_hours: 400,
    status: "normal",
    model_version: "pwa-health-pttf-v1",
    scored_at: "2026-07-31T00:00:00Z",
    simulated: true,
    ...overrides,
  };
}

describe("kpiFromWorklist", () => {
  it("returns null avgHealth for an empty list — never NaN", () => {
    const kpis = kpiFromWorklist([], 168);
    expect(kpis).toEqual({ atRisk: 0, avgHealth: null, pttfUnder: 0, total: 0 });
  });

  it("counts at-risk as warning+critical only, and averages health", () => {
    const items = [
      item({ status: "normal", health_score: 90 }),
      item({ status: "warning", health_score: 50 }),
      item({ status: "critical", health_score: 10 }),
      item({ status: "nodata", health_score: 0 }),
    ];
    const kpis = kpiFromWorklist(items, 168);
    expect(kpis.atRisk).toBe(2); // warning + critical, not normal, not nodata
    expect(kpis.total).toBe(4);
    expect(kpis.avgHealth).toBe((90 + 50 + 10 + 0) / 4);
  });

  it("counts pttfUnder against the hour threshold and ignores null PTTF", () => {
    const items = [
      item({ pttf_hours: 100 }), // < 168 → counted
      item({ pttf_hours: 168 }), // == 168 → NOT under
      item({ pttf_hours: 200 }), // > 168 → not counted
      item({ pttf_hours: null }), // unknown → not counted
    ];
    expect(kpiFromWorklist(items, 168).pttfUnder).toBe(1);
  });
});

describe("rcaBars", () => {
  const contribs = (xs: Array<[SignalContribution["signal"], number]>): SignalContribution[] =>
    xs.map(([signal, contribution]) => ({ signal, contribution }));

  it("returns an empty geometry with maxAbs 1 for no contributions", () => {
    expect(rcaBars([])).toEqual({ bars: [], maxAbs: 1 });
  });

  it("scales width by |contribution| against the largest magnitude, one shared axis", () => {
    const g = rcaBars(contribs([
      ["vibration", 0.34],
      ["bearing_temp_c", 0.17],
      ["pressure_bar", -0.34], // negative but same magnitude as the max
    ]));
    expect(g.maxAbs).toBeCloseTo(0.34);
    expect(g.bars[0].widthPct).toBe(100); // the largest magnitude fills the track
    expect(g.bars[1].widthPct).toBe(50); // half the magnitude → half the width
    expect(g.bars[2].widthPct).toBe(100); // |−0.34| == max → full width (magnitude, not sign)
  });

  it("preserves the API's ranked order and never emits a negative width", () => {
    const g = rcaBars(contribs([["power_kw", 0.2], ["flow_m3h", -0.5]]));
    expect(g.bars.map((b) => b.signal)).toEqual(["power_kw", "flow_m3h"]);
    expect(g.bars.every((b) => b.widthPct >= 0)).toBe(true);
  });
});

describe("pttfDays", () => {
  it("converts hours to days", () => {
    expect(pttfDays(168)).toBe(7);
    expect(pttfDays(0)).toBe(0);
  });

  it("passes null through rather than rendering 0 days for unknown", () => {
    expect(pttfDays(null)).toBeNull();
  });
});

describe("healthBand", () => {
  it("bands an aggregate health value the same way the model does (65 / 40)", () => {
    expect(healthBand(80)).toBe("normal");
    expect(healthBand(65)).toBe("normal"); // >= warning threshold is normal
    expect(healthBand(50)).toBe("warning");
    expect(healthBand(40)).toBe("warning"); // >= critical threshold is warning
    expect(healthBand(30)).toBe("critical");
  });
});
