import { expect, test } from "@playwright/test";

import {
  API_BASE,
  apiJson,
  deleteFeedbackByNote,
  feedbackCountByNote,
  feedbackIdByNote,
  pollUntil,
  postScenario,
} from "../lib/api";

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

test("3.4b — a judge drives Swagger Try it out and the row PERSISTS in the database (item 3.4)", async ({ page }) => {
  // The literal operator workflow: open /docs, expand POST /api/feedback, Try it out,
  // Execute — then prove persistence in the database itself (there is deliberately no
  // GET /api/feedback), and clean up exactly the rows this test wrote.
  const marker = `e2e-swagger-${Date.now()}`;
  try {
    await page.goto(`${API_BASE}/docs`);
    const op = page.locator(".opblock-post", { hasText: "/api/feedback" });
    await op.locator(".opblock-summary").click();
    await op.getByRole("button", { name: /try it out/i }).click();
    await op.locator("textarea.body-param__text").fill(
      JSON.stringify({ asset_id: "P-2", verdict: "confirmed", note: marker }),
    );
    await op.getByRole("button", { name: /^execute$/i }).click();

    const response = op.locator(".live-responses-table");
    // `:not(.col_header)` — the table's header cells share the response-col_* classes, so
    // a bare .first() reads the literal word "Code" instead of the live status.
    await expect(
      response.locator("td.response-col_status:not(.col_header)").first(),
    ).toHaveText("200");
    const body = response.locator("td.response-col_description:not(.col_header)").first();
    await expect(body).toContainText('"stored": true');
    const shown = (await body.innerText()).match(/"id":\s*(\d+)/);
    expect(shown, "the Swagger response must show the DB-returned id").not.toBeNull();
    const uiId = Number(shown![1]);
    expect(uiId).toBeGreaterThan(0);

    // Bounded persistence verification: exactly one row carries this test's marker, and
    // its DATABASE id is the id the judge just read in Swagger — the ack describes a real
    // row, not a canned constant.
    expect(feedbackCountByNote(marker)).toBe(1);
    expect(feedbackIdByNote(marker)).toBe(uiId);
    // The exact-removal proof belongs to the SUCCESS path: asserting it in finally would
    // replace the real Swagger/persistence failure with a 0≠1 cleanup error (both review
    // tiers; JS finally-throw semantics discard the pending exception).
    expect(deleteFeedbackByNote(marker)).toBe(1);
  } finally {
    // Unconditional, idempotent sweep (deletes 0 on the success path): a conditional
    // sweep skipped the cleanup exactly when the success-path delete itself failed
    // mid-flight, leaking the marker row forever (review-workflow LOW, round 2). Then
    // only VERIFY emptiness — never assert counts a failed try can't have produced.
    deleteFeedbackByNote(marker);
    expect(feedbackCountByNote(marker)).toBe(0);
  }
});

test("3.5 — the worklist is ranked worst-health first, and the rows a judge reads ARE the API's (item 3.5)", async ({ page }) => {
  interface Row { rank: number; health_score: number; asset_id: string }
  const items = await apiJson<Row[]>("/api/worklist?limit=20");
  expect(items.length).toBeGreaterThan(0);
  const scores = items.map((i) => i.health_score);
  expect(scores).toEqual([...scores].sort((a, b) => a - b)); // ascending health = worst first
  expect(items.map((i) => i.rank)).toEqual(items.map((_, i) => i + 1)); // rank 1..n

  await page.goto("/predictive");
  await expect(page.getByTestId("worklist")).toBeVisible();

  // First-three rendered↔API correspondence. Scores move as scoring cycles run, so the
  // comparison samples BOTH sides until they agree within one quiet window — but each
  // sample compares literally, so a reordering or value drift bug can never pass. THREE
  // rows are REQUIRED on both sides: a truncated worklist must fail this proof, not
  // satisfy it vacuously (g-check MEDIUM).
  const rows = page.getByTestId("worklist").locator('[data-testid^="worklist-row-"]');
  await pollUntil(
    async () => {
      const api = (await apiJson<Row[]>("/api/worklist?limit=3")).slice(0, 3);
      if (api.length !== 3 || (await rows.count()) < 3) return false;
      for (let i = 0; i < 3; i += 1) {
        const row = rows.nth(i);
        const [rank, asset, health, rankCell, assetButton, healthCell] = await Promise.all([
          row.getAttribute("data-rank"),
          row.getAttribute("data-asset"),
          row.getAttribute("data-health-score"),
          row.locator("td").first().innerText(),
          row.getByRole("button").innerText(),
          row.getByTestId("worklist-health-cell").innerText(),
        ]);
        // formatInt's half-away-from-zero rounding, replicated for the visible numeral.
        const vInt = (v: number): string => {
          const r = (v < 0 ? -1 : 1) * Math.floor(Math.abs(v) + 0.5);
          return new Intl.NumberFormat("th-TH", { style: "decimal", useGrouping: true }).format(r);
        };
        if (
          rank !== String(api[i].rank) ||
          asset !== api[i].asset_id ||
          health !== String(api[i].health_score) ||
          // …and the JUDGE-VISIBLE cells, not only the metadata attributes: the rendered
          // rank, asset label, AND health numeral must be the API's too (review-workflow
          // MEDIUM: the WorklistRow→HealthMeter seam was otherwise unproven live).
          rankCell.trim() !== String(api[i].rank) ||
          assetButton.trim() !== api[i].asset_id ||
          !healthCell.includes(vInt(api[i].health_score))
        ) {
          return false;
        }
      }
      return true;
    },
    { timeoutMs: 30_000, label: "first three rendered worklist rows to match the API's" },
  );
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

test("3.6b — two different induced anomalies produce two different TOP rendered causes (item 3.6)", async ({ page }) => {
  // Model-LOCAL attribution is the claim: a worn-trajectory anomaly tops on vibration,
  // while the hot-bearing anomaly (healthy baseline, bearing pinned above band) tops on
  // bearing temperature. Global feature importance ranks identically for every window and
  // cannot pass this. Both are allow-listed demo scenarios a judge can drive from the
  // สาธิตเหตุการณ์ panel. (`pressure_drop` cannot serve as the second cause: every fault
  // mode except bearing_anomaly rides the WORN trajectory, whose vibration dominates
  // attribution regardless of the injected instant.)
  interface Rca { contributions: { signal: string; contribution: number }[] }
  const apiTop = async (): Promise<string | undefined> =>
    (await apiJson<Rca>("/api/rca/P-2")).contributions[0]?.signal;

  try {
    await postScenario("anomaly", "P-2"); // worn trajectory + above-band vibration
    await pollUntil(async () => (await apiTop()) === "vibration", {
      timeoutMs: 35_000, label: "vibration to top the model's local attribution",
    });
    await page.goto("/predictive");
    await page.getByRole("button", { name: "P-2" }).click();
    const topBar = page.getByTestId("rca-panel").locator("[data-signal]").first();
    await expect(topBar).toHaveAttribute("data-signal", "vibration");

    await postScenario("bearing_anomaly", "P-2"); // healthy baseline, hot bearing
    await pollUntil(async () => (await apiTop()) === "bearing_temp_c", {
      timeoutMs: 35_000, label: "bearing temperature to top the model's local attribution",
    });
    // The named cause must come WITH a visible symptom: a hot-bearing device the
    // worklist/twin still call normal would be an RCA claiming a fault on a healthy
    // machine (review-workflow LOW).
    const health = await apiJson<{ status: string }>("/api/health/P-2");
    expect(["warning", "critical"]).toContain(health.status);
    await page.reload();
    await page.getByRole("button", { name: "P-2" }).click();
    await expect(topBar).toHaveAttribute("data-signal", "bearing_temp_c");
  } finally {
    // Restore the suite's warm-state convention UNCONDITIONALLY (both review tiers): a
    // mid-test failure must not leave the serialized shared stack off the documented
    // pressure_drop end-state. Poll the MODE-SPECIFIC observable — the active run_id of
    // the restore application — because "health degraded" was already true under both
    // anomaly modes and could never verify pressure_drop specifically (review-workflow
    // LOW, round 2).
    const restored = await postScenario("pressure_drop", "P-2");
    await pollUntil(
      async () => {
        const status = await apiJson<{ active_run_id: string | null }>("/api/demo/scenario");
        return status.active_run_id === restored.run_id;
      },
      { timeoutMs: 15_000, label: "the pressure_drop restore to be the active scenario" },
    );
  }
});

test("GLOBAL — every simulated model value carries a visible SIMULATED marker", async ({ page }) => {
  await page.goto("/predictive");
  await expect(page.getByTestId("model-card")).toBeVisible();
  // ≥5 badges: 3 KPI tiles + model card + dataset compare + worklist + RCA (honesty is P0).
  expect(await page.getByText("SIMULATED").count()).toBeGreaterThanOrEqual(5);
});
