import { describe, expect, it } from "vitest";

import fixture from "./__fixtures__/mtp-contract.json";
import {
  filterAndPageCustomers,
  lowPressureAreaName,
  mergeImpactResults,
  TYPE_LABEL_TH,
} from "./impactView";
import type { AffectedCustomer, ImpactResponse } from "./types";

const impact = fixture.impact as ImpactResponse;
const customers = impact.customers as readonly AffectedCustomer[];

describe("filterAndPageCustomers (R2)", () => {
  it("T1a: all 200 → 8 pages, page 1 has 25 rows", () => {
    const paged = filterAndPageCustomers(customers, "all", 1);
    expect(paged.filteredTotal).toBe(200);
    expect(paged.totalPages).toBe(8);
    expect(paged.page).toBe(1);
    expect(paged.rows).toHaveLength(25);
    expect(paged.rows[0]?.customer_id).toBe("SIM-MTP-00001");
  });

  it("T1a2: last page has the 8th slice (200 = 7×25 + 25)", () => {
    const paged = filterAndPageCustomers(customers, "all", 8);
    expect(paged.rows).toHaveLength(25);
    expect(paged.rows[24]?.customer_id).toBe("SIM-MTP-00200");
  });

  it("T1b: filter type 1 → 140 rows, 6 pages, headline set is 140", () => {
    const paged = filterAndPageCustomers(customers, 1, 1);
    expect(paged.filteredTotal).toBe(140);
    expect(paged.totalPages).toBe(6); // ceil(140/25)
    expect(paged.rows.every((c) => c.type_code === 1)).toBe(true);
  });

  it("T1b2: type 2 → 35 rows (2 pages), type 3 → 25 rows (1 page)", () => {
    expect(filterAndPageCustomers(customers, 2, 1).filteredTotal).toBe(35);
    expect(filterAndPageCustomers(customers, 2, 1).totalPages).toBe(2);
    expect(filterAndPageCustomers(customers, 3, 1).filteredTotal).toBe(25);
    expect(filterAndPageCustomers(customers, 3, 1).totalPages).toBe(1);
  });

  it("T1c: an out-of-range page clamps to the last page", () => {
    const paged = filterAndPageCustomers(customers, "all", 99);
    expect(paged.page).toBe(8);
    expect(paged.rows).toHaveLength(25);
  });

  it("T1c2: a page below 1 clamps to 1", () => {
    expect(filterAndPageCustomers(customers, "all", 0).page).toBe(1);
    expect(filterAndPageCustomers(customers, "all", -5).page).toBe(1);
  });

  it("T1c3: an empty filter result still reports 1 page and 0 rows", () => {
    const paged = filterAndPageCustomers([], "all", 1);
    expect(paged.filteredTotal).toBe(0);
    expect(paged.totalPages).toBe(1);
    expect(paged.rows).toHaveLength(0);
  });

  it("T1d: never mutates the input array", () => {
    const frozen = Object.freeze([...customers]) as readonly AffectedCustomer[];
    expect(() => filterAndPageCustomers(frozen, 2, 2)).not.toThrow();
    expect(frozen).toHaveLength(200);
  });

  it("T1d2: a custom pageSize repaginates", () => {
    const paged = filterAndPageCustomers(customers, "all", 2, 50);
    expect(paged.totalPages).toBe(4);
    expect(paged.rows).toHaveLength(50);
    expect(paged.rows[0]?.customer_id).toBe("SIM-MTP-00051");
  });
});

describe("mergeImpactResults (R20) — order-independent, enriched-preserving", () => {
  const enrichedC: AffectedCustomer = {
    customer_id: "SIM-MTP-00001",
    node: "n1",
    area: "a",
    branch: "b",
    type_code: 1,
    subtype_code: 11,
    account_no: "SIM-MTP-ACC-00001",
    meter_no: "SIM-MTP-MTR-00001",
    latest_usage_m3: 20,
  };
  const basicDup: AffectedCustomer = { customer_id: "SIM-MTP-00001", node: "n1", area: "a", branch: "b" };
  const enrichedResult: ImpactResponse = {
    pipe_id: "PIPE-A",
    affected_pipe_ids: ["PIPE-A"],
    customers: [enrichedC],
    count: 1,
    simulated: true,
    zone: "MTP-LPZ-01",
    type_breakdown: { type_1: 1, type_2: 0, type_3: 0 },
  };
  const basicResult: ImpactResponse = {
    pipe_id: "PIPE-B",
    affected_pipe_ids: ["PIPE-B"],
    customers: [basicDup],
    count: 1,
    simulated: true,
  };

  it("a basic duplicate NEVER overwrites an enriched customer, in either order", () => {
    const a = mergeImpactResults([enrichedResult, basicResult], "PIPE-A");
    const b = mergeImpactResults([basicResult, enrichedResult], "PIPE-A"); // reverse order
    expect(a.type_breakdown).toEqual({ type_1: 1, type_2: 0, type_3: 0 });
    expect(b.type_breakdown).toEqual({ type_1: 1, type_2: 0, type_3: 0 }); // order-INDEPENDENT
    expect(a.customers[0].type_code).toBe(1);
    expect(b.customers[0].type_code).toBe(1);
    expect(a.count).toBe(1);
    expect(a.zone).toBe("MTP-LPZ-01");
    // affected_pipe_ids is byte-stable regardless of the order the per-pipe requests resolved.
    expect(a.affected_pipe_ids).toEqual(["PIPE-A", "PIPE-B"]);
    expect(b.affected_pipe_ids).toEqual(["PIPE-A", "PIPE-B"]);
  });

  it("recomputes an exact 140/35/25 breakdown over the fixture's 200 (single result)", () => {
    const merged = mergeImpactResults([impact], impact.pipe_id);
    expect(merged.count).toBe(200);
    expect(merged.type_breakdown).toEqual({ type_1: 140, type_2: 35, type_3: 25 });
    expect(merged.zone).toBe("MTP-LPZ-01");
  });

  it("a wholly-basic incident yields null zone + null breakdown", () => {
    const merged = mergeImpactResults([basicResult], "PIPE-B");
    expect(merged.zone).toBeNull();
    expect(merged.type_breakdown).toBeNull();
  });
});

describe("lowPressureAreaName (R3) + TYPE_LABEL_TH", () => {
  it("T1e: the accessible name carries the zone, the count, and 'จำลอง' in TEXT", () => {
    const name = lowPressureAreaName("MTP-LPZ-01", 200);
    expect(name).toContain("MTP-LPZ-01");
    expect(name).toContain("200");
    expect(name).toContain("จำลอง");
  });

  it("T1e2: the three official PWA top-level labels are distinct Thai text", () => {
    expect(TYPE_LABEL_TH[1]).toContain("ที่อยู่อาศัย");
    expect(TYPE_LABEL_TH[2]).toContain("ราชการ");
    expect(TYPE_LABEL_TH[3]).toContain("รัฐวิสาหกิจ");
    const labels = [TYPE_LABEL_TH[1], TYPE_LABEL_TH[2], TYPE_LABEL_TH[3]];
    expect(new Set(labels).size).toBe(3);
  });
});
