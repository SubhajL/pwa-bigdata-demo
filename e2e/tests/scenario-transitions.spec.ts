import { expect, test, type Page } from "@playwright/test";

import { apiJson, demoStatus, dlqTotal, pipelineStatus, pollUntil, postScenario } from "../lib/api";

// P0 + P1 — the deterministic demo director, TRANSITION-proven.
//
// The earlier topic specs assert live SNAPSHOTS (the DOM agrees with the API now). These
// specs assert TRANSITIONS: the page is loaded once, the scenario API injects the fault
// from outside the browser, and the SAME DOM — no reload, proven by a window marker — is
// watched changing state. Two attributable stages per fault:
//
//   band stage   `kind="status"`  — POST → below-band frame → data-status leaves normal
//                                   within seconds (a pressure drop's band status can
//                                   never exceed `warning`, see api/app/bands.py);
//   model stage  `kind="health"`  — the UNTOUCHED scoring loop scores the injected
//                                   window through the shipped model → `critical`
//                                   reaches the same DOM ≤30s from the POST, real timer.
//
// The suite deliberately ENDS on `pressure_drop`: the demonstrated pump P-2 is left
// degraded, which is the state the later topic2/topic3 specs (2.3 warning|critical,
// 3.3 model severity) expect — on a warm stack the live window otherwise washes P-2
// back toward normal and those snapshot specs get flaky.

const P2 = '[data-asset="P-2"]';

/** DOM-only read of P-2's rendered status. */
function p2Dom(page: Page): Promise<string | null> {
  return page.locator(P2).getAttribute("data-status");
}

/** Load /operations once, with the socket open, and stamp the no-reload marker. */
async function openTwin(page: Page): Promise<void> {
  await page.goto("/operations");
  await expect(page.locator(P2)).toBeVisible();
  await expect(page.getByText("เชื่อมต่อแล้ว")).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    (window as Window & { __no_reload?: number }).__no_reload = 1;
  });
}

async function assertNotReloaded(page: Page): Promise<void> {
  const marker = await page.evaluate(
    () => (window as Window & { __no_reload?: number }).__no_reload,
  );
  expect(marker, "the page must never have reloaded during the transition").toBe(1);
}

/** Drive P-2 to a DOM-observed `normal` baseline (band frame instant, health ≤1 cycle). */
async function resetToNormal(page: Page): Promise<void> {
  await postScenario("normal");
  await expect.poll(() => p2Dom(page), { timeout: 45_000 }).toBe("normal");
}

test.beforeAll(async () => {
  // HARD assertion, not a skip: a suite-wide skip would turn "the scenario API is
  // unreachable/miswired" into a green gate that ran zero scenario tests. The compose
  // stack always sets DEMO_CONTROLS=1; anything else is a broken stack, not a variant.
  const status = await demoStatus();
  expect(status.enabled, "stack must run with DEMO_CONTROLS=1 (infra/docker-compose.yml)").toBe(true);
});

test("P0 — the scenario API is live, re-applies cleanly, and is traceable by run_id", async () => {
  const first = await postScenario("normal");
  const second = await postScenario("normal");
  expect(first.run_id).not.toBe(second.run_id);
  expect(second.injected_readings).toBeGreaterThan(0);
  // The first application's rows were removed by the second (reset is idempotent).
  expect(second.removed_rows).toBe(first.injected_readings);
  const status = await demoStatus();
  expect(status.active_run_id).toBe(second.run_id);
});

test("P1 — pressure_drop transitions the SAME loaded twin: band stage, pipes, customers, then model critical ≤30s", async ({ page }) => {
  await openTwin(page);
  await resetToNormal(page);
  // No active drop: no highlighted pipe, the impact panel shows its placeholder.
  expect(await page.locator('[data-affected="true"]').count()).toBe(0);
  await expect(page.getByText("ไม่มีเหตุแรงดันตกในขณะนี้")).toBeVisible();

  // A MutationObserver records EVERY data-status the DOM passes through, so the brief
  // band-stage `warning` is captured even if a scoring cycle lands moments later.
  await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (el == null) throw new Error(`no element for ${selector}`);
    const w = window as Window & { __statusHistory?: string[] };
    w.__statusHistory = [el.getAttribute("data-status") ?? ""];
    new MutationObserver(() => {
      w.__statusHistory?.push(el.getAttribute("data-status") ?? "");
    }).observe(el, { attributes: true, attributeFilter: ["data-status"] });
  }, P2);

  const injectedAt = Date.now();
  await postScenario("pressure_drop");

  // Band stage: the injected below-band frame arrives over the open socket in seconds.
  await expect.poll(() => p2Dom(page), { timeout: 10_000 }).not.toBe("normal");
  expect(["warning", "critical"]).toContain(await p2Dom(page));

  // The drop drives the impact join: outgoing pipes highlight, the seeded (SIMULATED) customers render.
  // (Count, not toBeVisible: a horizontal SVG <line> has a zero-height bounding box,
  // which Playwright's visibility rule calls hidden even while it renders red on screen.)
  await expect
    .poll(() => page.locator('[data-affected="true"]').count(), { timeout: 15_000 })
    .toBeGreaterThan(0);
  await expect(page.getByTestId("impact-customer").first()).toBeVisible({ timeout: 15_000 });

  // Model stage: `critical` is unreachable from a pressure band frame, so observing it
  // is observing the scoring loop's health broadcast — within the item-3.3 budget,
  // measured from the injection on a real clock.
  const remaining = Math.max(30_000 - (Date.now() - injectedAt), 1_000);
  await expect.poll(() => p2Dom(page), { timeout: remaining }).toBe("critical");

  // The recorded DOM history proves BOTH attributable stages were rendered, in order:
  // the band frame's warning first, the model's critical last.
  const history = await page.evaluate(
    () => (window as Window & { __statusHistory?: string[] }).__statusHistory ?? [],
  );
  expect(history).toContain("warning");
  expect(history[history.length - 1]).toBe("critical");
  expect(history.indexOf("warning")).toBeLessThan(history.lastIndexOf("critical"));

  // The API's model verdict agrees with what the DOM showed (secondary corroboration).
  const health = await apiJson<{ status: string }>("/api/health/P-2");
  expect(["warning", "critical"]).toContain(health.status);

  await assertNotReloaded(page);
});

test("P1 — normal recovers the same DOM: symbol back to normal, highlights and customers cleared", async ({ page }) => {
  await openTwin(page);
  await postScenario("pressure_drop");
  await expect.poll(() => p2Dom(page), { timeout: 10_000 }).not.toBe("normal");

  const resetAt = Date.now();
  await postScenario("normal");
  // The in-band pressure frame clears the drop immediately; the health recovery frame
  // (critical → normal) lands within a scoring cycle. Both reach the SAME loaded page,
  // inside the same ≤30s budget the runbook advertises for the model path.
  await expect.poll(() => p2Dom(page), { timeout: 30_000 }).toBe("normal");
  expect(Date.now() - resetAt).toBeLessThanOrEqual(31_000);
  await expect.poll(() => page.locator('[data-affected="true"]').count(), { timeout: 15_000 }).toBe(0);
  await expect(page.getByText("ไม่มีเหตุแรงดันตกในขณะนี้")).toBeVisible();
  await assertNotReloaded(page);
});

test("P0 — bad_asset dead-letters exactly one message and ingest keeps flowing", async () => {
  const dlqBefore = await dlqTotal();
  const result = await postScenario("bad_asset");
  expect(result.dead_letters).toBe(1);
  await pollUntil(async () => (await dlqTotal()) >= dlqBefore + 1, {
    timeoutMs: 10_000,
    label: "demo dead letter visible in conservation",
  });
  // The pipeline was never stalled — proven by PERSISTED evidence, not the paho
  // callback counter: `received` increments on the network thread before validation or
  // storage, so it keeps rising even when the consumer is wedged. The ledger only grows
  // when dispositions actually commit.
  const ledgerBefore = (await pipelineStatus()).conservation?.ledger ?? 0;
  await pollUntil(
    async () => ((await pipelineStatus()).conservation?.ledger ?? 0) > ledgerBefore,
    { timeoutMs: 20_000, label: "dispositions still committing after bad_asset" },
  );
});

test("P0 — the on-screen สาธิตเหตุการณ์ control drives the same injection, traceably", async ({ page }) => {
  await openTwin(page);
  await resetToNormal(page);
  const panel = page.getByTestId("demo-scenario-panel");
  await expect(panel).toBeVisible();

  await page.getByRole("button", { name: "จำลองแรงดันตก" }).click();

  // The run_id the panel reports is the run the API now calls active — traceability.
  await expect(page.getByTestId("demo-run-id")).toHaveText(/demo-pressure_drop-/, { timeout: 10_000 });
  const shown = await page.getByTestId("demo-run-id").textContent();
  const status = await demoStatus();
  expect(shown).toBe(status.active_run_id);

  // And the twin it sits beside reacts — same fault, four scored items, one click.
  await expect.poll(() => p2Dom(page), { timeout: 10_000 }).not.toBe("normal");
});
