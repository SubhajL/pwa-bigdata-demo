/**
 * PR-13 wiring — `/admin` must resolve to the REAL SystemAdminScreen, not the honest
 * placeholder. This cannot be left to router.test.tsx's T4: the placeholder renders the
 * very same `<h1>ผู้ดูแลระบบ`, so a missing `SCREENS["admin"]` registration would pass T4
 * while shipping the "not built yet" screen. This asserts screen-unique content instead.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { NAV_ITEMS } from "@/routes/nav";
import { buildRoutes } from "@/routes/routes";

afterEach(cleanup);

describe("PR-13 wiring — /admin", () => {
  it("marks the admin nav item as built", () => {
    const admin = NAV_ITEMS.find((i) => i.id === "admin");
    expect(admin?.built).toBe(true);
  });

  it("renders the real System Admin screen, not the placeholder", () => {
    const router = createMemoryRouter(buildRoutes(), { initialEntries: ["/admin"] });
    render(<RouterProvider router={router} />);
    const main = screen.getByRole("main");
    expect(within(main).getByTestId("system-admin")).toBeInTheDocument();
    expect(within(main).getByTestId("users-roles")).toBeInTheDocument();
    // The placeholder's tell-tale sentence must be absent.
    expect(main.textContent).not.toContain("หน้าจอนี้ยังไม่ได้พัฒนา");
  });
});
