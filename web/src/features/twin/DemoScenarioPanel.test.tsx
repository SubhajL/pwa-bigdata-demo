/**
 * P0 — the "สาธิตเหตุการณ์" demo director control.
 *
 * The panel is visibly a DEMONSTRATION tool: it renders only when the API's probe says
 * demo controls are enabled (`GET /api/demo/scenario → {enabled: true}`), it carries a
 * SIMULATED marker, and it surfaces the active run_id so an injection is traceable to
 * the rows it wrote. When the probe reports disabled — or fails, or returns a shape
 * without `enabled` (the screen tests' generic `{}` stub) — the panel renders NOTHING,
 * so no demo affordance can appear on a stack that has not opted in.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DemoScenarioPanel } from "./DemoScenarioPanel";

interface Captured {
  url: string;
  method: string;
  body: unknown;
}

function stubDemoFetch(options: {
  status?: { enabled: boolean; active_run_id?: string | null };
  probeFails?: boolean;
  postStatus?: number;
  captured?: Captured[];
}): void {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (options.captured) {
      options.captured.push({
        url,
        method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });
    }
    const json = (body: unknown, status = 200): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    if (!url.includes("/api/demo/scenario")) return json({});
    if (method === "GET") {
      if (options.probeFails) return Promise.reject(new TypeError("network down"));
      return json({ simulated: true, active_run_id: null, ...options.status });
    }
    if ((options.postStatus ?? 200) !== 200) return json({ detail: "boom" }, options.postStatus);
    const parsed = typeof init?.body === "string" ? (JSON.parse(init.body) as { mode: string }) : { mode: "?" };
    return json({
      run_id: `demo-${parsed.mode}-abc12345`,
      mode: parsed.mode,
      target: "P-2",
      injected_readings: 361,
      dead_letters: 0,
      removed_rows: 0,
      simulated: true,
    });
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("visibility gate", () => {
  it("renders nothing when the probe reports disabled", async () => {
    stubDemoFetch({ status: { enabled: false } });
    const { container } = render(<DemoScenarioPanel />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders nothing when the probe fails", async () => {
    stubDemoFetch({ probeFails: true });
    const { container } = render(<DemoScenarioPanel />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe("enabled panel", () => {
  it("shows the four scenario controls, a SIMULATED marker, and the active run", async () => {
    stubDemoFetch({ status: { enabled: true, active_run_id: "demo-anomaly-11aa22bb" } });
    render(<DemoScenarioPanel />);
    await screen.findByTestId("demo-scenario-panel");
    expect(screen.getByText("สาธิตเหตุการณ์")).toBeInTheDocument();
    expect(screen.getByText("SIMULATED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /จำลองแรงดันตก/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /จำลองอุปกรณ์เสื่อมสภาพ/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /จำลองข้อมูลเสีย/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /คืนสู่สภาวะปกติ/ })).toBeInTheDocument();
    expect(screen.getByTestId("demo-run-id")).toHaveTextContent("demo-anomaly-11aa22bb");
  });

  it("POSTs the mode and target, then shows the returned run_id", async () => {
    const captured: Captured[] = [];
    stubDemoFetch({ status: { enabled: true }, captured });
    render(<DemoScenarioPanel />);
    await screen.findByTestId("demo-scenario-panel");

    fireEvent.click(screen.getByRole("button", { name: /จำลองแรงดันตก/ }));

    await waitFor(() =>
      expect(screen.getByTestId("demo-run-id")).toHaveTextContent("demo-pressure_drop-abc12345"),
    );
    const post = captured.find((c) => c.method === "POST");
    expect(post?.url).toContain("/api/demo/scenario");
    expect(post?.body).toEqual({ mode: "pressure_drop", target: "P-2" });
  });

  it("surfaces a Thai error when the injection fails, and recovers the buttons", async () => {
    stubDemoFetch({ status: { enabled: true }, postStatus: 500 });
    render(<DemoScenarioPanel />);
    await screen.findByTestId("demo-scenario-panel");

    fireEvent.click(screen.getByRole("button", { name: /คืนสู่สภาวะปกติ/ }));

    await screen.findByText(/ไม่สามารถสั่งสาธิตได้/);
    expect(screen.getByRole("button", { name: /คืนสู่สภาวะปกติ/ })).toBeEnabled();
  });
});
