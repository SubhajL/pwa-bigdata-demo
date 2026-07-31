import { expect, test } from "@playwright/test";

import { apiJson } from "../lib/api";

// Topic ๓ — AI Predictive Maintenance (30 pts). The predictive panel + its API.

test("3.1 — the trained model, its algorithm and parameters are on screen (real, not the mockup)", async ({ page }) => {
  await page.goto("/predictive");
  const card = page.getByTestId("model-card");
  await expect(card).toContainText("Ridge"); // the REAL estimator (mockup fabricates Random Forest)
  await expect(card).toContainText("alpha");
  await expect(card).toContainText(/StandardScaler/);
  // model_mae beats the dummy baseline — the card's own evidence the model learned something.
  const model = await apiJson<{ metrics: { health: { model_mae: number; baseline_mae: number } } }>("/api/model");
  expect(model.metrics.health.model_mae).toBeLessThan(model.metrics.health.baseline_mae);
});

test("3.2 — Health & PTTF differ across two datasets (item 3.2)", async ({ page }) => {
  const model = await apiJson<{ datasets: { name: string; health_score: number }[] }>("/api/model");
  const byName = Object.fromEntries(model.datasets.map((d) => [d.name, d.health_score]));
  expect(byName.healthy - byName.degraded).toBeGreaterThanOrEqual(15); // materially different
  await page.goto("/predictive");
  await expect(page.getByTestId("dataset-healthy")).toBeVisible();
  await expect(page.getByTestId("dataset-degraded")).toBeVisible();
});

test("3.3 — a device's model health status is reflected on the twin (model→twin binding)", async () => {
  const health = await apiJson<{ status: string }>("/api/health/P-2");
  const topo = await apiJson<{ devices: { asset_id: string; status: string }[] }>("/api/twin/topology");
  const twin = topo.devices.find((d) => d.asset_id === "P-2")?.status;
  const rank = { normal: 0, nodata: 0, warning: 1, critical: 2 } as Record<string, number>;
  // Guard against the degenerate pass: the model must actually have scored P-2 to a non-trivial
  // severity (warning/critical), so this is a real binding and not 0>=0 on two nodata devices.
  expect(["warning", "critical"]).toContain(health.status);
  // The twin then reflects AT LEAST that model severity — the model→twin integration is live.
  // The ≤30s propagation bound is measured in api/tests/test_scoring_cycle.py.
  expect(rank[twin ?? "nodata"]).toBeGreaterThanOrEqual(rank[health.status]);
});

test("3.4 — the Feedback Loop API persists and is exposed in Swagger (item 3.4)", async ({ page }) => {
  await page.goto("/predictive");
  await expect(page.getByTestId("worklist")).toBeVisible();
  await page.getByRole("button", { name: /ส่งผลการตรวจสอบ/ }).click();
  const ack = page.getByTestId("feedback-ack");
  await expect(ack).toBeVisible();
  // Persistence evidence is the DB-RETURNED id (from INSERT … RETURNING), not the constant
  // `stored` default: a real positive `id #N` proves the row was written, not merely accepted.
  await expect(ack).toContainText(/id #[1-9]\d*/);
  await expect(ack).toContainText("stored=true");
  // …and the endpoint a judge exercises in Swagger is documented.
  const spec = await apiJson<{ paths: Record<string, unknown> }>("/openapi.json");
  expect(spec.paths["/api/feedback"]).toBeTruthy();
});

test("3.5 — the prioritized worklist is ranked worst-health first (item 3.5)", async ({ page }) => {
  const items = await apiJson<{ rank: number; health_score: number }[]>("/api/worklist?limit=20");
  expect(items.length).toBeGreaterThan(0);
  const scores = items.map((i) => i.health_score);
  expect(scores).toEqual([...scores].sort((a, b) => a - b)); // ascending health = worst first
  expect(items.map((i) => i.rank)).toEqual(items.map((_, i) => i + 1)); // rank 1..n
  await page.goto("/predictive");
  await expect(page.getByTestId("worklist")).toBeVisible();
});

test("3.6 — Root Cause Analysis names ranked signals for the selected device (item 3.6)", async ({ page }) => {
  const items = await apiJson<{ asset_id: string }[]>("/api/worklist?limit=1");
  const asset = items[0].asset_id;
  const rca = await apiJson<{ contributions: { signal: string; contribution: number }[] }>(
    `/api/rca/${encodeURIComponent(asset)}`,
  );
  expect(rca.contributions.length).toBeGreaterThan(0);
  const mags = rca.contributions.map((c) => Math.abs(c.contribution));
  expect(mags).toEqual([...mags].sort((a, b) => b - a)); // ranked, largest |contribution| first
  await page.goto("/predictive");
  await expect(page.getByTestId("rca-panel")).toBeVisible();
});

test("GLOBAL — every simulated model value carries a visible SIMULATED marker", async ({ page }) => {
  await page.goto("/predictive");
  await expect(page.getByTestId("model-card")).toBeVisible();
  // ≥5 badges: 3 KPI tiles + model card + dataset compare + worklist + RCA (honesty is P0).
  expect(await page.getByText("SIMULATED").count()).toBeGreaterThanOrEqual(5);
});
