/**
 * T9.7 — the predictive screen owns its INTERACTIONS states (PR-9 S9-E).
 * The heading renders SYNCHRONOUSLY (no successful poll required); a failed load shows an Alert,
 * never a blank page. Only the network is mocked. Mirrors PipelineMonitorScreen.test.tsx.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/predictive/predictiveClient", async (importActual) => {
  const actual = await importActual<typeof import("@/features/predictive/predictiveClient")>();
  return {
    ...actual,
    fetchWorklist: vi.fn(),
    fetchModelCard: vi.fn(),
    fetchHealth: vi.fn(),
    fetchRca: vi.fn(),
    submitFeedback: vi.fn(),
  };
});

import { fetchModelCard, fetchWorklist } from "@/features/predictive/predictiveClient";

import { PredictiveAnalyticsScreen } from "./PredictiveAnalyticsScreen";

const mWorklist = vi.mocked(fetchWorklist);
const mModel = vi.mocked(fetchModelCard);

afterEach(() => vi.useRealTimers());

describe("PredictiveAnalyticsScreen", () => {
  it("renders the Thai heading synchronously, before any fetch resolves", () => {
    mWorklist.mockReturnValue(new Promise(() => {})); // never resolves
    mModel.mockReturnValue(new Promise(() => {}));
    render(<PredictiveAnalyticsScreen />);
    expect(screen.getByRole("heading", { name: /การพยากรณ์/ })).toBeInTheDocument();
    expect(screen.getByTestId("predictive-analytics")).toBeInTheDocument();
  });

  it("shows an error Alert (not a blank) when the initial worklist load fails", async () => {
    vi.useFakeTimers();
    mWorklist.mockRejectedValue(new Error("net down"));
    mModel.mockRejectedValue(new Error("net down"));
    render(<PredictiveAnalyticsScreen />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("ไม่สามารถโหลดข้อมูลแบบจำลองได้")).toBeInTheDocument();
    // The heading is still present — a failed poll never blanks the screen.
    expect(screen.getByRole("heading", { name: /การพยากรณ์/ })).toBeInTheDocument();
  });

  it("shows an honest empty state (not a permanent skeleton) when the worklist loads empty", async () => {
    vi.useFakeTimers();
    mWorklist.mockResolvedValue([]);
    mModel.mockReturnValue(new Promise(() => {}));
    render(<PredictiveAnalyticsScreen />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByTestId("predictive-empty")).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่มีอุปกรณ์/)).toBeInTheDocument();
  });
});
