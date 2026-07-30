/**
 * The live WebSocket subscription for the digital twin (scored item 2.2).
 *
 * Owns the socket lifecycle and reduces incoming frames into a per-asset live state. It does
 * NOT own the topology baseline — the screen merges that (a device with no live `health` frame
 * falls back to its topology status), which keeps this hook a pure live reducer.
 *
 * Correctness the tests pin (each was a review finding):
 *  - GENERATION OWNERSHIP. React StrictMode double-mounts in development and a reconnect creates
 *    a new socket; a stale socket's onopen/onmessage/onerror/onclose must be inert. Each socket
 *    carries a generation id; callbacks check it against the live generation before touching
 *    state or scheduling a retry.
 *  - RECONNECT on any close the hook did not initiate (a server restart / proxy close can be
 *    "clean"); only cleanup is intentional. Backoff is capped exponential. onerror and onclose
 *    cannot schedule two retries — the first to fire nulls the socket's handlers.
 *  - CONTROL FRAMES. `{kind:"disabled"}` means ingest is off server-side — stop, do not hammer.
 *    `{kind:"busy"}` (hub full) means retry later. Neither is a data frame.
 *  - MALFORMED frames are dropped, not thrown.
 *  - RESYNC. The backend has no resynchronisation protocol and broadcasts a recovery once, so a
 *    frame missed while disconnected would strand the UI. `generation` bumps on every (re)open;
 *    the screen refetches topology on that change to resync from persisted health.
 */
import { useEffect, useRef, useState } from "react";

import { wsUrl } from "@/api/client";
import { APP_CONFIG } from "@/config/app.config";

import { TWIN_CONFIG } from "./twin.config";
import { isNewer } from "./twinClient";
import type { ConnectionState, DeviceLiveState, SignalState, TwinEventFrame } from "./types";

const DATA_KINDS = new Set(["status", "health"]);
const STATUSES = new Set(["normal", "warning", "critical", "nodata"]);
const SIGNALS = new Set(["pressure_bar", "flow_m3h", "power_kw", "vibration", "bearing_temp_c"]);

/** Parse and validate one wire frame; return null for anything unusable. The socket carries no
 *  runtime schema (getJson does none either), so every field is checked before we trust it. */
export function parseFrame(raw: unknown): TwinEventFrame | null {
  if (typeof raw !== "object" || raw === null) return null;
  const frame = raw as Record<string, unknown>;
  if (typeof frame.kind !== "string") return null;
  if (frame.kind === "disabled" || frame.kind === "busy") {
    return { kind: frame.kind, detail: typeof frame.detail === "string" ? frame.detail : undefined };
  }
  if (!DATA_KINDS.has(frame.kind)) return null;
  // A frame from a future event_version we do not understand is dropped, not misread.
  if (frame.event_version != null && frame.event_version !== 1) return null;
  if (typeof frame.asset_id !== "string") return null;
  if (typeof frame.status !== "string" || !STATUSES.has(frame.status)) return null;
  if (frame.signal != null && !(typeof frame.signal === "string" && SIGNALS.has(frame.signal))) return null;
  if (frame.value != null && typeof frame.value !== "number") return null;
  if (frame.observed_at != null && typeof frame.observed_at !== "string") return null;
  return frame as unknown as TwinEventFrame;
}

/** Fold one data frame into the per-asset live map, rejecting an out-of-order same-key frame. */
export function applyFrame(
  byAsset: ReadonlyMap<string, DeviceLiveState>,
  frame: TwinEventFrame,
): Map<string, DeviceLiveState> {
  const asset = frame.asset_id;
  const base = new Map(byAsset);
  if (asset == null) return base;
  const prev = base.get(asset) ?? { perSignal: {}, health: null };
  const incoming: SignalState = {
    status: frame.status ?? "nodata",
    value: frame.value ?? null,
    observed_at: frame.observed_at ?? null,
  };

  if (frame.kind === "health") {
    if (prev.health && !isNewer(incoming.observed_at, prev.health.observed_at)) return base;
    base.set(asset, { ...prev, health: incoming });
    return base;
  }
  const signal = frame.signal ?? "unknown";
  const existing = prev.perSignal[signal];
  if (existing && !isNewer(incoming.observed_at, existing.observed_at)) return base;
  base.set(asset, { ...prev, perSignal: { ...prev.perSignal, [signal]: incoming } });
  return base;
}

export interface UseTwinSocketResult {
  readonly connection: ConnectionState;
  readonly byAsset: ReadonlyMap<string, DeviceLiveState>;
  /** Increments on every socket (re)open. The screen refetches topology when it changes. */
  readonly generation: number;
}

export function useTwinSocket(): UseTwinSocketResult {
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [byAsset, setByAsset] = useState<Map<string, DeviceLiveState>>(() => new Map());
  const [generation, setGeneration] = useState(0);

  const genRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    genRef.current += 1;
    let intentional = false;
    let attempt = 0;

    const scheduleReconnect = (myGen: number): void => {
      if (myGen !== genRef.current || intentional) return;
      setConnection("reconnecting");
      const delay = Math.min(TWIN_CONFIG.reconnectMaxMs, TWIN_CONFIG.reconnectBaseMs * 2 ** attempt);
      attempt += 1;
      if (timerRef.current != null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (myGen === genRef.current && !intentional) connect();
      }, delay);
    };

    const connect = (): void => {
      if (typeof WebSocket === "undefined") {
        setConnection("closed");
        return;
      }
      // A FRESH generation per socket — not just per mount. Even if a previous socket's
      // callbacks were somehow retained (not nulled), their `myGen` no longer matches, so
      // they cannot mutate state or schedule a retry after a reconnect.
      genRef.current += 1;
      const myGen = genRef.current;
      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl(TWIN_CONFIG.wsPath, APP_CONFIG.apiBase));
      } catch {
        scheduleReconnect(myGen);
        return;
      }
      socketRef.current = socket;

      socket.onopen = (): void => {
        if (myGen !== genRef.current) return;
        attempt = 0;
        // Discard live state accumulated before this (re)open: it is stale across a
        // disconnect, and the screen resyncs from the fresh topology (persisted health) that
        // the `generation` bump below triggers. Without this, a recovery broadcast ONCE while
        // we were disconnected would be missed and the device would show critical forever.
        setByAsset(new Map());
        setConnection("open");
        setGeneration((g) => g + 1); // tell the screen to resync topology
      };
      socket.onmessage = (event: MessageEvent): void => {
        if (myGen !== genRef.current) return;
        let raw: unknown;
        try {
          raw = JSON.parse(typeof event.data === "string" ? event.data : "");
        } catch {
          return;
        }
        const frame = parseFrame(raw);
        if (frame == null) return;
        if (frame.kind === "disabled") {
          intentional = true; // ingest off; do not hammer-reconnect
          setConnection("disabled");
          return;
        }
        if (frame.kind === "busy") return; // the close that follows drives the backoff
        setByAsset((prev) => applyFrame(prev, frame));
      };
      const onGone = (): void => {
        if (myGen !== genRef.current || intentional) return;
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null; // no double-retry
        scheduleReconnect(myGen);
      };
      socket.onerror = onGone;
      socket.onclose = onGone;
    };

    connect();

    return (): void => {
      intentional = true;
      genRef.current += 1; // invalidate the current socket's callbacks
      if (timerRef.current != null) clearTimeout(timerRef.current);
      timerRef.current = null;
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        try {
          socket.close();
        } catch {
          /* already closing */
        }
      }
    };
  }, []);

  return { connection, byAsset, generation };
}
