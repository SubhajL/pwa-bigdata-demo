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

import { act } from "@testing-library/react";

import { fetchDlq, fetchPipelineStatus } from "@/features/pipeline/pipelineClient";
import { PipelineMonitorScreen } from "@/screens/PipelineMonitorScreen";
import { buildRoutes } from "@/routes/routes";
import type { DlqResponse, EnabledStatus } from "@/features/pipeline/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("T20 pipeline route wiring", () => {
  it("renders PipelineMonitorScreen at /pipeline, not the placeholder", () => {
    render(<RouterProvider router={createMemoryRouter(buildRoutes(), { initialEntries: ["/pipeline"] })} />);
    expect(screen.getByTestId("pipeline-monitor")).toBeInTheDocument(); // the real screen's marker
    expect(screen.queryByText(/หน้าจอนี้ยังไม่ได้พัฒนา/)).toBeNull(); // placeholder sentence absent
  });
});

// ── T21 DLQ auto-refresh (PR-B, item 1.5 judge evidence) ──────────────────────────────
// A dead-lettered message must become VISIBLE on the already-open page: when the polled
// conservation.dead_letter total changes, the screen refetches DLQ page 0. It must NOT
// refetch on the first status arrival (no total change) so pagination is never yanked
// by mere mounting.
function statusWithDlq(deadLetter: number): EnabledStatus {
  return {
    state: "connected", granted_qos: 1, connected_count: 1, disconnect_count: 0,
    received: 10, overflowed: 0, unstored: 0, last_error: null, queue_depth: 0,
    subscriber_run_id: "run-a", twin_subscribers: 0, twin_frames_dropped: 0,
    conservation: { ledger: 10, telemetry: 10, dead_letter: deadLetter, holds: true },
  };
}
const emptyDlqPage: DlqResponse = { count: 0, limit: 25, offset: 0, items: [] };

describe("T21 DLQ auto-refresh on the open page", () => {
  it("refetches DLQ page 0 when the polled dead-letter total changes, not on first arrival", async () => {
    vi.useFakeTimers();
    const mStatus = vi.mocked(fetchPipelineStatus);
    const mDlq = vi.mocked(fetchDlq);
    let dlqTotal = 58;
    mStatus.mockImplementation(() => Promise.resolve(statusWithDlq(dlqTotal)));
    mDlq.mockImplementation(() => Promise.resolve(emptyDlqPage));
    mDlq.mockClear();

    render(<PipelineMonitorScreen />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mDlq).toHaveBeenCalledTimes(1); // initial page load only — no reload on first total

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(mDlq).toHaveBeenCalledTimes(1); // unchanged total → no refetch

    dlqTotal = 59; // a message was dead-lettered while the page is open
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(mDlq.mock.calls.length).toBeGreaterThanOrEqual(2); // page 0 refetched → row visible
  });
});
