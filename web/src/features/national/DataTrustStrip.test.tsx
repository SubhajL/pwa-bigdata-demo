/**
 * PR-D1 (Path D) — the data-trust strip. It certifies the national figures are REAL, so it must show
 * the measured provenance and must NEVER carry a SIMULATED marker (mislabelling real data as
 * synthetic is the mirror of the honesty rule). It fetches on its OWN — a failure/hang must leave it
 * simply absent, never blanking the page around it.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SIMULATED_ARIA_LABEL } from "@/components/SimulatedBadge";

vi.mock("./nationalClient", async (importActual) => {
  const actual = await importActual<typeof import("./nationalClient")>();
  return { ...actual, fetchTrust: vi.fn() };
});

import { fetchTrust } from "./nationalClient";

import { DataTrustStrip } from "./DataTrustStrip";
import type { CuratedTrust } from "./types";

const mTrust = vi.mocked(fetchTrust);

const TRUST: CuratedTrust = {
  source: "water_sold_by_branch.csv",
  record_count: 9126,
  branch_count: 234,
  region_count: 10,
  month_count: 39,
  first_month: "2022-10",
  last_month: "2025-12",
  skipped_rows: 0,
};

afterEach(cleanup);

describe("DataTrustStrip", () => {
  it("shows the measured provenance of the real dataset", async () => {
    mTrust.mockResolvedValue(TRUST);
    render(<DataTrustStrip />);
    const strip = await screen.findByTestId("data-trust");
    expect(strip).toHaveTextContent("ข้อมูลจริงของ กปภ.");
    expect(strip).toHaveTextContent("234 สาขา");
    expect(strip).toHaveTextContent("10 เขต");
    expect(strip).toHaveTextContent("39 เดือน");
    expect(strip).toHaveTextContent("2022-10 – 2025-12");
    expect(strip).toHaveTextContent("water_sold_by_branch.csv");
  });

  it("carries NO SIMULATED marker — it is the honest counterpart", async () => {
    mTrust.mockResolvedValue(TRUST);
    render(<DataTrustStrip />);
    await screen.findByTestId("data-trust");
    expect(screen.queryByText("SIMULATED")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(SIMULATED_ARIA_LABEL)).not.toBeInTheDocument();
  });

  it("renders nothing while loading and stays absent if the fetch fails (never blanks the page)", async () => {
    mTrust.mockRejectedValue(new Error("trust 503"));
    const { container } = render(<DataTrustStrip />);
    expect(screen.queryByTestId("data-trust")).not.toBeInTheDocument();
    await waitFor(() => expect(mTrust).toHaveBeenCalled());
    expect(screen.queryByTestId("data-trust")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("surfaces quarantined rows when there are any", async () => {
    mTrust.mockResolvedValue({ ...TRUST, skipped_rows: 3 });
    render(<DataTrustStrip />);
    expect(await screen.findByTestId("data-trust")).toHaveTextContent("3 แถวถูกกัน");
  });
});
