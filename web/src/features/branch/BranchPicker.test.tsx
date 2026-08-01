/**
 * Drill-down landing fix — the Branch picker. When ระดับสาขา is reached with no branch, it lists a
 * region's real branches as drill links (month preserved) and refetches when the เขต changes, instead
 * of a dead-end "go to the national page" prompt. Only the network is mocked; branchBars stays real.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/regional/regionalClient", async (importActual) => {
  const actual = await importActual<typeof import("@/features/regional/regionalClient")>();
  return { ...actual, fetchMonths: vi.fn(), fetchRegion: vi.fn() };
});

import { fetchMonths, fetchRegion } from "@/features/regional/regionalClient";
import type { BranchRow } from "@/features/regional/types";

import { BranchPicker } from "./BranchPicker";

const mMonths = vi.mocked(fetchMonths);
const mRegion = vi.mocked(fetchRegion);

const ROWS: BranchRow[] = [
  { rank: 1, branch_code: "5551001", branch: "สิงห์บุรี", province: "สิงห์บุรี", region: 1, water_sold_m3: 300000, mom_pct: 1, yoy_pct: 1 },
  { rank: 2, branch_code: "5551002", branch: "อินทร์บุรี", province: "สิงห์บุรี", region: 1, water_sold_m3: 200000, mom_pct: 1, yoy_pct: 1 },
];

function renderPicker(): void {
  render(
    <MemoryRouter>
      <BranchPicker />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mMonths.mockResolvedValue({ months: ["2025-11", "2025-12"], count: 2 });
});
afterEach(cleanup);

describe("BranchPicker", () => {
  it("lists the default region's branches as drill links with the month preserved", async () => {
    mRegion.mockResolvedValue(ROWS);
    renderPicker();
    const link = await screen.findByRole("link", { name: /สิงห์บุรี/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("branch=5551001"));
    expect(link).toHaveAttribute("href", expect.stringContaining("month=2025-12"));
    expect(mRegion).toHaveBeenCalledWith(1, "2025-12", expect.anything());
  });

  it("refetches when the เขต changes", async () => {
    mRegion.mockResolvedValue(ROWS);
    renderPicker();
    await screen.findByRole("link", { name: /สิงห์บุรี/ });
    fireEvent.change(screen.getByRole("combobox", { name: "เลือกเขต" }), { target: { value: "4" } });
    await waitFor(() => expect(mRegion).toHaveBeenCalledWith(4, "2025-12", expect.anything()));
  });

  it("shows an empty state (not a crash) when the region has no branches", async () => {
    mRegion.mockResolvedValue([]);
    renderPicker();
    expect(await screen.findByTestId("branch-picker-empty")).toBeInTheDocument();
  });

  it("shows an error (not a blank/crash) when the region fetch fails", async () => {
    mRegion.mockRejectedValue(new Error("boom"));
    renderPicker();
    expect(await screen.findByText("โหลดรายชื่อสาขาไม่สำเร็จ")).toBeInTheDocument();
  });
});
