/**
 * PR-12 — useBranch loads the real series, sources the branch's SIMULATED NRW/status from the
 * REGION league (so it matches the Regional screen exactly), does not fetch when no branch is
 * selected, refetches on change, and keeps last data (stale) on a transient failure.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";

vi.mock("./branchClient", async (importActual) => {
  const actual = await importActual<typeof import("./branchClient")>();
  return { ...actual, fetchMonths: vi.fn(), fetchBranch: vi.fn() };
});
vi.mock("@/features/regional/regionalClient", async (importActual) => {
  const actual = await importActual<typeof import("@/features/regional/regionalClient")>();
  return { ...actual, fetchRegion: vi.fn() };
});

import { branchBars, fetchRegion } from "@/features/regional/regionalClient";
import type { BranchRow } from "@/features/regional/types";

import { fetchBranch, fetchMonths } from "./branchClient";
import type { BranchSeries } from "./types";
import { useBranch } from "./useBranch";

const mMonths = vi.mocked(fetchMonths);
const mBranch = vi.mocked(fetchBranch);
const mRegion = vi.mocked(fetchRegion);

const SERIES: BranchSeries = {
  branch_code: "5551001",
  branch: "สิงห์บุรี",
  province: "สิงห์บุรี",
  region: 2,
  points: [
    { month: "2025-11", water_sold_m3: 200 },
    { month: "2025-12", water_sold_m3: 220 },
  ],
};

const LEAGUE: BranchRow[] = [
  { rank: 1, branch_code: "5551002", branch: "B", province: "P", region: 2, water_sold_m3: 300, mom_pct: 1, yoy_pct: 1 },
  { rank: 2, branch_code: "5551001", branch: "สิงห์บุรี", province: "สิงห์บุรี", region: 2, water_sold_m3: 220, mom_pct: 1, yoy_pct: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mMonths.mockResolvedValue({ months: ["2025-11", "2025-12"], count: 2 });
  mBranch.mockResolvedValue(SERIES);
  mRegion.mockResolvedValue(LEAGUE);
});

describe("useBranch", () => {
  it("does not fetch when no branch is selected", async () => {
    const { result } = renderHook(() => useBranch(null, "2025-12"));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data?.series).toBeNull();
    expect(mBranch).not.toHaveBeenCalled();
  });

  it("loads the series and sources NRW/status from the region league (matches Regional exactly)", async () => {
    const { result } = renderHook(() => useBranch("5551001", "2025-12"));
    await waitFor(() => expect(result.current.data?.code).toBe("5551001"));
    const expectedBar = branchBars(LEAGUE).find((b) => b.branchCode === "5551001")!;
    expect(result.current.data?.standing?.nrwPct).toBe(expectedBar.nrwPct);
    expect(result.current.data?.standing?.status).toBe(expectedBar.status);
    expect(result.current.data?.standing?.rank).toBe(2);
    expect(result.current.data?.vitals?.m3).toBe(220);
  });

  it("refetches and updates provenance when the branch changes", async () => {
    const { result, rerender } = renderHook((code: string) => useBranch(code, "2025-12"), {
      initialProps: "5551001",
    });
    await waitFor(() => expect(result.current.data?.code).toBe("5551001"));
    mBranch.mockResolvedValue({ ...SERIES, branch_code: "5551002", branch: "B" });
    rerender("5551002");
    await waitFor(() => expect(result.current.data?.code).toBe("5551002"));
  });

  it("still shows the REAL series but an empty standing when the region source fails (404 or 500)", async () => {
    for (const err of [new ApiError(404, "no data"), new ApiError(500, "boom"), new Error("net")]) {
      vi.clearAllMocks();
      mMonths.mockResolvedValue({ months: ["2025-12"], count: 1 });
      mBranch.mockResolvedValue(SERIES);
      mRegion.mockRejectedValue(err);
      const { result, unmount } = renderHook(() => useBranch("5551001", "2025-12"));
      await waitFor(() => expect(result.current.data?.code).toBe("5551001"));
      expect(result.current.data?.series?.points.length).toBe(2); // real data survives
      expect(result.current.data?.standing?.nrwPct).toBeNull();
      expect(result.current.error).toBeNull();
      unmount();
    }
  });

  it("leaves NRW/rank null when the branch is not in the region league that month", async () => {
    mRegion.mockResolvedValue([
      { rank: 1, branch_code: "OTHER", branch: "O", province: "P", region: 2, water_sold_m3: 100, mom_pct: 1, yoy_pct: 1 },
    ]);
    const { result } = renderHook(() => useBranch("5551001", "2025-12"));
    await waitFor(() => expect(result.current.data?.code).toBe("5551001"));
    expect(result.current.data?.standing?.nrwPct).toBeNull();
    expect(result.current.data?.standing?.rank).toBeNull();
    expect(result.current.data?.standing?.branchCount).toBe(1); // still counted from the league
  });

  it("keeps the last data and flags stale when a refetch fails", async () => {
    const { result, rerender } = renderHook((month: string) => useBranch("5551001", month), {
      initialProps: "2025-11",
    });
    await waitFor(() => expect(result.current.data?.month).toBe("2025-11"));
    mBranch.mockRejectedValueOnce(new Error("down"));
    rerender("2025-12");
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.data?.month).toBe("2025-11");
  });
});
