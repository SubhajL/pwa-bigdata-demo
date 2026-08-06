/**
 * Pure view-model logic for the Map Ta Phut low-pressure impact surface (PR-J).
 *
 * Kept DOM-free and side-effect-free so the drawer's filtering/pagination and the footprint's
 * accessible name are unit-testable without React. The type labels are the official PWA
 * top-level classification (real classification text, not simulated values); the per-account
 * numbers all come from the API.
 */
import type { AffectedCustomer, ImpactResponse, TypeBreakdown } from "./types";

/** The customer-type filter: a PWA top-level type code, or "all". */
export type TypeFilter = "all" | 1 | 2 | 3;

export interface PagedCustomers {
  /** The rows on the requested (clamped) page. */
  readonly rows: readonly AffectedCustomer[];
  /** How many customers match the filter (the filtered set size, NOT the incident total). */
  readonly filteredTotal: number;
  /** Total pages for the filtered set (≥ 1, even when empty). */
  readonly totalPages: number;
  /** The page actually shown, after clamping to [1, totalPages]. */
  readonly page: number;
}

export const DEFAULT_PAGE_SIZE = 25;

/**
 * Official PWA top-level customer-type labels (effective 2026-04-01). Real classification text —
 * assigned here only to SIMULATED accounts. The three are distinct by design.
 */
export const TYPE_LABEL_TH: Readonly<Record<1 | 2 | 3, string>> = {
  1: "ที่อยู่อาศัยและอื่นๆ",
  2: "ราชการและธุรกิจขนาดเล็ก",
  3: "รัฐวิสาหกิจ อุตสาหกรรมและธุรกิจขนาดใหญ่",
};

/** A compact Thai label for a customer's type (+ subtype code, which has no official short name). */
export function typeLabelTh(typeCode: number | null | undefined, subtypeCode?: number | null): string {
  const top = typeCode === 1 || typeCode === 2 || typeCode === 3 ? TYPE_LABEL_TH[typeCode] : "—";
  return subtypeCode != null ? `${top} · ประเภทย่อย ${subtypeCode}` : top;
}

/**
 * Filter by top-level type then paginate. PURE — never mutates the input. The filtered set size
 * is reported separately from the incident total (which the drawer header reads from
 * `impact.count`), so filtering can never change the headline 200 (source step 6).
 */
export function filterAndPageCustomers(
  customers: readonly AffectedCustomer[],
  typeFilter: TypeFilter,
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PagedCustomers {
  const filtered =
    typeFilter === "all" ? customers : customers.filter((c) => c.type_code === typeFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clamped = Math.min(totalPages, Math.max(1, Math.trunc(page) || 1));
  const start = (clamped - 1) * pageSize;
  return {
    rows: filtered.slice(start, start + pageSize),
    filteredTotal: filtered.length,
    totalPages,
    page: clamped,
  };
}

/**
 * The accessible name for the clickable low-pressure footprint. Status/identity is carried in
 * TEXT (zone id + affected count + จำลอง), never by colour — the design rule the footprint must
 * satisfy (tokens.map.md: status is never colour alone).
 */
export function lowPressureAreaName(zone: string, count: number): string {
  return `พื้นที่แรงดันต่ำจำลอง ${zone} · ผู้ใช้น้ำที่ได้รับผลกระทบ ${count} ราย · ข้อมูลจำลอง`;
}

/** Distinct affected accounts per PWA top-level type, over the merged set. Sums to the count. */
export function breakdownCustomers(customers: readonly AffectedCustomer[]): TypeBreakdown {
  let type_1 = 0;
  let type_2 = 0;
  let type_3 = 0;
  for (const c of customers) {
    if (c.type_code === 1) type_1 += 1;
    else if (c.type_code === 2) type_2 += 1;
    else if (c.type_code === 3) type_3 += 1;
  }
  return { type_1, type_2, type_3 };
}

/**
 * Merge the per-pipe impact responses for one dropped asset into one incident (PR-J R20). A
 * customer reachable via several pipes appears in several results; the merge keeps the ENRICHED
 * record when duplicates disagree, so a basic entry can NEVER overwrite `type_code` and corrupt
 * the breakdown — order-independent. `zone` is preserved from any enriched result and the
 * breakdown is RECOMPUTED from the deduped set (both null for a basic incident). PURE.
 */
export function mergeImpactResults(
  results: readonly ImpactResponse[],
  primaryPipeId: string,
): ImpactResponse {
  const seen = new Map<string, AffectedCustomer>();
  const affected = new Set<string>();
  for (const r of results) {
    for (const id of r.affected_pipe_ids) affected.add(id);
    for (const c of r.customers) {
      const existing = seen.get(c.customer_id);
      if (existing == null || (existing.type_code == null && c.type_code != null)) {
        seen.set(c.customer_id, c);
      }
    }
  }
  const customers = [...seen.values()].sort((a, b) => a.customer_id.localeCompare(b.customer_id));
  // `zone` and `type_breakdown` are gated on the SAME `enriched` result, so they can never
  // disagree (both present or both null). `affected_pipe_ids` is sorted so the merged incident is
  // byte-stable regardless of the order the per-pipe requests resolved in.
  const enriched = results.find((r) => r.zone != null);
  return {
    pipe_id: primaryPipeId,
    affected_pipe_ids: [...affected].sort(),
    customers,
    count: customers.length,
    simulated: true,
    zone: enriched?.zone ?? null,
    type_breakdown: enriched != null ? breakdownCustomers(customers) : null,
  };
}
