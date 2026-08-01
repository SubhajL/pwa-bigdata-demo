/**
 * PR-16 wiring — `/assistant` must resolve to the REAL AiAssistantScreen, not the placeholder.
 * router.test.tsx T4 cannot catch a missing `SCREENS["assistant"]` because PlaceholderScreen renders
 * the same `<h1>ผู้ช่วยอัจฉริยะ`; this asserts screen-unique content instead.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { NAV_ITEMS } from "@/routes/nav";
import { buildRoutes } from "@/routes/routes";

afterEach(cleanup);

describe("PR-16 wiring — /assistant", () => {
  it("marks the assistant nav item as built", () => {
    expect(NAV_ITEMS.find((i) => i.id === "assistant")?.built).toBe(true);
  });

  it("renders the real AI Assistant screen, not the placeholder", () => {
    const router = createMemoryRouter(buildRoutes(), { initialEntries: ["/assistant"] });
    render(<RouterProvider router={router} />);
    const main = screen.getByRole("main");
    expect(within(main).getByTestId("ai-assistant")).toBeInTheDocument();
    expect(within(main).getByTestId("conversation")).toBeInTheDocument();
    expect(main.textContent).not.toContain("หน้าจอนี้ยังไม่ได้พัฒนา");
  });
});
