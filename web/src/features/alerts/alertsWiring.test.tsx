/**
 * PR-15 wiring — `/alerts` must resolve to the REAL AlertCenterScreen, not the placeholder.
 * router.test.tsx T4 cannot catch a missing `SCREENS["alerts"]` because PlaceholderScreen renders the
 * same `<h1>ศูนย์แจ้งเตือน`; this asserts screen-unique content instead.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { NAV_ITEMS } from "@/routes/nav";
import { buildRoutes } from "@/routes/routes";

afterEach(cleanup);

describe("PR-15 wiring — /alerts", () => {
  it("marks the alerts nav item as built", () => {
    expect(NAV_ITEMS.find((i) => i.id === "alerts")?.built).toBe(true);
  });

  it("renders the real Alert Center screen, not the placeholder", () => {
    const router = createMemoryRouter(buildRoutes(), { initialEntries: ["/alerts"] });
    render(<RouterProvider router={router} />);
    const main = screen.getByRole("main");
    expect(within(main).getByTestId("alert-center")).toBeInTheDocument();
    expect(within(main).getByTestId("alert-summary")).toBeInTheDocument();
    expect(main.textContent).not.toContain("หน้าจอนี้ยังไม่ได้พัฒนา");
  });
});
