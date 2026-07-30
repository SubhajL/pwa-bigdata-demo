/**
 * Types mirroring the twin API (PR-7a/7b) exactly — field-for-field with `api/app/models.py`.
 * Every value here is SIMULATED except real branch/geography labels; the API carries a
 * `simulated` flag rather than the UI assuming it.
 */
import type { StatusKind } from "@/components/StatusChip";

/** The twin's status vocabulary is the API's `TwinStatus`, which equals PR-6's `StatusKind`. */
export type TwinStatus = StatusKind;

export type Signal =
  | "pressure_bar"
  | "flow_m3h"
  | "power_kw"
  | "vibration"
  | "bearing_temp_c";

export type DeviceKind = "pump" | "motor" | "valve" | "sensor";

export interface TwinNode {
  readonly node: string;
  readonly x: number;
  readonly y: number;
}

export interface TwinPipe {
  readonly pipe_id: string;
  readonly from_node: string;
  readonly to_node: string;
  readonly dma: string | null;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface TwinDeviceView {
  readonly asset_id: string;
  readonly kind: DeviceKind;
  readonly node: string;
  readonly x: number;
  readonly y: number;
  readonly dma: string | null;
  readonly status: TwinStatus;
  readonly simulated: boolean;
}

export interface TwinTopology {
  readonly nodes: readonly TwinNode[];
  readonly pipes: readonly TwinPipe[];
  readonly devices: readonly TwinDeviceView[];
  readonly simulated: boolean;
}

export interface SignalBand {
  readonly low: number;
  readonly high: number;
}

export interface BandsResponse {
  /** NESTED: `bands[signal].low` — not `bands.low`. */
  readonly bands: Readonly<Record<string, SignalBand>>;
  readonly simulated: boolean;
}

export interface SecResponse {
  readonly asset_id: string;
  readonly sec_kwh_per_m3: number | null;
  readonly power_kw: number | null;
  readonly flow_m3h: number | null;
  readonly power_observed_at: string | null;
  readonly flow_observed_at: string | null;
  readonly skew_s: number | null;
  readonly simulated: boolean;
  readonly detail: string | null;
}

export interface AffectedCustomer {
  readonly customer_id: string;
  readonly node: string;
  readonly area: string;
  readonly branch: string;
}

export interface ImpactResponse {
  readonly pipe_id: string;
  readonly affected_pipe_ids: readonly string[];
  readonly customers: readonly AffectedCustomer[];
  readonly count: number;
  readonly simulated: boolean;
}

/** A live frame on `WS /ws/twin`. `kind` is a data frame ("status"|"health") or a control
 *  frame ("disabled"|"busy") the server sends before closing. */
export interface TwinEventFrame {
  readonly event_version?: number;
  readonly kind: "status" | "health" | "disabled" | "busy";
  readonly asset_id?: string;
  readonly status?: TwinStatus;
  readonly signal?: Signal | null;
  readonly value?: number | null;
  readonly observed_at?: string | null;
  readonly published_at?: string | null;
  readonly health_score?: number | null;
  readonly pttf_hours?: number | null;
  readonly model_version?: string | null;
  readonly detail?: string;
}

/** One entry per (kind|signal), retained RAW so drop-state can be re-derived once bands load. */
export interface SignalState {
  readonly status: TwinStatus;
  readonly value: number | null;
  readonly observed_at: string | null;
}

/** The live state accumulated for one device from its frames + the topology baseline. */
export interface DeviceLiveState {
  /** Latest per-signal status frame, keyed by signal. */
  readonly perSignal: Readonly<Record<string, SignalState>>;
  /** Latest health frame (seeded from topology.status on load). */
  readonly health: SignalState | null;
}

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed" | "disabled";
