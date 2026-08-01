/**
 * PR-14 wiring — `/reports` must resolve to the REAL ReportCenterScreen, not the placeholder.
 * router.test.tsx T4 cannot catch a missing `SCREENS["reports"]` because PlaceholderScreen renders
 * the same `<h1>ศูนย์รายงาน`; this asserts screen-unique content instead.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { NAV_ITEMS } from "@/routes/nav";
import { buildRoutes } from "@/routes/routes";

afterEach(cleanup);

describe("PR-14 wiring — /reports", () => {
  it("marks the reports nav item as built", () => {
    expect(NAV_ITEMS.find((i) => i.id === "reports")?.built).toBe(true);
  });

  it("renders the real Report Center screen, not the placeholder", () => {
    const router = createMemoryRouter(buildRoutes(), { initialEntries: ["/reports"] });
    render(<RouterProvider router={router} />);
    const main = screen.getByRole("main");
    expect(within(main).getByTestId("report-center")).toBeInTheDocument();
    expect(within(main).getByRole("radiogroup", { name: "เลือกรูปแบบรายงาน" })).toBeInTheDocument();
    expect(main.textContent).not.toContain("หน้าจอนี้ยังไม่ได้พัฒนา");
  });
});
