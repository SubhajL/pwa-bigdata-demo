/**
 * PR-13 (S5) — the System Admin screen. It carries no real data, so the tests assert the
 * proposal-narrative behaviour: a synchronous heading, the RBAC roster, the SIMULATED
 * honesty markers, working tab switching, and the honest "designed, not built" note on the
 * non-users tabs. No network is involved.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SIMULATED_ARIA_LABEL } from "@/components/SimulatedBadge";
import { SIM_ROSTER, SSO_NOTE_TH } from "@/features/admin/admin";

import { SystemAdminScreen } from "./SystemAdminScreen";

afterEach(cleanup);

describe("SystemAdminScreen", () => {
  it("renders the heading carrying the nav label synchronously", () => {
    render(<SystemAdminScreen />);
    expect(screen.getByRole("heading", { name: /ผู้ดูแลระบบ/ })).toBeInTheDocument();
  });

  it("marks the simulated roster card AND keeps a footer marker on every tab", () => {
    render(<SystemAdminScreen />);
    // The badge must sit on the roster card itself (whole card is simulated) — asserting a
    // mere global count would still pass if this one were deleted and only the footer's
    // remained, so scope the first assertion to the card.
    const card = screen.getByTestId("users-roles");
    expect(within(card).getByLabelText(SIMULATED_ARIA_LABEL)).toBeInTheDocument();
    expect(screen.getAllByLabelText(SIMULATED_ARIA_LABEL).length).toBeGreaterThanOrEqual(2);
  });

  it("shows the RBAC roster with the seed user's email and role", () => {
    render(<SystemAdminScreen />);
    expect(screen.getByText(SIM_ROSTER[0].email)).toBeInTheDocument();
    expect(screen.getByText("Executive")).toBeInTheDocument();
  });

  it("shows the SSO / Active Directory capability note", () => {
    render(<SystemAdminScreen />);
    expect(screen.getByText(SSO_NOTE_TH)).toBeInTheDocument();
  });

  it("renders both account states (active and disabled) with a text label", () => {
    render(<SystemAdminScreen />);
    expect(screen.getAllByText("ใช้งาน").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("ปิดใช้งาน")).toBeInTheDocument();
  });

  it("switches to a proposal-only tab and back", () => {
    render(<SystemAdminScreen />);
    // Users tab is active by default.
    expect(screen.getByTestId("users-roles")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "การเชื่อมต่อข้อมูล" }));
    expect(screen.queryByTestId("users-roles")).not.toBeInTheDocument();
    expect(screen.getByTestId("admin-proposal-note")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "ผู้ใช้และสิทธิ์" }));
    expect(screen.getByTestId("users-roles")).toBeInTheDocument();
  });

  it("marks exactly one tab selected at a time", () => {
    render(<SystemAdminScreen />);
    const selected = screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("ผู้ใช้และสิทธิ์");
  });

  it("renders the add-user proposal affordance", () => {
    render(<SystemAdminScreen />);
    expect(screen.getByRole("button", { name: /เพิ่มผู้ใช้/ })).toBeInTheDocument();
  });

  it("states in the footer that the data is simulated, not real PWA data", () => {
    render(<SystemAdminScreen />);
    expect(screen.getByText(/ไม่ใช่ข้อมูลผู้ใช้จริงของ กปภ\./)).toBeInTheDocument();
  });
});
