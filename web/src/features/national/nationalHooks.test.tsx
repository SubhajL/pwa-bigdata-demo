/**
 * PR-10 — useNational resolves the effective month, refetches when it changes, and never blanks
 * on a transient failure (keeps the last data, flags stale). Only the network is mocked.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./nationalClient", async (importActual) => {
  const actual = await importActual<typeof import("./nationalClient")>();
  return {
    ...actual,
    fetchMonths: vi.fn(),
    fetchNational: vi.fn(),
    fetchNationalSeries: vi.fn(),
  };
});

import { fetchMonths, fetchNational, fetchNationalSeries } from "./nationalClient";
import { useNational } from "./useNational";

const mMonths = vi.mocked(fetchMonths);
const mNational = vi.mocked(fetchNational);
const mSeries = vi.mocked(fetchNationalSeries);

beforeEach(() => {
  vi.clearAllMocks();
  mMonths.mockResolvedValue({ months: ["2025-10", "2025-11", "2025-12"], count: 3 });
  mSeries.mockResolvedValue({ points: [] });
  mNational.mockImplementation((month) =>
    Promise.resolve({
      month,
      total_m3: 1,
      branch_count: 1,
      regions: [{ region: 1, water_sold_m3: 1, branch_count: 1 }],
    }),
  );
});

describe("useNational", () => {
  it("defaults to the latest month when none is requested", async () => {
    const { result } = renderHook(() => useNational(null));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data?.month).toBe("2025-12");
    expect(mNational).toHaveBeenCalledWith("2025-12", expect.anything());
  });

  it("loads the requested month when it is a real one", async () => {
    const { result } = renderHook(() => useNational("2025-11"));
    await waitFor(() => expect(result.current.data?.month).toBe("2025-11"));
  });

  it("falls back to the latest month when the requested month is not in the dataset", async () => {
    const { result } = renderHook(() => useNational("1999-01"));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data?.month).toBe("2025-12");
  });

  it("refetches when the month changes", async () => {
    const { result, rerender } = renderHook((m: string) => useNational(m), {
      initialProps: "2025-11",
    });
    await waitFor(() => expect(result.current.data?.month).toBe("2025-11"));
    rerender("2025-12");
    await waitFor(() => expect(result.current.data?.month).toBe("2025-12"));
  });

  it("keeps the last data and flags stale when a refetch fails", async () => {
    const { result, rerender } = renderHook((m: string) => useNational(m), {
      initialProps: "2025-11",
    });
    await waitFor(() => expect(result.current.data?.month).toBe("2025-11"));
    mNational.mockRejectedValueOnce(new Error("net down"));
    rerender("2025-12");
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.data?.month).toBe("2025-11"); // last-known kept, never blanked
  });
});
