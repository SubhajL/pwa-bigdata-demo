/**
 * ProcessSchematic / DeviceSymbol / PipeEdge (DREP-PR7c R1, R2, R6). Pure SVG, no I/O.
 *
 * jsdom cannot prove visual sharpness or clipping — those are PR-17's Playwright. What this
 * proves: the schematic is inline vector (not raster), zoom changes ONLY the viewBox about the
 * centre, geometry is data-driven (two fixtures → two DOMs), and status changes the SYMBOL.
 *
 * Authored by Claude; the implementer must not modify this file (DREP §10).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { StatusKind } from "@/components/StatusChip";

import { ProcessSchematic } from "./ProcessSchematic";
import type { TwinTopology } from "./types";

afterEach(cleanup);

function topo(over: Partial<TwinTopology> = {}): TwinTopology {
  return {
    nodes: [
      { node: "a", x: 60, y: 200 },
      { node: "b", x: 440, y: 200 },
    ],
    pipes: [{ pipe_id: "P", from_node: "a", to_node: "b", dma: "DMA-03", x1: 60, y1: 200, x2: 440, y2: 200 }],
    devices: [
      { asset_id: "P-2", kind: "pump", node: "a", x: 60, y: 200, dma: null, status: "normal", simulated: true },
    ],
    simulated: true,
    ...over,
  };
}

function renderSchematic(t: TwinTopology, statusOf: (a: string) => StatusKind = () => "normal") {
  return render(
    <ProcessSchematic
      topology={t}
      statusOf={statusOf}
      affectedPipeIds={new Set()}
      selected={null}
      onSelect={() => {}}
    />,
  );
}

describe("R1 — vector SVG with viewBox zoom", () => {
  it("renders an inline <svg> with a viewBox and no raster image", () => {
    const { container } = renderSchematic(topo());
    const svg = screen.getByTestId("twin-schematic");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("viewBox")).toBe("0 0 1000 400");
    expect(container.querySelector("image")).toBeNull(); // no SVG <image> raster
    expect(container.querySelector("img")).toBeNull();
  });

  it("zoom-in shrinks the viewBox about the centre; width/height attrs unchanged", () => {
    renderSchematic(topo());
    const svg = screen.getByTestId("twin-schematic");
    const before = svg.getAttribute("width");
    fireEvent.click(screen.getByRole("button", { name: "ขยายเข้า" }));
    const [x, y, w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    expect(w).toBeCloseTo(800); // 1000 * 0.8
    expect(h).toBeCloseTo(320);
    expect(x + w / 2).toBeCloseTo(500); // centre invariant
    expect(y + h / 2).toBeCloseTo(200);
    expect(svg.getAttribute("width")).toBe(before); // the element size never changes
  });

  it("reset restores the base viewBox", () => {
    renderSchematic(topo());
    fireEvent.click(screen.getByRole("button", { name: "ขยายเข้า" }));
    fireEvent.click(screen.getByRole("button", { name: "รีเซ็ตมุมมอง" }));
    expect(screen.getByTestId("twin-schematic").getAttribute("viewBox")).toBe("0 0 1000 400");
  });
});

describe("R2 — geometry is data-driven, not hardcoded", () => {
  it("two different topologies produce two different DOMs at the data's coordinates", () => {
    const a = topo();
    const { unmount } = renderSchematic(a);
    // The device symbol sits at the fixture's coordinates.
    let circle = document.querySelector('[data-asset="P-2"] [data-symbol]');
    expect(circle?.getAttribute("cx")).toBe("60");
    unmount();

    const b = topo({
      devices: [
        { asset_id: "X-9", kind: "valve", node: "b", x: 777, y: 123, dma: null, status: "normal", simulated: true },
      ],
    });
    renderSchematic(b);
    expect(document.querySelector('[data-asset="P-2"]')).toBeNull(); // no baked-in P-2
    circle = document.querySelector('[data-asset="X-9"] [data-symbol]');
    expect(circle?.getAttribute("cx")).toBe("777");
  });

  it("draws each pipe at its own endpoints", () => {
    renderSchematic(
      topo({
        pipes: [{ pipe_id: "Q", from_node: "a", to_node: "b", dma: null, x1: 10, y1: 20, x2: 30, y2: 40 }],
      }),
    );
    const line = document.querySelector('[data-pipe="Q"]');
    expect(line?.getAttribute("x1")).toBe("10");
    expect(line?.getAttribute("y2")).toBe("40");
  });
});

describe("R6 — status changes the symbol, not only the colour", () => {
  it("each status renders a pairwise-distinct symbol shape with a Thai-labelled name", () => {
    const kinds: StatusKind[] = ["normal", "warning", "critical", "nodata"];
    const symbols = new Set<string>();
    const labels = new Set<string>();
    for (const kind of kinds) {
      const t = topo({
        devices: [
          { asset_id: "D", kind: "pump", node: "a", x: 60, y: 200, dma: null, status: kind, simulated: true },
        ],
      });
      const { unmount } = renderSchematic(t, () => kind);
      const g = document.querySelector('[data-asset="D"]')!;
      symbols.add(g.querySelector("[data-symbol]")!.getAttribute("data-symbol")!);
      const name = g.getAttribute("aria-label") ?? "";
      labels.add(name);
      expect(name).toContain("สถานะ"); // carries the Thai status word
      expect(g.getAttribute("data-status")).toBe(kind);
      unmount();
    }
    // All FOUR statuses render a distinct shape (circle/square/diamond/ring), so a device's
    // state reads without colour — and four distinct accessible names.
    expect(symbols.size).toBe(4);
    expect(labels.size).toBe(4);
  });
});
