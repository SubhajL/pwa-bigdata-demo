/**
 * PR-11 — the Regional screen is WIRED, not orphaned. NAV_ITEMS marks it built, and navigating to
 * /regions with a region renders the REAL screen, not the "not built yet" PlaceholderScreen.
 */
import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/regional/regionalClient", async (importActual) => {
  const actual = await importActual<typeof import("@/features/regional/regionalClient")>();
  return {
    ...actual,
    fetchMonths: vi.fn(() => new Promise(() => {})),
    fetchRegion: vi.fn(() => new Promise(() => {})),
  };
});

import { NAV_ITEMS } from "@/routes/nav";
import { buildRoutes } from "@/routes/routes";

describe("regional wiring", () => {
  it("marks the regional nav item built", () => {
    const item = NAV_ITEMS.find((i) => i.id === "regional");
    expect(item?.built).toBe(true);
    expect(item?.path).toBe("/regions");
  });

  it("renders the real RegionalScreen at /regions, not the placeholder", () => {
    const router = createMemoryRouter(buildRoutes(), {
      initialEntries: ["/regions?region=2&month=2025-12"],
    });
    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("regional")).toBeInTheDocument();
    expect(screen.queryByText(/ยังไม่ได้พัฒนา|not built/i)).not.toBeInTheDocument();
  });
});
