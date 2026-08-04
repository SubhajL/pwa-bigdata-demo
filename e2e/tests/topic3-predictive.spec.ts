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

test("3.1b — the artifact hash on screen IS the hash the API serves (provenance, no drift)", async ({ page }) => {
  // PR-D: one hash across the running image, the API, the card on screen, and preflight.
  const model = await apiJson<{ artifact_sha256: string; data_sha256: string }>("/api/model");
  expect(model.artifact_sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(model.artifact_sha256).not.toBe(model.data_sha256); // artifact ≠ training-data hash
  await page.goto("/predictive");
  // String-for-string equality with the API — the DOM exposes the full untruncated hash.
  const sha = page.getByTestId("model-artifact-sha");
  await expect(sha).toHaveAttribute("data-sha256", model.artifact_sha256);
  // …and the judge-VISIBLE text is a recognizable prefix of that same hash.
  await expect(sha).toContainText(model.artifact_sha256.slice(0, 12));
});

test("3.2 — Health & PTTF differ across two datasets, in the DOM the judge reads (item 3.2)", async ({ page }) => {
  interface Tile { name: string; health_score: number; pttf_hours: number; pttf_out_of_range: boolean }
  const model = await apiJson<{ datasets: Tile[] }>("/api/model");
  const byName = Object.fromEntries(model.datasets.map((d) => [d.name, d]));
  await page.goto("/predictive");

  // The component's own formatting rules (web/src/lib/format.ts), replicated so the
  // VISIBLE numbers can be predicted from the API payload: formatInt rounds
  // half-away-from-zero; PTTF renders as days with exactly one fraction digit.
  const visibleInt = (v: number): string => {
    const rounded = (v < 0 ? -1 : 1) * Math.floor(Math.abs(v) + 0.5);
    return new Intl.NumberFormat("th-TH", { style: "decimal", useGrouping: true }).format(rounded);
  };
  const visibleDays = (hours: number): string =>
    new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(hours / 24);

  // Literal DOM↔API correspondence: the tiles expose the exact served values, and the
  // numbers a judge actually READS are asserted against the same payload — so neither
  // metadata nor the visible rendering can drift from what /api/model said.
  for (const name of ["healthy", "degraded"] as const) {
    const tile = page.getByTestId(`dataset-${name}`);
    await expect(tile).toBeVisible();
    await expect(tile).toHaveAttribute("data-health-score", String(byName[name].health_score));
    await expect(tile).toHaveAttribute("data-pttf-hours", String(byName[name].pttf_hours));
    await expect(tile).toHaveAttribute(
      "data-pttf-lower-bound",
      String(byName[name].pttf_out_of_range),
    );
    // The judge-visible numbers, not just tile metadata (g-check MEDIUM). EXACT text on
    // the bare-number hooks: containment accepted "122.0" for "22.0" (review round 3).
    await expect(tile.getByTestId("dataset-health-visible")).toHaveText(
      visibleInt(byName[name].health_score),
    );
    await expect(tile.getByTestId("dataset-pttf-days")).toHaveText(
      visibleDays(byName[name].pttf_hours),
    );
    // A censored PTTF must be VISIBLY a lower bound (≥), never silently exact — and an
    // exact PTTF must not wear the marker.
    const marker = tile.locator('[aria-hidden="true"]', { hasText: "≥" });
    await (byName[name].pttf_out_of_range
      ? expect(marker).toBeVisible()
      : expect(marker).toHaveCount(0));
  }

  // The separation and direction claims are made from the RENDERED values themselves.
  const domHealth = async (name: string): Promise<number> =>
    Number(await page.getByTestId(`dataset-${name}`).getAttribute("data-health-score"));
  const domPttf = async (name: string): Promise<number> =>
    Number(await page.getByTestId(`dataset-${name}`).getAttribute("data-pttf-hours"));
  expect((await domHealth("healthy")) - (await domHealth("degraded"))).toBeGreaterThanOrEqual(15);
  expect(await domPttf("healthy")).toBeGreaterThan(await domPttf("degraded")); // PTTF direction

  // …and the VISIBLE PTTF numbers must themselves differ in that direction: two hour
  // values that collapse to the same one-decimal day text would show a judge NO variation,
  // however correct the raw attributes are (g-check round-2 LOW). Read from the exact
  // bare-number hook so a marker or prefix can never leak into the parse.
  const visibleDayNumber = async (name: string): Promise<number> => {
    const text = await page
      .getByTestId(`dataset-${name}`)
      .getByTestId("dataset-pttf-days")
      .innerText();
    return Number(text.replace(/,/g, ""));
  };
  expect(await visibleDayNumber("healthy")).toBeGreaterThan(await visibleDayNumber("degraded"));
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
