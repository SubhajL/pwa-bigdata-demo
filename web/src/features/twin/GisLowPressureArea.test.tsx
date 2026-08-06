import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import fixture from "./__fixtures__/mtp-contract.json";
import { GisLowPressureArea } from "./GisLowPressureArea";
import type { ImpactResponse } from "./types";

afterEach(cleanup);

const enriched = fixture.impact as ImpactResponse;
const basic: ImpactResponse = { ...enriched, zone: null, type_breakdown: null };

describe("GisLowPressureArea (R3)", () => {
  it("T2a: is a button whose accessible name carries the count and 'จำลอง' in TEXT", () => {
    render(<GisLowPressureArea impact={enriched} onOpen={vi.fn()} />);
    const area = screen.getByTestId("low-pressure-area");
    expect(area.tagName).toBe("BUTTON"); // native button → Enter/Space are native
    const name = area.getAttribute("aria-label") ?? "";
    expect(name).toContain("200");
    expect(name).toContain("จำลอง");
    expect(name).toContain("MTP-LPZ-01");
  });

  it("T2b: the footprint is encoded by a PATTERN + text + SIMULATED badge, not colour alone", () => {
    const { container } = render(<GisLowPressureArea impact={enriched} onOpen={vi.fn()} />);
    // A visible shape must reference a defined SVG <pattern> (a colour-only `fill="#…"` would
    // fail the url(#…) match below — this is the non-colour proof).
    const fills = [...container.querySelectorAll("[fill]")].map((n) => n.getAttribute("fill") ?? "");
    const patternRef = fills.find((f) => /^url\(#(.+)\)$/.test(f));
    expect(patternRef, "a shape must be filled by a pattern, not a solid colour").toBeTruthy();
    const patternId = patternRef!.replace(/^url\(#|\)$/g, "");
    expect(container.querySelector(`pattern#${patternId}`)).not.toBeNull();
    // Plus a Lucide icon, a Thai text label, and the SIMULATED marker (secondary, non-colour).
    const area = screen.getByTestId("low-pressure-area");
    expect(area.querySelector("svg[class*='lucide-']")).not.toBeNull(); // the icon (R3)
    expect(within(area).getByText(/พื้นที่แรงดันต่ำ/)).toBeTruthy();
    expect(within(area).getByText("SIMULATED")).toBeTruthy();
  });

  it("T2c: clicking fires onOpen", () => {
    const onOpen = vi.fn();
    render(<GisLowPressureArea impact={enriched} onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId("low-pressure-area"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("T2d: renders nothing when the impact has no enriched zone (basic mode)", () => {
    const { container } = render(<GisLowPressureArea impact={basic} onOpen={vi.fn()} />);
    expect(container.querySelector('[data-testid="low-pressure-area"]')).toBeNull();
  });

  it("T2d2: renders nothing when impact is null", () => {
    const { container } = render(<GisLowPressureArea impact={null} onOpen={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
