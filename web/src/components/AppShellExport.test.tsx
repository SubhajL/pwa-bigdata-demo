/**
 * PR-D2 (Path D) — the shared header "ส่งออกรายงาน" action is now real: it prints the current view
 * (the browser's print-to-PDF), no longer inert chrome. Rendered at /admin (a static screen) so no
 * data fetch is involved.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRoutes } from "@/routes/routes";

afterEach(cleanup);

describe("AppShell export action", () => {
  it("prints the current view when ส่งออกรายงาน is clicked", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<RouterProvider router={createMemoryRouter(buildRoutes(), { initialEntries: ["/admin"] })} />);

    fireEvent.click(screen.getByRole("button", { name: /ส่งออกรายงาน/ }));

    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });
});
