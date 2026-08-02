/**
 * PR-14 (S6) — the Report Center screen. A proposal-narrative surface with real client-side
 * behaviour and SIMULATED figures: template + filter selection that genuinely SHAPE the preview,
 * honest SIMULATED markers, and the target table's multi-state status. No network is involved.
 *
 * Interaction model (realigned to Stitch S6, which shows a POPULATED preview): the screen LANDS with
 * a generated default report — never an empty configure-first panel. Filter changes are "pending"
 * until ประมวลผลรายงาน applies them to the previewed snapshot, which keeps that button a real action
 * (not inert chrome) and gives every filter change a visible before/after.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SIMULATED_ARIA_LABEL } from "@/components/SimulatedBadge";

import { ReportCenterScreen } from "./ReportCenterScreen";

afterEach(cleanup);

/** Apply the current (pending) filter selection to the previewed report. */
function generate(): void {
  fireEvent.click(screen.getByRole("button", { name: /ประมวลผลรายงาน/ }));
}

const preview = (): HTMLElement => screen.getByTestId("report-preview");

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

  it("lands with a generated default report — no configure-first empty state", () => {
    render(<ReportCenterScreen />);
    expect(preview()).toBeInTheDocument();
    expect(screen.queryByTestId("report-prompt")).not.toBeInTheDocument();
    expect(screen.queryByTestId("report-dirty")).not.toBeInTheDocument();
  });

  it("marks the report SIMULATED and shows a chart and target table on load", () => {
    render(<ReportCenterScreen />);
    expect(within(preview()).getByLabelText(SIMULATED_ARIA_LABEL)).toBeInTheDocument();
    expect(within(preview()).getByTestId("target-table")).toBeInTheDocument();
    expect(within(preview()).getByText("แนวโน้มรายไตรมาส (ล้าน ลบ.ม.)")).toBeInTheDocument();
  });

  it("draws four quarterly bars with the tallest at full height", () => {
    render(<ReportCenterScreen />);
    const bars = screen.getAllByTestId("quarter-bar");
    expect(bars).toHaveLength(4);
    expect(bars.every((b) => /%$/.test(b.style.height))).toBe(true);
    expect(bars.some((b) => b.style.height === "100%")).toBe(true);
  });

  it("holds KPI-type chip changes as pending until ประมวลผลรายงาน applies them", () => {
    render(<ReportCenterScreen />);
    // Default generated selection is volume + nrw → energy tile absent, no pending marker.
    expect(within(preview()).getByTestId("report-kpi-volume")).toBeInTheDocument();
    expect(within(preview()).getByTestId("report-kpi-nrw")).toBeInTheDocument();
    expect(within(preview()).queryByTestId("report-kpi-energy")).not.toBeInTheDocument();

    // Turning a chip on is PENDING — the preview does not change yet, and the marker appears.
    fireEvent.click(screen.getByRole("button", { name: "พลังงาน" }));
    expect(within(preview()).queryByTestId("report-kpi-energy")).not.toBeInTheDocument();
    expect(screen.getByTestId("report-dirty")).toBeInTheDocument();

    // Generating applies it and clears the pending marker.
    generate();
    expect(within(preview()).getByTestId("report-kpi-energy")).toBeInTheDocument();
    expect(screen.queryByTestId("report-dirty")).not.toBeInTheDocument();

    // Turning one off applies the same way.
    fireEvent.click(screen.getByRole("button", { name: "ปริมาณจำหน่าย" }));
    generate();
    expect(within(preview()).queryByTestId("report-kpi-volume")).not.toBeInTheDocument();
  });

  it("holds a level change pending, then reflects it in the report header on generate", () => {
    render(<ReportCenterScreen />);
    expect(within(preview()).getByText(/ระดับองค์กร/)).toBeInTheDocument();

    // Pending: the header keeps the GENERATED level (องค์กร) until ประมวลผลรายงาน — this guards
    // against the preview being wired to the live `level` instead of `generated.level`.
    fireEvent.click(screen.getByRole("radio", { name: "สาขา" }));
    expect(within(preview()).getByText(/ระดับองค์กร/)).toBeInTheDocument();
    expect(within(preview()).queryByText(/ระดับสาขา/)).not.toBeInTheDocument();
    expect(screen.getByTestId("report-dirty")).toBeInTheDocument();

    generate();
    expect(within(preview()).getByText(/ระดับสาขา/)).toBeInTheDocument();
    expect(screen.queryByTestId("report-dirty")).not.toBeInTheDocument();
  });

  it("holds a template change pending, then reflects it in the report header on generate", () => {
    render(<ReportCenterScreen />);
    expect(within(preview()).getByText(/รายงานตามลำดับชั้น/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /รายงานสรุปผู้บริหาร/ }));
    // Pending: preview still shows the generated (hierarchical) template; picker shows the new one.
    expect(within(preview()).getByText(/รายงานตามลำดับชั้น/)).toBeInTheDocument();
    expect(within(preview()).queryByText(/รายงานสรุปผู้บริหาร/)).not.toBeInTheDocument();
    expect(screen.getByTestId("report-dirty")).toBeInTheDocument();

    generate();
    expect(within(preview()).getByText(/รายงานสรุปผู้บริหาร/)).toBeInTheDocument();
  });

  it("resets template, filters and the generated report via สร้างรายงานใหม่", () => {
    render(<ReportCenterScreen />);
    fireEvent.click(screen.getByRole("radio", { name: /รายงานสรุปผู้บริหาร/ }));
    fireEvent.click(screen.getByRole("button", { name: "พลังงาน" })); // turn energy on
    generate();
    expect(within(preview()).getByTestId("report-kpi-energy")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /สร้างรายงานใหม่/ }));

    // Back to the default hierarchical template and default KPIs, with a fresh clean preview.
    expect(screen.getByRole("radio", { name: /รายงานตามลำดับชั้น/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "พลังงาน" })).toHaveAttribute("aria-pressed", "false");
    expect(within(preview()).queryByTestId("report-kpi-energy")).not.toBeInTheDocument();
    expect(within(preview()).getByTestId("report-kpi-volume")).toBeInTheDocument();
    expect(screen.queryByTestId("report-dirty")).not.toBeInTheDocument();
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
