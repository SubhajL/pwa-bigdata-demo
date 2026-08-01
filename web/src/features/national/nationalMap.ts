/**
 * Pure geometry for the national office map (PR-10). The map plots the 234 REAL PWA office
 * locations, grouped into the ten regions and shaded by each region's REAL water-sold volume
 * (sequential one-hue intensity — magnitude by fill, never a categorical colour). No polygon
 * boundaries: this is an honest office-POINT map, not a choropleth (the source has points, not
 * region polygons). All coordinates are real; the shading encodes real volume.
 */
import type { ChartDims } from "@/features/pipeline/types";

import { NATIONAL_CONFIG } from "./national.config";
import { OFFICE_POINT_TUPLES, type OfficePoint } from "./officePoints";
import type { RegionRollup } from "./types";

export interface ProjectedOffice {
  readonly x: number;
  readonly y: number;
}

export interface RegionMark {
  readonly region: number;
  /** REAL water sold for the region this month, or `null` when the region did not report. */
  readonly volumeM3: number | null;
  readonly branchCount: number;
  /** Sequential fill intensity 0..1 (magnitude by intensity); a floor keeps points visible. */
  readonly fillOpacity: number;
  readonly offices: readonly ProjectedOffice[];
}

export interface Bounds {
  readonly lngMin: number;
  readonly lngMax: number;
  readonly latMin: number;
  readonly latMax: number;
}

/** The lightest a reporting region is drawn, so every point stays visible on the map. */
const MIN_FILL = 0.3;

export function parseOfficePoints(
  tuples: ReadonlyArray<readonly [number, number, number]> = OFFICE_POINT_TUPLES,
): OfficePoint[] {
  return tuples.map(([region, lng, lat]) => ({ region, lng, lat }));
}

export function officeBounds(points: readonly OfficePoint[]): Bounds {
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  return {
    lngMin: Math.min(...lngs),
    lngMax: Math.max(...lngs),
    latMin: Math.min(...lats),
    latMax: Math.max(...lats),
  };
}

/** Linear equirectangular projection into the SVG box. Latitude is inverted (north → top). */
export function projectOffice(point: OfficePoint, bounds: Bounds, dims: ChartDims): ProjectedOffice {
  const { w, h, pad } = dims;
  const lngSpan = bounds.lngMax - bounds.lngMin || 1;
  const latSpan = bounds.latMax - bounds.latMin || 1;
  return {
    x: pad + ((point.lng - bounds.lngMin) / lngSpan) * (w - 2 * pad),
    y: pad + ((bounds.latMax - point.lat) / latSpan) * (h - 2 * pad),
  };
}

/** Sequential intensity for a region's volume, floored so a low-volume region is still visible.
 *  A non-reporting region (`null`), a non-finite/negative volume, or a degenerate max returns the
 *  floor; the result is clamped to [MIN_FILL, 1] so an out-of-contract input can never escape it. */
export function regionFillOpacity(volume: number | null, maxVolume: number): number {
  if (volume == null || !Number.isFinite(volume) || volume < 0 || !(maxVolume > 0)) return MIN_FILL;
  const scaled = MIN_FILL + (1 - MIN_FILL) * (volume / maxVolume);
  return Math.max(MIN_FILL, Math.min(1, scaled));
}

/**
 * The ten region marks: real office points projected into the SVG box, each region tagged with
 * its REAL volume, branch count and a sequential fill. Sorted by region number so the drill
 * controls have a stable order. Regions are taken from the office data (always ten), so a region
 * missing from the month's rollup still renders — with `volumeM3: null` — rather than vanishing.
 */
export function regionMarks(
  rollup: RegionRollup,
  dims: ChartDims = NATIONAL_CONFIG.mapDims,
  tuples: ReadonlyArray<readonly [number, number, number]> = OFFICE_POINT_TUPLES,
): RegionMark[] {
  const points = parseOfficePoints(tuples);
  const bounds = officeBounds(points);
  const volByRegion = new Map(rollup.regions.map((r) => [r.region, r.water_sold_m3]));
  const branchByRegion = new Map(rollup.regions.map((r) => [r.region, r.branch_count]));
  const maxVolume = Math.max(...rollup.regions.map((r) => r.water_sold_m3), Number.MIN_VALUE);

  const officesByRegion = new Map<number, ProjectedOffice[]>();
  for (const point of points) {
    const projected = projectOffice(point, bounds, dims);
    const list = officesByRegion.get(point.region);
    if (list) list.push(projected);
    else officesByRegion.set(point.region, [projected]);
  }

  return [...officesByRegion.entries()]
    .sort(([a], [b]) => a - b)
    .map(([region, offices]) => {
      const volumeM3 = volByRegion.get(region) ?? null;
      return {
        region,
        volumeM3,
        branchCount: branchByRegion.get(region) ?? 0,
        fillOpacity: regionFillOpacity(volumeM3, maxVolume),
        offices,
      };
    });
}
