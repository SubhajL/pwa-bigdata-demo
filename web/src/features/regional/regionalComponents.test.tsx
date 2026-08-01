/**
 * PR-11 — the regional presentational components carry the honesty markers and drill contract.
 * The SIMULATED badge is on the NRW/watch KPIs and the NRW/status table columns, and NOT on the
 * real volume/branch-count tiles; rows drill preserving the month; status is icon+label (not
 * colour-alone); the breadcrumb links national with the month.
 */
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { parseOfficePoints } from "@/features/national/nationalMap";

import { BranchLeagueTable } from "./BranchLeagueTable";
import { RegionBreadcrumb } from "./RegionBreadcrumb";
import { RegionOfficeMap } from "./RegionOfficeMap";
import { RegionalKpiRow } from "./RegionalKpiRow";
import { branchBars } from "./regionalClient";
import type { BranchRow, RegionSummary } from "./types";

const SUMMARY: RegionSummary = { totalM3: 4_340_570, branchCount: 2, avgNrwPct: 27.5, watchCount: 1 };

const ROWS: BranchRow[] = [
  { rank: 1, branch_code: "5551001", branch: "รังสิต", province: "ปทุมธานี", region: 2, water_sold_m3: 2_450_120, mom_pct: 2.1, yoy_pct: 3.0 },
  { rank: 2, branch_code: "5551002", branch: "คลองหลวง", province: "ปทุมธานี", region: 2, water_sold_m3: 1_890_450, mom_pct: -0.5, yoy_pct: -1.0 },
];

describe("RegionalKpiRow", () => {
  it("badges the simulated NRW + watch tiles and not the real volume/branch tiles", () => {
    render(<RegionalKpiRow summary={SUMMARY} />);
    expect(within(screen.getByTestId("rkpi-nrw")).getByText("SIMULATED")).toBeInTheDocument();
    expect(within(screen.getByTestId("rkpi-watch")).getByText("SIMULATED")).toBeInTheDocument();
    expect(within(screen.getByTestId("rkpi-total")).queryByText("SIMULATED")).toBeNull();
    expect(within(screen.getByTestId("rkpi-branches")).queryByText("SIMULATED")).toBeNull();
  });
});

describe("BranchLeagueTable", () => {
  it("drills to a branch preserving the month and badges the simulated columns", () => {
    render(
      <MemoryRouter>
        <BranchLeagueTable bars={branchBars(ROWS)} month="2025-12" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "รังสิต" });
    expect(link).toHaveAttribute("href", expect.stringContaining("branch=5551001"));
    expect(link).toHaveAttribute("href", expect.stringContaining("month=2025-12"));
    // Each simulated column header carries its OWN badge (scoped, not just "≥2 somewhere").
    expect(within(screen.getByRole("columnheader", { name: /NRW/ })).getByText("SIMULATED")).toBeInTheDocument();
    expect(within(screen.getByRole("columnheader", { name: /สถานะ/ })).getByText("SIMULATED")).toBeInTheDocument();
    // Status is an icon + Thai label chip (never colour-alone) — StatusChip stamps data-icon + label.
    expect(document.querySelector("[data-icon]")).not.toBeNull();
    expect(screen.getAllByText(/ปกติ|เฝ้าระวัง|วิกฤต/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows an empty state when there are no bars", () => {
    render(
      <MemoryRouter>
        <BranchLeagueTable bars={[]} month="2025-12" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("league-empty")).toBeInTheDocument();
  });
});

describe("RegionOfficeMap", () => {
  it("plots exactly the real offices of the given region (no fabricated status)", () => {
    const expected = parseOfficePoints().filter((p) => p.region === 2).length;
    const { container } = render(<RegionOfficeMap region={2} />);
    expect(expected).toBeGreaterThan(0);
    expect(container.querySelectorAll("circle")).toHaveLength(expected);
    // Real locations only — no simulated marker on the map itself.
    expect(screen.queryByText("SIMULATED")).toBeNull();
  });
});

describe("RegionBreadcrumb", () => {
  it("links back to national with the month preserved", () => {
    render(
      <MemoryRouter>
        <RegionBreadcrumb region={2} month="2025-12" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "ภาพรวมประเทศ" });
    expect(link).toHaveAttribute("href", "/national?month=2025-12");
    expect(screen.getByText("เขต 2")).toBeInTheDocument();
  });
});
