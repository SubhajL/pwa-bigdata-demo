/**
 * PR-D4 (Path D) — the Regional S2 sub-panels. Both are SIMULATED (per-branch NRW is simulated; the
 * Step-Test log is illustrative), so each must be badged. The NRW chart ranks branches; the Step-Test
 * card encodes leak/no-leak with an icon + label (not colour alone).
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SIMULATED_ARIA_LABEL } from "@/components/SimulatedBadge";

import { RegionBranchNrwChart, RegionStepTestCard } from "./RegionDetailPanels";
import type { BranchBar } from "./types";

function bar(o: Partial<BranchBar>): BranchBar {
  return {
    rank: 1,
    branchCode: "c1",
    branch: "A",
    province: "P",
    waterSoldM3: 100,
    momPct: 1,
    yoyPct: 1,
    widthPct: 100,
    nrwPct: 20,
    status: "normal",
    ...o,
  };
}

const BARS: readonly BranchBar[] = [
  bar({ branchCode: "a", branch: "Alpha", nrwPct: 38 }),
  bar({ branchCode: "b", branch: "Beta", nrwPct: 22 }),
];

afterEach(cleanup);

describe("RegionBranchNrwChart (SIMULATED)", () => {
  it("shows the branches and is badged SIMULATED", () => {
    render(<RegionBranchNrwChart bars={BARS} />);
    const card = screen.getByTestId("region-nrw-chart");
    expect(card).toHaveTextContent("Alpha");
    expect(card).toHaveTextContent("38.0%");
    expect(within(card).getByLabelText(SIMULATED_ARIA_LABEL)).toBeInTheDocument();
  });

  it("shows an empty state for no branches", () => {
    render(<RegionBranchNrwChart bars={[]} />);
    expect(screen.getByTestId("region-nrw-chart")).toHaveTextContent("ไม่มีข้อมูล");
  });
});

describe("RegionStepTestCard (SIMULATED)", () => {
  it("lists step-test history and is badged SIMULATED", () => {
    render(<RegionStepTestCard />);
    const card = screen.getByTestId("region-steptest");
    expect(card).toHaveTextContent("DMA-03");
    expect(card).toHaveTextContent("Step Test");
    expect(within(card).getByLabelText(SIMULATED_ARIA_LABEL)).toBeInTheDocument();
  });

  it("distinguishes leak from no-leak with two DISTINCT status icons (not a constant glyph)", () => {
    render(<RegionStepTestCard />);
    const card = screen.getByTestId("region-steptest");
    // Would fail if the leak/no-leak icon ternary collapsed to a single constant icon.
    expect(card.querySelector(".text-status-warning")).not.toBeNull();
    expect(card.querySelector(".text-status-normal")).not.toBeNull();
  });
});
