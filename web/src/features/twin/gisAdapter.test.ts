/**
 * PR-H — pure GIS adapter logic (rayong-pipe-gis-sec-plan Phase 3).
 *
 * Everything here must be testable without a DOM or a map: the mapping from twin state
 * to map style inputs, the manifest-driven focus bounds, the availability
 * classification of API errors, and the arithmetic-only energy delta.
 */
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/client";

import {
  availabilityFromError,
  energyDelta,
  focusBounds,
  highlightFilter,
  highlightedPipeIds,
  selectedPipeFeature,
} from "./gisAdapter";
import type { EnergyReference, GisManifest, GisNetwork, SecResponse } from "./types";

const ENERGY_REFERENCE: EnergyReference = {
  value_kwh_per_m3: 0.54,
  unit: "kWh/m³",
  year: 2025,
  scope: "system-wide",
  operator: "East Water",
  source_url:
    "https://www.eastwater.com/en/sustainability/sustainability-overview/environment-dimension/energy-management",
  station_specific: false,
};

const MANIFEST: GisManifest = {
  schema_version: "pipe-ry-gis-1",
  generated_at: "2026-08-05T12:00:00Z",
  source: {
    dataset: "PIPE RY (Rayong pipe GIS)",
    crs: "EPSG:32647",
    output_crs: "EPSG:4326",
    feature_count: 19,
    files: { "PIPE RY.shp": { sha256: "ab", bytes: 10 } },
  },
  datasets: {
    "map-ta-phut": {
      file: "map_ta_phut.geojson",
      feature_count: 19,
      bounds_wgs84: [101.180758, 12.6756819, 101.2100184, 12.7222887],
      length_m: 11023.95,
      sha256: "cd",
      bytes: 100,
    },
    full: {
      file: "network.geojson",
      feature_count: 9273,
      bounds_wgs84: [101.1753136, 12.5924355, 101.4166367, 12.8442413],
      length_m: 1894203.85,
      sha256: "ef",
      bytes: 200,
    },
  },
  demo_binding: {
    scenario_asset_id: "P-2",
    pipe_id: 4926,
    rule: "longest Map Ta Phut focus pipe, ties broken by lowest pipe id",
    midpoint_wgs84: [101.1972997, 12.715989],
    placement: "SIMULATED",
    properties: { pipe_id: 4926, pipe_type: "HDPE" },
  },
  provenance: {
    geometry: "REAL",
    attributes: "REAL",
    binding: "SIMULATED",
    placement: "SIMULATED",
    distribution: "local until permission",
  },
  energy_reference: ENERGY_REFERENCE,
};

const NETWORK: GisNetwork = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { pipe_id: 4926, pipe_type: "HDPE", size_mm: 315 },
      geometry: { type: "LineString", coordinates: [[101.19, 12.71], [101.2, 12.72]] },
    },
    {
      type: "Feature",
      properties: { pipe_id: 2269, pipe_type: "PVC", size_mm: 110 },
      geometry: { type: "LineString", coordinates: [[101.18, 12.68], [101.19, 12.69]] },
    },
  ],
};

describe("focusBounds", () => {
  it("returns the Map Ta Phut dataset bounds as [[west, south], [east, north]]", () => {
    expect(focusBounds(MANIFEST)).toEqual([
      [101.180758, 12.6756819],
      [101.2100184, 12.7222887],
    ]);
  });

  it("returns null for malformed bounds rather than fitting the map to garbage", () => {
    const broken: GisManifest = {
      ...MANIFEST,
      datasets: {
        ...MANIFEST.datasets,
        "map-ta-phut": {
          ...MANIFEST.datasets["map-ta-phut"],
          bounds_wgs84: [101.2, 12.7, 101.1, Number.NaN],
        },
      },
    };
    expect(focusBounds(broken)).toBeNull();
  });
});

describe("highlightedPipeIds", () => {
  it("highlights the bound pipe exactly while ITS scenario asset is the active drop", () => {
    expect(highlightedPipeIds(MANIFEST.demo_binding, "P-2")).toEqual([4926]);
  });

  it("highlights nothing when no drop is active or another asset drops", () => {
    expect(highlightedPipeIds(MANIFEST.demo_binding, null)).toEqual([]);
    expect(highlightedPipeIds(MANIFEST.demo_binding, "P-9")).toEqual([]);
  });
});

describe("highlightFilter", () => {
  it("builds an expression matching pipe_id membership", () => {
    expect(highlightFilter([4926])).toEqual(["in", ["get", "pipe_id"], ["literal", [4926]]]);
    expect(highlightFilter([])).toEqual(["in", ["get", "pipe_id"], ["literal", []]]);
  });
});

describe("energyDelta", () => {
  const sec = (value: number | null): SecResponse => ({
    asset_id: "P-2",
    sec_kwh_per_m3: value,
    power_kw: 30,
    flow_m3h: 100,
    power_observed_at: null,
    flow_observed_at: null,
    skew_s: 0,
    simulated: true,
    detail: null,
  });

  it("is plain arithmetic against the official reference, rounded to 3 decimals", () => {
    expect(energyDelta(sec(0.3), ENERGY_REFERENCE)).toBeCloseTo(-0.24, 10);
    expect(energyDelta(sec(0.643), ENERGY_REFERENCE)).toBeCloseTo(0.103, 10);
  });

  it("is null without a computed SEC — never 0, never NaN", () => {
    expect(energyDelta(sec(null), ENERGY_REFERENCE)).toBeNull();
    expect(energyDelta(null, ENERGY_REFERENCE)).toBeNull();
  });
});

describe("availabilityFromError", () => {
  it("maps 404 to disabled (dark landing) and 5xx to unavailable (broken bundle)", () => {
    expect(availabilityFromError(new ApiError(404, "PIPE_GIS_ENABLED is off"))).toBe("disabled");
    expect(availabilityFromError(new ApiError(503, "bundle unavailable"))).toBe("unavailable");
  });

  it("treats transport failures as unavailable, never as disabled", () => {
    expect(availabilityFromError(new ApiError(0, "network down"))).toBe("unavailable");
    expect(availabilityFromError(new TypeError("boom"))).toBe("unavailable");
  });
});

describe("selectedPipeFeature", () => {
  it("finds the clicked pipe by id and returns null for an unknown id", () => {
    expect(selectedPipeFeature(NETWORK, 2269)?.properties.pipe_type).toBe("PVC");
    expect(selectedPipeFeature(NETWORK, 999)).toBeNull();
    expect(selectedPipeFeature(null, 2269)).toBeNull();
  });
});
