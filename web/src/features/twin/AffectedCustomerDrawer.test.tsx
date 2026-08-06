import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AffectedCustomerDrawer } from "./AffectedCustomerDrawer";
import fixture from "./__fixtures__/mtp-contract.json";
import type { DemoCustomerDetail, ImpactResponse } from "./types";

afterEach(cleanup);

const impact = fixture.impact as ImpactResponse;
const detail = fixture.detail as DemoCustomerDetail;

function open(props: Partial<React.ComponentProps<typeof AffectedCustomerDrawer>> = {}) {
  return render(
    <AffectedCustomerDrawer
      impact={impact}
      open={true}
      onClose={vi.fn()}
      selectedCustomerId={null}
      detail={null}
      detailLoading={false}
      onSelectCustomer={vi.fn()}
      {...props}
    />,
  );
}

describe("AffectedCustomerDrawer (R5/R6/R8)", () => {
  it("T4a: header shows exactly 200, a SIMULATED IMPACT badge, the zone, and 140/35/25", () => {
    open();
    const header = screen.getByTestId("impact-drawer-header");
    expect(within(header).getByTestId("impact-count").textContent).toContain("200");
    expect(within(header).getByText(/SIMULATED IMPACT/i)).toBeTruthy();
    expect(header.textContent).toContain("MTP-LPZ-01");
    const bd = within(header).getByTestId("type-breakdown").textContent ?? "";
    expect(bd).toContain("140");
    expect(bd).toContain("35");
    expect(bd).toContain("25");
  });

  it("T4a2: closed → renders nothing", () => {
    const { container } = render(
      <AffectedCustomerDrawer
        impact={impact}
        open={false}
        onClose={vi.fn()}
        selectedCustomerId={null}
        detail={null}
        detailLoading={false}
        onSelectCustomer={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("T4b: page 1 shows 25 rows and the pager reports 8 pages", () => {
    open();
    expect(screen.getAllByTestId("customer-row")).toHaveLength(25);
    expect(screen.getByTestId("pager").textContent).toMatch(/8/);
  });

  it("T4c: Next advances to page 2 with a different first row", () => {
    open();
    const first1 = screen.getAllByTestId("customer-row")[0].textContent;
    fireEvent.click(screen.getByTestId("customer-next"));
    const first2 = screen.getAllByTestId("customer-row")[0].textContent;
    expect(first2).not.toBe(first1);
  });

  it("T4b2: can reach page 8 (the last)", () => {
    open();
    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByTestId("customer-next"));
    expect(screen.getByTestId("customer-next")).toBeDisabled();
    expect(screen.getAllByTestId("customer-row")).toHaveLength(25);
  });

  it("T4d: filtering to type 1 keeps the 200 headline AND every visible row is type 1", () => {
    open();
    fireEvent.click(screen.getByTestId("filter-type-1"));
    // headline count is the INCIDENT total — invariant under filtering
    expect(screen.getByTestId("impact-count").textContent).toContain("200");
    // every visible row is the filtered type (label "ที่อยู่อาศัย")
    for (const row of screen.getAllByTestId("customer-row")) {
      expect(row.textContent).toMatch(/ที่อยู่อาศัย/);
    }
    // 140 of type 1 → 6 pages
    expect(screen.getByTestId("pager").textContent).toMatch(/6/);
  });

  it("T4d2: changing the filter resets to page 1", () => {
    open();
    fireEvent.click(screen.getByTestId("customer-next")); // page 2
    fireEvent.click(screen.getByTestId("filter-type-2"));
    expect(screen.getByTestId("pager").textContent).toMatch(/1/);
  });

  it("each row's accessible control is a real <button> (not a role-overridden <tr>)", () => {
    open();
    const first = screen.getAllByTestId("customer-select")[0];
    expect(first.tagName).toBe("BUTTON");
    expect(screen.getAllByTestId("customer-row")[0].tagName).toBe("TR"); // row semantics preserved
  });

  it("clicking a row's select button calls onSelectCustomer with its id", () => {
    const onSelectCustomer = vi.fn();
    open({ onSelectCustomer });
    fireEvent.click(screen.getAllByTestId("customer-select")[0]);
    expect(onSelectCustomer).toHaveBeenCalledWith("SIM-MTP-00001");
  });

  it("T4b3 (R8): Previous is disabled on page 1 and Next enabled", () => {
    open();
    expect(screen.getByTestId("customer-prev")).toBeDisabled();
    expect(screen.getByTestId("customer-next")).not.toBeDisabled();
  });

  it("renders the detail panel + 12 readings when a customer is selected", () => {
    open({ selectedCustomerId: detail.customer_id, detail });
    expect(screen.getByTestId("customer-detail")).toBeTruthy();
    expect(screen.getAllByTestId("meter-reading-row")).toHaveLength(12);
  });
});

describe("AffectedCustomerDrawer focus + keyboard (R24)", () => {
  it("T4e: is a modal dialog; Esc calls onClose", () => {
    const onClose = vi.fn();
    open({ onClose });
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("T4e2: on open focus moves into the dialog; on close it returns to the trigger", () => {
    function Harness() {
      const [isOpen, setOpen] = useState(false);
      return (
        <>
          <button data-testid="trigger" onClick={() => setOpen(true)}>
            open
          </button>
          <AffectedCustomerDrawer
            impact={impact}
            open={isOpen}
            onClose={() => setOpen(false)}
            selectedCustomerId={null}
            detail={null}
            detailLoading={false}
            onSelectCustomer={vi.fn()}
          />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.click(trigger); // opens; drawer captures the trigger as the return target
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true); // focus moved into the dialog
    fireEvent.keyDown(dialog, { key: "Escape" }); // closes
    expect(document.activeElement).toBe(trigger); // focus restored to the trigger
  });

  it("T4e3: Tab is trapped — from the last focusable it wraps to the first, and shift+Tab reverses", () => {
    open();
    const dialog = screen.getByRole("dialog");
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    // The trap must include the 25 row-select buttons (and the close + filter chips) — a query
    // that missed the row controls would leave the table unreachable by keyboard.
    const selectButtons = [...focusables].filter((el) => el.getAttribute("data-testid") === "customer-select");
    expect(selectButtons).toHaveLength(25);
    expect(focusables.length).toBeGreaterThan(25);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first); // wrapped forward
    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last); // wrapped backward
  });
});
