/**
 * PR-11 — useRegional resolves the month, fetches the region's rows, refetches on region/month
 * change, does not fetch when no region is selected, and keeps the last data (stale) on a
 * transient failure. Only the network is mocked.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./regionalClient", async (importActual) => {
  const actual = await importActual<typeof import("./regionalClient")>();
  return { ...actual, fetchMonths: vi.fn(), fetchRegion: vi.fn() };
});

import { ApiError } from "@/api/client";

import { fetchMonths, fetchRegion } from "./regionalClient";
import type { BranchRow } from "./types";
import { useRegional } from "./useRegional";

const mMonths = vi.mocked(fetchMonths);
const mRegion = vi.mocked(fetchRegion);

function rowsFor(region: number): BranchRow[] {
  return [
    { rank: 1, branch_code: `${region}01`, branch: "A", province: "P", region, water_sold_m3: 10, mom_pct: 1, yoy_pct: 1 },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mMonths.mockResolvedValue({ months: ["2025-10", "2025-11", "2025-12"], count: 3 });
  mRegion.mockImplementation((region) => Promise.resolve(rowsFor(region)));
});

describe("useRegional", () => {
  it("does not fetch a region when none is selected", async () => {
    const { result } = renderHook(() => useRegional(null, "2025-12"));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data?.rows).toEqual([]);
    expect(mRegion).not.toHaveBeenCalled();
  });

  it("loads the requested month's rows for a selected region, defaulting to the latest month", async () => {
    const { result } = renderHook(() => useRegional(2, null));
    await waitFor(() => expect(result.current.data?.rows.length).toBe(1));
    expect(result.current.data?.month).toBe("2025-12");
    expect(mRegion).toHaveBeenCalledWith(2, "2025-12", expect.anything());
  });

  it("refetches when the region changes and updates the data's region provenance", async () => {
    const { result, rerender } = renderHook((region: number) => useRegional(region, "2025-12"), {
      initialProps: 2,
    });
    await waitFor(() => expect(result.current.data?.region).toBe(2));
    rerender(3);
    await waitFor(() => expect(result.current.data?.region).toBe(3));
    expect(mRegion).toHaveBeenCalledWith(3, "2025-12", expect.anything());
  });

  it("treats a 404 from the endpoint as an empty region, not an error", async () => {
    mRegion.mockRejectedValue(new ApiError(404, "no data"));
    const { result } = renderHook(() => useRegional(2, "2025-12"));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data?.rows).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("keeps the last rows and flags stale when a refetch fails", async () => {
    const { result, rerender } = renderHook((month: string) => useRegional(2, month), {
      initialProps: "2025-11",
    });
    await waitFor(() => expect(result.current.data?.month).toBe("2025-11"));
    mRegion.mockRejectedValueOnce(new Error("down"));
    rerender("2025-12");
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.data?.month).toBe("2025-11"); // last-known kept
  });
});
