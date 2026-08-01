/**
 * PR-D2 (Path D) — the league table's tri-state column sort. Clicking a numeric header cycles
 * none → desc → asc → none, reorders the rows, exposes `aria-sort`, and NEVER renumbers the `#`
 * column (the endpoint's rank travels with each row).
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { BranchLeagueTable } from "./BranchLeagueTable";
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
  bar({ rank: 1, branchCode: "c1", branch: "Alpha", waterSoldM3: 300 }),
  bar({ rank: 2, branchCode: "c2", branch: "Beta", waterSoldM3: 100 }),
  bar({ rank: 3, branchCode: "c3", branch: "Gamma", waterSoldM3: 200 }),
];

afterEach(cleanup);

function renderTable(): void {
  render(
    <MemoryRouter>
      <BranchLeagueTable bars={BARS} month="2025-12" />
    </MemoryRouter>,
  );
}

/** The branch name of each body row, in render order. */
function branchOrder(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getByRole("link").textContent ?? "");
}

const volHeader = (): HTMLElement => screen.getByRole("button", { name: /ปริมาณจำหน่าย/ });
const volTh = (): HTMLElement => volHeader().closest("th")!;

describe("BranchLeagueTable tri-state sort", () => {
  it("defaults to the endpoint rank order with no active sort", () => {
    renderTable();
    expect(branchOrder()).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(volTh()).toHaveAttribute("aria-sort", "none");
  });

  it("cycles a column none → desc → asc → none, reordering the rows each time", () => {
    renderTable();

    fireEvent.click(volHeader());
    expect(volTh()).toHaveAttribute("aria-sort", "descending");
    expect(branchOrder()).toEqual(["Alpha", "Gamma", "Beta"]); // 300, 200, 100

    fireEvent.click(volHeader());
    expect(volTh()).toHaveAttribute("aria-sort", "ascending");
    expect(branchOrder()).toEqual(["Beta", "Gamma", "Alpha"]); // 100, 200, 300

    fireEvent.click(volHeader());
    expect(volTh()).toHaveAttribute("aria-sort", "none");
    expect(branchOrder()).toEqual(["Alpha", "Beta", "Gamma"]); // back to rank order
  });

  it("switching to a different column starts that column at descending and resets the old one", () => {
    renderTable();
    fireEvent.click(volHeader()); // volume: descending
    expect(volTh()).toHaveAttribute("aria-sort", "descending");

    const momHeader = screen.getByRole("button", { name: /MoM/ });
    fireEvent.click(momHeader); // switch to MoM → its own descending
    expect(momHeader.closest("th")).toHaveAttribute("aria-sort", "descending");
    expect(volTh()).toHaveAttribute("aria-sort", "none");
  });

  it("keeps the # rank column stable when sorted (no renumber)", () => {
    renderTable();
    fireEvent.click(volHeader()); // desc → Alpha(1), Gamma(3), Beta(2)
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getAllByRole("cell")[0]).toHaveTextContent("1");
    expect(within(rows[1]).getAllByRole("cell")[0]).toHaveTextContent("3");
    expect(within(rows[2]).getAllByRole("cell")[0]).toHaveTextContent("2");
  });
});
