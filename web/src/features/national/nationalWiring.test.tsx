/**
 * PR-10 — the National Executive screen is WIRED, not orphaned.
 * Proves NAV_ITEMS marks it built and that navigating to /national renders the REAL screen (its
 * data-testid), not the "not built yet" PlaceholderScreen. Mirrors predictiveWiring.test.tsx.
 */
import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// The screen fetches on mount; stub the network so this test is about wiring, not fetching.
vi.mock("@/features/national/nationalClient", async (importActual) => {
  const actual = await importActual<typeof import("@/features/national/nationalClient")>();
  return {
    ...actual,
    fetchMonths: vi.fn(() => new Promise(() => {})),
    fetchNational: vi.fn(() => new Promise(() => {})),
    fetchNationalSeries: vi.fn(() => new Promise(() => {})),
  };
});

import { NAV_ITEMS } from "@/routes/nav";
import { buildRoutes } from "@/routes/routes";

describe("national wiring", () => {
  it("marks the national nav item built", () => {
    const item = NAV_ITEMS.find((i) => i.id === "national");
    expect(item?.built).toBe(true);
    expect(item?.path).toBe("/national");
  });

  it("renders the real NationalExecutiveScreen at /national, not the placeholder", () => {
    const router = createMemoryRouter(buildRoutes(), { initialEntries: ["/national"] });
    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("national-executive")).toBeInTheDocument();
    expect(screen.queryByText(/ยังไม่ได้พัฒนา|not built/i)).not.toBeInTheDocument();
  });
});
