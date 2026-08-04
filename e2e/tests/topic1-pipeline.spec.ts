import { expect, test, type Page } from "@playwright/test";

import { apiJson, dbDur, pollUntil, setFault, startBroker, stopBroker } from "../lib/api";

// Topic ๑ — Real-time Data Pipeline (35 pts). Drives the real broker/DB, no fixtures.
//
// PR-B evidence hardening: every proof is observed on ONE open /pipeline DOM — the page a
// judge is actually watching — through the stable evidence attributes (kpi-rows / kpi-dlq
// `data-value`, rt-row `data-count/-failures/-mean-ms`, ConnectionPill `data-kind`), with
// API reads only as secondary corroboration. `received` alone is never trusted: it counts
// the paho callback BEFORE validation, so committed proof always reads
// `conservation.telemetry` (rows the DB accepted) via the rows-written KPI.

/** simulator/app/models.py::BAD_ASSET_ID — the unknown id FAULT_MODE=bad_asset publishes. */
const BAD_ASSET_ID = "PWA-UNKNOWN-DEVICE-000";

async function openPipeline(page: Page): Promise<void> {
  await page.goto("/pipeline");
  await expect(page.getByTestId("pipeline-monitor")).toBeVisible();
  // Marker proving all later observations happened on this same loaded DOM (no reload).
  await page.evaluate(() => {
    (window as Window & { __samePage?: boolean }).__samePage = true;
  });
}

async function assertNotReloaded(page: Page): Promise<void> {
  const marker = await page.evaluate(
    () => (window as Window & { __samePage?: boolean }).__samePage ?? false,
  );
  expect(marker, "the page was never reloaded — same-DOM proof").toBe(true);
}

/** Read a machine-readable `data-value` evidence attribute off the open DOM. */
async function domValue(page: Page, testId: string): Promise<number> {
  const raw = await page.getByTestId(testId).getAttribute("data-value");
  if (raw == null) throw new Error(`${testId} exposes no data-value yet`);
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${testId} data-value=${raw} is not numeric`);
  return n;
}

/** ConnectionPill state as rendered (`data-kind` is unique to the pill on this screen). */
function domKind(page: Page): Promise<string | null> {
  return page.locator("[data-kind]").first().getAttribute("data-kind");
}

/** Wait until a data-value attribute exists for `testId` (first status poll landed). */
function waitForValue(page: Page, testId: string): Promise<void> {
  return pollUntil(
    async () => (await page.getByTestId(testId).getAttribute("data-value")) != null,
    { timeoutMs: 20_000, label: `${testId} renders a machine-readable value` },
  );
}

test("1.1 — committed ingest grows on the OPEN page: rows-written KPI advances, pill stays connected", async ({ page }) => {
  await openPipeline(page);
  await waitForValue(page, "kpi-rows");
  const before = await domValue(page, "kpi-rows");
  // conservation.telemetry only advances on a validated, STORED reading — watching the KPI
  // tile move is watching committed ingest, not the pre-validation callback counter.
  await expect.poll(() => domValue(page, "kpi-rows"), { timeout: 30_000 }).toBeGreaterThan(before);
  expect(await domKind(page), "the connection pill is live at proof time").toBe("ok");
  await assertNotReloaded(page);
});

test("1.2 — broker outage is VISIBLE on the open page, then reconnect + committed ingest resume ≤ 30s", async ({ page }) => {
  test.setTimeout(150_000);
  await openPipeline(page);
  await pollUntil(async () => (await domKind(page)) === "ok", {
    timeoutMs: 20_000,
    label: "pill connected before the drill",
  });
  await waitForValue(page, "kpi-rows");
  try {
    stopBroker();
    // The outage becomes judge-visible on the SAME DOM: paho loses the socket and the 2 s
    // status poll carries the state change into the pill (down or reconnect-pending).
    await pollUntil(
      async () => {
        const k = await domKind(page);
        return k === "down" || k === "pending";
      },
      { timeoutMs: 30_000, label: "pill shows the outage (down|pending)" },
    );
    const committedAtOutage = await domValue(page, "kpi-rows");
    // Clock starts BEFORE the compose invocation so container/compose startup is inside the
    // 30 s budget — the judge's stopwatch starts when the operator acts, not when Docker
    // finishes. Residual accepted: a commit already in disposition-retry backoff (≤ ~3.75 s)
    // could land past the watermark, but the conjunct below still requires a real
    // reconnect+SUBACK before it can pass.
    const t0 = Date.now();
    startBroker();
    // Recovery is only proven when BOTH are true on the open page: the pill is back to ok
    // AND committed rows moved past the outage watermark (persistence resumed, item 1.2).
    await pollUntil(
      async () =>
        (await domKind(page)) === "ok" && (await domValue(page, "kpi-rows")) > committedAtOutage,
      { timeoutMs: 30_000, intervalMs: 500, label: "pill ok + committed rows grow post-reconnect" },
    );
    expect(
      Date.now() - t0,
      "item 1.2: reconnect AND resumed persistence within 30 s of broker start",
    ).toBeLessThanOrEqual(30_000);
  } finally {
    startBroker(); // idempotent — never leave the stack without its broker
  }
  await assertNotReloaded(page);
});

test("1.3 — ALL displayed endpoints complete five probes with zero failures and mean ≤ 500 ms", async ({ page }) => {
  await openPipeline(page);
  // DevTools half of item 1.3: the app's own /latest probe answers with Server-Timing db;dur.
  const resp = await page.waitForResponse((r) => /\/api\/telemetry\/[^/]+\/latest/.test(r.url()), {
    timeout: 20_000,
  });
  const db = dbDur(resp.headers()["server-timing"] ?? null);
  expect(db, "Server-Timing db;dur present (the DevTools evidence)").not.toBeNull();
  expect(db as number).toBeLessThanOrEqual(500);
  // On-screen half: a COMPLETE clean round — three rows, each 5/5 calls, zero failures,
  // mean ≤ 500, budget-ok verdict. Captured as ONE atomic DOM snapshot per poll so every
  // assertion describes the SAME probe round (rounds replace all summaries in one commit).
  interface RtRow {
    path: string | null;
    count: string | null;
    failures: string | null;
    meanMs: string | null;
    verdictOk: boolean;
  }
  const snapshotRows = (): Promise<RtRow[]> =>
    page.$$eval('[data-testid="rt-row"]', (rows) =>
      rows.map((r) => ({
        path: r.getAttribute("data-path"),
        count: r.getAttribute("data-count"),
        failures: r.getAttribute("data-failures"),
        meanMs: r.getAttribute("data-mean-ms"),
        verdictOk: r.querySelector('[data-testid="budget-ok"]') != null,
      })),
    );
  let clean: RtRow[] = [];
  await pollUntil(
    async () => {
      const rows = await snapshotRows();
      if (rows.length !== 3) return false;
      if (!rows.every((r) => r.count === "5" && r.failures === "0")) return false;
      clean = rows;
      return true;
    },
    { timeoutMs: 60_000, label: "a complete 3×5 zero-failure probe round on screen" },
  );
  for (const r of clean) {
    const mean = parseFloat(r.meanMs ?? "NaN");
    expect(Number.isFinite(mean), `numeric on-screen mean for ${r.path}`).toBe(true);
    expect(mean, `browser round-trip mean ≤ 500 ms for ${r.path}`).toBeLessThanOrEqual(500);
    expect(r.verdictOk, `budget-ok verdict for ${r.path} (text+icon, never colour alone)`).toBe(true);
  }
  await assertNotReloaded(page);
});

test("1.4 — time-series write + correct historical retrieval", async ({ page }) => {
  const range = await apiJson<{ count: number; readings: { ts: string }[] }>(
    "/api/telemetry/P-2/range?minutes=15",
  );
  expect(range.count).toBeGreaterThan(0);
  // ascending by ts (the retrieval is ordered, not a bag of rows)
  const ts = range.readings.map((r) => Date.parse(r.ts));
  expect(ts).toEqual([...ts].sort((a, b) => a - b));
  // and the retrieval-evidence panel shows rows on screen, RENDERED in ascending order —
  // the visible table proves ordered retrieval, not just the Node-side API read above.
  await page.goto("/pipeline");
  await expect(page.getByTestId("range-row").first()).toBeVisible({ timeout: 30_000 });
  const renderedTs = await page.$$eval('[data-testid="range-row"]', (rows) =>
    rows.map((r) => r.getAttribute("data-ts") ?? ""),
  );
  expect(renderedTs.length).toBeGreaterThan(0);
  const rendered = renderedTs.map((t) => Date.parse(t));
  expect(rendered.every(Number.isFinite), "every rendered row carries a parseable ts").toBe(true);
  expect(rendered).toEqual([...rendered].sort((a, b) => a - b));
});

test("1.5 — a bad Asset ID from real MQTT lands VISIBLY in the DLQ and the main flow continues, same DOM", async ({ page }) => {
  test.setTimeout(180_000);
  await openPipeline(page);
  await waitForValue(page, "kpi-dlq");
  const dlqBefore = await domValue(page, "kpi-dlq");
  try {
    // The scored 1.5 mechanism: the SIMULATOR publishes the unknown id through the real
    // broker; the consumer validates and dead-letters it (not the demo director's direct
    // insert — that path is a labelled visual, see DemoScenarioPanel).
    // Arm the page-0 refetch listener BEFORE injecting: the page fetch uses limit=25 (the
    // probe's /api/dlq?limit=1 traffic cannot satisfy this), so catching one such response
    // AFTER injection proves the auto-refresh actually fired — the visible row cannot be
    // a leftover of the initial page load from an earlier bad_asset run.
    const pageZeroRefetch = page.waitForResponse(
      (r) => r.url().includes("/api/dlq") && r.url().includes("limit=25") && r.ok(),
      { timeout: 60_000 },
    );
    setFault("bad_asset");
    await pollUntil(async () => (await domValue(page, "kpi-dlq")) > dlqBefore, {
      timeoutMs: 60_000,
      label: "DLQ total grows under bad_asset (same DOM)",
    });
    await pageZeroRefetch;
    // The offending row itself — unknown id + reason — is rendered with NO reload: the
    // screen refetches DLQ page 0 when the polled total moves.
    await expect(
      page.getByTestId("dlq-row").filter({ hasText: BAD_ASSET_ID }).first(),
    ).toBeVisible({ timeout: 20_000 });
    // Main flow uninterrupted: committed GOOD telemetry keeps growing after the reset.
    const committedAfterBad = await domValue(page, "kpi-rows");
    setFault("normal");
    await pollUntil(async () => (await domValue(page, "kpi-rows")) > committedAfterBad, {
      timeoutMs: 60_000,
      label: "good committed telemetry resumes (loop never stalled)",
    });
  } finally {
    setFault("normal");
  }
  await assertNotReloaded(page);
});
