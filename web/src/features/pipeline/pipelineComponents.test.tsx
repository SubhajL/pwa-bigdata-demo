/**
 * T10–T17 — the pipeline monitor's leaf components (PR-8 S3). Authored by Claude; the implementer
 * fills the component bodies to satisfy these. Oracles use `data-testid` hooks (listed in the
 * brief) so they pin behaviour without over-specifying layout, and are written to fail a stub.
 */
import { cleanup, render, screen, within, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SIMULATED_ARIA_LABEL } from "@/components/SimulatedBadge";

import { ConnectionPill } from "./ConnectionPill";
import { DlqTable } from "./DlqTable";
import { IngestRateChart } from "./IngestRateChart";
import { KpiRow } from "./KpiRow";
import { LineageDiagram } from "./LineageDiagram";
import { ResponseTimeTable } from "./ResponseTimeTable";
import { RetrievalEvidence } from "./RetrievalEvidence";
import type { DlqResponse, EnabledStatus, LatencySummary, RangeResponse } from "./types";

afterEach(cleanup);

function enabled(over: Partial<EnabledStatus> = {}): EnabledStatus {
  return {
    state: "connected", granted_qos: 1, connected_count: 2, disconnect_count: 1,
    received: 100, overflowed: 0, unstored: 0, last_error: null, queue_depth: 0,
    subscriber_run_id: "run-a", twin_subscribers: 0, twin_frames_dropped: 0,
    conservation: { ledger: 1935, telemetry: 1935, dead_letter: 58, holds: true }, ...over,
  };
}
function sum(over: Partial<LatencySummary> & { path: string }): LatencySummary {
  return { meanMs: 3, count: 5, failures: 0, dbMs: 1.2, underBudget: true, ...over };
}

// ── T10 ConnectionPill ────────────────────────────────────────────────────────────────
describe("T10 ConnectionPill", () => {
  it("shows kind + reconnect counts, and swaps distinctly on disconnect with last_error", () => {
    const { rerender, container } = render(<ConnectionPill status={enabled()} />);
    expect(container.querySelector('[data-kind="ok"]')).not.toBeNull();
    expect(screen.getByText(/2/)).toBeInTheDocument(); // connected_count
    expect(screen.getByText(/1/)).toBeInTheDocument(); // disconnect_count
    rerender(<ConnectionPill status={enabled({ state: "disconnected", last_error: "socket boom" })} />);
    expect(container.querySelector('[data-kind="down"]')).not.toBeNull(); // distinct kind
    expect(screen.getByText(/socket boom/)).toBeInTheDocument();
  });
  it("renders the disabled state distinctly", () => {
    const { container } = render(<ConnectionPill status={{ state: "disabled", detail: "off" }} />);
    expect(container.querySelector('[data-kind="disabled"]')).not.toBeNull();
  });
});

// ── T11 IngestRateChart ───────────────────────────────────────────────────────────────
describe("T11 IngestRateChart", () => {
  it("draws a single-y-axis polyline and a SIMULATED badge", () => {
    const { container } = render(<IngestRateChart rates={[1, 2, 3]} />);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="y-axis"]')).toHaveLength(1); // exactly one axis
    expect(container.querySelector("polyline, path")).not.toBeNull();
    expect(screen.getByLabelText(SIMULATED_ARIA_LABEL)).toBeInTheDocument();
  });
  it("shows an explicit empty state for no rates", () => {
    render(<IngestRateChart rates={[]} />);
    expect(screen.getByTestId("chart-empty")).toBeInTheDocument();
  });
});

// ── T12 ResponseTimeTable ─────────────────────────────────────────────────────────────
describe("T12 ResponseTimeTable", () => {
  it("derives an under/over/failed verdict per endpoint and shows the budget", () => {
    render(
      <ResponseTimeTable
        budgetMs={500}
        summaries={[
          sum({ path: "/a", meanMs: 3, underBudget: true }),
          sum({ path: "/b", meanMs: 640, underBudget: false }),
          sum({ path: "/c", meanMs: 0, count: 0, failures: 2, underBudget: false }),
        ]}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByTestId("rt-row")).toHaveLength(3);
    expect(screen.getByTestId("budget-ok")).toBeInTheDocument();
    expect(screen.getByTestId("budget-over")).toBeInTheDocument();
    expect(screen.getByTestId("budget-failed")).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument(); // threshold shown as text
    // R11 honesty: latency is genuinely MEASURED, not synthetic — it must be disclosed as
    // demo-environment / "not a production SLA", and must NOT wear the violet SIMULATED badge
    // (which would falsely imply the number was fabricated). Codex CRITICAL.
    expect(screen.getByText(/production|SLA/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(SIMULATED_ARIA_LABEL)).toBeNull();
    // An all-failed endpoint must read as unknown ("—"), never a fast "0.0 ms".
    expect(screen.queryByText("0.0")).toBeNull();
    expect(within(screen.getByTestId("budget-failed").closest("tr") as HTMLElement).getByText("—")).toBeInTheDocument();
  });
});

// ── T13 / T14 DlqTable ────────────────────────────────────────────────────────────────
const dlqPage: DlqResponse = {
  count: 2, limit: 25, offset: 0,
  items: [
    { message_id: "m1", run_id: "r", asset_id: "BOGUS", reason: "unknown asset_id", raw: { a: 1 } },
    { message_id: "m2", run_id: null, asset_id: null, reason: "malformed", raw: { value: "x".repeat(80) } },
  ],
};
describe("T13 DlqTable rows / empty / paginate", () => {
  it("renders rows with null→— and serialised raw, the total, and a next control", () => {
    render(<DlqTable page={dlqPage} total={58} offset={0} loading={false} onPrev={() => {}} onNext={() => {}} />);
    expect(screen.getAllByTestId("dlq-row")).toHaveLength(2);
    expect(screen.getByText("—")).toBeInTheDocument(); // null asset_id
    expect(screen.getByText(/unknown asset_id/)).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/)).toBeNull(); // raw serialised, not stringified object
    expect(screen.getByText(/\{"a":1\}/)).toBeInTheDocument(); // the actual serialised raw value
    expect(screen.getByText(/58/)).toBeInTheDocument(); // total from conservation
    expect(screen.getByTestId("dlq-next")).toBeInTheDocument();
  });
  it("shows an explicit empty state, not a silent zero-row table", () => {
    render(<DlqTable page={{ count: 0, limit: 25, offset: 0, items: [] }} total={0} offset={0} loading={false} onPrev={() => {}} onNext={() => {}} />);
    expect(screen.getByTestId("dlq-empty")).toBeInTheDocument();
  });
  it("disables Next on the last page and keeps controls on an empty overrun (never strands)", () => {
    // total 100, page size 25: offset 0 → next enabled, prev disabled.
    const { rerender } = render(<DlqTable page={{ count: 25, limit: 25, offset: 0, items: dlqPage.items }} total={100} offset={0} loading={false} onPrev={() => {}} onNext={() => {}} />);
    expect(screen.getByTestId("dlq-prev")).toBeDisabled();
    expect(screen.getByTestId("dlq-next")).not.toBeDisabled();
    // last page: offset 75 covers rows 76–100 → next disabled.
    rerender(<DlqTable page={{ count: 25, limit: 25, offset: 75, items: dlqPage.items }} total={100} offset={75} loading={false} onPrev={() => {}} onNext={() => {}} />);
    expect(screen.getByTestId("dlq-next")).toBeDisabled();
    // empty overrun past the end still shows navigation so the operator can go back.
    rerender(<DlqTable page={{ count: 0, limit: 25, offset: 100, items: [] }} total={100} offset={100} loading={false} onPrev={() => {}} onNext={() => {}} />);
    expect(screen.getByTestId("dlq-prev")).not.toBeDisabled();
  });
});
describe("T14 DlqTable export", () => {
  it("exports the loaded rows as a text/csv blob whose CONTENTS are the CSV, without a network call", async () => {
    const createURL = vi.fn((_blob: Blob) => "blob:x");
    const revokeURL = vi.fn((_url: string) => {});
    // jsdom implements neither; add them for this test and remove after.
    const urlCtor = globalThis.URL as unknown as {
      createObjectURL?: (b: Blob) => string;
      revokeObjectURL?: (u: string) => void;
    };
    urlCtor.createObjectURL = createURL;
    urlCtor.revokeObjectURL = revokeURL;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in export"));
    render(<DlqTable page={dlqPage} total={58} offset={0} loading={false} onPrev={() => {}} onNext={() => {}} />);
    fireEvent.click(screen.getByTestId("dlq-export"));
    expect(createURL).toHaveBeenCalledTimes(1);
    const blob = createURL.mock.calls[0][0];
    expect(blob.type).toContain("text/csv");
    // jsdom's Blob has no .text(); a non-empty size proves a real CSV was built (the CSV CONTENTS
    // are proven by the toCsv unit tests). An empty/stub export would produce size 0 or the header.
    expect(blob.size).toBeGreaterThan("message_id,run_id,asset_id,reason,raw".length);
    expect(revokeURL).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    delete urlCtor.createObjectURL;
    delete urlCtor.revokeObjectURL;
    fetchSpy.mockRestore();
  });
});

// ── T15 LineageDiagram ────────────────────────────────────────────────────────────────
describe("T15 LineageDiagram", () => {
  it("shows the four stages, a DLQ branch edge, counts, and a recomputed holds ✓/✗", () => {
    const { rerender, container } = render(<LineageDiagram conservation={{ ledger: 1935, telemetry: 1935, dead_letter: 0, holds: true }} />);
    for (const stage of ["MQTT", "Validate", "TimescaleDB", "API"]) {
      expect(screen.getByText(new RegExp(stage))).toBeInTheDocument();
    }
    expect(container.querySelector('[data-testid="dlq-edge"]')).not.toBeNull();
    expect(screen.getAllByText(/1935/).length).toBeGreaterThanOrEqual(1); // ledger/telemetry counts rendered
    expect(screen.getByTestId("holds").textContent).toContain("✓");
    rerender(<LineageDiagram conservation={{ ledger: 1935, telemetry: 1930, dead_letter: 0, holds: true }} />);
    expect(screen.getByTestId("holds").textContent).toContain("✗"); // recomputed client-side, ignores server holds
  });
});

// ── T16 RetrievalEvidence ─────────────────────────────────────────────────────────────
describe("T16 RetrievalEvidence", () => {
  it("renders the readings in ascending ts order with the count", () => {
    const range: RangeResponse = {
      asset_id: "P-2", window_minutes: 15, count: 3,
      readings: [
        { ts: "2026-07-30T10:00:00Z", signal: "pressure_bar", value: 1, run_id: "r" },
        { ts: "2026-07-30T10:01:00Z", signal: "pressure_bar", value: 2, run_id: "r" },
        { ts: "2026-07-30T10:02:00Z", signal: "pressure_bar", value: 3, run_id: "r" },
      ],
    };
    render(<RetrievalEvidence range={range} />);
    const rows = screen.getAllByTestId("range-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText(/10:00/)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/10:02/)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument(); // count
  });
});

// ── T17 KpiRow ────────────────────────────────────────────────────────────────────────
describe("T17 KpiRow", () => {
  it("derives every tile, excludes failed endpoints from latency, badges each simulated tile", () => {
    const failed = sum({ path: "/b", meanMs: 0, count: 0, failures: 5, underBudget: false });
    const { rerender } = render(<KpiRow status={enabled()} rates={[10]} summaries={[sum({ path: "/a", meanMs: 3, count: 5 }), failed]} />);
    expect(screen.getByTestId("kpi-throughput").textContent).toMatch(/10/);
    // latency is success-weighted and IGNORES the all-failed endpoint: 3, never (3+0)/2 = 1.5.
    expect(screen.getByTestId("kpi-latency").textContent).toMatch(/3/);
    expect(screen.getByTestId("kpi-latency").textContent).not.toMatch(/1\.5/);
    expect(screen.getByTestId("kpi-rows").textContent).toMatch(/1,?935/);
    expect(screen.getByTestId("kpi-dlq").textContent).toMatch(/58/);
    // Per-tile provenance: each simulated-feed tile is individually badged (Codex HIGH).
    expect(screen.getAllByLabelText(SIMULATED_ARIA_LABEL).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/เซสชันนี้/)).toBeInTheDocument(); // session scope
    expect(screen.getByText(/สะสมทุกรอบ/)).toBeInTheDocument(); // all-runs scope
    // Re-render: every derived tile changes (nothing hardcoded).
    rerender(<KpiRow status={enabled({ conservation: { ledger: 40, telemetry: 40, dead_letter: 2, holds: true } })} rates={[99]} summaries={[sum({ path: "/a", meanMs: 7, count: 3 })]} />);
    expect(screen.getByTestId("kpi-throughput").textContent).toMatch(/99/);
    expect(screen.getByTestId("kpi-latency").textContent).toMatch(/7/);
    expect(screen.getByTestId("kpi-rows").textContent).toMatch(/40/);
    expect(screen.getByTestId("kpi-dlq").textContent).toMatch(/2/);
    // Disabled ingest → conservation unknown, rendered as "—", never a reassuring 0.
    rerender(<KpiRow status={{ state: "disabled", detail: "off" }} rates={[]} summaries={[]} />);
    expect(screen.getByTestId("kpi-rows").textContent).toContain("—");
    expect(screen.getByTestId("kpi-dlq").textContent).toContain("—");
  });
});
