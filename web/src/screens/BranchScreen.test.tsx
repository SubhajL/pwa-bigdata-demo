/**
 * PR-12 — the Branch screen owns its INTERACTIONS states. The heading renders SYNCHRONOUSLY; a
 * missing branch shows an honest prompt (no fetch); a failed load shows an Alert; the invalid-month
 * and branch-switch guards behave. Only the network is mocked.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/branch/branchClient", async (importActual) => {
  const actual = await importActual<typeof import("@/features/branch/branchClient")>();
  return { ...actual, fetchMonths: vi.fn(), fetchBranch: vi.fn() };
});
vi.mock("@/features/regional/regionalClient", async (importActual) => {
  const actual = await importActual<typeof import("@/features/regional/regionalClient")>();
  return { ...actual, fetchRegion: vi.fn() };
});

import { fetchRegion } from "@/features/regional/regionalClient";
import type { BranchRow } from "@/features/regional/types";

import { fetchBranch, fetchMonths } from "@/features/branch/branchClient";
import type { BranchSeries } from "@/features/branch/types";

import { BranchScreen } from "./BranchScreen";

const mMonths = vi.mocked(fetchMonths);
const mBranch = vi.mocked(fetchBranch);
const mRegion = vi.mocked(fetchRegion);

function NavButton({ to }: { readonly to: string }): JSX.Element {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>go</button>;
}

function seriesFor(code: string, branch: string): BranchSeries {
  return {
    branch_code: code,
    branch,
    province: "สิงห์บุรี",
    region: 2,
    points: [
      { month: "2025-11", water_sold_m3: 200 },
      { month: "2025-12", water_sold_m3: 220 },
    ],
  };
}

const LEAGUE: BranchRow[] = [
  { rank: 1, branch_code: "5551001", branch: "สิงห์บุรี", province: "สิงห์บุรี", region: 2, water_sold_m3: 220, mom_pct: 1, yoy_pct: 1 },
];

function renderAt(entry: string): void {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <BranchScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("BranchScreen", () => {
  it("renders the Thai heading synchronously, before any fetch resolves", () => {
    mMonths.mockReturnValue(new Promise(() => {}));
    mBranch.mockReturnValue(new Promise(() => {}));
    mRegion.mockReturnValue(new Promise(() => {}));
    renderAt("/branches?branch=5551001");
    expect(screen.getByRole("heading", { name: /ระดับสาขา/ })).toBeInTheDocument();
  });

  it("shows an honest prompt when no branch is selected (no crash, no fetch)", () => {
    renderAt("/branches");
    expect(screen.getByTestId("branch-no-branch")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ระดับสาขา/ })).toBeInTheDocument();
    expect(mBranch).not.toHaveBeenCalled();
  });

  it("shows an error Alert (not a blank) when the branch load fails", async () => {
    mMonths.mockResolvedValue({ months: ["2025-12"], count: 1 });
    mBranch.mockRejectedValue(new Error("down"));
    mRegion.mockResolvedValue(LEAGUE);
    renderAt("/branches?branch=NOPE");
    expect(await screen.findByText("ไม่สามารถโหลดข้อมูลรายสาขาได้")).toBeInTheDocument();
  });

  it("renders the KPI row, trend and honesty footer once a branch loads", async () => {
    mMonths.mockResolvedValue({ months: ["2025-11", "2025-12"], count: 2 });
    mBranch.mockResolvedValue(seriesFor("5551001", "สิงห์บุรี"));
    mRegion.mockResolvedValue(LEAGUE);
    renderAt("/branches?branch=5551001&month=2025-12");
    expect(await screen.findByTestId("branch-kpis")).toBeInTheDocument();
    // The S3 sub-panels (Path D) are wired into the loaded view.
    expect(screen.getByTestId("branch-peer")).toBeInTheDocument();
    expect(screen.getByTestId("branch-production")).toBeInTheDocument();
    expect(screen.getByTestId("branch-forecast")).toBeInTheDocument();
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("เป็นค่าจำลอง");
    expect(within(footer).getByText("SIMULATED")).toBeInTheDocument();
  });

  it("does not stick in a loading-dim when the URL month is invalid (resolves to latest)", async () => {
    mMonths.mockResolvedValue({ months: ["2025-11", "2025-12"], count: 2 });
    mBranch.mockResolvedValue(seriesFor("5551001", "สิงห์บุรี"));
    mRegion.mockResolvedValue(LEAGUE);
    renderAt("/branches?branch=5551001&month=2099-01");
    expect(await screen.findByTestId("branch-kpis")).toBeInTheDocument();
    expect(screen.queryByText("กำลังโหลดเดือนที่เลือก…")).toBeNull();
    expect(screen.getByRole("combobox", { name: "เลือกเดือน" })).toHaveValue("2025-12");
  });

  it("does not render one branch's data under another branch's heading during a switch", async () => {
    mMonths.mockResolvedValue({ months: ["2025-12"], count: 1 });
    mRegion.mockResolvedValue(LEAGUE);
    mBranch.mockImplementation((code) =>
      code === "5551001" ? Promise.resolve(seriesFor("5551001", "สิงห์บุรี")) : new Promise(() => {}),
    );
    render(
      <MemoryRouter initialEntries={["/branches?branch=5551001&month=2025-12"]}>
        <BranchScreen />
        <NavButton to="/branches?branch=5551002&month=2025-12" />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: /สิงห์บุรี/ })).toBeInTheDocument();
    fireEvent.click(screen.getByText("go"));
    // Heading drops the old branch name; the old branch's KPIs must be gone (skeleton).
    expect(await screen.findByRole("heading", { name: /^ระดับสาขา$/ })).toBeInTheDocument();
    expect(screen.queryByTestId("branch-kpis")).toBeNull();
  });
});
