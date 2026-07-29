/**
 * Number and date formatting for Thai UI.
 *
 * The single rule that matters: a MISSING value and a value of ZERO must never render the
 * same. An executive reading "0" where the truth is "we do not know" makes a different
 * decision than one reading "—".
 *
 * These return STRINGS. `tabular-nums` is a rendering property and belongs to `Num`
 * (components/ui/num.tsx), which is the only sanctioned way to put a numeral on screen.
 */

/** Rendered for every missing / non-finite value. Never "0", never "NaN", never "". */
export const DASH = "—";

/**
 * Grouped integer in Thai locale, Latin digits.
 *
 * Latin digits, not Thai numerals: every Stitch mockup shows `120,999,834`, and the
 * tabular-nums requirement in tokens.map.md is defined against Latin figures.
 *
 * @param value the number, or null/undefined when unknown.
 * @param locale BCP-47 tag; defaults to th-TH.
 * @returns grouped digits; {@link DASH} for null, undefined, NaN, ±Infinity, or any
 *   magnitude above Number.MAX_SAFE_INTEGER (we do not print a number we cannot hold).
 *   A real 0 returns "0".
 *
 * Non-integers round half-away-from-zero: 1.4 -> "1", -1.5 -> "-2".
 */
export function formatInt(value: number | null | undefined, locale = "th-TH"): string {
  if (value == null || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    return DASH;
  }
  // Round half-away-from-zero: 1.4 -> 1, 1.5 -> 2, -1.5 -> -2.
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const rounded = sign * Math.floor(abs + 0.5);
  return new Intl.NumberFormat(locale, {
    style: "decimal",
    useGrouping: true,
  }).format(rounded);
}

/**
 * Volume with the Thai cubic-metre unit.
 *
 * @returns `formatInt(value) + " ลบ.ม."`, or a bare {@link DASH} with NO unit when the
 *   value is missing — "— ลบ.ม." reads as a measurement, "—" reads as unknown.
 */
export function formatM3(value: number | null | undefined, locale = "th-TH"): string {
  const formatted = formatInt(value, locale);
  if (formatted === DASH) return DASH;
  return `${formatted} ลบ.ม.`;
}

/**
 * A percentage delta, already in percent units.
 *
 * `value` is ALREADY a percentage (-2.0 means -2.0%), matching the API's `mom_pct` /
 * `yoy_pct`. It is not a 0..1 ratio.
 *
 * @param digits fraction digits, integer 0..4.
 * @returns signed for non-zero ("+0.8%", "-2.0%"); exact zero renders "0.0%" with NO
 *   sign; missing/non-finite returns {@link DASH}. Negative zero is treated as zero.
 * @throws RangeError when `digits` is not an integer in 0..4.
 */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (!Number.isInteger(digits) || digits < 0 || digits > 4) {
    throw new RangeError(`digits must be an integer in 0..4, got ${digits}`);
  }
  if (value == null || !Number.isFinite(value)) return DASH;
  // Negative zero is treated as zero.
  const v = Object.is(value, -0) ? 0 : value;
  if (v === 0) {
    if (digits === 0) return "0%";
    return `0.${"0".repeat(digits)}%`;
  }
  const sign = v > 0 ? "+" : "-";
  // Round half-away-from-zero for the absolute value.
  // Avoid binary floating-point tie errors (e.g. 1.005 * 100 -> 100.49999...)
  // by rounding via a scaled integer after adding a tiny epsilon.
  const abs = Math.abs(v);
  const scale = 10 ** digits;
  const scaled = abs * scale + 1e-12;
  const rounded = Math.floor(scaled + 0.5) / scale;
  return `${sign}${rounded.toFixed(digits)}%`;
}

/**
 * "2025-12" -> "ธันวาคม 2568" (Thai month name + Buddhist-era year).
 *
 * The Buddhist era is Gregorian + 543. Government dashboards show B.E.; showing 2025 to
 * this audience reads as a data error.
 *
 * @param month ISO year-month, `YYYY-MM`.
 * @throws RangeError when `month` is not `YYYY-MM` with a month in 01..12.
 */
const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
] as const;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function formatMonthTh(month: string): string {
  const m = MONTH_RE.exec(month);
  if (!m) {
    throw new RangeError(`month must be YYYY-MM with month in 01..12, got "${month}"`);
  }
  const year = parseInt(m[1], 10);
  const monthIdx = parseInt(m[2], 10) - 1;
  return `${THAI_MONTHS[monthIdx]} ${year + 543}`;
}
