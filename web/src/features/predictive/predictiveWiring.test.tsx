/**
 * T9.8 — the predictive screen is WIRED, not orphaned (PR-9 S9-E).
 * Proves NAV_ITEMS marks it built and that navigating to /predictive renders the REAL screen
 * (its data-testid), not the "not built yet" PlaceholderScreen. Mirrors pipelineWiring.test.tsx.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouterProvider, createMemoryRouter } from "react-router-dom";

// The screen polls on mount; stub the network so this test is about wiring, not fetching.
vi.mock("@/features/predictive/predictiveClient", async (importActual) => {
  const actual = await importActual<typeof import("@/features/predictive/predictiveClient")>();
  return {
    ...actual,
    fetchWorklist: vi.fn(() => new Promise(() => {})),
    fetchModelCard: vi.fn(() => new Promise(() => {})),
    fetchHealth: vi.fn(() => new Promise(() => {})),
    fetchRca: vi.fn(() => new Promise(() => {})),
  };
});

import { NAV_ITEMS } from "@/routes/nav";
import { buildRoutes } from "@/routes/routes";

describe("predictive wiring", () => {
  it("marks the predictive nav item built", () => {
    const item = NAV_ITEMS.find((i) => i.id === "predictive");
    expect(item?.built).toBe(true);
    expect(item?.path).toBe("/predictive");
  });

  it("renders the real PredictiveAnalyticsScreen at /predictive, not the placeholder", () => {
    const router = createMemoryRouter(buildRoutes(), { initialEntries: ["/predictive"] });
    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("predictive-analytics")).toBeInTheDocument();
    // The placeholder announces itself; the real screen must NOT show that copy.
    expect(screen.queryByText(/ยังไม่ได้พัฒนา|not built/i)).not.toBeInTheDocument();
  });
});
