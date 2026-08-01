/**
 * PR-14 (S6) — the Report Center screen. A proposal-narrative surface with real client-side
 * behaviour and SIMULATED figures: template + filter selection that genuinely SHAPE the preview, a
 * generate→preview flow, honest SIMULATED markers, and the target table's multi-state status. No
 * network is involved.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SIMULATED_ARIA_LABEL } from "@/components/SimulatedBadge";

import { ReportCenterScreen } from "./ReportCenterScreen";

afterEach(cleanup);

/** Configure nothing, just generate the default report. */
function generate(): void {
  fireEvent.click(screen.getByRole("button", { name: /ประมวลผลรายงาน/ }));
}

describe("ReportCenterScreen", () => {
  it("renders the heading carrying the nav label synchronously", () => {
    render(<ReportCenterScreen />);
    expect(screen.getByRole("heading", { name: /ศูนย์รายงาน/ })).toBeInTheDocument();
  });

  it("shows the template picker with the default selected", () => {
    render(<ReportCenterScreen />);
    const group = screen.getByRole("radiogroup", { name: "เลือกรูปแบบรายงาน" });
    const checked = within(group).getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveTextContent("รายงานตามลำดับชั้น");
  });

  it("selects a different template and keeps exactly one selected", () => {
    render(<ReportCenterScreen />);
    fireEvent.click(screen.getByRole("radio", { name: /รายงานสรุปผู้บริหาร/ }));
    expect(screen.getByRole("radio", { name: /รายงานสรุปผู้บริหาร/ })).toHaveAttribute("aria-checked", "true");
    const checked = screen.getByRole("radiogroup", { name: "เลือกรูปแบบรายงาน" });
    expect(within(checked).getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
  });

  it("holds the preview behind a generate action, then reveals it", () => {
    render(<ReportCenterScreen />);
    expect(screen.getByTestId("report-prompt")).toBeInTheDocument();
    expect(screen.queryByTestId("report-preview")).not.toBeInTheDocument();
    generate();
    expect(screen.getByTestId("report-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("report-prompt")).not.toBeInTheDocument();
  });

  it("marks the generated report SIMULATED and shows a chart and target table", () => {
    render(<ReportCenterScreen />);
    generate();
    const preview = screen.getByTestId("report-preview");
    expect(within(preview).getByLabelText(SIMULATED_ARIA_LABEL)).toBeInTheDocument();
    expect(within(preview).getByTestId("target-table")).toBeInTheDocument();
    expect(within(preview).getByText("แนวโน้มรายไตรมาส (ล้าน ลบ.ม.)")).toBeInTheDocument();
  });

  it("draws four quarterly bars with the tallest at full height", () => {
    render(<ReportCenterScreen />);
    generate();
    const bars = screen.getAllByTestId("quarter-bar");
    expect(bars).toHaveLength(4);
    expect(bars.every((b) => /%$/.test(b.style.height))).toBe(true);
    expect(bars.some((b) => b.style.height === "100%")).toBe(true);
  });

  it("lets the KPI-type chips actually drive which KPI tiles the preview shows", () => {
    render(<ReportCenterScreen />);
    generate();
    const preview = screen.getByTestId("report-preview");
    // Default selection is volume + nrw → energy tile is absent until its chip is turned on.
    expect(within(preview).getByTestId("report-kpi-volume")).toBeInTheDocument();
    expect(within(preview).getByTestId("report-kpi-nrw")).toBeInTheDocument();
    expect(within(preview).queryByTestId("report-kpi-energy")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "พลังงาน" }));
    expect(within(screen.getByTestId("report-preview")).getByTestId("report-kpi-energy")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ปริมาณจำหน่าย" }));
    expect(within(screen.getByTestId("report-preview")).queryByTestId("report-kpi-volume")).not.toBeInTheDocument();
  });

  it("reflects the chosen level in the generated report header", () => {
    render(<ReportCenterScreen />);
    generate();
    expect(within(screen.getByTestId("report-preview")).getByText(/ระดับองค์กร/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "สาขา" }));
    expect(within(screen.getByTestId("report-preview")).getByText(/ระดับสาขา/)).toBeInTheDocument();
  });

  it("resets template, filters and preview via สร้างรายงานใหม่", () => {
    render(<ReportCenterScreen />);
    fireEvent.click(screen.getByRole("radio", { name: /รายงานสรุปผู้บริหาร/ }));
    fireEvent.click(screen.getByRole("button", { name: "พลังงาน" })); // turn energy on
    generate();
    expect(screen.getByTestId("report-preview")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /สร้างรายงานใหม่/ }));

    expect(screen.getByTestId("report-prompt")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /รายงานตามลำดับชั้น/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "พลังงาน" })).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles a KPI-type filter chip both ways", () => {
    render(<ReportCenterScreen />);
    const volume = screen.getByRole("button", { name: "ปริมาณจำหน่าย" });
    expect(volume).toHaveAttribute("aria-pressed", "true"); // default on
    fireEvent.click(volume);
    expect(volume).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(volume);
    expect(volume).toHaveAttribute("aria-pressed", "true");
  });

  it("states in the footer that the report is simulated, not real PWA data", () => {
    render(<ReportCenterScreen />);
    expect(screen.getByText(/ไม่ใช่ข้อมูลจริงของ กปภ\./)).toBeInTheDocument();
  });
});
