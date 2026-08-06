/**
 * PR-I — the Map Ta Phut cross-language contract, from the TypeScript side.
 *
 * The committed fixture is the SHAPE PR-J will consume. This proves it (a) is assignable to the
 * interfaces in `./types` at compile time and (b) carries the real invariants (200 accounts,
 * 140/35/25 breakdown, 12 consistent readings) at runtime. The Python side
 * (test_twin_routes.py::test_web_contract_fixture_matches_openapi) proves the same fixture's keys
 * match the live FastAPI /openapi.json — so the two languages cannot silently drift.
 */
import { describe, expect, it } from "vitest";

import fixture from "./__fixtures__/mtp-contract.json";
import type { DemoCustomerDetail, ImpactResponse, ImpactZoneCollection } from "./types";

// Compile-time contract: impact/detail carry no string-literal fields, so a typed binding is a
// real structural check against the consumer interfaces. (The zone's literal members are widened
// to `string` by the JSON import, so they are asserted at runtime and cross-checked against the
// OpenAPI enum on the Python side.)
const impact: ImpactResponse = fixture.impact;
const detail: DemoCustomerDetail = fixture.detail;

// Compile-time shape check for the zone. The JSON import widens `type`/`provenance` to `string`,
// so instead of `satisfies ImpactZoneCollection` (which the literals would fail) we bind to a
// structural type that catches a renamed or missing FIELD; the literal VALUES are asserted at
// runtime below, and their OpenAPI parity by the Python cross-check.
const _zoneShape: {
  readonly type: string;
  readonly scenario_id: string;
  readonly zone_id: string;
  readonly provenance: string;
  readonly features: readonly unknown[];
  readonly simulated: boolean;
} = fixture.zone;
void _zoneShape;

describe("PR-I Map Ta Phut contract fixture", () => {
  it("pins the enriched impact invariants (200 accounts, 140/35/25)", () => {
    expect(impact.count).toBe(200);
    // The fixture is the FULL response, so count must equal the actual customer array — this
    // catches a sampled fixture that claims 200 above a short list (g2-qcheck round 3).
    expect(impact.customers.length).toBe(impact.count);
    expect(impact.zone).toBe("MTP-LPZ-01");
    const breakdown = impact.type_breakdown;
    expect(breakdown).toEqual({ type_1: 140, type_2: 35, type_3: 25 });
    expect((breakdown?.type_1 ?? 0) + (breakdown?.type_2 ?? 0) + (breakdown?.type_3 ?? 0)).toBe(
      impact.count,
    );
  });

  it("every enriched customer carries its synthetic profile fields", () => {
    expect(impact.customers.length).toBe(200);
    for (const customer of impact.customers) {
      expect(customer.customer_id.startsWith("SIM-MTP-")).toBe(true);
      expect(typeof customer.type_code).toBe("number");
      expect(typeof customer.latest_usage_m3).toBe("number");
    }
  });

  it("customer detail has 12 arithmetically consistent monthly readings", () => {
    expect(detail.readings).toHaveLength(12);
    const periods = detail.readings.map((r) => r.period);
    expect([...periods].sort()).toEqual(periods);
    expect(new Set(periods).size).toBe(12);
    for (const reading of detail.readings) {
      expect(reading.usage_m3).toBe(reading.reading_m3 - reading.previous_reading_m3);
    }
  });

  it("the impact zone is an explicitly simulated footprint, never real geometry", () => {
    const zone = fixture.zone as ImpactZoneCollection;
    expect(zone.type).toBe("FeatureCollection");
    expect(zone.provenance).toBe("SIMULATED_LOW_PRESSURE_FOOTPRINT");
    expect(zone.zone_id).toBe("MTP-LPZ-01");
    expect(zone.features[0]?.geometry.type).toBe("Polygon");
  });
});
