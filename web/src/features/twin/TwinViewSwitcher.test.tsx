/**
 * PR-R3 finding 8 (LOW) — the twin view switcher is an ARIA tablist, so it must honour
 * the WAI-ARIA keyboard pattern: roving tabIndex, Arrow keys to move between tabs
 * (wrapping), and Home/End to jump to the ends. Click activation is covered by the
 * screen/e2e suites.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { TwinViewSwitcher } from "./TwinViewSwitcher";
import type { TwinView } from "./types";

function Harness(): JSX.Element {
  const [view, setView] = useState<TwinView>("logical");
  return <TwinViewSwitcher view={view} onChange={setView} />;
}

describe("TwinViewSwitcher keyboard pattern", () => {
  it("roving tabIndex: only the selected tab is in the tab sequence", () => {
    render(<Harness />);
    const [logical, gis] = screen.getAllByRole("tab");
    expect(logical).toHaveAttribute("tabindex", "0");
    expect(gis).toHaveAttribute("tabindex", "-1");
  });

  it("declares horizontal orientation and wires each tab to its panel", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "horizontal");
    const [logical, gis] = screen.getAllByRole("tab");
    expect(logical).toHaveAttribute("id", "twin-tab-logical");
    expect(logical).toHaveAttribute("aria-controls", "twin-panel-logical");
    expect(gis).toHaveAttribute("id", "twin-tab-gis");
    expect(gis).toHaveAttribute("aria-controls", "twin-panel-gis");
  });

  it("ArrowRight moves selection to the next tab and focuses it", () => {
    render(<Harness />);
    const [logical, gis] = screen.getAllByRole("tab");
    logical.focus();
    fireEvent.keyDown(logical, { key: "ArrowRight" });
    expect(gis).toHaveAttribute("aria-selected", "true");
    expect(gis).toHaveFocus();
    expect(gis).toHaveAttribute("tabindex", "0");
    expect(logical).toHaveAttribute("tabindex", "-1");
  });

  it("ArrowLeft moves back to the previous tab", () => {
    render(<Harness />);
    const [logical, gis] = screen.getAllByRole("tab");
    logical.focus();
    fireEvent.keyDown(logical, { key: "ArrowRight" });
    fireEvent.keyDown(gis, { key: "ArrowLeft" });
    expect(logical).toHaveAttribute("aria-selected", "true");
    expect(logical).toHaveFocus();
  });

  it("ArrowRight on the last tab wraps to the first", () => {
    render(<Harness />);
    const [logical, gis] = screen.getAllByRole("tab");
    logical.focus();
    fireEvent.keyDown(logical, { key: "ArrowRight" }); // -> gis (last)
    fireEvent.keyDown(gis, { key: "ArrowRight" }); // wraps -> logical
    expect(logical).toHaveAttribute("aria-selected", "true");
    expect(logical).toHaveFocus();
  });

  it("Home selects the first tab and End the last", () => {
    render(<Harness />);
    const [logical, gis] = screen.getAllByRole("tab");
    logical.focus();
    fireEvent.keyDown(logical, { key: "End" });
    expect(gis).toHaveAttribute("aria-selected", "true");
    expect(gis).toHaveFocus();
    fireEvent.keyDown(gis, { key: "Home" });
    expect(logical).toHaveAttribute("aria-selected", "true");
    expect(logical).toHaveFocus();
  });
});
