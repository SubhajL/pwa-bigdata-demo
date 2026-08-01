/**
 * PR-12 — the branch presentational components carry the honesty markers and the drill breadcrumb.
 * NRW/status are badged; water-sold/rank/vs-median are not; the breadcrumb links national + region
 * with the month preserved; the trend has exactly one y-axis and a real region-median reference.
 */
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { BranchAiCard } from "./BranchAiCard";
import { BranchBreadcrumb } from "./BranchBreadcrumb";
import { BranchKpiRow } from "./BranchKpiRow";
import { BranchTrendChart } from "./BranchTrendChart";
import type { BranchStanding, BranchVitals, SeriesPoint } from "./types";

const VITALS: BranchVitals = { month: "2025-12", m3: 2_450_120, momPct: -4.2, yoyPct: 3.1 };
const STANDING: BranchStanding = { nrwPct: 22.4, status: "normal", rank: 3, branchCount: 30, regionMedianM3: 1_800_000 };
const POINTS: SeriesPoint[] = [
  { month: "2025-11", water_sold_m3: 2_300_000 },
  { month: "2025-12", water_sold_m3: 2_450_120 },
];

describe("BranchKpiRow", () => {
  it("badges only the simulated NRW tile, not the real water/rank/median tiles", () => {
    render(<BranchKpiRow vitals={VITALS} standing={STANDING} />);
    expect(within(screen.getByTestId("bkpi-nrw")).getByText("SIMULATED")).toBeInTheDocument();
    for (const id of ["bkpi-water", "bkpi-rank", "bkpi-median"]) {
      expect(within(screen.getByTestId(id)).queryByText("SIMULATED")).toBeNull();
    }
  });

  it("renders the real latest volume, rank, and a signed vs-median delta", () => {
    render(<BranchKpiRow vitals={VITALS} standing={STANDING} />);
    expect(within(screen.getByTestId("bkpi-water")).getByText("2,450,120")).toBeInTheDocument();
    expect(within(screen.getByTestId("bkpi-rank")).getByText("3")).toBeInTheDocument();
    // (2,450,120 - 1,800,000) / 1,800,000 ≈ +36.1%
    expect(within(screen.getByTestId("bkpi-median")).getByText(/\+36\.1%/)).toBeInTheDocument();
  });
});

describe("BranchBreadcrumb", () => {
  it("links national and region with the month preserved, branch is the current crumb", () => {
    render(
      <MemoryRouter>
        <BranchBreadcrumb region={2} branch="สิงห์บุรี" month="2025-12" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "ภาพรวมประเทศ" })).toHaveAttribute("href", "/national?month=2025-12");
    expect(screen.getByRole("link", { name: "เขต 2" })).toHaveAttribute("href", "/regions?region=2&month=2025-12");
    expect(screen.getByText("สิงห์บุรี")).toBeInTheDocument();
  });
});

describe("BranchTrendChart", () => {
  it("renders exactly one y-axis and a real region-median reference line", () => {
    render(<BranchTrendChart points={POINTS} regionMedianM3={1_800_000} />);
    expect(screen.getAllByTestId("y-axis")).toHaveLength(1);
    expect(screen.getByTestId("median-line")).toBeInTheDocument();
  });

  it("shows an empty state when there is no series", () => {
    render(<BranchTrendChart points={[]} regionMedianM3={null} />);
    expect(screen.getByTestId("branch-trend-empty")).toBeInTheDocument();
  });
});

describe("BranchAiCard", () => {
  it("names the branch, gives a recommendation, and always renders the provenance caption", () => {
    render(<BranchAiCard branch="สิงห์บุรี" vitals={VITALS} standing={STANDING} />);
    const card = screen.getByTestId("branch-ai");
    expect(card).toHaveTextContent("สิงห์บุรี");
    expect(card).toHaveTextContent("ข้อเสนอแนะ");
    expect(screen.getByTestId("branch-ai-provenance")).toHaveTextContent(
      "ข้อความนี้เป็นสคริปต์ตัวอย่าง ไม่ใช่ LLM แบบเรียลไทม์",
    );
    // The narrative cites only real facts — no violet badge on it.
    expect(within(screen.getByTestId("branch-ai")).queryByText("SIMULATED")).toBeNull();
  });

  it("recommends from REAL volume vs median — a branch AT the median is not called 'below'", () => {
    // volume == median → must NOT claim below-median (the rank>count/2 bug did).
    render(<BranchAiCard branch="อู่ทอง" vitals={{ ...VITALS, m3: 354_122 }} standing={{ ...STANDING, rank: 12, branchCount: 23, regionMedianM3: 354_122 }} />);
    expect(screen.getByTestId("branch-ai")).not.toHaveTextContent("ต่ำกว่าค่ากลาง");
  });

  it("calls a genuinely below-median branch below the median", () => {
    render(<BranchAiCard branch="X" vitals={{ ...VITALS, m3: 100_000 }} standing={{ ...STANDING, regionMedianM3: 354_122 }} />);
    expect(screen.getByTestId("branch-ai")).toHaveTextContent("ต่ำกว่าค่ากลาง");
  });
});
