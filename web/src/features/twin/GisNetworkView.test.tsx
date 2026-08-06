/**
 * PR-H — MapLibre lifecycle and source/layer composition (Phase 3).
 *
 * maplibre-gl is mocked: jsdom has no WebGL. What these tests own is the CONTRACT with
 * the library — one Map per mount, blank offline style (no external tiles), the GeoJSON
 * source and its two VALID line layers (specs checked, not just call counts), focus
 * fit, exact marker lng/lat order, in-place highlight updates, readiness only after
 * load+idle, pre-load errors surfacing as the explicit failed state, crash-safe
 * cleanup, and theme repaint (data-theme and OS scheme). Real rendering/zoom crispness
 * is the topic2-gis Playwright pass.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GisManifest, GisNetwork, ImpactZoneCollection } from "./types";

type Handler = (event: unknown) => void;

vi.mock("maplibre-gl", () => {
  class MockMap {
    static instances: MockMap[] = [];
    options: Record<string, unknown>;
    handlers = new Map<string, Handler[]>();
    onceHandlers = new Map<string, Handler[]>();
    layerClicks: Array<{ layer: string; handler: Handler }> = [];
    layers: Array<Record<string, unknown>> = [];
    sources: Record<string, { data?: { features?: unknown[] } }> = {};
    setSourceData: Array<{ id: string; data: { features?: unknown[] } }> = [];
    renderedFeatures: unknown[] = [];
    removeThrows = false;
    addSource = vi.fn((id: string, spec: { data?: { features?: unknown[] } }) => {
      this.sources[id] = spec;
    });
    getSource = vi.fn((id: string) => {
      if (!this.sources[id]) return undefined;
      return {
        setData: (data: { features?: unknown[] }) => {
          this.sources[id].data = data;
          this.setSourceData.push({ id, data });
        },
      };
    });
    querySourceFeatures = vi.fn((id: string) => this.sources[id]?.data?.features ?? []);
    queryRenderedFeatures = vi.fn(() => this.renderedFeatures);
    addLayer = vi.fn((spec: Record<string, unknown>) => {
      this.layers.push(spec);
    });
    setFilter = vi.fn();
    setPaintProperty = vi.fn();
    fitBounds = vi.fn();
    remove = vi.fn(() => {
      if (this.removeThrows) throw new TypeError("painter is undefined");
    });
    getCanvas = vi.fn(() => ({ style: {} }));
    getLayer = vi.fn((id: string) => {
      const style = this.options.style as { layers?: Array<{ id: string }> } | undefined;
      const inStyle = style?.layers?.some((layer) => layer.id === id) ?? false;
      const added = this.layers.some((layer) => layer.id === id);
      return inStyle || added ? { id } : undefined;
    });
    constructor(options: Record<string, unknown>) {
      this.options = options;
      MockMap.instances.push(this);
    }
    on(event: string, layerOrHandler: string | Handler, maybeHandler?: Handler): this {
      if (typeof layerOrHandler === "function") {
        const list = this.handlers.get(event) ?? [];
        list.push(layerOrHandler);
        this.handlers.set(event, list);
      } else if (maybeHandler) {
        this.layerClicks.push({ layer: layerOrHandler, handler: maybeHandler });
      }
      return this;
    }
    once(event: string, handler: Handler): this {
      const list = this.onceHandlers.get(event) ?? [];
      list.push(handler);
      this.onceHandlers.set(event, list);
      return this;
    }
    fire(event: string, payload: unknown = {}): void {
      for (const handler of this.handlers.get(event) ?? []) handler(payload);
      const once = this.onceHandlers.get(event) ?? [];
      this.onceHandlers.set(event, []);
      for (const handler of once) handler(payload);
    }
  }
  class MockMarker {
    static instances: MockMarker[] = [];
    element: HTMLElement;
    lngLats: Array<[number, number]> = [];
    setLngLat = vi.fn((lngLat: [number, number]) => {
      this.lngLats.push(lngLat);
      return this;
    });
    addTo = vi.fn((map: MockMap) => {
      // Real maplibre v6 re-parents the marker element into the canvas container.
      const container = map.options.container as HTMLElement | undefined;
      container?.appendChild(this.element);
      return this;
    });
    remove = vi.fn();
    constructor(options: { element: HTMLElement }) {
      this.element = options.element;
      MockMarker.instances.push(this);
    }
  }
  return { Map: MockMap, Marker: MockMarker };
});

import { GisNetworkView } from "./GisNetworkView";
import { GIS_CONFIG } from "./gis.config";
import { resolveCssColor } from "./gisAdapter";

interface MockMapInstance {
  options: Record<string, unknown>;
  layers: Array<Record<string, unknown>>;
  sources: Record<string, { data?: { features?: unknown[] } }>;
  setSourceData: Array<{ id: string; data: { features?: unknown[] } }>;
  renderedFeatures: unknown[];
  removeThrows: boolean;
  addSource: ReturnType<typeof vi.fn>;
  getSource: ReturnType<typeof vi.fn>;
  addLayer: ReturnType<typeof vi.fn>;
  queryRenderedFeatures: ReturnType<typeof vi.fn>;
  setFilter: ReturnType<typeof vi.fn>;
  setPaintProperty: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  layerClicks: Array<{ layer: string; handler: (event: unknown) => void }>;
  fire: (event: string, payload?: unknown) => void;
}

interface MockedMaplibre {
  Map: { instances: MockMapInstance[] };
  Marker: {
    instances: Array<{
      element: HTMLElement;
      lngLats: Array<[number, number]>;
      remove: ReturnType<typeof vi.fn>;
    }>;
  };
}

async function mocked(): Promise<MockedMaplibre> {
  return (await import("maplibre-gl")) as unknown as MockedMaplibre;
}

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
    rule: "longest",
    midpoint_wgs84: [101.1972997, 12.715989],
    placement: "SIMULATED",
    properties: { pipe_id: 4926 },
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
      properties: { pipe_id: 4926 },
      geometry: { type: "LineString", coordinates: [[101.19, 12.71], [101.2, 12.72]] },
    },
  ],
};

function renderView(overrides: Partial<Parameters<typeof GisNetworkView>[0]> = {}) {
  return render(
    <GisNetworkView
      manifest={MANIFEST}
      network={NETWORK}
      markerStatus="normal"
      highlightedPipeIds={[]}
      onSelectPipe={() => undefined}
      {...overrides}
    />,
  );
}

async function mountedMap(): Promise<MockMapInstance> {
  const lib = await mocked();
  await waitFor(() => expect(lib.Map.instances).toHaveLength(1));
  return lib.Map.instances[0];
}

afterEach(async () => {
  cleanup();
  const lib = await mocked();
  lib.Map.instances.length = 0;
  lib.Marker.instances.length = 0;
  document.documentElement.removeAttribute("data-theme");
});

describe("GisNetworkView", () => {
  it("creates one offline map (no external style/tiles) and fits the focus bounds", async () => {
    renderView();
    const map = await mountedMap();
    const style = map.options.style as { sources: object };
    // Offline demo: the style must carry NO external URLs — sources are empty and the
    // GeoJSON is added from already-fetched data.
    expect(JSON.stringify(map.options.style)).not.toMatch(/https?:\/\//);
    expect(style.sources).toEqual({});
    act(() => map.fire("load"));
    expect(map.addSource).toHaveBeenCalledWith("pipe-ry", {
      type: "geojson",
      data: NETWORK,
    });
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [101.180758, 12.6756819],
        [101.2100184, 12.7222887],
      ],
      expect.objectContaining({ padding: expect.any(Number), animate: false }),
    );
  });

  it("installs two VALID line layers over the one source — specs, not call counts", async () => {
    renderView();
    const map = await mountedMap();
    act(() => map.fire("load"));
    const pipeLayers = (
      map.layers as Array<{
        id: string;
        type: string;
        source: string;
        filter?: unknown;
        paint: Record<string, unknown>;
      }>
    ).filter((l) => l.id === "pipe-ry-line" || l.id === "pipe-ry-highlight");
    expect(pipeLayers).toHaveLength(2);
    const [base, highlight] = pipeLayers;
    for (const layer of [base, highlight]) {
      expect(layer.type).toBe("line");
      expect(layer.source).toBe("pipe-ry");
      // Only paint keys real maplibre accepts for a line layer — catches `line-colour`.
      expect(
        Object.keys(layer.paint).every((key) => ["line-color", "line-width"].includes(key)),
      ).toBe(true);
      // A POSITIVE width — a zero width would ingest every feature yet paint nothing, so
      // the source-ingestion proof (data-source-features) is not a visibility proof; this
      // is the paint guard against invisible linework (QCHECK round 1).
      expect(typeof layer.paint["line-width"]).toBe("number");
      expect(layer.paint["line-width"] as number).toBeGreaterThan(0);
    }
    expect(base.id).toBe("pipe-ry-line");
    expect(highlight.id).toBe("pipe-ry-highlight");
    // The highlight layer must start EMPTY — without this filter every pipe renders in
    // the critical style at rest, an honesty defect, not a style nit.
    expect(highlight.filter).toEqual(["in", ["get", "pipe_id"], ["literal", []]]);
  });

  it("does not report ready from load or source ingestion alone", async () => {
    renderView();
    const map = await mountedMap();
    const view = screen.getByTestId("gis-network-view");
    expect(view).toHaveAttribute("data-map-ready", "false");
    act(() => map.fire("load"));
    act(() => map.fire("sourcedata", { sourceId: "pipe-ry", isSourceLoaded: true }));
    expect(view).toHaveAttribute("data-map-ready", "false");
    expect(view).toHaveAttribute("data-rendered-features", "0");
    expect(map.layers.some((l) => l.id === "pipe-ry-line")).toBe(true);
  });

  it("reports ready only after all distinct base-layer pipes are query-rendered", async () => {
    renderView();
    const map = await mountedMap();
    const view = screen.getByTestId("gis-network-view");
    act(() => map.fire("load"));
    map.renderedFeatures = [...NETWORK.features];
    act(() => map.fire("render"));
    await waitFor(() => expect(view).toHaveAttribute("data-map-ready", "true"));
    expect(view).toHaveAttribute("data-rendered-features", "1");
    expect(map.queryRenderedFeatures).toHaveBeenCalledWith({ layers: ["pipe-ry-line"] });
  });

  it("publishes the DISTINCT source feature count once the source loads", async () => {
    renderView();
    const map = await mountedMap();
    const view = screen.getByTestId("gis-network-view");
    // Before the source loads there is no honest count to publish.
    expect(view).toHaveAttribute("data-source-features", "");
    act(() => map.fire("load"));
    act(() => map.fire("sourcedata", { sourceId: "pipe-ry", isSourceLoaded: true }));
    // NETWORK carries one feature (pipe_id 4926); the count is read from the source cache.
    await waitFor(() =>
      expect(view).toHaveAttribute("data-source-features", "1"),
    );
  });

  it("ignores sourcedata for other sources and before the source is loaded", async () => {
    renderView();
    const map = await mountedMap();
    const view = screen.getByTestId("gis-network-view");
    act(() => map.fire("load"));
    act(() => map.fire("sourcedata", { sourceId: "some-other-source", isSourceLoaded: true }));
    act(() => map.fire("sourcedata", { sourceId: "pipe-ry", isSourceLoaded: false }));
    expect(view).toHaveAttribute("data-source-features", "");
  });

  it("updates the highlight filter in place when the drop state changes", async () => {
    const view = renderView();
    const map = await mountedMap();
    act(() => map.fire("load"));
    view.rerender(
      <GisNetworkView
        manifest={MANIFEST}
        network={NETWORK}
        markerStatus="critical"
        highlightedPipeIds={[4926]}
        onSelectPipe={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(map.setFilter).toHaveBeenCalledWith("pipe-ry-highlight", [
        "in",
        ["get", "pipe_id"],
        ["literal", [4926]],
      ]),
    );
    // One Map for the whole lifecycle — a remount would flash and lose the camera.
    const lib = await mocked();
    expect(lib.Map.instances).toHaveLength(1);
    expect(screen.getByTestId("gis-network-view")).toHaveAttribute(
      "data-highlighted-pipes",
      "4926",
    );
  });

  it("places the SIMULATED marker at the manifest midpoint in [lng, lat] order", async () => {
    renderView({ markerStatus: "critical" });
    const lib = await mocked();
    await waitFor(() => expect(lib.Marker.instances).toHaveLength(1));
    // Exact coordinates, exact order: a [lat, lng] swap throws in real maplibre
    // ("Invalid LngLat latitude value") and would crash the whole view.
    expect(lib.Marker.instances[0].lngLats).toEqual([[101.1972997, 12.715989]]);
    const marker = screen.getByTestId("gis-device-marker");
    expect(marker).toHaveTextContent("P-2");
    expect(marker).toHaveAttribute("data-status", "critical");
    expect(marker).toHaveTextContent(/ตำแหน่งจำลอง/);
  });

  it("keeps the marker interactive after maplibre re-parents its element", async () => {
    const onSelectPipe = vi.fn();
    renderView({ onSelectPipe });
    const map = await mountedMap();
    // The mock's addTo mimics v6's re-parenting into the map container.
    const container = map.options.container as HTMLElement;
    const marker = screen.getByTestId("gis-device-marker");
    expect(container.contains(marker)).toBe(true);
    fireEvent.click(marker);
    expect(onSelectPipe).toHaveBeenCalledWith(4926);
  });

  it("wires a pipe click to onSelectPipe with the source pipe_id", async () => {
    const onSelectPipe = vi.fn();
    renderView({ onSelectPipe });
    const map = await mountedMap();
    act(() => map.fire("load"));
    const click = map.layerClicks.find((c) => c.layer === "pipe-ry-line");
    expect(click).toBeDefined();
    click?.handler({ features: [{ properties: { pipe_id: 4926 } }] });
    expect(onSelectPipe).toHaveBeenCalledWith(4926);
  });

  // ── PR-J: the SIMULATED low-pressure footprint layer (R13/R22) ──────────────────────
  const ZONE: ImpactZoneCollection = {
    type: "FeatureCollection",
    scenario_id: "mtp-low-pressure-200-v1",
    zone_id: "MTP-LPZ-01",
    provenance: "SIMULATED_LOW_PRESSURE_FOOTPRINT",
    simulated: true,
    features: [
      {
        type: "Feature",
        properties: { zone_id: "MTP-LPZ-01", label: "พื้นที่แรงดันต่ำจำลอง", simulated: true },
        geometry: {
          type: "Polygon",
          coordinates: [[[101.135, 12.665], [101.175, 12.665], [101.175, 12.7], [101.135, 12.7], [101.135, 12.665]]],
        },
      },
    ],
  };

  it("T6b: creates the footprint source EMPTY at load, so a LATER zone still has a source", async () => {
    const view = renderView({ impactZone: null });
    const map = await mountedMap();
    act(() => map.fire("load"));
    // Source exists at load with no features — the zone arrived AFTER mount (judge triggers the
    // drop while already on the GIS view).
    expect(map.addSource).toHaveBeenCalledWith("mtp-lpz", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    view.rerender(
      <GisNetworkView
        manifest={MANIFEST}
        network={NETWORK}
        markerStatus="critical"
        highlightedPipeIds={[]}
        onSelectPipe={() => undefined}
        impactZone={ZONE}
        onOpenImpact={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(map.setSourceData.some((s) => s.id === "mtp-lpz" && (s.data.features?.length ?? 0) === 1)).toBe(true),
    );
  });

  it("T6-recovery: a null zone clears the footprint (empty features) in place", async () => {
    const view = renderView({ impactZone: ZONE });
    const map = await mountedMap();
    act(() => map.fire("load"));
    view.rerender(
      <GisNetworkView
        manifest={MANIFEST}
        network={NETWORK}
        markerStatus="normal"
        highlightedPipeIds={[]}
        onSelectPipe={() => undefined}
        impactZone={null}
        onOpenImpact={() => undefined}
      />,
    );
    await waitFor(() => {
      const last = map.setSourceData.filter((s) => s.id === "mtp-lpz").at(-1);
      expect(last?.data.features).toEqual([]);
    });
  });

  it("T6a: clicking the footprint fill layer opens the drawer (onOpenImpact)", async () => {
    const onOpenImpact = vi.fn();
    renderView({ impactZone: ZONE, onOpenImpact });
    const map = await mountedMap();
    act(() => map.fire("load"));
    const click = map.layerClicks.find((c) => c.layer === "mtp-lpz-fill");
    expect(click).toBeDefined();
    click?.handler({});
    expect(onOpenImpact).toHaveBeenCalledTimes(1);
  });

  it("R19: a click on a HIGHLIGHTED pipe opens the drawer; a non-highlighted pipe shows details", async () => {
    const onOpenImpact = vi.fn();
    const onSelectPipe = vi.fn();
    renderView({ highlightedPipeIds: [4926], onOpenImpact, onSelectPipe });
    const map = await mountedMap();
    act(() => map.fire("load"));
    const lineClick = map.layerClicks.find((c) => c.layer === "pipe-ry-line");
    expect(lineClick).toBeDefined();
    // A highlighted pipe → the drawer, NOT the details.
    lineClick?.handler({ features: [{ properties: { pipe_id: 4926 } }] });
    expect(onOpenImpact).toHaveBeenCalledTimes(1);
    expect(onSelectPipe).not.toHaveBeenCalled();
    // A different, non-highlighted pipe → details, NOT the drawer.
    lineClick?.handler({ features: [{ properties: { pipe_id: 111 } }] });
    expect(onSelectPipe).toHaveBeenCalledWith(111);
    expect(onOpenImpact).toHaveBeenCalledTimes(1); // unchanged
  });

  it("R19b: the device MARKER always shows pipe details, even while its bound pipe is highlighted", async () => {
    const onOpenImpact = vi.fn();
    const onSelectPipe = vi.fn();
    renderView({ highlightedPipeIds: [4926], onOpenImpact, onSelectPipe }); // 4926 is the bound pipe
    await mountedMap();
    // The marker (its bound pipe IS highlighted during a drop) must NOT open the drawer — its
    // PR-H "show REAL attributes" behaviour stays intact during an incident (QCHECK round 3 HIGH).
    fireEvent.click(screen.getByTestId("gis-device-marker"));
    expect(onSelectPipe).toHaveBeenCalledWith(4926);
    expect(onOpenImpact).not.toHaveBeenCalled();
  });

  it("R19c: the marker click STOPS propagating, so it cannot reach maplibre's canvas listener", async () => {
    // QCHECK round 4 HIGH: maplibre places the marker inside the canvas container, whose native
    // click listener would otherwise receive the bubbled marker click and hit-test it against the
    // zone/line layers → open the drawer. The native markerEl listener stopPropagation guards it.
    const onSelectPipe = vi.fn();
    renderView({ highlightedPipeIds: [4926], onSelectPipe });
    await mountedMap();
    const marker = screen.getByTestId("gis-device-marker");
    const container = marker.closest('[role="application"]');
    expect(container).not.toBeNull();
    const ancestorHeard = vi.fn();
    container!.addEventListener("click", ancestorHeard);
    fireEvent.click(marker);
    expect(onSelectPipe).toHaveBeenCalledWith(4926); // details still ran
    expect(ancestorHeard).not.toHaveBeenCalled(); // …but the click did NOT bubble past markerEl
    container!.removeEventListener("click", ancestorHeard);
  });

  it("T6d: the footprint is a valid dashed-outline + translucent fill, token-coloured (no hex)", async () => {
    renderView({ impactZone: ZONE, onOpenImpact: () => undefined });
    const map = await mountedMap();
    act(() => map.fire("load"));
    const fill = map.layers.find((l) => l.id === "mtp-lpz-fill") as { type: string; source: string; paint: Record<string, unknown> };
    const outline = map.layers.find((l) => l.id === "mtp-lpz-outline") as { type: string; source: string; paint: Record<string, unknown> };
    expect(fill.type).toBe("fill");
    expect(outline.type).toBe("line");
    expect(fill.source).toBe("mtp-lpz");
    expect(outline.source).toBe("mtp-lpz");
    // Valid maplibre paint keys only (catches `fill-colour`/typos).
    expect(Object.keys(fill.paint).every((k) => ["fill-color", "fill-opacity"].includes(k))).toBe(true);
    expect(Object.keys(outline.paint).every((k) => ["line-color", "line-width", "line-dasharray"].includes(k))).toBe(true);
    // Non-colour encoding present: a dashed outline + a translucent fill.
    expect(outline.paint["line-dasharray"]).toEqual([2, 2]);
    expect(fill.paint["fill-opacity"]).toBeGreaterThan(0);
    expect(fill.paint["fill-opacity"]).toBeLessThan(1);
    // Colour is TOKEN-resolved, never a hex literal: the paint value must equal
    // resolveCssColor(zone token). A hardcoded hex would differ from the token's resolved value.
    const expected = resolveCssColor(GIS_CONFIG.colorTokens.zone);
    if (expected != null) {
      expect(fill.paint["fill-color"]).toBe(expected);
      expect(outline.paint["line-color"]).toBe(expected);
    } else {
      expect("fill-color" in fill.paint).toBe(false);
      expect("line-color" in outline.paint).toBe(false);
    }
  });

  it("surfaces a pre-load map error as an explicit failed state, never a blank box", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      renderView();
      const map = await mountedMap();
      act(() => map.fire("error"));
      await waitFor(() =>
        expect(screen.getByTestId("gis-map-failed")).toHaveTextContent(/ไม่สามารถแสดงผล/),
      );
      expect(screen.getByTestId("gis-network-view")).toHaveAttribute(
        "data-map-ready",
        "false",
      );
      expect(warning).toHaveBeenCalledWith("pipe-GIS map error: unknown");
    } finally {
      warning.mockRestore();
    }
  });

  it("revokes readiness and fails explicitly on a post-load map error", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      renderView();
      const map = await mountedMap();
      const view = screen.getByTestId("gis-network-view");
      act(() => map.fire("load"));
      map.renderedFeatures = [...NETWORK.features];
      act(() => map.fire("render"));
      await waitFor(() => expect(view).toHaveAttribute("data-map-ready", "true"));
      act(() => map.fire("error", { error: new Error("WebGL context lost") }));
      await waitFor(() => expect(screen.getByTestId("gis-map-failed")).toBeVisible());
      expect(view).toHaveAttribute("data-map-ready", "false");
      expect(warning).toHaveBeenCalledWith("pipe-GIS map error: WebGL context lost");
    } finally {
      warning.mockRestore();
    }
  });

  it("survives a throwing map.remove() on unmount — a broken map must not take the screen down", async () => {
    const view = renderView();
    const map = await mountedMap();
    map.removeThrows = true; // half-initialized maplibre throws from remove()
    expect(() => view.unmount()).not.toThrow();
    expect(map.remove).toHaveBeenCalledTimes(1);
  });

  /** jsdom cannot rasterize, so token resolution (computed colour → 1×1 canvas pixel)
   *  needs a stubbed 2D context for the repaint path to produce a colour at all. */
  function stubCanvasColor(): void {
    const context = {
      fillStyle: "",
      fillRect: () => undefined,
      getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
  }

  it("repaints from the SAME tokens when data-theme flips after load", async () => {
    stubCanvasColor();
    try {
      renderView();
      const map = await mountedMap();
      act(() => map.fire("load"));
      map.setPaintProperty.mockClear();
      act(() => {
        document.documentElement.setAttribute("data-theme", "dark");
      });
      await waitFor(() => {
        const painted = map.setPaintProperty.mock.calls.map((call) => call[0]);
        expect(painted).toContain("pipe-ry-line");
        expect(painted).toContain("pipe-ry-highlight");
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("repaints on an OS scheme flip even when no data-theme attribute exists", async () => {
    stubCanvasColor();
    let flip: (() => void) | null = null;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: (_event: string, handler: () => void) => {
          flip = handler;
        },
        removeEventListener: vi.fn(),
      })),
    );
    try {
      renderView();
      const map = await mountedMap();
      act(() => map.fire("load"));
      map.setPaintProperty.mockClear();
      expect(flip).not.toBeNull();
      act(() => flip?.());
      const painted = map.setPaintProperty.mock.calls.map((call) => call[0]);
      expect(painted).toContain("pipe-ry-line");
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it("removes the map and the marker on unmount", async () => {
    const view = renderView();
    const map = await mountedMap();
    const lib = await mocked();
    view.unmount();
    expect(map.remove).toHaveBeenCalledTimes(1);
    expect(lib.Marker.instances[0].remove).toHaveBeenCalledTimes(1);
  });
});
