/**
 * PR-12 — the Branch screen is WIRED, not orphaned. NAV_ITEMS marks it built, and navigating to
 * /branches with a branch renders the REAL screen, not the "not built yet" PlaceholderScreen.
 */
import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/branch/branchClient", async (importActual) => {
  const actual = await importActual<typeof import("@/features/branch/branchClient")>();
  return {
    ...actual,
    fetchMonths: vi.fn(() => new Promise(() => {})),
    fetchBranch: vi.fn(() => new Promise(() => {})),
  };
});

import { NAV_ITEMS } from "@/routes/nav";
import { buildRoutes } from "@/routes/routes";

describe("branch wiring", () => {
  it("marks the branch nav item built", () => {
    const item = NAV_ITEMS.find((i) => i.id === "branch");
    expect(item?.built).toBe(true);
    expect(item?.path).toBe("/branches");
  });

  it("renders the real BranchScreen at /branches, not the placeholder", () => {
    const router = createMemoryRouter(buildRoutes(), {
      initialEntries: ["/branches?branch=5551001&month=2025-12"],
    });
    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("branch")).toBeInTheDocument();
    expect(screen.queryByText(/ยังไม่ได้พัฒนา|not built/i)).not.toBeInTheDocument();
  });
});
