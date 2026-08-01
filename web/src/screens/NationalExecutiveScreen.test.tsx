/**
 * PR-10 — the National Executive screen owns its INTERACTIONS states.
 * The heading renders SYNCHRONOUSLY (no successful fetch required); a failed load shows an Alert,
 * never a blank page; a month with no rows shows an honest empty state, not a permanent skeleton.
 * Only the network is mocked. Mirrors PredictiveAnalyticsScreen.test.tsx.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/national/nationalClient", async (importActual) => {
  const actual = await importActual<typeof import("@/features/national/nationalClient")>();
  return {
    ...actual,
    fetchMonths: vi.fn(),
    fetchNational: vi.fn(),
    fetchNationalSeries: vi.fn(),
  };
});

import { fetchMonths, fetchNational, fetchNationalSeries } from "@/features/national/nationalClient";

import { NationalExecutiveScreen } from "./NationalExecutiveScreen";

const mMonths = vi.mocked(fetchMonths);
const mNational = vi.mocked(fetchNational);
const mSeries = vi.mocked(fetchNationalSeries);

function renderScreen(): void {
  render(
    <MemoryRouter initialEntries={["/national"]}>
      <NationalExecutiveScreen />
    </MemoryRouter>,
  );
}

describe("NationalExecutiveScreen", () => {
  it("renders the Thai heading synchronously, before any fetch resolves", () => {
    mMonths.mockReturnValue(new Promise(() => {})); // never resolves
    mNational.mockReturnValue(new Promise(() => {}));
    mSeries.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByRole("heading", { name: /ภาพรวมประเทศ/ })).toBeInTheDocument();
    expect(screen.getByTestId("national-executive")).toBeInTheDocument();
  });

  it("shows an error Alert (not a blank) when the initial load fails", async () => {
    mMonths.mockRejectedValue(new Error("net down"));
    mNational.mockRejectedValue(new Error("net down"));
    mSeries.mockRejectedValue(new Error("net down"));
    renderScreen();
    expect(await screen.findByText("ไม่สามารถโหลดข้อมูลภาพรวมได้")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ภาพรวมประเทศ/ })).toBeInTheDocument();
  });

  it("shows an honest empty state when the month has no rows (not a permanent skeleton)", async () => {
    mMonths.mockResolvedValue({ months: ["2025-12"], count: 1 });
    mNational.mockResolvedValue({ month: "2025-12", total_m3: 0, branch_count: 0, regions: [] });
    mSeries.mockResolvedValue({ points: [] });
    renderScreen();
    expect(await screen.findByTestId("national-empty")).toBeInTheDocument();
    expect(screen.getByText(/ไม่มีข้อมูลสำหรับเดือนนี้/)).toBeInTheDocument();
  });

  it("renders the KPI row and honesty footer once a month loads", async () => {
    mMonths.mockResolvedValue({ months: ["2025-11", "2025-12"], count: 2 });
    mNational.mockResolvedValue({
      month: "2025-12",
      total_m3: 120_999_833.55,
      branch_count: 234,
      regions: [{ region: 2, water_sold_m3: 50_000_000, branch_count: 30 }],
    });
    mSeries.mockResolvedValue({
      points: [
        { month: "2025-11", total_m3: 118_000_000, branch_count: 234 },
        { month: "2025-12", total_m3: 120_999_833.55, branch_count: 234 },
      ],
    });
    renderScreen();
    expect(await screen.findByTestId("national-kpis")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-water-sold")).toBeInTheDocument();
    // The honesty footer names WHICH KPIs are simulated (a P0 honesty control) — assert it, don't
    // just claim it: a regression that dropped or reworded it must fail here.
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("เป็นค่าจำลอง");
    expect(within(footer).getByText("SIMULATED")).toBeInTheDocument();
  });

  it("binds the month picker to the URL's requested month (no snap-back)", async () => {
    mMonths.mockResolvedValue({ months: ["2025-11", "2025-12"], count: 2 });
    mNational.mockResolvedValue({
      month: "2025-11",
      total_m3: 118_000_000,
      branch_count: 234,
      regions: [{ region: 2, water_sold_m3: 50_000_000, branch_count: 30 }],
    });
    mSeries.mockResolvedValue({
      points: [
        { month: "2025-11", total_m3: 118_000_000, branch_count: 234 },
        { month: "2025-12", total_m3: 120_999_833.55, branch_count: 234 },
      ],
    });
    render(
      <MemoryRouter initialEntries={["/national?month=2025-11"]}>
        <NationalExecutiveScreen />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("national-kpis")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "เลือกเดือน" })).toHaveValue("2025-11");
  });

  it("announces a pending month switch instead of silently showing the old month under a new URL", async () => {
    mMonths.mockResolvedValue({ months: ["2025-11", "2025-12"], count: 2 });
    mSeries.mockResolvedValue({
      points: [{ month: "2025-11", total_m3: 118_000_000, branch_count: 234 }],
    });
    // The first month loads; the newly-picked month stays PENDING, exercising the mid-switch state.
    mNational.mockImplementation((month) =>
      month === "2025-11"
        ? Promise.resolve({
            month: "2025-11",
            total_m3: 118_000_000,
            branch_count: 234,
            regions: [{ region: 2, water_sold_m3: 50_000_000, branch_count: 30 }],
          })
        : new Promise(() => {}),
    );
    render(
      <MemoryRouter initialEntries={["/national?month=2025-11"]}>
        <NationalExecutiveScreen />
      </MemoryRouter>,
    );
    await screen.findByTestId("national-kpis");
    fireEvent.change(screen.getByRole("combobox", { name: "เลือกเดือน" }), {
      target: { value: "2025-12" },
    });
    // Picker reflects the choice immediately and the load is announced — not a silent stale mismatch.
    expect(await screen.findByText("กำลังโหลดเดือนที่เลือก…")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "เลือกเดือน" })).toHaveValue("2025-12");
  });
});
