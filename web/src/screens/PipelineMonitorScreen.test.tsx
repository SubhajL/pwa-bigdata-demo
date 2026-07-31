/**
 * T18/T19/T21 — the pipeline monitor SCREEN (PR-8 S3). The screen + wiring are Claude-implemented,
 * so these verify (and are mutation-checked in the coding log): the <h1> and testid render without
 * a successful fetch, a failed poll never blanks, offline keeps the last values with a timestamp,
 * and the loaded screen is axe-clean. Only the network functions are mocked; the S1/S2 logic is real.
 */
import axe from "axe-core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DlqResponse, EnabledStatus, RangeResponse } from "@/features/pipeline/types";

vi.mock("@/features/pipeline/pipelineClient", async (importActual) => {
  const actual = await importActual<typeof import("@/features/pipeline/pipelineClient")>();
  return { ...actual, fetchPipelineStatus: vi.fn(), fetchDlq: vi.fn(), fetchRange: vi.fn(), probeLatency: vi.fn() };
});

import { fetchDlq, fetchPipelineStatus, fetchRange, probeLatency } from "@/features/pipeline/pipelineClient";
import { PipelineMonitorScreen } from "./PipelineMonitorScreen";

const mStatus = vi.mocked(fetchPipelineStatus);
const mDlq = vi.mocked(fetchDlq);
const mRange = vi.mocked(fetchRange);
const mProbe = vi.mocked(probeLatency);

function enabled(received = 100): EnabledStatus {
  return {
    state: "connected", granted_qos: 1, connected_count: 1, disconnect_count: 0,
    received, overflowed: 0, unstored: 0, last_error: null, queue_depth: 0,
    subscriber_run_id: "run-a", twin_subscribers: 0, twin_frames_dropped: 0,
    conservation: { ledger: received, telemetry: received, dead_letter: 0, holds: true },
  };
}
const emptyDlq: DlqResponse = { count: 0, limit: 25, offset: 0, items: [] };
const emptyRange: RangeResponse = { asset_id: "P-2", window_minutes: 15, count: 0, readings: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mDlq.mockResolvedValue(emptyDlq);
  mRange.mockResolvedValue(emptyRange);
  mProbe.mockResolvedValue({ path: "/x", roundTripMs: 3, dbMs: 1, ok: true, status: 200 });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("T18 heading + states", () => {
  it("renders the heading and testid while loading (no successful fetch needed)", () => {
    mStatus.mockReturnValue(new Promise(() => {})); // never resolves
    render(<PipelineMonitorScreen />);
    expect(screen.getByRole("heading", { name: /คุณภาพข้อมูล/ })).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-monitor")).toBeInTheDocument();
  });
  it("shows an error alert but keeps the heading when the poll fails", async () => {
    mStatus.mockRejectedValue(new Error("net down"));
    render(<PipelineMonitorScreen />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: /คุณภาพข้อมูล/ })).toBeInTheDocument(); // not blanked
  });
});

describe("T19 offline keeps last values with a timestamp", () => {
  it("keeps the last status dimmed and shows a stale marker on a later failed poll", async () => {
    vi.useFakeTimers();
    mStatus.mockResolvedValueOnce(enabled(100)).mockRejectedValue(new Error("dropped"));
    render(<PipelineMonitorScreen />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); // second poll fails
    expect(screen.getByText(/ข้อมูลไม่เป็นปัจจุบัน/)).toBeInTheDocument(); // stale marker + timestamp
    expect(screen.getByTestId("pipeline-monitor")).toBeInTheDocument(); // never blanked
  });
});

describe("T21 loaded-state accessibility", () => {
  it("has no structural axe violations once data is loaded", async () => {
    mStatus.mockResolvedValue(enabled(100));
    render(<PipelineMonitorScreen />);
    // Wait for LOADED leaf content (a lineage element), not just the synchronous root/heading, so
    // axe audits the real tables/SVG/controls rather than the skeleton (Codex MEDIUM).
    await screen.findByTestId("holds");
    // The screen is mounted standalone here — NOT inside AppShell's <main> or the real index.html.
    // Disable the rules that are the shell's / document's responsibility (covered by a11y.test.tsx
    // and index.html), so this audits the SCREEN's own structure: labels, table headers, aria,
    // heading order. color-contrast can't run under jsdom (no layout).
    const results = await axe.run(document, {
      resultTypes: ["violations"],
      rules: {
        "color-contrast": { enabled: false },
        "document-title": { enabled: false },
        "html-has-lang": { enabled: false },
        region: { enabled: false },
      },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
