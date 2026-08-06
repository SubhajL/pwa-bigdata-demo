/**
 * PR-H — the GIS view inside OperationsTwinScreen (rayong-pipe-gis-sec-plan Phase 3).
 *
 * The dual-view contract: one screen, one WebSocket state, two synchronized views. Dark
 * by default — a 404 from the GIS API shows an explicit disabled notice (never a
 * synthetic map), a 503 shows an explicit unavailable state, and only a verified bundle
 * renders real geometry. The live browser pass is e2e/tests/topic2-gis.spec.ts.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import mtpFixture from "@/features/twin/__fixtures__/mtp-contract.json";
import type {
  BandsResponse,
  GisManifest,
  GisNetwork,
  SecResponse,
  TwinTopology,
} from "@/features/twin/types";

import { OperationsTwinScreen } from "./OperationsTwinScreen";

type Handler = (event: unknown) => void;

vi.mock("maplibre-gl", () => {
  class MockMap {
    static instances: MockMap[] = [];
    options: Record<string, unknown>;
    loadHandlers: Handler[] = [];
    layerClicks: Array<{ layer: string; handler: Handler }> = [];
    addSource = vi.fn();
    getSource = vi.fn(() => ({ setData: vi.fn() }));
    addLayer = vi.fn();
    setFilter = vi.fn();
    setPaintProperty = vi.fn();
    fitBounds = vi.fn();
    remove = vi.fn();
    getCanvas = vi.fn(() => ({ style: {} }));
    getLayer = vi.fn(() => undefined);
    querySourceFeatures = vi.fn(() => []);
    queryRenderedFeatures = vi.fn(() => []);
    constructor(options: Record<string, unknown>) {
      this.options = options;
      MockMap.instances.push(this);
    }
    on(event: string, layerOrHandler: string | Handler, handler?: Handler): this {
      if (event === "load" && typeof layerOrHandler === "function") this.loadHandlers.push(layerOrHandler);
      else if (typeof layerOrHandler === "string" && handler) this.layerClicks.push({ layer: layerOrHandler, handler });
      return this;
    }
    fireLayerClick(layer: string, event: unknown): void {
      this.layerClicks.filter((c) => c.layer === layer).forEach((c) => c.handler(event));
    }
    once(_event: string, _handler: Handler): this {
      return this;
    }
  }
  class MockMarker {
    setLngLat = vi.fn(() => this);
    addTo = vi.fn((map: MockMap) => {
      // Real maplibre v6 re-parents the marker element into the canvas container —
      // the portal target must land in the document for screen queries to see it.
      (map.options.container as HTMLElement | undefined)?.appendChild(this.element);
      return this;
    });
    remove = vi.fn();
    element: HTMLElement;
    constructor(options: { element: HTMLElement }) {
      this.element = options.element;
    }
  }
  return { default: { Map: MockMap, Marker: MockMarker }, Map: MockMap, Marker: MockMarker };
});

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
    {
      asset_id: "P-2",
      kind: "pump",
      node: "P-2",
      x: 240,
      y: 200,
      dma: "DMA-03",
      status: "normal",
      simulated: true,
    },
    {
      asset_id: "P-9",
      kind: "pump",
      node: "P-9",
      x: 340,
      y: 300,
      dma: "DMA-09",
      status: "normal",
      simulated: true,
    },
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

const MANIFEST: GisManifest = {
  schema_version: "pipe-ry-gis-1",
  generated_at: "2026-08-05T12:00:00Z",
  source: {
    dataset: "PIPE RY (Rayong pipe GIS)",
    crs: "EPSG:32647",
    output_crs: "EPSG:4326",
    feature_count: 19,
    fingerprint_sha256: "ab".repeat(32),
    files: { "PIPE RY.shp": { sha256: "ab", bytes: 10 } },
  },
  datasets: {
    "map-ta-phut": {
      file: "map_ta_phut.geojson",
      feature_count: 1,
      bounds_wgs84: [101.18, 12.67, 101.21, 12.72],
      length_m: 11023.95,
      sha256: "cd",
      bytes: 100,
    },
    full: {
      file: "network.geojson",
      feature_count: 1,
      bounds_wgs84: [101.17, 12.59, 101.42, 12.85],
      length_m: 1894203.85,
      sha256: "ef",
      bytes: 200,
    },
  },
  demo_binding: {
    scenario_asset_id: "P-2",
    pipe_id: 4926,
    rule: "longest",
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
  energy_reference: {
    value_kwh_per_m3: 0.54,
    unit: "kWh/m³",
    year: 2025,
    scope: "system-wide",
    operator: "East Water",
    source_url: "https://www.eastwater.com/x",
    station_specific: false,
  },
};

const NETWORK: GisNetwork = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { pipe_id: 4926, pipe_type: "HDPE", size_mm: 315 },
      geometry: { type: "LineString", coordinates: [[101.19, 12.71], [101.2, 12.72]] },
    },
  ],
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

function stubFetch(
  gis: {
    manifestStatus?: number;
    networkStatus?: number;
    /** Fail only the FIRST GIS attempt with the given status; later attempts succeed. */
    failOnlyFirst?: boolean;
    /** GIS responses wait on this promise — for late-arrival supersession tests. */
    gate?: Promise<void>;
    /** Return the enriched 200-account impact (+ impact-zone) — for the PR-J drawer bridge. */
    enrichedImpact?: boolean;
  } = {},
): void {
  let gisAttempts = 0;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    const json = (body: unknown, status = 200): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    if (url.includes("/api/twin/gis/manifest")) {
      if (gis.gate) await gis.gate;
      gisAttempts += 1;
      const failed = gis.failOnlyFirst === true && gisAttempts > 1 ? 200 : (gis.manifestStatus ?? 200);
      if (failed !== 200) return json({ detail: "PIPE_GIS_ENABLED is off" }, failed);
      return json(MANIFEST);
    }
    if (url.includes("/api/twin/gis/network")) {
      if (gis.gate) await gis.gate;
      const status = gis.failOnlyFirst === true && gisAttempts > 1 ? 200 : (gis.networkStatus ?? gis.manifestStatus ?? 200);
      if (status !== 200) return json({ detail: "unavailable" }, status);
      return json(NETWORK);
    }
    if (url.includes("/api/twin/topology")) return json(TOPOLOGY);
    if (url.includes("/api/twin/bands")) return json(BANDS);
    if (url.includes("/api/twin/sec/")) {
      // Echo the requested asset with a per-asset value, so a drifted selection is
      // observable: the bound P-2 reads 0.253, any other pump reads 0.999.
      const assetId = decodeURIComponent(url.split("/api/twin/sec/")[1].split(/[?#]/)[0]);
      return json({ ...SEC, asset_id: assetId, sec_kwh_per_m3: assetId === "P-2" ? 0.253 : 0.999 });
    }
    if (url.includes("/api/twin/gis/impact-zones")) {
      return json(mtpFixture.zone);
    }
    if (url.includes("/api/twin/impact/")) {
      if (gis.enrichedImpact === true) {
        return json({
          ...mtpFixture.impact,
          pipe_id: "PIPE-P2-TANK",
          affected_pipe_ids: ["PIPE-P2-TANK"],
        });
      }
      return json({
        pipe_id: "PIPE-P2-TANK",
        affected_pipe_ids: ["PIPE-P2-TANK"],
        customers: [],
        count: 0,
        simulated: true,
      });
    }
    if (url.includes("/api/demo/scenario")) {
      return json({ enabled: false, active_run_id: null, simulated: true });
    }
    return json({});
  });
}

async function openGisView(): Promise<void> {
  render(<OperationsTwinScreen />);
  await waitFor(() => expect(screen.getByRole("tablist")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("tab", { name: /แผนที่ GIS มาบตาพุด/ }));
}

beforeEach(() => {
  sockets = [];
  vi.stubGlobal("WebSocket", FakeSocket as unknown as typeof WebSocket);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OperationsTwinScreen GIS view", () => {
  it("keeps the logical schematic as the default view", async () => {
    stubFetch();
    render(<OperationsTwinScreen />);
    await waitFor(() => expect(screen.getByRole("tablist")).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: /แผนผังกระบวนการ/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByTestId("gis-network-view")).toBeNull();
  });

  it("shows an explicit disabled notice on 404 — dark landing, never a fake map", async () => {
    stubFetch({ manifestStatus: 404 });
    await openGisView();
    await waitFor(() =>
      expect(screen.getByTestId("gis-availability")).toHaveTextContent(/ยังไม่เปิดใช้งาน/),
    );
    expect(screen.queryByTestId("gis-network-view")).toBeNull();
    // The logical view stays one click away — honestly distinct, not replaced.
    fireEvent.click(screen.getByRole("tab", { name: /แผนผังกระบวนการ/ }));
    await waitFor(() => expect(screen.queryByTestId("gis-availability")).toBeNull());
  });

  it("shows an explicit unavailable state on 503 — a broken bundle is reported broken", async () => {
    stubFetch({ manifestStatus: 503 });
    await openGisView();
    await waitFor(() =>
      expect(screen.getByTestId("gis-availability")).toHaveTextContent(/ไม่พร้อมใช้งาน/),
    );
    expect(screen.queryByTestId("gis-network-view")).toBeNull();
  });

  it("renders the verified bundle: map, provenance legend, energy card, bound-pump SEC", async () => {
    stubFetch();
    await openGisView();
    await waitFor(() => expect(screen.getByTestId("gis-network-view")).toBeInTheDocument());
    expect(screen.getByTestId("twin-provenance-legend")).toBeInTheDocument();
    expect(screen.getByTestId("energy-official-reference")).toHaveTextContent("0.54");
    // Entering the GIS view selects the bound pump so SEC (2.3) rides the same state.
    await waitFor(() => expect(screen.getByTestId("energy-sec-live")).toHaveTextContent("0.253"));
  });

  it("shows the pipe-details prompt and wires marker click → bound pipe's REAL attributes", async () => {
    stubFetch();
    await openGisView();
    await waitFor(() => expect(screen.getByTestId("gis-network-view")).toBeInTheDocument());
    const details = screen.getByTestId("gis-pipe-details");
    expect(details).toHaveTextContent(/คลิกท่อบนแผนที่/);
    fireEvent.click(screen.getByTestId("gis-device-marker"));
    await waitFor(() => expect(screen.getByTestId("gis-pipe-details")).toHaveTextContent("4926"));
    expect(screen.getByTestId("gis-pipe-details")).toHaveTextContent(/การจับคู่จำลอง/);
  });

  it("re-entering the GIS view re-selects the bound pump, even after another was selected", async () => {
    // PR-R3 finding 5: SEC beside the fixed GIS binding must be the bound pump's, never a
    // pump left selected in the logical view. The regression: selection snapped only on
    // the FIRST fetch, so a later GIS entry kept the stale selection.
    stubFetch();
    render(<OperationsTwinScreen />);
    await waitFor(() => expect(screen.getByRole("tablist")).toBeInTheDocument());

    // First GIS entry: selection snaps to the bound P-2, energy card shows its SEC.
    fireEvent.click(screen.getByRole("tab", { name: /แผนที่ GIS มาบตาพุด/ }));
    await waitFor(() =>
      expect(screen.getByTestId("energy-sec-live")).toHaveTextContent("0.253"),
    );

    // Back on the logical view, select a DIFFERENT pump.
    fireEvent.click(screen.getByRole("tab", { name: /แผนผังกระบวนการ/ }));
    fireEvent.click(screen.getByRole("button", { name: /P-9/ }));
    await waitFor(() => expect(screen.getByTestId("sec-card")).toHaveTextContent("P-9"));

    // Re-enter GIS: it must re-select the binding, not carry P-9's SEC beside real geometry.
    fireEvent.click(screen.getByRole("tab", { name: /แผนที่ GIS มาบตาพุด/ }));
    await waitFor(() =>
      expect(screen.getByTestId("energy-sec-live")).toHaveTextContent("0.253"),
    );
    expect(screen.getByTestId("sec-card")).toHaveTextContent("P-2");
  });

  it("a late GIS arrival after switching back to logical must NOT snap the selection", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubFetch({ gate });
    render(<OperationsTwinScreen />);
    await waitFor(() => expect(screen.getByRole("tablist")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /แผนที่ GIS มาบตาพุด/ }));
    fireEvent.click(screen.getByRole("tab", { name: /แผนผังกระบวนการ/ }));
    release();
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    // Had the late continuation snapped selection to P-2, the SEC card would render.
    expect(screen.queryByText(/อัตราการใช้พลังงานจำเพาะ · P-2/)).toBeNull();
    expect(
      screen.getByRole("tab", { name: /แผนผังกระบวนการ/ }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("a transient first-load failure is retryable by re-entering the GIS tab", async () => {
    stubFetch({ manifestStatus: 503, failOnlyFirst: true });
    await openGisView();
    await waitFor(() =>
      expect(screen.getByTestId("gis-availability")).toHaveTextContent(/ไม่พร้อมใช้งาน/),
    );
    fireEvent.click(screen.getByRole("tab", { name: /แผนผังกระบวนการ/ }));
    fireEvent.click(screen.getByRole("tab", { name: /แผนที่ GIS มาบตาพุด/ }));
    await waitFor(() => expect(screen.getByTestId("gis-network-view")).toBeInTheDocument());
  });

  it("the unavailable notice's retry button refetches in place", async () => {
    stubFetch({ manifestStatus: 503, failOnlyFirst: true });
    await openGisView();
    await waitFor(() => expect(screen.getByTestId("gis-retry")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("gis-retry"));
    await waitFor(() => expect(screen.getByTestId("gis-network-view")).toBeInTheDocument());
  });

  it("highlights the bound REAL pipe during its asset's pressure drop and clears on recovery", async () => {
    stubFetch();
    await openGisView();
    await waitFor(() => expect(screen.getByTestId("gis-network-view")).toBeInTheDocument());
    expect(sockets.length).toBeGreaterThan(0);
    const socket = sockets[0];
    act(() => socket.open());
    act(() =>
      socket.send({
        event_version: 1,
        kind: "status",
        asset_id: "P-2",
        signal: "pressure_bar",
        status: "critical",
        value: 1.0,
        observed_at: "2026-08-05T10:00:00Z",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("gis-network-view")).toHaveAttribute(
        "data-highlighted-pipes",
        "4926",
      ),
    );
    act(() =>
      socket.send({
        event_version: 1,
        kind: "status",
        asset_id: "P-2",
        signal: "pressure_bar",
        status: "normal",
        value: 4.0,
        observed_at: "2026-08-05T10:00:05Z",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("gis-network-view")).toHaveAttribute(
        "data-highlighted-pipes",
        "",
      ),
    );
  });

  it("PR-J R19 — clicking the HIGHLIGHTED bound pipe in the GIS view opens the 200-account drawer", async () => {
    stubFetch({ enrichedImpact: true });
    await openGisView();
    await waitFor(() => expect(screen.getByTestId("gis-network-view")).toBeInTheDocument());
    const socket = sockets[0];
    act(() => socket.open());
    // Drop P-2 → its bound pipe 4926 highlights on the map (the R19 entry point).
    act(() =>
      socket.send({
        event_version: 1,
        kind: "status",
        asset_id: "P-2",
        signal: "pressure_bar",
        status: "critical",
        value: 1.0,
        observed_at: "2026-08-05T10:00:00Z",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("gis-network-view")).toHaveAttribute("data-highlighted-pipes", "4926"),
    );
    // Fire a click on the HIGHLIGHTED pipe LINE (the source-step-4 entry point) — the screen wires
    // GisNetworkView.onOpenImpact to openImpactDrawer, so the shared 200-account drawer opens.
    const lib = (await import("maplibre-gl")) as unknown as {
      Map: { instances: Array<{ loadHandlers: Array<() => void>; fireLayerClick: (l: string, e: unknown) => void }> };
    };
    const map = lib.Map.instances[lib.Map.instances.length - 1];
    act(() => map.loadHandlers.forEach((h) => h())); // register the layer-click handlers
    act(() => map.fireLayerClick("pipe-ry-line", { features: [{ properties: { pipe_id: 4926 } }] }));
    const drawer = await screen.findByTestId("impact-drawer");
    expect(within(drawer).getByTestId("impact-count").textContent).toContain("200");
    // The device MARKER, by contrast, still shows REAL pipe details even now (bound pipe
    // highlighted) — it never opens the drawer. That discrimination is unit-tested in
    // GisNetworkView.test.tsx (R19/R19b); the marker→REAL-attributes path is topic2-gis 2.5.
  });
});
