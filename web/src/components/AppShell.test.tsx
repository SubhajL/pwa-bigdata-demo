/**
 * T5 — shell landmarks and a current marker that is more than colour (DREP-PR6 R7).
 *
 * Also absorbs the assertion from the deleted PR-0 `App.test.tsx` ("renders the brand"),
 * so that coverage is moved rather than dropped.
 *
 * Authored by Claude; the implementer must not modify this file (DREP §10).
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RouterProvider, createMemoryRouter } from "react-router-dom";

import { APP_CONFIG } from "@/config/app.config";
import { NAV_ITEMS } from "@/routes/nav";
import { buildRoutes } from "@/routes/routes";

afterEach(cleanup);

function renderAt(path: string): void {
  render(<RouterProvider router={createMemoryRouter(buildRoutes(), { initialEntries: [path] })} />);
}

describe("T5 — AppShell", () => {
  it("renders all four landmarks", () => {
    renderAt(NAV_ITEMS[0].path);
    // Screen-reader navigation depends on these; axe cannot infer them.
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("renders the brand", () => {
    renderAt(NAV_ITEMS[0].path);
    expect(screen.getByText(APP_CONFIG.brand)).toBeInTheDocument();
  });

  it("lists every registry item in the navigation", () => {
    renderAt(NAV_ITEMS[0].path);
    const nav = screen.getByRole("navigation");
    for (const item of NAV_ITEMS) {
      expect(
        within(nav).getByRole("link", { name: new RegExp(item.labelTh) }),
        `${item.labelTh} missing from the sidebar`,
      ).toBeInTheDocument();
    }
  });

  it("groups the navigation under its section headings", () => {
    renderAt(NAV_ITEMS[0].path);
    const nav = screen.getByRole("navigation");
    for (const label of ["ภาพรวม", "การดำเนินงาน", "ระบบ"]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the current item with a dedicated element, not only a colour", () => {
    const current = NAV_ITEMS[2];
    renderAt(current.path);

    const links = screen.getAllByRole("link", { current: "page" });
    expect(links).toHaveLength(1);

    // A class name would prove nothing — it can be colour-only, or display:none. A
    // rendered NODE is evidence that something other than hue distinguishes the item.
    // (jsdom cannot prove it is VISIBLE; real-browser visibility is PR-17's Playwright
    // pass. Stated, not pretended away.)
    expect(links[0].querySelector("[data-current-marker]")).not.toBeNull();

    const marked = document.querySelectorAll("[data-current-marker]");
    expect(marked, "the marker must appear on the current item only").toHaveLength(1);
  });

  it("keeps the footer's system-status affordance a link, not a fabricated reading", () => {
    renderAt(NAV_ITEMS[0].path);
    const footer = screen.getByRole("contentinfo");
    // A live status chip here would imply a measurement, and no status source is wired in
    // this PR. Inventing one is a hardcoded telemetry value, which CLAUDE.md forbids.
    // PR-8 owns the real pipeline status.
    expect(within(footer).getByRole("link", { name: /System Status/i })).toBeInTheDocument();
  });
});
