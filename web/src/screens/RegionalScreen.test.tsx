/**
 * PR-11 — the Regional screen owns its INTERACTIONS states. The heading renders SYNCHRONOUSLY; a
 * missing region shows an honest "pick a region" prompt (not a crash/fetch); a failed load shows an
 * Alert; an empty region shows an honest empty state. Only the network is mocked.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";

vi.mock("@/features/regional/regionalClient", async (importActual) => {
  const actual = await importActual<typeof import("@/features/regional/regionalClient")>();
  return { ...actual, fetchMonths: vi.fn(), fetchRegion: vi.fn() };
});

import { fetchMonths, fetchRegion } from "@/features/regional/regionalClient";

import { RegionalScreen } from "./RegionalScreen";

/** A button that navigates, so a test can drive a URL change (region/month switch) in-place. */
function NavButton({ to }: { readonly to: string }): JSX.Element {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>go</button>;
}

const mMonths = vi.mocked(fetchMonths);
const mRegion = vi.mocked(fetchRegion);

function renderAt(entry: string): void {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <RegionalScreen />
    </MemoryRouter>,
  );
}

const REGION_ROWS = [
  { rank: 1, branch_code: "5551001", branch: "รังสิต", province: "ปทุมธานี", region: 2, water_sold_m3: 2_450_120, mom_pct: 2.1, yoy_pct: 3.0 },
  { rank: 2, branch_code: "5551002", branch: "คลองหลวง", province: "ปทุมธานี", region: 2, water_sold_m3: 1_890_450, mom_pct: -0.5, yoy_pct: -1.0 },
];

describe("RegionalScreen", () => {
  it("renders the Thai heading synchronously, before any fetch resolves", () => {
    mMonths.mockReturnValue(new Promise(() => {}));
    mRegion.mockReturnValue(new Promise(() => {}));
    renderAt("/regions?region=2");
    expect(screen.getByRole("heading", { name: /ระดับเขต/ })).toBeInTheDocument();
  });

  it("shows an honest 'pick a region' prompt when no region is selected (no crash)", () => {
    renderAt("/regions");
    expect(screen.getByTestId("regional-no-region")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ระดับเขต/ })).toBeInTheDocument();
    expect(mRegion).not.toHaveBeenCalled();
  });

  it("shows an error Alert (not a blank) when the load fails", async () => {
    mMonths.mockRejectedValue(new Error("down"));
    mRegion.mockRejectedValue(new Error("down"));
    renderAt("/regions?region=2");
    expect(await screen.findByText("ไม่สามารถโหลดข้อมูลรายเขตได้")).toBeInTheDocument();
  });

  it("shows an honest empty state when the endpoint 404s (a region with no rows this month)", async () => {
    // The real route returns 404 (not []) for a region with no rows; the hook must treat that as
    // empty, not an error.
    mMonths.mockResolvedValue({ months: ["2025-12"], count: 1 });
    mRegion.mockRejectedValue(new ApiError(404, "no data"));
    renderAt("/regions?region=2&month=2025-12");
    expect(await screen.findByTestId("regional-empty")).toBeInTheDocument();
  });

  it("renders the KPI row, table and honesty footer once a region loads", async () => {
    mMonths.mockResolvedValue({ months: ["2025-11", "2025-12"], count: 2 });
    mRegion.mockResolvedValue(REGION_ROWS);
    renderAt("/regions?region=2&month=2025-12");
    expect(await screen.findByTestId("regional-kpis")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "รังสิต" })).toBeInTheDocument();
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("เป็นค่าจำลอง");
    expect(within(footer).getByText("SIMULATED")).toBeInTheDocument();
  });

  it("does not stick in a loading-dim when the URL month is invalid (resolves to latest)", async () => {
    mMonths.mockResolvedValue({ months: ["2025-11", "2025-12"], count: 2 });
    mRegion.mockResolvedValue(REGION_ROWS);
    renderAt("/regions?region=2&month=2099-01");
    expect(await screen.findByTestId("regional-kpis")).toBeInTheDocument();
    // No permanent "loading month" cue, and the picker shows the resolved month, not the bogus one.
    expect(screen.queryByText("กำลังโหลดเดือนที่เลือก…")).toBeNull();
    expect(screen.getByRole("combobox", { name: "เลือกเดือน" })).toHaveValue("2025-12");
  });

  it("does not render one region's table under another region's heading during a switch", async () => {
    mMonths.mockResolvedValue({ months: ["2025-12"], count: 1 });
    // Region 2 resolves; region 3 stays pending → the switch must show a skeleton, not เขต 2 rows.
    mRegion.mockImplementation((region) =>
      region === 2 ? Promise.resolve(REGION_ROWS) : new Promise(() => {}),
    );
    render(
      <MemoryRouter initialEntries={["/regions?region=2&month=2025-12"]}>
        <RegionalScreen />
        <NavButton to="/regions?region=3&month=2025-12" />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("link", { name: "รังสิต" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("go"));
    // Heading now says เขต 3; region 2's รังสิต row must be gone (skeleton), not shown under เขต 3.
    expect(await screen.findByRole("heading", { name: /เขต 3/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "รังสิต" })).toBeNull();
  });
});
