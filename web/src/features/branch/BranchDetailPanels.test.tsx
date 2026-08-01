/**
 * PR-D3 (Path D) — the Branch S3 sub-panels. The peer card is REAL (rank/branchCount) so it carries
 * NO SimulatedBadge; the production and forecast cards synthesise, so each is badged SIMULATED.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SIMULATED_ARIA_LABEL } from "@/components/SimulatedBadge";

import { BranchForecastCard, BranchPeerCard, BranchProductionCard } from "./BranchDetailPanels";

afterEach(cleanup);

describe("BranchPeerCard (REAL)", () => {
  it("shows the branch's rank, peer count and top-% with no SIMULATED marker", () => {
    render(<BranchPeerCard rank={3} branchCount={20} />);
    const card = screen.getByTestId("branch-peer");
    expect(card).toHaveTextContent("อันดับ");
    expect(card).toHaveTextContent("3");
    expect(card).toHaveTextContent("20");
    expect(within(card).queryByLabelText(SIMULATED_ARIA_LABEL)).not.toBeInTheDocument();
  });

  it("renders the percentile as an unsigned magnitude (a standing is not a signed delta)", () => {
    render(<BranchPeerCard rank={3} branchCount={20} />); // top 15%
    const card = screen.getByTestId("branch-peer");
    expect(card).toHaveTextContent("15% แรก");
    expect(card.textContent).not.toContain("+15");
  });

  it("degrades honestly when the rank is unknown", () => {
    render(<BranchPeerCard rank={null} branchCount={0} />);
    expect(screen.getByTestId("branch-peer")).toHaveTextContent("ไม่มีข้อมูลอันดับ");
  });
});

describe("BranchProductionCard (SIMULATED)", () => {
  it("shows produced/loss/customers and is badged SIMULATED", () => {
    render(<BranchProductionCard soldM3={1000} nrwPct={20} />);
    const card = screen.getByTestId("branch-production");
    expect(card).toHaveTextContent("ผลิตน้ำ");
    expect(card).toHaveTextContent("ผู้ใช้น้ำ");
    expect(within(card).getByLabelText(SIMULATED_ARIA_LABEL)).toBeInTheDocument();
  });
});

describe("BranchForecastCard (SIMULATED)", () => {
  it("shows a next-month projection and is badged SIMULATED, stating it is not a real model", () => {
    render(<BranchForecastCard m3={1000} momPct={10} />);
    const card = screen.getByTestId("branch-forecast");
    expect(card).toHaveTextContent("คาดการณ์ปริมาณจำหน่าย");
    expect(card).toHaveTextContent("ไม่ใช่แบบจำลองจริง");
    expect(within(card).getByLabelText(SIMULATED_ARIA_LABEL)).toBeInTheDocument();
  });
});
