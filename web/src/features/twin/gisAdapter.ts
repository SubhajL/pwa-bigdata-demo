/**
 * Pure adapter between twin state and the GIS view (PR-H).
 *
 * Everything a map decision depends on lives here, DOM- and map-free, so the mapping is
 * unit-testable: focus bounds from the manifest, which pipes to highlight for a drop,
 * the MapLibre filter expression, error→availability classification, and the
 * arithmetic-only delta between simulated SEC and the official reference.
 */
import { ApiError } from "@/api/client";

import type {
  EnergyReference,
  GisDemoBinding,
  GisLineFeature,
  GisManifest,
  GisNetwork,
  ImpactZoneCollection,
  SecResponse,
} from "./types";

/** The Map Ta Phut focus as [[west, south], [east, north]], or null when malformed —
 *  a map fitted to garbage bounds fails silently, so the caller must skip the fit. */
export function focusBounds(
  manifest: GisManifest,
): readonly [readonly [number, number], readonly [number, number]] | null {
  const bounds = manifest.datasets["map-ta-phut"]?.bounds_wgs84;
  if (bounds == null || bounds.length !== 4) return null;
  const [west, south, east, north] = bounds;
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (west > east || south > north) return null;
  return [
    [west, south],
    [east, north],
  ];
}

/** The bound REAL pipe highlights exactly while ITS scenario asset is the active drop.
 *  Any other asset's drop belongs to the logical view's own affected-pipe logic. */
export function highlightedPipeIds(
  binding: GisDemoBinding,
  droppedAssetId: string | null,
): readonly number[] {
  return droppedAssetId === binding.scenario_asset_id ? [binding.pipe_id] : [];
}

/** MapLibre filter matching features whose `pipe_id` is in `pipeIds`. */
export function highlightFilter(pipeIds: readonly number[]): unknown[] {
  return ["in", ["get", "pipe_id"], ["literal", [...pipeIds]]];
}

/** The impact-zone footprint as a GeoJSON FeatureCollection for `source.setData`, or an EMPTY
 *  collection when no zone is active (PR-J). The source/layers are created empty at map load and
 *  fed by this on prop change, so a late-arriving zone always has a source to update. */
export function impactZoneGeoJson(zone: ImpactZoneCollection | null): {
  readonly type: "FeatureCollection";
  readonly features: readonly ImpactZoneCollection["features"][number][];
} {
  return { type: "FeatureCollection", features: zone?.features ?? [] };
}

/**
 * Simulated instantaneous SEC minus the official reference, rounded to 3 decimals.
 * Arithmetic ONLY — the caller must not colour it or alarm on it
 * (rayong-pipe-gis-sec-plan decision 10). Null without a computed SEC: never 0.
 */
export function energyDelta(
  sec: SecResponse | null,
  reference: EnergyReference,
): number | null {
  const value = sec?.sec_kwh_per_m3;
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round((value - reference.value_kwh_per_m3) * 1000) / 1000;
}

/** 404 means the feature is off (dark landing); everything else is a broken dependency.
 *  Transport failures are "unavailable" — an unreachable API is not proof of intent. */
export function availabilityFromError(error: unknown): "disabled" | "unavailable" {
  return error instanceof ApiError && error.status === 404 ? "disabled" : "unavailable";
}

/** The clicked pipe's feature, by source pipe id. */
export function selectedPipeFeature(
  network: GisNetwork | null,
  pipeId: number | null,
): GisLineFeature | null {
  if (network == null || pipeId == null) return null;
  return network.features.find((feature) => feature.properties.pipe_id === pipeId) ?? null;
}

/**
 * Resolve a design token (a `--color-*` custom property) to a MapLibre-compatible
 * colour via a probe element — the canvas paint uses the SAME tokens as the DOM,
 * re-resolved per call so a theme flip yields the other `light-dark()` branch. Null
 * when the environment cannot compute styles or rasterize (jsdom): the caller must
 * then OMIT the paint property so the map library's own default applies — this module
 * never invents a colour literal (tokens.test.ts T2 enforces that repo-wide).
 */
export function resolveCssColor(token: string, doc: Document = document): string | null {
  const probe = doc.createElement("span");
  probe.style.color = `var(${token})`;
  doc.body.appendChild(probe);
  const resolved = doc.defaultView?.getComputedStyle(probe).color ?? "";
  probe.remove();
  return resolved === "" ? null : toMaplibreColor(resolved, doc);
}

/**
 * Modern engines serialize the computed colour in its SPECIFIED space — our tokens
 * come back in the OKLCH functional notation, which the MapLibre style spec rejects
 * (its style validator fires an `error` event and the paint is refused; this broke the
 * live E2E). A 1×1 canvas fill makes the BROWSER do the colour conversion, and the
 * result is re-encoded as a hex string built from the pixel bytes — no colour literal
 * in this source.
 */
function toMaplibreColor(cssColor: string, doc: Document): string | null {
  const canvas = doc.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context == null) return null;
  context.fillStyle = cssColor;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  const bytes = alpha === 255 ? [red, green, blue] : [red, green, blue, alpha];
  return `#${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
