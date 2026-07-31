/**
 * Predictive components (PR-9 S9-D). Pure-prop components render offline; only FeedbackPanel's
 * network is mocked. Asserts the honesty model (SimulatedBadge on every model-derived card),
 * status-not-colour-alone (StatusChip), one-axis RCA bars, and that REAL API values render.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Keep the pure reducers real; only stub the feedback POST (used by FeedbackPanel via useFeedback).
vi.mock("./predictiveClient", async (importActual) => {
  const actual = await importActual<typeof import("./predictiveClient")>();
  return { ...actual, submitFeedback: vi.fn() };
});
import { submitFeedback } from "./predictiveClient";

import { DatasetCompare } from "./DatasetCompare";
import { HealthMeter } from "./HealthMeter";
import { KpiRow } from "./KpiRow";
import { ModelCard } from "./ModelCard";
import { RcaPanel } from "./RcaPanel";
import { WorklistTable } from "./WorklistTable";
import { FeedbackPanel } from "./FeedbackPanel";
import type { DatasetScore, ModelCardResponse, RcaResponse, WorklistItem } from "./types";

function wItem(over: Partial<WorklistItem>): WorklistItem {
  return {
    rank: 1, asset_id: "P-2", branch: "สมุทรสาคร", health_score: 30, pttf_hours: 0,
    status: "critical", model_version: "v1", scored_at: "2026-07-31T00:00:00Z", simulated: true, ...over,
  };
}

const CARD: ModelCardResponse = {
  model_version: "pwa-health-pttf-v1",
  pipelines: {
    health: { estimator_class: "Ridge", hyperparameters: { alpha: 1.0, solver: "auto" }, target: "h", units: "0-100", preprocessing: ["StandardScaler"] },
    pttf: { estimator_class: "Ridge", hyperparameters: { alpha: 1.0 }, target: "p", units: "hours", preprocessing: ["StandardScaler"] },
  },
  metrics: { health: { model_mae: 0.15, baseline_mae: 17.02 }, pttf: { model_mae: 30.9, baseline_mae: 102.0 } },
  data_sha256: "b847664d4ab11777c0ffee", created_from: {}, censoring: {}, limitations: ["synthetic wear model"],
  datasets: [
    { name: "healthy", lifecycle_id: "lc-0", health_score: 99.5, pttf_hours: 527.4, pttf_out_of_range: true, status: "normal" },
    { name: "degraded", lifecycle_id: "lc-9", health_score: 30.1, pttf_hours: 0, pttf_out_of_range: false, status: "critical" },
  ],
  simulated: true,
};

describe("HealthMeter", () => {
  it("renders the value and an em-dash for null (nodata)", () => {
    const { rerender } = render(<HealthMeter value={30} status="critical" />);
    expect(screen.getByText("30")).toBeInTheDocument();
    rerender(<HealthMeter value={null} status="nodata" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("KpiRow", () => {
  it("derives at-risk and average health from the worklist, badged SIMULATED", () => {
    const items = [wItem({ status: "critical", health_score: 30 }), wItem({ asset_id: "P-7", status: "normal", health_score: 90 })];
    render(<KpiRow items={items} modelVersion="pwa-health-pttf-v1" />);
    expect(within(screen.getByTestId("kpi-atrisk")).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByTestId("kpi-avghealth")).getByText("60.0")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-model")).toHaveTextContent("pwa-health-pttf-v1");
    // The at-risk caption is derived from config, not hardcoded (drift would make it lie).
    expect(within(screen.getByTestId("kpi-atrisk")).getByText("Health < 65")).toBeInTheDocument();
    // The three model-derived tiles each carry a badge; the model-version tile (metadata) does not.
    expect(screen.getAllByText("SIMULATED")).toHaveLength(3);
    expect(within(screen.getByTestId("kpi-model")).queryByText("SIMULATED")).not.toBeInTheDocument();
  });
});

describe("WorklistTable", () => {
  it("shows a status chip (icon + Thai label) per row and selects on asset click", () => {
    const onSelect = vi.fn();
    const items = [wItem({ asset_id: "P-2", status: "critical" }), wItem({ asset_id: "P-7", rank: 2, status: "warning" })];
    render(<WorklistTable items={items} selected="P-2" onSelect={onSelect} />);
    expect(screen.getByText("วิกฤต")).toBeInTheDocument(); // critical label — not colour alone
    expect(screen.getByText("เฝ้าระวัง")).toBeInTheDocument(); // warning label
    // Each row's status is icon + label, never colour alone: the icon lives INSIDE that row.
    expect(screen.getByTestId("worklist-row-P-2").querySelector('[data-icon="critical"]')).toBeInTheDocument();
    expect(screen.getByTestId("worklist-row-P-7").querySelector('[data-icon="warning"]')).toBeInTheDocument();
    expect(within(screen.getByTestId("worklist")).getByText("SIMULATED")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "P-7" }));
    expect(onSelect).toHaveBeenCalledWith("P-7");
  });
});

describe("RcaPanel", () => {
  it("renders one bar per contribution with a signal label; empty shows a message", () => {
    const rca: RcaResponse = {
      asset_id: "P-2", model_version: "v1", observed_at: null, simulated: true, detail: null,
      contributions: [{ signal: "vibration", contribution: 0.34 }, { signal: "pressure_bar", contribution: 0.12 }],
    };
    const { rerender } = render(<RcaPanel asset="P-2" rca={rca} />);
    expect(screen.getByText(/Vibration/)).toBeInTheDocument();
    expect(screen.getByText("0.34")).toBeInTheDocument();
    // One bar per contribution — dropping a contribution must fail this, not slip through.
    expect(within(screen.getByTestId("rca-panel")).getAllByRole("listitem")).toHaveLength(2);
    expect(within(screen.getByTestId("rca-panel")).getByText("SIMULATED")).toBeInTheDocument();
    rerender(<RcaPanel asset={null} rca={null} />);
    expect(screen.getByText(/เลือกอุปกรณ์/)).toBeInTheDocument();
  });
});

describe("ModelCard", () => {
  it("shows the REAL algorithm, a hyperparameter and MAE beating the baseline (item 3.1)", () => {
    render(<ModelCard card={CARD} />);
    const card = screen.getByTestId("model-card");
    expect(card).toHaveTextContent("Ridge");
    expect(card).toHaveTextContent("alpha: 1");
    expect(card).toHaveTextContent("StandardScaler");
    expect(card).toHaveTextContent("0.15"); // model_mae < baseline_mae (17.02)
    expect(card).toHaveTextContent("17.0");
    expect(within(card).getByText("SIMULATED")).toBeInTheDocument();
  });

  it("distinguishes loading from unavailable when there is no card", () => {
    const { rerender } = render(<ModelCard card={null} loading />);
    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
    rerender(<ModelCard card={null} loading={false} />);
    expect(screen.getByText(/ไม่พบข้อมูลแบบจำลอง/)).toBeInTheDocument();
  });
});

describe("DatasetCompare", () => {
  it("shows healthy vs degraded differing, with a ≥ on the censored PTTF (item 3.2)", () => {
    render(<DatasetCompare datasets={CARD.datasets as DatasetScore[]} />);
    expect(within(screen.getByTestId("dataset-healthy")).getByText("100")).toBeInTheDocument(); // Num rounds 99.5
    expect(within(screen.getByTestId("dataset-degraded")).getByText("30")).toBeInTheDocument();
    expect(screen.getByText(/≥/)).toBeInTheDocument(); // healthy PTTF is out-of-range (visual)
    // …and screen readers hear "at least", not an exact value (a11y for the censored bound).
    expect(screen.getByText("อย่างน้อย")).toBeInTheDocument();
    expect(within(screen.getByTestId("dataset-compare")).getByText("SIMULATED")).toBeInTheDocument();
  });
});

describe("FeedbackPanel", () => {
  it("offers exactly the four verdicts, a Swagger link, and disables submit with no device", () => {
    render(<FeedbackPanel asset={null} />);
    const options = within(screen.getByRole("combobox")).getAllByRole("option");
    expect(options).toHaveLength(4);
    expect(screen.getByRole("link", { name: /Swagger/ })).toHaveAttribute("href", "/docs");
    expect(screen.getByRole("button", { name: /ส่งผลการตรวจสอบ/ })).toBeDisabled();
  });

  it("submits for the given device and shows the persisted ack LABELLED with its asset_id", async () => {
    vi.mocked(submitFeedback).mockResolvedValue({
      id: 42, asset_id: "P-2", verdict: "confirmed", created_at: "2026-07-31T01:00:00Z", stored: true,
    });
    render(<FeedbackPanel asset="P-2" />);
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: /ส่งผลการตรวจสอบ/ }).closest("form")!); });
    expect(vi.mocked(submitFeedback)).toHaveBeenCalledWith(
      expect.objectContaining({ asset_id: "P-2", verdict: "confirmed" }),
    );
    const ack = screen.getByTestId("feedback-ack");
    expect(ack).toHaveTextContent("P-2"); // the ack names the device it belongs to
    expect(ack).toHaveTextContent("#42");
  });
});
