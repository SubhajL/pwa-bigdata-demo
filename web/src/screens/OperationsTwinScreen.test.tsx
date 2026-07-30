/**
 * OperationsTwinScreen integration (DREP-PR7c R3,R5,R7,R8,R9,R10,R11,R12).
 *
 * fetch and WebSocket are stubbed so the reducer, the topology-baseline merge, the drop→impact
 * flow and the states are exercised end-to-end IN THE COMPONENT — jsdom cannot render the SVG
 * visually or run a real socket, which is PR-17's Playwright pass (stated in each file).
 *
 * Authored by Claude; the implementer must not modify this file (DREP §10).
 */
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";

import type { BandsResponse, ImpactResponse, SecResponse, TwinTopology } from "@/features/twin/types";

import { OperationsTwinScreen } from "./OperationsTwinScreen";

// ── stubs ─────────────────────────────────────────────────────────────────────────────
const TOPOLOGY: TwinTopology = {
  nodes: [
    { node: "P-2", x: 240, y: 200 },
    { node: "tank", x: 440, y: 200 },
    { node: "n1", x: 800, y: 130 },
  ],
  pipes: [
    { pipe_id: "PIPE-P2-TANK", from_node: "P-2", to_node: "tank", dma: "DMA-03", x1: 240, y1: 200, x2: 440, y2: 200 },
    { pipe_id: "PIPE-TANK-N1", from_node: "tank", to_node: "n1", dma: "DMA-03", x1: 440, y1: 200, x2: 800, y2: 130 },
  ],
  devices: [
    { asset_id: "P-2", kind: "pump", node: "P-2", x: 240, y: 200, dma: "DMA-03", status: "critical", simulated: true },
    { asset_id: "V-9", kind: "valve", node: "tank", x: 440, y: 200, dma: "DMA-03", status: "normal", simulated: true },
  ],
  simulated: true,
};
const BANDS: BandsResponse = { bands: { pressure_bar: { low: 2, high: 6 } }, simulated: true };
const SEC: SecResponse = {
  asset_id: "P-2", sec_kwh_per_m3: 0.253, power_kw: 30, flow_m3h: 118.6,
  power_observed_at: null, flow_observed_at: null, skew_s: 5, simulated: true, detail: null,
};
const IMPACT: ImpactResponse = {
  pipe_id: "PIPE-P2-TANK",
  affected_pipe_ids: ["PIPE-P2-TANK", "PIPE-TANK-N1"],
  customers: [
    { customer_id: "72-1-00001", node: "n1", area: "ต.ท่าจีน", branch: "สมุทรสาคร" },
    { customer_id: "72-1-00003", node: "n1", area: "ต.ท่าจีน", branch: "สมุทรสาคร" },
  ],
  count: 2,
  simulated: true,
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

function stubFetch(overrides: { sec?: SecResponse; impact?: ImpactResponse; emptyTopo?: boolean; failTopo?: boolean } = {}): void {
  vi.stubGlobal("fetch", (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    const json = (body: unknown): Promise<Response> =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
    if (url.includes("/api/twin/topology")) {
      if (overrides.failTopo) return Promise.resolve(new Response("nope", { status: 503 }));
      return json(overrides.emptyTopo ? { ...TOPOLOGY, devices: [], pipes: [], nodes: [] } : TOPOLOGY);
    }
    if (url.includes("/api/twin/bands")) return json(BANDS);
    if (url.includes("/api/twin/sec/")) return json(overrides.sec ?? SEC);
    if (url.includes("/api/twin/impact/")) return json(overrides.impact ?? IMPACT);
    return Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
  });
}

beforeEach(() => {
  sockets = [];
  vi.stubGlobal("WebSocket", FakeSocket as unknown as typeof WebSocket);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** In production the screen renders inside AppShell's `<main>`; the test provides that landmark
 *  so axe's page-level `region` rule (an AppShell concern, covered by PR-6) is not spuriously
 *  tripped by rendering the screen in isolation. */
function Harness(): JSX.Element {
  return (
    <main>
      <OperationsTwinScreen />
    </main>
  );
}

async function mountLoaded() {
  const utils = render(<Harness />);
  await screen.findByTestId("twin-schematic"); // topology+bands resolved
  return utils;
}

describe("R11 — loading / empty / error states", () => {
  it("shows a skeleton before data, then the schematic", async () => {
    stubFetch();
    render(<Harness />);
    expect(document.querySelector('[aria-hidden="true"]')).toBeTruthy(); // skeleton
    await screen.findByTestId("twin-schematic");
  });

  it("shows a 3-part error alert when topology fails", async () => {
    stubFetch({ failTopo: true });
    render(<Harness />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/ไม่สามารถโหลด/);
  });

  it("shows an empty message when there are no devices", async () => {
    stubFetch({ emptyTopo: true });
    render(<Harness />);
    expect(await screen.findByText(/ไม่มีอุปกรณ์/)).toBeInTheDocument();
  });
});

describe("R3/R5 — a live frame updates a device with no refetch; per-signal + baseline merge", () => {
  it("the topology-critical pump is not cleared by a first flow:normal frame", async () => {
    stubFetch();
    await mountLoaded();
    act(() => sockets[0].open());
    // P-2 loaded critical (persisted health baseline). A flow normal must NOT clear it.
    act(() => sockets[0].send({ kind: "status", asset_id: "P-2", status: "normal", signal: "flow_m3h", value: 100 }));
    await waitFor(() => {
      expect(document.querySelector('[data-asset="P-2"]')!.getAttribute("data-status")).toBe("critical");
    });
  });

  it("a live health:normal recovery supersedes the topology-critical baseline", async () => {
    stubFetch();
    await mountLoaded();
    act(() => sockets[0].open());
    act(() => sockets[0].send({ kind: "health", asset_id: "P-2", status: "normal" }));
    await waitFor(() => {
      expect(document.querySelector('[data-asset="P-2"]')!.getAttribute("data-status")).toBe("normal");
    });
  });
});

describe("R8 — pressure DROP highlights the pipe and lists customers; a spike does not", () => {
  it("a below-band pressure frame fetches impact and highlights the outgoing pipe", async () => {
    stubFetch();
    await mountLoaded();
    act(() => sockets[0].open());
    act(() => sockets[0].send({ kind: "status", asset_id: "P-2", status: "warning", signal: "pressure_bar", value: 1.0 }));
    // The affected customer count is the API's (2), never the mockup's 1,204.
    expect(await screen.findByText("72-1-00001")).toBeInTheDocument();
    expect(screen.queryByText(/1,?204/)).toBeNull();
    await waitFor(() => {
      expect(document.querySelector('[data-pipe="PIPE-P2-TANK"]')!.getAttribute("data-affected")).toBe("true");
    });
  });

  it("an above-band spike does NOT list affected customers", async () => {
    stubFetch();
    await mountLoaded();
    act(() => sockets[0].open());
    act(() => sockets[0].send({ kind: "status", asset_id: "P-2", status: "warning", signal: "pressure_bar", value: 9.0 }));
    // No drop → the panel stays in its "no pressure event" state.
    await waitFor(() => expect(screen.getByText(/ไม่มีเหตุแรงดันตก/)).toBeInTheDocument());
  });
});

describe("R8 — the MOST RECENT drop is active, not topology order (HIGH-3)", () => {
  it("A drops, then V-9 (later) drops → V-9's pipe is highlighted", async () => {
    // Pipe-SPECIFIC impact so the test discriminates WHICH asset is active: each pipe reports
    // only itself affected. If P-2 (first in topology) were wrongly active, PIPE-P2-TANK would
    // be highlighted and PIPE-TANK-N1 would not.
    vi.stubGlobal("fetch", (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      const json = (b: unknown): Promise<Response> =>
        Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } }));
      if (url.includes("/api/twin/topology")) return json(TOPOLOGY);
      if (url.includes("/api/twin/bands")) return json(BANDS);
      if (url.includes("/api/twin/impact/")) {
        const id = decodeURIComponent(url.split("/api/twin/impact/")[1]);
        return json({ pipe_id: id, affected_pipe_ids: [id], customers: [], count: 0, simulated: true });
      }
      return json({});
    });
    await mountLoaded();
    act(() => sockets[0].open());
    // P-2 drops first (earlier observed_at)...
    act(() => sockets[0].send({ kind: "status", asset_id: "P-2", status: "warning", signal: "pressure_bar", value: 1.0, observed_at: "2026-01-01T00:00:00Z" }));
    // ...then V-9 drops LATER (its outgoing pipe is PIPE-TANK-N1).
    act(() => sockets[0].send({ kind: "status", asset_id: "V-9", status: "warning", signal: "pressure_bar", value: 1.0, observed_at: "2026-01-01T00:05:00Z" }));
    await waitFor(() => {
      expect(document.querySelector('[data-pipe="PIPE-TANK-N1"]')!.getAttribute("data-affected")).toBe("true");
    });
  });
});

describe("R7 — selecting a pump shows its SEC; null renders an em dash", () => {
  it("shows kWh/m³ from the API on selection", async () => {
    stubFetch();
    await mountLoaded();
    act(() => document.querySelector('[data-asset="P-2"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(await screen.findByText(/kWh\/m³/)).toBeInTheDocument();
    expect(screen.getByText("0.253")).toBeInTheDocument();
  });

  it("renders an em dash (not 0) when SEC is null", async () => {
    stubFetch({ sec: { ...SEC, sec_kwh_per_m3: null, detail: "readings are stale" } });
    await mountLoaded();
    act(() => document.querySelector('[data-asset="P-2"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(await screen.findByText("—")).toBeInTheDocument();
    expect(screen.getByText(/readings are stale/)).toBeInTheDocument();
  });
});

describe("R9 — structure: config file + ≥3 components", () => {
  it("the config and the components exist and are imported by the screen", async () => {
    // Structural: the screen module imports the config and the twin components. A dead-file
    // structure cannot render the schematic, which mountLoaded() requires.
    const config = await import("@/features/twin/twin.config");
    expect(config.TWIN_CONFIG.wsPath).toBeTruthy();
    for (const mod of ["ProcessSchematic", "DeviceSymbol", "ImpactPanel", "SecTooltip"]) {
      const m = await import(`@/features/twin/${mod}`);
      expect(m[mod]).toBeTypeOf("function");
    }
    stubFetch();
    await mountLoaded();
  });
});

describe("R10 — honesty markers on synthetic values", () => {
  it("marks the SEC, the counters and the impact panel as SIMULATED", async () => {
    stubFetch();
    await mountLoaded();
    act(() => sockets[0].open());
    act(() => document.querySelector('[data-asset="P-2"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await screen.findByText(/kWh\/m³/);
    const badges = screen.getAllByLabelText("ข้อมูลจำลอง ไม่ใช่ข้อมูลจริงของ กปภ.");
    // counters + SEC + impact panel + footer -> several markers on synthetic surfaces.
    expect(badges.length).toBeGreaterThanOrEqual(3);
  });
});

describe("R12 — accessibility of the loaded twin", () => {
  it("axe finds no violations on the loaded schematic; the SVG has an accessible name", async () => {
    stubFetch();
    await mountLoaded();
    const svg = screen.getByTestId("twin-schematic");
    expect(svg.getAttribute("aria-label")).toBeTruthy();
    const results = await axe.run(document.body, {
      resultTypes: ["violations"],
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  it("each device has an accessible name carrying its status word", async () => {
    stubFetch();
    await mountLoaded();
    const p2 = within(screen.getByTestId("twin-schematic")).getByRole("button", { name: /P-2/ });
    expect(p2.getAttribute("aria-label")).toMatch(/สถานะ/);
  });
});
