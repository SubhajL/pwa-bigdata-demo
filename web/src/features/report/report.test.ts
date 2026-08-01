/**
 * PR-14 (S6) — the Report Center data contract. Pure data, so these pin the invariants the screen
 * relies on: the three templates and the default, the KPI/level/chart sets, and the target table
 * whose status column must be more than one state.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TEMPLATE,
  QUARTERLY_BARS,
  REPORT_KPIS,
  REPORT_LEVELS,
  REPORT_TEMPLATES,
  TARGET_ROWS,
} from "./report.config";

describe("REPORT_TEMPLATES", () => {
  it("has the three S6 templates", () => {
    expect(REPORT_TEMPLATES.map((t) => t.id)).toEqual(["executive", "hierarchical", "deep"]);
  });

  it("names a default that exists in the list", () => {
    expect(REPORT_TEMPLATES.some((t) => t.id === DEFAULT_TEMPLATE)).toBe(true);
  });
});

describe("REPORT_LEVELS", () => {
  it("offers org / region / branch", () => {
    expect(REPORT_LEVELS.map((l) => l.id)).toEqual(["org", "region", "branch"]);
  });
});

describe("QUARTERLY_BARS", () => {
  it("has four positive-valued quarters", () => {
    expect(QUARTERLY_BARS).toHaveLength(4);
    for (const q of QUARTERLY_BARS) expect(q.valueMm3).toBeGreaterThan(0);
  });
});

describe("REPORT_KPIS", () => {
  it("mirrors the mockup's water-sold headline", () => {
    expect(REPORT_KPIS.find((k) => k.id === "volume")?.value).toBe(21_515_813);
  });
});

describe("TARGET_ROWS", () => {
  it("shows more than one status so the column is not colour-decoration", () => {
    expect(new Set(TARGET_ROWS.map((r) => r.status)).size).toBeGreaterThan(1);
  });

  it("flags NRW (over target) as not-normal", () => {
    expect(TARGET_ROWS.find((r) => r.labelTh === "NRW")?.status).not.toBe("normal");
  });
});
