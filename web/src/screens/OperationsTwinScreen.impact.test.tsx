/**
 * PR-J — the clickable low-pressure impact experience wired into OperationsTwinScreen, proven on
 * the LOGICAL view (no GIS bundle needed — the same bundle-free path the E2E drives). One socket
 * state: a pressure drop surfaces the footprint + highlighted pipe; clicking either opens ONE
 * drawer of exactly 200; a row reveals the account detail + 12 readings; recovery clears it all.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fixture from "@/features/twin/__fixtures__/mtp-contract.json";
import type { BandsResponse, SecResponse, TwinTopology } from "@/features/twin/types";

import { OperationsTwinScreen } from "./OperationsTwinScreen";

const TOPOLOGY: TwinTopology = {
  nodes: [
    { node: "P-2", x: 240, y: 200 },
    { node: "tank", x: 440, y: 200 },
  ],
  pipes: [
    {
      pipe_id: "PIPE-P2-TANK",
      from_node: "P-2",
      to_node: "tank",
      dma: "DMA-03",
      x1: 240,
      y1: 200,
      x2: 440,
      y2: 200,
    },
  ],
  devices: [
    { asset_id: "P-2", kind: "pump", node: "P-2", x: 240, y: 200, dma: "DMA-03", status: "normal", simulated: true },
  ],
  simulated: true,
};

const BANDS: BandsResponse = { bands: { pressure_bar: { low: 2, high: 6 } }, simulated: true };
const SEC: SecResponse = {
  asset_id: "P-2",
  sec_kwh_per_m3: 0.253,
  power_kw: 30,
  flow_m3h: 118.6,
  power_observed_at: null,
  flow_observed_at: null,
  skew_s: 5,
  simulated: true,
  detail: null,
};

let sockets: FakeSocket[] = [];
class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor() {
    sockets.push(this);
  }
  close(): void {}
  open(): void {
    this.onopen?.();
  }
  send(frame: object): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

interface StubOpts {
  /** Gate the customer-detail response for this id until the returned release() is called. */
  detailGateId?: string;
  gate?: Promise<void>;
  /** Return this status for the customer-detail route (e.g. 404/503) to exercise the failure path. */
  detailStatus?: number;
  /** Fail ONLY the first customer-detail request (then succeed) — for the retry-completion path. */
  detailFailFirst?: boolean;
}

let detailAttempts = 0;

let fetchedUrls: string[] = [];
let detailSignals: Map<string, AbortSignal | undefined>;

function stubFetch(opts: StubOpts = {}): void {
  fetchedUrls = [];
  detailSignals = new Map();
  detailAttempts = 0;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    fetchedUrls.push(url);
    if (url.includes("/api/twin/customers/")) {
      const cid = decodeURIComponent(url.split("/api/twin/customers/")[1].split(/[?#]/)[0]);
      detailSignals.set(cid, init?.signal ?? undefined);
    }
    const json = (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/api/twin/topology")) return json(TOPOLOGY);
    if (url.includes("/api/twin/bands")) return json(BANDS);
    if (url.includes("/api/twin/sec/")) return json(SEC);
    if (url.includes("/api/twin/impact/")) {
      // P-2's drop highlights its own outgoing corridor (the schematic's PIPE-P2-TANK).
      return json({ ...fixture.impact, pipe_id: "PIPE-P2-TANK", affected_pipe_ids: ["PIPE-P2-TANK"] });
    }
    if (url.includes("/api/twin/gis/impact-zones")) return json(fixture.zone);
    if (url.includes("/api/twin/customers/")) {
      const id = decodeURIComponent(url.split("/api/twin/customers/")[1].split(/[?#]/)[0]);
      if (opts.detailGateId === id && opts.gate) await opts.gate;
      detailAttempts += 1;
      const failFirst = opts.detailFailFirst === true && detailAttempts === 1;
      if (failFirst || (opts.detailStatus != null && opts.detailStatus !== 200)) {
        return json({ detail: "unavailable" }, opts.detailStatus ?? 503);
      }
      return json({ ...fixture.detail, customer_id: id });
    }
    if (url.includes("/api/twin/gis/manifest")) return json({ detail: "off" }, 404);
    if (url.includes("/api/demo/scenario")) return json({ enabled: false, active_run_id: null, simulated: true });
    return json({});
  });
}

const DROP = {
  event_version: 1,
  kind: "status",
  asset_id: "P-2",
  signal: "pressure_bar",
  status: "critical",
  value: 1.0,
  observed_at: "2026-08-05T10:00:00Z",
} as const;
const RECOVER = { ...DROP, status: "normal", value: 4.0, observed_at: "2026-08-05T10:00:05Z" } as const;
const REDROP = { ...DROP, observed_at: "2026-08-05T10:00:10Z" } as const;

async function mountDropped(): Promise<FakeSocket> {
  render(<OperationsTwinScreen />);
  await waitFor(() => expect(screen.getByTestId("twin-schematic")).toBeInTheDocument());
  expect(sockets.length).toBeGreaterThan(0);
  const socket = sockets[0];
  act(() => socket.open());
  act(() => socket.send(DROP));
  await waitFor(() => expect(screen.getByTestId("low-pressure-area")).toBeInTheDocument());
  return socket;
}

beforeEach(() => {
  sockets = [];
  vi.stubGlobal("WebSocket", FakeSocket as unknown as typeof WebSocket);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PR-J — clickable low-pressure impact (R14/R19/R20)", () => {
  it("T7a: a pressure drop surfaces the footprint; clicking it opens the 200-drawer with breakdown", async () => {
    stubFetch();
    await mountDropped();
    fireEvent.click(screen.getByTestId("low-pressure-area"));
    const drawer = await screen.findByTestId("impact-drawer");
    expect(within(drawer).getByTestId("impact-count").textContent).toContain("200");
    const bd = within(drawer).getByTestId("type-breakdown").textContent ?? "";
    expect(bd).toContain("140");
    expect(bd).toContain("35");
    expect(bd).toContain("25");
    expect(within(drawer).getAllByTestId("customer-row")).toHaveLength(25);
  });

  it("T7-pipe (R19): clicking the affected pipe opens the SAME drawer", async () => {
    stubFetch();
    await mountDropped();
    fireEvent.click(screen.getByTestId("affected-pipe"));
    const drawer = await screen.findByTestId("impact-drawer");
    expect(within(drawer).getByTestId("impact-count").textContent).toContain("200");
  });

  it("T7b: selecting a row fetches and renders that account's detail + 12 readings", async () => {
    stubFetch();
    await mountDropped();
    fireEvent.click(screen.getByTestId("low-pressure-area"));
    const drawer = await screen.findByTestId("impact-drawer");
    fireEvent.click(within(drawer).getAllByTestId("customer-select")[0]);
    await waitFor(() => expect(screen.getByTestId("customer-detail")).toHaveTextContent("SIM-MTP-00001"));
    expect(screen.getAllByTestId("meter-reading-row")).toHaveLength(12);
  });

  it("T7d (R12): recovery closes the drawer and clears the footprint", async () => {
    stubFetch();
    const socket = await mountDropped();
    fireEvent.click(screen.getByTestId("low-pressure-area"));
    await screen.findByTestId("impact-drawer");
    act(() => socket.send(RECOVER));
    await waitFor(() => expect(screen.queryByTestId("impact-drawer")).toBeNull());
    expect(screen.queryByTestId("low-pressure-area")).toBeNull();
  });

  it("T7f (R12/R22): a same-asset re-drop after recovery does NOT auto-reopen, nor show stale detail", async () => {
    stubFetch();
    const socket = await mountDropped();
    fireEvent.click(screen.getByTestId("low-pressure-area"));
    const drawer = await screen.findByTestId("impact-drawer");
    fireEvent.click(within(drawer).getAllByTestId("customer-select")[0]); // select a customer
    await waitFor(() => expect(screen.getByTestId("customer-detail")).toBeInTheDocument());

    act(() => socket.send(RECOVER));
    await waitFor(() => expect(screen.queryByTestId("impact-drawer")).toBeNull());

    // Re-drop the SAME asset: the footprint returns, but the drawer must stay CLOSED (no click yet).
    act(() => socket.send(REDROP));
    await waitFor(() => expect(screen.getByTestId("low-pressure-area")).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId("impact-drawer")).toBeNull();

    // Opening it now shows the LIST, not the previously-selected customer's stale detail.
    fireEvent.click(screen.getByTestId("low-pressure-area"));
    const reopened = await screen.findByTestId("impact-drawer");
    expect(within(reopened).getAllByTestId("customer-row").length).toBe(25);
    expect(screen.queryByTestId("customer-detail")).toBeNull();
  });

  it("T7g (R1): a drop fetches the impact-zone GeoJSON for the map layer", async () => {
    stubFetch();
    await mountDropped();
    await waitFor(() => expect(fetchedUrls.some((u) => u.includes("/api/twin/gis/impact-zones"))).toBe(true));
  });

  it("T7i (R21): a customer-detail FAILURE shows an error+retry, not a permanent spinner", async () => {
    stubFetch({ detailStatus: 503 });
    await mountDropped();
    fireEvent.click(screen.getByTestId("low-pressure-area"));
    const drawer = await screen.findByTestId("impact-drawer");
    fireEvent.click(within(drawer).getAllByTestId("customer-select")[0]);
    // The failed fetch settles to an error state — an explicit retry, never a stuck "loading".
    await waitFor(() => expect(screen.getByTestId("customer-detail-error")).toBeInTheDocument());
    expect(screen.getByTestId("customer-detail").textContent).not.toMatch(/กำลังโหลด/);
    expect(screen.queryByTestId("meter-reading-row")).toBeNull();
  });

  it("T7j (R21): clicking retry after a failure re-fetches and renders the detail + 12 readings", async () => {
    stubFetch({ detailFailFirst: true }); // first detail request 503s, the retry succeeds
    await mountDropped();
    fireEvent.click(screen.getByTestId("low-pressure-area"));
    const drawer = await screen.findByTestId("impact-drawer");
    fireEvent.click(within(drawer).getAllByTestId("customer-select")[0]);
    await waitFor(() => expect(screen.getByTestId("customer-detail-error")).toBeInTheDocument());
    // Retry → the error clears, a second request runs, and the detail + 12 readings render.
    fireEvent.click(screen.getByTestId("customer-detail-retry"));
    await waitFor(() => expect(screen.getByTestId("customer-detail")).toHaveTextContent("SIM-MTP-00001"));
    expect(screen.queryByTestId("customer-detail-error")).toBeNull();
    expect(screen.getAllByTestId("meter-reading-row")).toHaveLength(12);
  });

  it("T7h (recovery hardening): if the incident MOVES to another asset while a drawer is open, it clears", async () => {
    // Two droppable pumps. Open A's drawer, then a NEWER drop on B supersedes A WITHOUT passing
    // through recovery — the A-bound drawer must close and not carry A's selection.
    const twoPumpTopology: TwinTopology = {
      ...TOPOLOGY,
      devices: [
        ...TOPOLOGY.devices,
        { asset_id: "P-9", kind: "pump", node: "P-9", x: 340, y: 300, dma: "DMA-09", status: "normal", simulated: true },
      ],
      nodes: [...TOPOLOGY.nodes, { node: "P-9", x: 340, y: 300 }],
      pipes: [
        ...TOPOLOGY.pipes,
        { pipe_id: "PIPE-P9", from_node: "P-9", to_node: "tank", dma: "DMA-09", x1: 340, y1: 300, x2: 440, y2: 200 },
      ],
    };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      const json = (b: unknown): Response =>
        new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/api/twin/topology")) return json(twoPumpTopology);
      if (url.includes("/api/twin/bands")) return json(BANDS);
      if (url.includes("/api/twin/sec/")) return json(SEC);
      if (url.includes("/api/twin/impact/")) return json({ ...fixture.impact, pipe_id: "x", affected_pipe_ids: ["x"] });
      if (url.includes("/api/twin/gis/impact-zones")) return json(fixture.zone);
      if (url.includes("/api/twin/customers/")) return json(fixture.detail);
      if (url.includes("/api/twin/gis/manifest")) return new Response("{}", { status: 404 });
      return json({});
    });
    const p9Drop = {
      event_version: 1,
      kind: "status",
      asset_id: "P-9",
      signal: "pressure_bar",
      status: "critical",
      value: 1.0,
      observed_at: "2026-08-05T10:00:20Z",
    } as const;
    const p9Recover = { ...p9Drop, status: "normal", value: 4.0, observed_at: "2026-08-05T10:00:25Z" } as const;

    render(<OperationsTwinScreen />);
    await waitFor(() => expect(screen.getByTestId("twin-schematic")).toBeInTheDocument());
    const socket = sockets[0];
    act(() => socket.open());
    act(() => socket.send(DROP)); // P-2 drops (t=00)
    await waitFor(() => expect(screen.getByTestId("low-pressure-area")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("low-pressure-area"));
    const drawer = await screen.findByTestId("impact-drawer");
    fireEvent.click(within(drawer).getAllByTestId("customer-select")[0]); // select a customer
    await waitFor(() => expect(screen.getByTestId("customer-detail")).toBeInTheDocument());

    // A NEWER drop on P-9 becomes the active incident (t=20) — the A-bound drawer closes render-wise.
    act(() => socket.send(p9Drop));
    await waitFor(() => expect(screen.queryByTestId("impact-drawer")).toBeNull());

    // P-9 RECOVERS (t=25) while P-2 is STILL dropped → droppedAsset reverts to P-2. WITHOUT the
    // asset-move clear, `openForAsset` would still be "P-2" and the drawer would AUTO-REOPEN with
    // the stale selected customer. With it, the open state was cleared when P-9 took over.
    act(() => socket.send(p9Recover));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId("impact-drawer")).toBeNull();
    expect(screen.queryByTestId("customer-detail")).toBeNull();
  });

  it("T7e: the whole journey happens on one mounted screen (no reload)", async () => {
    stubFetch();
    await mountDropped();
    // The schematic that was mounted at the start is still the same element — no remount/reload.
    expect(screen.getByTestId("twin-schematic")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("low-pressure-area"));
    await screen.findByTestId("impact-drawer");
    expect(screen.getByTestId("twin-schematic")).toBeInTheDocument();
  });

  it("T7c (R21): a newer row selection supersedes an in-flight detail request", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    stubFetch({ detailGateId: "SIM-MTP-00001", gate });
    await mountDropped();
    fireEvent.click(screen.getByTestId("low-pressure-area"));
    const drawer = await screen.findByTestId("impact-drawer");
    const rows = within(drawer).getAllByTestId("customer-select");
    fireEvent.click(rows[0]); // SIM-MTP-00001 — gated
    fireEvent.click(rows[1]); // SIM-MTP-00002 — resolves immediately
    await waitFor(() => expect(screen.getByTestId("customer-detail")).toHaveTextContent("SIM-MTP-00002"));
    // The superseded request's transport was actually ABORTED (not merely ignored).
    expect(detailSignals.get("SIM-MTP-00001")?.aborted).toBe(true);
    expect(detailSignals.get("SIM-MTP-00002")?.aborted).toBe(false);
    release(); // the late 00001 response must NOT overwrite 00002
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByTestId("customer-detail")).toHaveTextContent("SIM-MTP-00002");
    expect(screen.getByTestId("customer-detail")).not.toHaveTextContent("SIM-MTP-00001");
  });
});
