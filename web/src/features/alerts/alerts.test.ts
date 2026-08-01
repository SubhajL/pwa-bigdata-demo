/**
 * PR-15 (S7) — the Alert Center data + derivations. Config invariants plus the pure acknowledge
 * accounting and feed filter, tested without a DOM.
 */
import { describe, expect, it } from "vitest";

import { ALERT_RULES, ALERTS, BASE_COUNTS, FEED_FILTERS } from "./alerts.config";
import { activeAlerts, deriveCounts } from "./alertsModel";

describe("alerts.config", () => {
  it("gives every feed alert a severity, source and at least one tag", () => {
    for (const a of ALERTS) {
      expect(["critical", "warning", "info"]).toContain(a.severity);
      expect(a.source.length).toBeGreaterThan(0);
      expect(a.tags.length).toBeGreaterThan(0);
    }
  });

  it("offers the all/critical/warning feed filters", () => {
    expect(FEED_FILTERS.map((f) => f.id)).toEqual(["all", "critical", "warning"]);
  });

  it("has at least one alert rule", () => {
    expect(ALERT_RULES.length).toBeGreaterThan(0);
  });
});

describe("deriveCounts", () => {
  it("returns the base counts when nothing is acknowledged", () => {
    expect(deriveCounts(new Set())).toEqual(BASE_COUNTS);
  });

  it("moves an acknowledged alert from its severity into acknowledged", () => {
    const before = deriveCounts(new Set());
    const after = deriveCounts(new Set(["a1"])); // a1 is critical
    expect(after.critical).toBe(before.critical - 1);
    expect(after.acknowledged).toBe(before.acknowledged + 1);
  });
});

describe("activeAlerts", () => {
  it("hides acknowledged alerts", () => {
    const ids = activeAlerts(new Set(["a1"]), "all").map((a) => a.id);
    expect(ids).not.toContain("a1");
  });

  it("filters by severity", () => {
    const warnings = activeAlerts(new Set(), "warning");
    expect(warnings.every((a) => a.severity === "warning")).toBe(true);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
