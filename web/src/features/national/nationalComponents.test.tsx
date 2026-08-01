/**
 * PR-10 — the national presentational components carry the honesty markers and geometry rules.
 * The SIMULATED badge is on the three synthetic KPI tiles and ABSENT from the real WATER SOLD
 * tile; region bars drill to the region PRESERVING the month; the trend has exactly one y-axis;
 * the AI card always renders its provenance caption and names a specific region.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AiSituationCard } from "./AiSituationCard";
import { NationalKpiRow } from "./NationalKpiRow";
import { NationalTrendChart } from "./NationalTrendChart";
import { OfficeRegionMap } from "./OfficeRegionMap";
import { RegionVolumeBars } from "./RegionVolumeBars";
import type { NationalSeries, RegionRollup } from "./types";

const ROLLUP: RegionRollup = {
  month: "2025-12",
  total_m3: 120_999_833.55,
  branch_count: 234,
  regions: [
    { region: 2, water_sold_m3: 50_000_000, branch_count: 30 },
    { region: 1, water_sold_m3: 25_000_000, branch_count: 24 },
  ],
};

const SERIES: NationalSeries = {
  points: [
    { month: "2024-12", total_m3: 100_000_000, branch_count: 234 },
    { month: "2025-11", total_m3: 118_000_000, branch_count: 234 },
    { month: "2025-12", total_m3: 120_999_833.55, branch_count: 234 },
  ],
};

describe("NationalKpiRow", () => {
  it("badges the three simulated tiles and never the real WATER SOLD tile", () => {
    render(<NationalKpiRow rollup={ROLLUP} series={SERIES} />);
    for (const id of ["kpi-nrw", "kpi-energy", "kpi-cost-per-m3"]) {
      expect(within(screen.getByTestId(id)).getByText("SIMULATED")).toBeInTheDocument();
    }
    expect(within(screen.getByTestId("kpi-water-sold")).queryByText("SIMULATED")).toBeNull();
  });

  it("shows the real total and a signed YoY delta on the WATER SOLD tile", () => {
    render(<NationalKpiRow rollup={ROLLUP} series={SERIES} />);
    const tile = within(screen.getByTestId("kpi-water-sold"));
    // Numeral and unit are separate nodes (so the big figure never wraps); assert both.
    expect(tile.getByText("120,999,834")).toBeInTheDocument();
    expect(tile.getByText("ลบ.ม.")).toBeInTheDocument();
    expect(tile.getByText(/\+21\.0%/)).toBeInTheDocument(); // (121.0 - 100)/100
  });
});

describe("RegionVolumeBars", () => {
  it("drills to a region preserving the month, and shows no fabricated status", () => {
    render(
      <MemoryRouter>
        <RegionVolumeBars rollup={ROLLUP} />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: /เขต 2/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("region=2"));
    expect(link).toHaveAttribute("href", expect.stringContaining("month=2025-12"));
    // Water sold only — no simulated status swatch here.
    expect(screen.queryByText("SIMULATED")).toBeNull();
  });

  it("shows an empty state for a month with no regions", () => {
    render(
      <MemoryRouter>
        <RegionVolumeBars rollup={{ ...ROLLUP, regions: [] }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("region-bars-empty")).toBeInTheDocument();
  });
});

describe("NationalTrendChart", () => {
  it("renders exactly one y-axis (one axis per chart)", () => {
    render(<NationalTrendChart series={SERIES} />);
    expect(screen.getAllByTestId("y-axis")).toHaveLength(1);
  });

  it("shows an empty state when there is no series", () => {
    render(<NationalTrendChart series={{ points: [] }} />);
    expect(screen.getByTestId("trend-empty")).toBeInTheDocument();
  });
});

describe("OfficeRegionMap", () => {
  it("renders ten focusable region controls over the 234 real office points", () => {
    const { container } = render(
      <MemoryRouter>
        <OfficeRegionMap rollup={ROLLUP} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(10);
    expect(container.querySelectorAll("circle")).toHaveLength(234);
    // Status/volume is in the accessible NAME, not colour alone.
    const region2 = screen.getByRole("button", { name: /เขต 2/ });
    expect(region2).toHaveAttribute("aria-label", expect.stringContaining("ลบ.ม."));
  });

  it("drills to the region on click, preserving the month", () => {
    const router = createMemoryRouter(
      [
        { path: "/", element: <OfficeRegionMap rollup={ROLLUP} /> },
        { path: "/regions", element: <div>REGIONAL</div> },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole("button", { name: /เขต 2/ }));
    expect(screen.getByText("REGIONAL")).toBeInTheDocument();
    expect(router.state.location.search).toContain("region=2");
    expect(router.state.location.search).toContain("month=2025-12");
  });
});

describe("AiSituationCard", () => {
  it("always renders the provenance caption and names the top region", () => {
    render(<AiSituationCard rollup={ROLLUP} series={SERIES} />);
    expect(screen.getByTestId("ai-provenance")).toHaveTextContent(
      "ข้อความนี้เป็นสคริปต์ตัวอย่าง ไม่ใช่ LLM แบบเรียลไทม์",
    );
    // The recommendation names a specific region (the top one by volume = เขต 2).
    expect(screen.getByText(/ข้อเสนอแนะ/)).toHaveTextContent(/เขต 2/);
  });
});
