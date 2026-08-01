/**
 * PR-15 (S7) — the Alert Center screen. A proposal-narrative surface with SIMULATED data and REAL
 * interactions: acknowledging an alert removes it and moves the counts, the severity filter drives the
 * feed, and the rule switches toggle. No network is involved.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SIMULATED_ARIA_LABEL } from "@/components/SimulatedBadge";
import { BASE_COUNTS } from "@/features/alerts/alerts.config";

import { AlertCenterScreen } from "./AlertCenterScreen";

afterEach(cleanup);

function tileCount(key: string): string {
  return screen.getByTestId(`alert-tile-${key}`).textContent ?? "";
}

describe("AlertCenterScreen", () => {
  it("renders the heading carrying the nav label synchronously", () => {
    render(<AlertCenterScreen />);
    expect(screen.getByRole("heading", { name: /ศูนย์แจ้งเตือน/ })).toBeInTheDocument();
  });

  it("carries a visible SIMULATED honesty marker", () => {
    render(<AlertCenterScreen />);
    expect(screen.getAllByLabelText(SIMULATED_ARIA_LABEL).length).toBeGreaterThanOrEqual(1);
  });

  it("shows the four summary tiles seeded from the base counts", () => {
    render(<AlertCenterScreen />);
    expect(tileCount("critical")).toContain(String(BASE_COUNTS.critical));
    expect(tileCount("acknowledged")).toContain(String(BASE_COUNTS.acknowledged));
  });

  it("acknowledges an alert: it leaves the feed and the counts move", () => {
    render(<AlertCenterScreen />);
    expect(screen.getByTestId("alert-a1")).toBeInTheDocument(); // a1 is critical
    fireEvent.click(within(screen.getByTestId("alert-a1")).getByRole("button", { name: "รับทราบ" }));
    expect(screen.queryByTestId("alert-a1")).not.toBeInTheDocument();
    expect(tileCount("critical")).toContain(String(BASE_COUNTS.critical - 1));
    expect(tileCount("acknowledged")).toContain(String(BASE_COUNTS.acknowledged + 1));
  });

  it("filters the feed by severity", () => {
    render(<AlertCenterScreen />);
    fireEvent.click(screen.getByRole("radio", { name: "เฝ้าระวัง" }));
    // a3 is the only warning; the two critical alerts must be hidden.
    expect(screen.getByTestId("alert-a3")).toBeInTheDocument();
    expect(screen.queryByTestId("alert-a1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("alert-a2")).not.toBeInTheDocument();
  });

  it("shows an empty state when a filter matches no active alert", () => {
    render(<AlertCenterScreen />);
    // Acknowledge the sole warning, then filter to warnings.
    fireEvent.click(within(screen.getByTestId("alert-a3")).getByRole("button", { name: "รับทราบ" }));
    fireEvent.click(screen.getByRole("radio", { name: "เฝ้าระวัง" }));
    expect(screen.getByTestId("alert-feed-empty")).toBeInTheDocument();
  });

  it("toggles an alert rule switch", () => {
    render(<AlertCenterScreen />);
    const switches = screen.getAllByRole("switch");
    expect(switches[0]).toHaveAttribute("aria-checked", "true"); // defaults on
    fireEvent.click(switches[0]);
    expect(switches[0]).toHaveAttribute("aria-checked", "false");
  });

  it("states in the footer that the alerts are simulated, not real", () => {
    render(<AlertCenterScreen />);
    expect(screen.getByText(/ไม่ใช่การแจ้งเตือนจริงของ กปภ\./)).toBeInTheDocument();
  });
});
