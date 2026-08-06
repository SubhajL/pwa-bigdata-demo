import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import fixture from "./__fixtures__/mtp-contract.json";
import { ImpactPanel } from "./ImpactPanel";
import type { ImpactResponse } from "./types";

afterEach(cleanup);

const enriched = fixture.impact as ImpactResponse;
const basic: ImpactResponse = { ...enriched, zone: null, type_breakdown: null };

describe("ImpactPanel enriched (R4)", () => {
  it("T3a: renders the 140/35/25 breakdown with the three distinct type labels", () => {
    render(<ImpactPanel impact={enriched} loading={false} onOpenDrawer={vi.fn()} />);
    const breakdown = screen.getByTestId("type-breakdown");
    expect(within(breakdown).getByText(/ที่อยู่อาศัย/)).toBeTruthy();
    expect(within(breakdown).getByText(/ราชการ/)).toBeTruthy();
    expect(within(breakdown).getByText(/รัฐวิสาหกิจ/)).toBeTruthy();
    const text = breakdown.textContent ?? "";
    expect(text).toContain("140");
    expect(text).toContain("35");
    expect(text).toContain("25");
  });

  it("T3b: shows the zone id", () => {
    render(<ImpactPanel impact={enriched} loading={false} onOpenDrawer={vi.fn()} />);
    expect(screen.getByText(/MTP-LPZ-01/)).toBeTruthy();
  });

  it("T3c: the open-drawer trigger calls onOpenDrawer", () => {
    const onOpenDrawer = vi.fn();
    render(<ImpactPanel impact={enriched} loading={false} onOpenDrawer={onOpenDrawer} />);
    fireEvent.click(screen.getByTestId("open-impact-drawer"));
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it("T3c2: the low-pressure-area footprint also opens the drawer", () => {
    const onOpenDrawer = vi.fn();
    render(<ImpactPanel impact={enriched} loading={false} onOpenDrawer={onOpenDrawer} />);
    fireEvent.click(screen.getByTestId("low-pressure-area"));
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it("T3e (H8): keeps the impact-customer list in ENRICHED mode (no regression)", () => {
    render(<ImpactPanel impact={enriched} loading={false} onOpenDrawer={vi.fn()} />);
    expect(screen.getAllByTestId("impact-customer").length).toBeGreaterThan(0);
    expect(screen.getByText("SIM-MTP-00001")).toBeTruthy();
  });
});

describe("ImpactPanel basic mode (R4 no-regression)", () => {
  it("T3d: basic impact shows count + impact-customer list but NO breakdown/footprint", () => {
    render(<ImpactPanel impact={basic} loading={false} onOpenDrawer={vi.fn()} />);
    expect(screen.getAllByTestId("impact-customer").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("type-breakdown")).toBeNull();
    expect(screen.queryByTestId("low-pressure-area")).toBeNull();
    expect(screen.queryByTestId("open-impact-drawer")).toBeNull();
  });

  it("T3d2: null impact shows the no-incident message", () => {
    render(<ImpactPanel impact={null} loading={false} onOpenDrawer={vi.fn()} />);
    expect(screen.getByText("ไม่มีเหตุแรงดันตกในขณะนี้")).toBeTruthy();
  });

  it("T3d3: onOpenDrawer is optional (renders without it)", () => {
    expect(() => render(<ImpactPanel impact={enriched} loading={false} />)).not.toThrow();
  });
});
