/**
 * Pure-logic tests for the twin (DREP-PR7c FN1–FN3, FN5). No DOM, no socket.
 * Authored by Claude; the implementer must not modify this file (DREP §10).
 */
import { describe, expect, it } from "vitest";

import { formatDecimal, DASH } from "@/lib/format";

import type { BandsResponse, DeviceLiveState, TwinEventFrame, TwinTopology } from "./types";
import {
  deriveStatus,
  isNewer,
  isPressureDrop,
  outgoingPipes,
  zoomViewBox,
} from "./twinClient";

const BANDS: BandsResponse = {
  bands: { pressure_bar: { low: 2, high: 6 }, flow_m3h: { low: 50, high: 400 } },
  simulated: true,
};

function live(
  perSignal: Record<string, { status: "normal" | "warning" | "critical" | "nodata" }>,
  health?: "normal" | "warning" | "critical",
): DeviceLiveState {
  return {
    perSignal: Object.fromEntries(
      Object.entries(perSignal).map(([k, v]) => [k, { status: v.status, value: 0, observed_at: null }]),
    ),
    health: health ? { status: health, value: null, observed_at: null } : null,
  };
}

describe("deriveStatus — max severity across per-signal + health", () => {
  it("returns nodata (not normal) when nothing is known", () => {
    expect(deriveStatus(live({}))).toBe("nodata");
  });

  it("a pressure warning is not cleared by a flow normal (different signal)", () => {
    expect(deriveStatus(live({ pressure_bar: { status: "warning" }, flow_m3h: { status: "normal" } }))).toBe(
      "warning",
    );
  });

  it("health critical wins over per-signal normals", () => {
    expect(deriveStatus(live({ flow_m3h: { status: "normal" } }, "critical"))).toBe("critical");
  });

  it("takes the worst of everything", () => {
    expect(
      deriveStatus(live({ pressure_bar: { status: "warning" }, power_kw: { status: "critical" } }, "normal")),
    ).toBe("critical");
  });
});

describe("isPressureDrop — a drop, not a spike", () => {
  const drop: TwinEventFrame = { kind: "status", signal: "pressure_bar", status: "warning", value: 1.0 };
  const spike: TwinEventFrame = { kind: "status", signal: "pressure_bar", status: "warning", value: 9.0 };

  it("is true for a below-band pressure warning", () => {
    expect(isPressureDrop(drop, BANDS)).toBe(true);
  });

  it("is FALSE for an above-band spike — a spike loses no customers water", () => {
    expect(isPressureDrop(spike, BANDS)).toBe(false);
  });

  it("is false without bands (retain and re-derive later, never crash)", () => {
    expect(isPressureDrop(drop, null)).toBe(false);
  });

  it("is false for a normal or nodata pressure frame", () => {
    expect(isPressureDrop({ ...drop, status: "normal" }, BANDS)).toBe(false);
    expect(isPressureDrop({ ...drop, status: "nodata" }, BANDS)).toBe(false);
  });

  it("is false for a non-pressure signal or a non-status kind", () => {
    expect(isPressureDrop({ ...drop, signal: "flow_m3h" }, BANDS)).toBe(false);
    expect(isPressureDrop({ ...drop, kind: "health" }, BANDS)).toBe(false);
  });

  it("is false for a missing or non-finite value", () => {
    expect(isPressureDrop({ ...drop, value: null }, BANDS)).toBe(false);
    expect(isPressureDrop({ ...drop, value: Number.NaN }, BANDS)).toBe(false);
  });
});

describe("outgoingPipes", () => {
  const topo: TwinTopology = {
    nodes: [],
    pipes: [
      { pipe_id: "A", from_node: "n1", to_node: "n2", dma: null, x1: 0, y1: 0, x2: 1, y2: 1 },
      { pipe_id: "B", from_node: "n1", to_node: "n3", dma: null, x1: 0, y1: 0, x2: 2, y2: 2 },
      { pipe_id: "C", from_node: "n2", to_node: "n4", dma: null, x1: 1, y1: 1, x2: 3, y2: 3 },
    ],
    devices: [],
    simulated: true,
  };

  it("returns every pipe leaving a branching node", () => {
    expect(outgoingPipes("n1", topo).map((p) => p.pipe_id)).toEqual(["A", "B"]);
  });

  it("returns empty for a leaf node", () => {
    expect(outgoingPipes("n4", topo)).toEqual([]);
  });
});

describe("zoomViewBox — resolution-independent, centre-invariant", () => {
  const base = { x: 0, y: 0, width: 1000, height: 400 };

  it("zoom in shrinks the viewBox about the centre", () => {
    const zoomed = zoomViewBox(base, base, 0.8, 0.25, 4);
    expect(zoomed.width).toBeCloseTo(800);
    expect(zoomed.height).toBeCloseTo(320);
    // centre unchanged: (0+1000/2, 0+400/2) == (zx+zw/2, zy+zh/2)
    expect(zoomed.x + zoomed.width / 2).toBeCloseTo(500);
    expect(zoomed.y + zoomed.height / 2).toBeCloseTo(200);
  });

  it("clamps to the min/max scale relative to base", () => {
    let vb = base;
    for (let i = 0; i < 20; i += 1) vb = zoomViewBox(base, vb, 0.8, 0.25, 4); // zoom in hard
    expect(vb.width).toBeCloseTo(1000 * 0.25); // clamped at minScale
    let out = base;
    for (let i = 0; i < 20; i += 1) out = zoomViewBox(base, out, 1.25, 0.25, 4); // zoom out hard
    expect(out.width).toBeCloseTo(1000 * 4); // clamped at maxScale
  });

  it("rejects a non-positive or non-finite factor", () => {
    expect(() => zoomViewBox(base, base, 0, 0.25, 4)).toThrow(RangeError);
    expect(() => zoomViewBox(base, base, -1, 0.25, 4)).toThrow(RangeError);
    expect(() => zoomViewBox(base, base, Number.NaN, 0.25, 4)).toThrow(RangeError);
  });
});

describe("isNewer — observed_at ordering", () => {
  it("a strictly-later timestamp is newer", () => {
    expect(isNewer("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z")).toBe(true);
  });
  it("an earlier timestamp is not newer", () => {
    expect(isNewer("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")).toBe(false);
  });
  it("a null timestamp on either side is treated as current", () => {
    expect(isNewer(null, "2026-01-01T00:00:00Z")).toBe(true);
    expect(isNewer("2026-01-01T00:00:00Z", null)).toBe(true);
  });
});

describe("formatDecimal — SEC needs decimals Num cannot render", () => {
  it("keeps a real 0.25 as a decimal, not 0", () => {
    expect(formatDecimal(0.253, 3)).toBe("0.253");
    expect(formatDecimal(0.253, 3)).not.toBe("0");
  });
  it("renders a measured zero, distinct from missing", () => {
    expect(formatDecimal(0, 2)).toBe("0.00");
    expect(formatDecimal(null)).toBe(DASH);
    expect(formatDecimal(Number.NaN)).toBe(DASH);
  });
  it("rejects out-of-range digits", () => {
    expect(() => formatDecimal(1, 9)).toThrow(RangeError);
  });
});
