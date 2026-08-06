import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomerDetailPanel } from "./CustomerDetailPanel";
import fixture from "./__fixtures__/mtp-contract.json";
import { MonthlyMeterReadings } from "./MonthlyMeterReadings";
import type { DemoCustomerDetail } from "./types";

afterEach(cleanup);

const detail = fixture.detail as DemoCustomerDetail;

describe("CustomerDetailPanel (R9)", () => {
  it("T5a: renders every requested synthetic field", () => {
    render(<CustomerDetailPanel detail={detail} loading={false} />);
    const panel = screen.getByTestId("customer-detail");
    const text = panel.textContent ?? "";
    expect(text).toContain(detail.customer_id);
    expect(text).toContain(detail.account_no);
    expect(text).toContain(detail.meter_no);
    expect(text).toContain(detail.meter_size);
    expect(text).toContain(detail.pressure_zone_id);
    expect(text).toContain(detail.address_label);
    expect(text).toContain(detail.area);
    expect(text).toContain(detail.branch);
    // type + subtype rendered as a label (the official top-level label + subtype code)
    expect(text).toContain("ที่อยู่อาศัย"); // detail.type_code === 1
    expect(text).toContain(String(detail.subtype_code));
  });

  it("T5b: the whole card carries a SIMULATED marker", () => {
    render(<CustomerDetailPanel detail={detail} loading={false} />);
    expect(within(screen.getByTestId("customer-detail")).getByText("SIMULATED")).toBeTruthy();
  });

  it("T5b2: loading shows a placeholder, null shows nothing selected", () => {
    const { rerender } = render(<CustomerDetailPanel detail={null} loading={true} />);
    expect(screen.getByTestId("customer-detail").textContent).toMatch(/กำลังโหลด/);
    rerender(<CustomerDetailPanel detail={null} loading={false} />);
    expect(screen.getByTestId("customer-detail").textContent).toMatch(/เลือก/);
  });

  it("T5e (R21): a settled FAILURE shows an error + retry, never a permanent spinner", () => {
    const onRetry = vi.fn();
    render(<CustomerDetailPanel detail={null} loading={false} error={true} onRetry={onRetry} />);
    const panel = screen.getByTestId("customer-detail");
    expect(within(panel).getByTestId("customer-detail-error")).toBeTruthy();
    expect(panel.textContent).not.toMatch(/กำลังโหลด/); // NOT the loading state
    fireEvent.click(within(panel).getByTestId("customer-detail-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("MonthlyMeterReadings (R10)", () => {
  it("T5c: renders exactly 12 rows and usage = reading − previous for every visible row", () => {
    render(<MonthlyMeterReadings readings={detail.readings} />);
    const rows = screen.getAllByTestId("meter-reading-row");
    expect(rows).toHaveLength(12);
    for (const r of rows) {
      const cells = within(r).getAllByRole("cell");
      // cells: period, previous, reading, usage (in that column order)
      const previous = Number(cells[1].textContent);
      const reading = Number(cells[2].textContent);
      const usage = Number(cells[3].textContent);
      expect(usage).toBe(reading - previous);
    }
  });

  it("T5c2: it is a semantic table with a SimulatedBadge header", () => {
    render(<MonthlyMeterReadings readings={detail.readings} />);
    const table = screen.getByTestId("meter-readings");
    expect(table.querySelector("table")).not.toBeNull();
    expect(within(table).getByText("SIMULATED")).toBeTruthy();
  });
});

describe("AffectedCustomerDrawer detail supersession (R21 — no stale readings)", () => {
  it("T5d: while a NEW customer's detail loads, the PREVIOUS customer's readings are hidden", async () => {
    const { AffectedCustomerDrawer } = await import("./AffectedCustomerDrawer");
    const impact = fixture.impact as import("./types").ImpactResponse;
    // detailLoading=true (a newer selection is loading) but `detail` still holds the OLD customer.
    render(
      <AffectedCustomerDrawer
        impact={impact}
        open={true}
        onClose={() => {}}
        selectedCustomerId="SIM-MTP-00002"
        detail={detail} /* still customer 00001 */
        detailLoading={true}
        onSelectCustomer={() => {}}
      />,
    );
    // The detail card shows loading, and the stale 00001 readings must NOT be rendered.
    expect(screen.getByTestId("customer-detail").textContent).toMatch(/กำลังโหลด/);
    expect(screen.queryAllByTestId("meter-reading-row")).toHaveLength(0);
  });

  it("T5d2: once the loaded detail matches the selection, its 12 readings render", async () => {
    const { AffectedCustomerDrawer } = await import("./AffectedCustomerDrawer");
    const impact = fixture.impact as import("./types").ImpactResponse;
    render(
      <AffectedCustomerDrawer
        impact={impact}
        open={true}
        onClose={() => {}}
        selectedCustomerId={detail.customer_id}
        detail={detail}
        detailLoading={false}
        onSelectCustomer={() => {}}
      />,
    );
    expect(screen.getAllByTestId("meter-reading-row")).toHaveLength(12);
  });
});
