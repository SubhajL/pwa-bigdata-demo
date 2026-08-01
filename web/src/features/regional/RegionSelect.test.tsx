/**
 * Drill-down landing fix — the shared เขต selector. Offers all 10 regions and reports the chosen one
 * as a number (so the URL/state stay numeric).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RegionSelect } from "./RegionSelect";

afterEach(cleanup);

describe("RegionSelect", () => {
  it("offers เขต 1–10 and reflects the current value", () => {
    render(<RegionSelect region={3} onChange={() => {}} />);
    const select = screen.getByRole("combobox", { name: "เลือกเขต" });
    expect(select).toHaveValue("3");
    expect(screen.getAllByRole("option")).toHaveLength(10);
  });

  it("reports the chosen region as a number", () => {
    const onChange = vi.fn();
    render(<RegionSelect region={1} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "เลือกเขต" }), { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith(7);
  });
});
