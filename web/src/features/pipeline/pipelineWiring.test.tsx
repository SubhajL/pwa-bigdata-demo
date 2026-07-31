/**
 * T20 — the /pipeline route renders the REAL screen, not the placeholder (PR-8 S3 wiring).
 *
 * This is the oracle Codex proved the existing router test CANNOT provide: `built:true` alone still
 * passes the labelTh-heading check because the placeholder shares that heading. So this asserts a
 * marker unique to PipelineMonitorScreen is present AND the placeholder sentence is absent. The
 * network is mocked so the mounted screen does not fetch during the route test.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";

vi.mock("@/features/pipeline/pipelineClient", async (importActual) => {
  const actual = await importActual<typeof import("@/features/pipeline/pipelineClient")>();
  return {
    ...actual,
    fetchPipelineStatus: vi.fn(() => new Promise(() => {})),
    fetchDlq: vi.fn(() => new Promise(() => {})),
    fetchRange: vi.fn(() => new Promise(() => {})),
    probeLatency: vi.fn(() => new Promise(() => {})),
  };
});

import { buildRoutes } from "@/routes/routes";

afterEach(cleanup);

describe("T20 pipeline route wiring", () => {
  it("renders PipelineMonitorScreen at /pipeline, not the placeholder", () => {
    render(<RouterProvider router={createMemoryRouter(buildRoutes(), { initialEntries: ["/pipeline"] })} />);
    expect(screen.getByTestId("pipeline-monitor")).toBeInTheDocument(); // the real screen's marker
    expect(screen.queryByText(/หน้าจอนี้ยังไม่ได้พัฒนา/)).toBeNull(); // placeholder sentence absent
  });
});
