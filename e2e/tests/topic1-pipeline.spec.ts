import { expect, test } from "@playwright/test";

import {
  apiJson,
  dbDur,
  dlqTotal,
  pipelineStatus,
  pollUntil,
  restartBroker,
  setFault,
} from "../lib/api";

// Topic ๑ — Real-time Data Pipeline (35 pts). Drives the real broker/DB, no fixtures.

test("1.1 — MQTT ingest is continuous (received advances over time)", async () => {
  const before = (await pipelineStatus()).received;
  await new Promise((r) => setTimeout(r, 3500));
  const after = (await pipelineStatus()).received;
  expect(after).toBeGreaterThan(before);
});

test("1.2 — subscriber auto-reconnects and resumes ingest ≤ 30s", async () => {
  const before = (await pipelineStatus()).received;
  const start = Date.now();
  restartBroker();
  await pollUntil(
    async () => {
      const s = await pipelineStatus();
      return s.state === "connected" && s.received > before;
    },
    { timeoutMs: 30_000, intervalMs: 1000, label: "reconnect + ingest resume" },
  );
  expect(Date.now() - start).toBeLessThanOrEqual(30_000);
});

test("1.3 — a real endpoint responds under 500ms, visible in the Network panel", async ({ page }) => {
  await page.goto("/pipeline");
  // The pipeline monitor probes /api/telemetry/P-2/latest; capture ITS response (not poll traffic).
  const resp = await page.waitForResponse((r) => /\/api\/telemetry\/[^/]+\/latest/.test(r.url()), {
    timeout: 20_000,
  });
  // The DevTools evidence (scored item 1.3) is the Server-Timing header: db;dur present AND under
  // budget. (Playwright's request().timing().responseEnd is unreliable here — it returns -1 — so we
  // do NOT depend on it; the round-trip itself is measured by the app, asserted below.)
  const db = dbDur(resp.headers()["server-timing"] ?? null);
  expect(db, "Server-Timing db;dur present (the DevTools evidence)").not.toBeNull();
  expect(db as number).toBeLessThanOrEqual(500);
  // …and the on-screen Response-Time table reports the app's own MEASURED round-trip under budget.
  await expect(page.getByTestId("budget-ok").first()).toBeVisible({ timeout: 30_000 });
});

test("1.4 — time-series write + correct historical retrieval", async ({ page }) => {
  const range = await apiJson<{ count: number; readings: { ts: string }[] }>(
    "/api/telemetry/P-2/range?minutes=15",
  );
  expect(range.count).toBeGreaterThan(0);
  // ascending by ts (the retrieval is ordered, not a bag of rows)
  const ts = range.readings.map((r) => Date.parse(r.ts));
  expect(ts).toEqual([...ts].sort((a, b) => a - b));
  // and the retrieval-evidence panel shows rows on screen
  await page.goto("/pipeline");
  await expect(page.getByTestId("range-row").first()).toBeVisible({ timeout: 30_000 });
});

async function telemetryTotal(): Promise<number> {
  return (await pipelineStatus()).conservation?.telemetry ?? 0;
}

test("1.5 — a bad Asset ID is dead-lettered and the main flow stays uninterrupted", async () => {
  const dlqBefore = await dlqTotal();
  try {
    // The bad burst is routed to the DLQ (the consumer ran and validated it — `received` alone
    // would not prove that, since it increments on the paho callback BEFORE validation).
    setFault("bad_asset");
    await pollUntil(async () => (await dlqTotal()) > dlqBefore, {
      timeoutMs: 40_000,
      label: "DLQ total grows under bad_asset",
    });
    // Main flow uninterrupted: after the bad burst, GOOD telemetry resumes being written to the
    // hypertable — proving the loop was never stalled by the bad messages (conservation.telemetry
    // only advances on a validated, stored reading, unlike the pre-validation `received` counter).
    const telAfterBad = await telemetryTotal();
    setFault("normal");
    await pollUntil(async () => (await telemetryTotal()) > telAfterBad, {
      timeoutMs: 60_000,
      label: "good telemetry resumes (main flow uninterrupted)",
    });
  } finally {
    setFault("normal");
  }
});
