/**
 * T8 — missing vs zero (DREP-PR6 R10).
 *
 * The single rule these lock down: an executive reading "0" where the truth is "we do not
 * know" makes a different decision than one reading "—". Authored by Claude; the
 * implementer must not modify this file (DREP §10).
 */
import { describe, expect, it } from "vitest";

import { DASH, formatInt, formatM3, formatMonthTh, formatPercent } from "@/lib/format";

describe("formatInt", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])("renders %s as the dash, never 0", (_label, value) => {
    expect(formatInt(value as number | null | undefined)).toBe(DASH);
  });

  it("renders a real zero as 0, distinguishable from missing", () => {
    // The whole point of the module. If this ever returns DASH, a branch that genuinely
    // sold nothing becomes indistinguishable from one that failed to report.
    expect(formatInt(0)).toBe("0");
    expect(formatInt(0)).not.toBe(DASH);
  });

  it("groups thousands", () => {
    // The real December-2025 national total, rounded — the figure on the Stitch mockup.
    expect(formatInt(120999834)).toMatch(/^120[,.\u00a0\u202f\s]999[,.\u00a0\u202f\s]834$/);
  });

  it("rounds half away from zero", () => {
    expect(formatInt(1.4)).toBe("1");
    expect(formatInt(1.5)).toBe("2");
    expect(formatInt(-1.5)).toBe("-2");
  });

  it("refuses a magnitude it cannot represent exactly", () => {
    expect(formatInt(Number.MAX_SAFE_INTEGER + 2)).toBe(DASH);
  });
});

describe("formatM3", () => {
  it("appends the Thai cubic-metre unit", () => {
    expect(formatM3(1234)).toContain("ลบ.ม.");
    expect(formatM3(1234)).toMatch(/^1[,.\u00a0\u202f\s]234\s*ลบ\.ม\.$/);
  });

  it("renders a bare dash with NO unit when missing", () => {
    // "— ลบ.ม." reads as a measurement of unknown size; "—" reads as unknown.
    expect(formatM3(null)).toBe(DASH);
    expect(formatM3(null)).not.toContain("ลบ.ม.");
  });

  it("keeps a legitimate zero volume as a measurement", () => {
    expect(formatM3(0)).toMatch(/^0\s*ลบ\.ม\.$/);
  });
});

describe("formatPercent", () => {
  it("signs a non-zero delta", () => {
    expect(formatPercent(0.8)).toBe("+0.8%");
    expect(formatPercent(-2.0)).toBe("-2.0%");
  });

  it("renders an exact zero unsigned", () => {
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(-0)).toBe("0.0%");
  });

  it("treats the value as already-percent, not a ratio", () => {
    // The API's mom_pct/yoy_pct are percentages. If this were read as a ratio, 0.8 would
    // render "+80.0%" and every delta on every dashboard would be 100x wrong.
    expect(formatPercent(0.8)).not.toBe("+80.0%");
  });

  it("honours the digits argument", () => {
    expect(formatPercent(1.2345, 2)).toBe("+1.23%");
    expect(formatPercent(1.2345, 0)).toBe("+1%");
  });

  it("returns the dash for a missing or non-finite value", () => {
    expect(formatPercent(null)).toBe(DASH);
    expect(formatPercent(undefined)).toBe(DASH);
    expect(formatPercent(Number.NaN)).toBe(DASH);
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe(DASH);
  });

  it("rejects an out-of-range digits argument", () => {
    expect(() => formatPercent(1, 9)).toThrow(RangeError);
    expect(() => formatPercent(1, -1)).toThrow(RangeError);
    expect(() => formatPercent(1, 1.5)).toThrow(RangeError);
  });
});

describe("formatMonthTh", () => {
  it("renders the Thai month and the Buddhist-era year", () => {
    // 2025 CE + 543 = 2568 BE. Showing 2025 to this audience reads as a data error.
    expect(formatMonthTh("2025-12")).toBe("ธันวาคม 2568");
    expect(formatMonthTh("2022-10")).toBe("ตุลาคม 2565");
  });

  it("rejects a malformed month", () => {
    expect(() => formatMonthTh("2025-13")).toThrow(RangeError);
    expect(() => formatMonthTh("2025-1")).toThrow(RangeError);
    expect(() => formatMonthTh("2025-12-01")).toThrow(RangeError);
    expect(() => formatMonthTh("")).toThrow(RangeError);
  });
});
