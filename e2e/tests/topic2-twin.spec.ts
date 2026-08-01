import { expect, test, type Page } from "@playwright/test";

import { apiJson } from "../lib/api";

// Topic ๒ — Real-time Digital Twin (35 pts).
//
// NOTE (items 2.2/2.4): the socket-driven status update and the pressure-drop impact panel are
// unit/integration-verified in web/src/features/twin/useTwinSocket.test.tsx and api/tests/test_twin_*.py.
// The PR-7 demo-data tuning (scripts/backfill_history.py::DEMO_WEAR_OVERRIDE) backfills P-2 to
// health≈32 → `critical` (still pre-failure), so at a true cold start the twin colours it red;
// pressure_drop drives pressure below the 2.0 low band (simulator/tests/test_pressure_drop.py). These
// specs assert the wired, live surfaces (real data, not the static mockup) and tolerate `warning` as
// well as `critical`: the live window averages readings per clock-hour, so a stack that has been
// running a while washes P-2's health from red back up toward `warning`/`normal` (docs/demo-runbook.md).

interface Device { asset_id: string; status: string; kind: string }

async function p2Status(): Promise<string> {
  const topo = await apiJson<{ devices: Device[] }>("/api/twin/topology");
  return topo.devices.find((d) => d.asset_id === "P-2")?.status ?? "?";
}

async function selectP2(page: Page): Promise<void> {
  await page.locator('[data-asset="P-2"]').click();
}

test("2.1 — the schematic is vector SVG that zooms without resolution loss", async ({ page }) => {
  await page.goto("/operations");
  const svg = page.getByTestId("twin-schematic");
  await expect(svg).toBeVisible();
  // Vector primitives, and NOT a raster <image> masquerading as SVG.
  expect(await svg.locator("path, circle, rect, line").count()).toBeGreaterThan(0);
  expect(await svg.locator("image").count()).toBe(0);
  // Zoom changes ONLY the viewBox (resolution-independent), never the element size.
  const before = await svg.getAttribute("viewBox");
  await page.getByRole("button", { name: "ขยายเข้า" }).click();
  await expect(svg).not.toHaveAttribute("viewBox", before ?? "");
});

test("2.2 — device status on the twin is LIVE data, agreeing with the API (not a static mock)", async ({ page }) => {
  await page.goto("/operations");
  const symbol = page.locator('[data-asset="P-2"]');
  await expect(symbol).toBeVisible();
  // The rendered status equals the API's current status — the screen reflects live topology, not
  // the Stitch mockup's fabricated values. (The no-refresh socket push is unit-tested in PR-7.)
  const dom = await symbol.getAttribute("data-status");
  expect(dom).toBe(await p2Status());
  expect(["normal", "warning", "critical", "nodata"]).toContain(dom);
});

test("2.3 — a non-nominal pump shows its shape-coded status and a SEC tooltip from real data", async ({ page }) => {
  await page.goto("/operations");
  // P-2 is non-nominal (red at cold start; `warning` once the live window warms), rendered as a
  // distinct SHAPE, never colour alone.
  const symbol = page.locator('[data-asset="P-2"]');
  await expect(symbol).toHaveAttribute("data-status", /warning|critical/);
  expect(await symbol.locator("[data-symbol]").count()).toBeGreaterThan(0);
  await selectP2(page);
  await expect(page.getByText(/อัตราการใช้พลังงานจำเพาะ · P-2/)).toBeVisible();
  await expect(page.getByText("kWh/m³")).toBeVisible();
});

test("2.4 — pressure-drop impact joins pipe topology to affected customers (item 2.4 data path)", async ({ page }) => {
  // The affected-customers set is a real recursive topology join, not a fabricated count. P-2 feeds
  // PIPE-P2-TANK; downstream customers are non-empty and API-derived.
  const impact = await apiJson<{ count: number; customers: unknown[]; affected_pipe_ids: string[] }>(
    "/api/twin/impact/PIPE-P2-TANK",
  );
  expect(impact.count).toBeGreaterThan(0);
  expect(impact.affected_pipe_ids.length).toBeGreaterThan(1);
  // The ImpactPanel is present on the twin (renders the customer list when a drop is active).
  await page.goto("/operations");
  await expect(page.getByText("ผู้ใช้น้ำที่ได้รับผลกระทบ")).toBeVisible();
});

test("2.5 — the twin renders ≥3 distinct components (source-structure corroboration)", async ({ page }) => {
  await page.goto("/operations");
  // schematic + at least one device symbol + pipe edges = three distinct components.
  await expect(page.getByTestId("twin-schematic")).toBeVisible();
  expect(await page.locator("[data-asset]").count()).toBeGreaterThanOrEqual(1);
  expect(await page.getByTestId("twin-schematic").locator("line, path").count()).toBeGreaterThan(1);
});
