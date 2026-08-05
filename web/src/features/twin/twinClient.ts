/**
 * The twin's read clients and pure reducers.
 *
 * The HTTP clients are thin wrappers over PR-6's `getJson` (retiring its declared orphan).
 * The pure functions — status derivation, drop detection, pipe lookup, viewBox zoom — are the
 * logic the components and the socket hook share, kept here so they are unit-testable without a
 * DOM or a socket.
 */
import { getJson } from "@/api/client";

import type {
  BandsResponse,
  DeviceLiveState,
  GisManifest,
  GisNetwork,
  GisScope,
  ImpactResponse,
  SecResponse,
  TwinEventFrame,
  TwinPipe,
  TwinStatus,
  TwinTopology,
} from "./types";

// ── HTTP clients ──────────────────────────────────────────────────────────────────────

export function fetchTopology(signal?: AbortSignal): Promise<TwinTopology> {
  return getJson<TwinTopology>("/api/twin/topology", { signal });
}

export function fetchBands(signal?: AbortSignal): Promise<BandsResponse> {
  return getJson<BandsResponse>("/api/twin/bands", { signal });
}

export function fetchSec(assetId: string, signal?: AbortSignal): Promise<SecResponse> {
  return getJson<SecResponse>(`/api/twin/sec/${encodeURIComponent(assetId)}`, { signal });
}

export function fetchImpact(pipeId: string, signal?: AbortSignal): Promise<ImpactResponse> {
  return getJson<ImpactResponse>(`/api/twin/impact/${encodeURIComponent(pipeId)}`, { signal });
}

/** The GIS bundle manifest (PR-H). 404 = feature disabled (dark), 503 = broken bundle. */
export function fetchGisManifest(signal?: AbortSignal): Promise<GisManifest> {
  return getJson<GisManifest>("/api/twin/gis/manifest", { signal });
}

/** One scope's verified GeoJSON. Same status semantics as the manifest. */
export function fetchGisNetwork(
  scope: GisScope = "map-ta-phut",
  signal?: AbortSignal,
): Promise<GisNetwork> {
  return getJson<GisNetwork>(`/api/twin/gis/network?scope=${scope}`, { signal });
}

// ── pure reducers ─────────────────────────────────────────────────────────────────────

const SEVERITY: Readonly<Record<TwinStatus, number>> = {
  nodata: 0,
  normal: 1,
  warning: 2,
  critical: 3,
};

/**
 * A device's rendered status = the MAX severity across its live per-signal status frames and
 * its health frame (the 7b contract). Empty → "nodata", NEVER "normal": an unknown device must
 * not render healthy. A pressure warning therefore persists until a newer pressure frame,
 * independent of flow/power frames.
 */
export function deriveStatus(live: DeviceLiveState): TwinStatus {
  const candidates: TwinStatus[] = Object.values(live.perSignal).map((s) => s.status);
  if (live.health) candidates.push(live.health.status);
  if (candidates.length === 0) return "nodata";
  return candidates.reduce((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst), "nodata");
}

/**
 * Is this frame a pressure DROP (as opposed to a spike)? Needs the bands to know `low`.
 *
 * A drop is `pressure_bar`, a warning-or-critical status, a finite value, and `value < low`.
 * A spike (`value > high`) is deliberately NOT a drop — it does not lose customers water, so
 * it must not trigger the affected-customer list.
 */
export function isPressureDrop(
  frame: TwinEventFrame,
  bands: BandsResponse | null,
): boolean {
  if (bands == null) return false;
  if (frame.kind !== "status" || frame.signal !== "pressure_bar") return false;
  if (frame.status !== "warning" && frame.status !== "critical") return false;
  const value = frame.value;
  const low = bands.bands.pressure_bar?.low;
  if (value == null || !Number.isFinite(value) || low == null) return false;
  return value < low;
}

/**
 * Every pipe leaving `node` — usually one, but a branching topology has several distinct
 * `pipe_id`s, each of which must be queried and their customers deduplicated. (`pipe_id` being
 * non-unique in the DB is a different axis, handled by the impact route itself.)
 */
export function outgoingPipes(node: string, topology: TwinTopology): TwinPipe[] {
  return topology.pipes.filter((p) => p.from_node === node);
}

export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Zoom `current` by `factor` about its centre, clamped so the width stays within
 * `[minScale, maxScale] × base.width`. A factor < 1 zooms in (smaller viewBox), > 1 zooms out.
 * Only the viewBox changes; the SVG's own width/height never do, which is what makes the zoom
 * resolution-independent.
 *
 * @throws RangeError for a non-finite or non-positive factor.
 */
export function zoomViewBox(
  base: ViewBox,
  current: ViewBox,
  factor: number,
  minScale: number,
  maxScale: number,
): ViewBox {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError(`zoom factor must be finite and positive, got ${factor}`);
  }
  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;
  const rawScale = (current.width * factor) / base.width;
  const scale = Math.min(maxScale, Math.max(minScale, rawScale));
  const width = base.width * scale;
  const height = base.height * scale;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** True when `next` is strictly newer than `prev` by observed_at, or when either is null
 *  (a frame with no timestamp is treated as current — newest-by-arrival). */
export function isNewer(next: string | null, prev: string | null): boolean {
  if (prev == null || next == null) return true;
  return next >= prev;
}
