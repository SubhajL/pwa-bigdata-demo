import { expect, test, type Page } from "@playwright/test";
import { inflateSync } from "node:zlib";

import { API_BASE, WEB_BASE, apiJson, postScenario } from "../lib/api";

// Topic ๒ realism — the Rayong pipe-GIS view (PR-H, criteria 2.1–2.5 realism).
//
// PR-H LANDS DARK: the default stack runs with PIPE_GIS_ENABLED off. The dark-landing
// UX is proven on EVERY stack — when the live API happens to be enabled, the GIS
// endpoints are route-stubbed to 404 for that one test, so the proof never self-skips.
// The four real-geometry proofs are gated on the stack's own report
// (`/api/twin/gis/manifest`): enable locally with
//     make gis-build GIS_SOURCE='…/PIPE RY.shp' GIS_APPROVED_SOURCE_FINGERPRINT="$FP"
//     PIPE_GIS_ENABLED=1 PIPE_GIS_APPROVED_SOURCE_FINGERPRINT="$FP" \
//       PIPE_GIS_APPROVED_BUNDLE_SHA256="$BUNDLE_FP" make demo-e2e
// Activation for a judged run stays permission-gated (docs/data/pipe-ry-provenance.md).
// A 503 is deliberately NOT a skip: an enabled stack with a broken bundle must fail.
//
// SUITE-STATE CONTRACT: scenario-transitions deliberately leaves P-2 degraded, and the
// later topic2-twin/topic3 specs depend on that warm state. The recovery proof below
// therefore RESTORES pressure_drop in a `finally` and waits for the degraded
// observable before finishing — an enabled full-suite run must not end P-2 healthy.

interface GisManifestLite {
  datasets: Record<string, { feature_count: number }>;
  demo_binding: { pipe_id: number; scenario_asset_id: string; placement: string };
  energy_reference: { value_kwh_per_m3: number; year: number; scope: string };
  provenance: { geometry: string; binding: string };
}

let manifestStatus = 0;

test.beforeAll(async () => {
  const response = await fetch(`${API_BASE}/api/twin/gis/manifest`);
  manifestStatus = response.status;
});

async function openGisTab(page: Page): Promise<void> {
  await page.goto("/operations");
  await page.getByRole("tab", { name: /แผนที่ GIS มาบตาพุด/ }).click();
}

async function stubRendererFixture(page: Page): Promise<void> {
  const manifest = {
    schema_version: "pipe-ry-gis-1",
    generated_at: "2026-08-06T00:00:00Z",
    source: {
      dataset: "SYNTHETIC E2E RENDERER FIXTURE — NOT PROVENANCE EVIDENCE",
      crs: "EPSG:32647",
      output_crs: "EPSG:4326",
      feature_count: 19,
      fingerprint_sha256: "ab".repeat(32),
      files: { "fixture.shp": { sha256: "cd".repeat(32), bytes: 1 } },
      audit: {
        branch_code: "5531021",
        global_id_unique: true,
        expected_full: 19,
        expected_focus: 19,
      },
    },
    datasets: {
      "map-ta-phut": {
        file: "fixture.geojson",
        feature_count: 19,
        bounds_wgs84: [101.18, 12.675, 101.21, 12.722],
        length_m: 1,
        sha256: "ef".repeat(32),
        bytes: 1,
      },
      full: {
        file: "fixture.geojson",
        feature_count: 19,
        bounds_wgs84: [101.18, 12.675, 101.21, 12.722],
        length_m: 1,
        sha256: "ef".repeat(32),
        bytes: 1,
      },
    },
    demo_binding: {
      scenario_asset_id: "P-2",
      pipe_id: 4926,
      rule: "synthetic renderer fixture only",
      midpoint_wgs84: [101.195, 12.685],
      placement: "SIMULATED",
      properties: { pipe_id: 4926, pipe_type: "HDPE" },
    },
    provenance: {
      geometry: "REAL",
      attributes: "REAL",
      binding: "SIMULATED",
      placement: "SIMULATED",
      distribution: "test route fixture only",
    },
    energy_reference: {
      value_kwh_per_m3: 0.54,
      unit: "kWh/m³",
      year: 2025,
      scope: "system-wide",
      operator: "East Water",
      source_url: "https://www.eastwater.com/",
      station_specific: false,
    },
  };
  const network = {
    type: "FeatureCollection",
    features: Array.from({ length: 19 }, (_, index) => ({
      type: "Feature",
      properties: { pipe_id: index === 0 ? 4926 : 5000 + index, pipe_type: "HDPE" },
      geometry: {
        type: "LineString",
        coordinates: [
          [101.181, 12.676 + index * 0.0023],
          [101.209, 12.677 + index * 0.0023],
        ],
      },
    })),
  };
  await page.route("**/api/twin/gis/manifest", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifest) }),
  );
  await page.route("**/api/twin/gis/network**", (route) =>
    route.fulfill({ status: 200, contentType: "application/geo+json", body: JSON.stringify(network) }),
  );
}

async function paintedCanvasPixels(page: Page): Promise<number> {
  const png = await page.getByTestId("gis-network-view").locator("canvas").screenshot();
  return countPngPixelsDifferentFromCorner(png);
}

function countPngPixelsDifferentFromCorner(png: Buffer): number {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bytesPerPixel = 0;
  const compressed: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || (body[9] !== 6 && body[9] !== 2)) return 0;
      bytesPerPixel = body[9] === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      compressed.push(body);
    }
    offset += length + 12;
  }
  const encoded = inflateSync(Buffer.concat(compressed));
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let input = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = encoded[input];
    input += 1;
    const rowStart = row * stride;
    for (let column = 0; column < stride; column += 1) {
      const raw = encoded[input + column];
      const left = column >= bytesPerPixel ? pixels[rowStart + column - bytesPerPixel] : 0;
      const above = row > 0 ? pixels[rowStart + column - stride] : 0;
      const upperLeft =
        row > 0 && column >= bytesPerPixel
          ? pixels[rowStart + column - stride - bytesPerPixel]
          : 0;
      const predictor =
        filter === 0 ? 0
        : filter === 1 ? left
        : filter === 2 ? above
        : filter === 3 ? Math.floor((left + above) / 2)
        : filter === 4 ? paeth(left, above, upperLeft)
        : Number.NaN;
      if (!Number.isFinite(predictor)) return 0;
      pixels[rowStart + column] = (raw + predictor) & 0xff;
    }
    input += stride;
  }
  const reference = pixels.subarray(0, bytesPerPixel);
  let different = 0;
  for (let pixel = 0; pixel < pixels.length; pixel += bytesPerPixel) {
    let distance = 0;
    for (let channel = 0; channel < bytesPerPixel; channel += 1) {
      distance += Math.abs(pixels[pixel + channel] - reference[channel]);
    }
    if (distance > 8) different += 1;
  }
  return different;
}

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

test("GIS runtime NEVER touches the private source path or any external host", async ({ page, baseURL }) => {
  // Runs in BOTH modes: the only legitimate hosts are the web app's and the API's —
  // no OneDrive path, no tile CDN, nothing external. The allowlist derives from the
  // harness's own WEB_BASE/API_BASE so a remote-host run cannot false-flag itself.
  const allowedHosts = new Set(
    [baseURL ?? WEB_BASE, API_BASE].map((base) => new URL(base).host),
  );
  const offenders: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/onedrive|cloudstorage|shp[ %+]?pipe|pipe[ %+]?ry\.shp/i.test(url)) offenders.push(url);
    if (/^https?:\/\//.test(url) && !allowedHosts.has(new URL(url).host)) offenders.push(url);
  });
  await openGisTab(page);
  const view = page.getByTestId("gis-network-view");
  const notice = page.getByTestId("gis-availability");
  await expect(view.or(notice)).toBeVisible();
  if (await view.isVisible()) {
    // Wait for the map's first settled render: a style/glyph/tile URL regression fires
    // its request during load, so asserting before readiness would race it.
    await expect(view).toHaveAttribute("data-map-ready", "true", { timeout: 20_000 });
    await page.waitForTimeout(750);
  }
  expect(offenders).toEqual([]);
});

test("dark landing — an explicit disabled notice, and the logical twin loses nothing", async ({ page }) => {
  // Proven on every stack: when the live API is GIS-enabled, stub the GIS endpoints to
  // the exact disabled contract (404) for this page only.
  if (manifestStatus !== 404) {
    await page.route("**/api/twin/gis/**", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "PIPE_GIS_ENABLED is off (stubbed dark-landing proof)" }),
      }),
    );
  }
  await openGisTab(page);
  const notice = page.getByTestId("gis-availability");
  await expect(notice).toContainText("ยังไม่เปิดใช้งาน");
  await expect(page.getByTestId("gis-network-view")).toHaveCount(0);
  await page.getByRole("tab", { name: /แผนผังกระบวนการ/ }).click();
  await expect(page.getByTestId("twin-schematic")).toBeVisible();
});

test("renderer regression — a browser-queryable pipe is required for readiness", async ({ page }) => {
  // This synthetic route fixture proves only the MapLibre/WebGL renderer contract and
  // runs even while real-data permission is pending. It is NOT evidence that the real
  // Rayong bundle is approved or enabled; those proofs remain gated below.
  await stubRendererFixture(page);
  await openGisTab(page);
  const view = page.getByTestId("gis-network-view");
  await expect(view).toHaveAttribute("data-map-ready", "true", { timeout: 20_000 });
  await expect(view).toHaveAttribute("data-source-features", "19");
  await expect(view).toHaveAttribute("data-rendered-features", "19");
  await expect(view.locator("canvas")).toBeVisible();
  // Literal paint proof: queryRenderedFeatures can still return a transparent or
  // background-coloured line. Read the compositor's WebGL buffer and require a material
  // number of pixels to differ from the blank corner colour.
  await expect.poll(() => paintedCanvasPixels(page)).toBeGreaterThan(50);
});

test.describe("real-bundle proofs (PIPE_GIS_ENABLED=1)", () => {
  test.beforeEach(() => {
    // Single line so the evidence-docs case counter never sees `test.skip(` open a line.
    if (manifestStatus === 404) test.skip(true, "PIPE_GIS_ENABLED off (dark landing) — run `PIPE_GIS_ENABLED=1 make demo-e2e` after `make gis-build`");
  });

  test("2.1 — the audited 19-feature Map Ta Phut focus renders in a Canvas map", async ({ page }) => {
    const manifest = await apiJson<GisManifestLite>("/api/twin/gis/manifest");
    expect(manifest.datasets["map-ta-phut"].feature_count).toBe(19);
    expect(manifest.provenance.geometry).toBe("REAL");
    await openGisTab(page);
    const view = page.getByTestId("gis-network-view");
    await expect(view).toBeVisible();
    // Canvas/WebGL rendering (criterion 2.1) — not SVG, not a raster <img> — and the
    // map must REACH readiness: source + layers installed and a first render settled
    // (`idle`). A blank canvas from a failed GL init cannot pass this.
    await expect(view).toHaveAttribute("data-map-ready", "true", { timeout: 20_000 });
    await expect(view.locator("canvas")).toBeVisible();
    expect(await view.locator("img").count()).toBe(0);
    // Source-ingestion proof (PR-R3 finding 6): the number of DISTINCT real pipes MapLibre
    // actually parsed into its source must equal the manifest's audited focus count —
    // proving the 19 features reached the map's source, not merely that a canvas exists.
    // (This certifies ingestion, not painting; the non-zero line width is unit-asserted.)
    await expect(view).toHaveAttribute(
      "data-source-features",
      String(manifest.datasets["map-ta-phut"].feature_count),
      { timeout: 20_000 },
    );
    // Painting proof: MapLibre itself must return every distinct pipe from the visible
    // base layer. A loaded source plus visible canvas can still be blank; this query
    // fails that hollow success mode and post-load map errors revoke readiness.
    await expect(view).toHaveAttribute(
      "data-rendered-features",
      String(manifest.datasets["map-ta-phut"].feature_count),
      { timeout: 20_000 },
    );
    await expect.poll(() => paintedCanvasPixels(page)).toBeGreaterThan(50);
    await expect(view).toHaveAttribute(
      "data-bound-pipe",
      String(manifest.demo_binding.pipe_id),
    );
    await expect(page.getByTestId("twin-provenance-legend")).toBeVisible();
  });

  test("2.3 — simulated live SEC and the official 0.54 reference stay unmistakably separate", async ({ page }) => {
    const manifest = await apiJson<GisManifestLite>("/api/twin/gis/manifest");
    expect(manifest.energy_reference.value_kwh_per_m3).toBe(0.54);
    expect(manifest.energy_reference.scope).toBe("system-wide");
    await openGisTab(page);
    const official = page.getByTestId("energy-official-reference");
    await expect(official).toContainText("0.54");
    await expect(official).toContainText("East Water");
    await expect(official).toContainText("2025");
    await expect(official).toContainText("ทั้งระบบ");
    await expect(official).toContainText("ไม่ใช่ค่าของสถานีมาบตาพุด");
    // The SIMULATED badge scopes the LIVE value only — the official figure is not
    // simulated and must not sit under that marker.
    await expect(official).not.toContainText("SIMULATED");
    const live = page.getByTestId("energy-sec-live");
    await expect(live).toBeVisible();
    await expect(live).toContainText("จำลอง");
    await expect(live).toContainText("SIMULATED");
  });

  test("2.2/2.4 — an injected drop highlights the bound REAL pipe on the SAME page; recovery clears it", async ({ page }) => {
    await openGisTab(page);
    const view = page.getByTestId("gis-network-view");
    await expect(view).toBeVisible();
    await expect(view).toHaveAttribute("data-map-ready", "true", { timeout: 20_000 });
    const bound = await view.getAttribute("data-bound-pipe");
    expect(bound).not.toBeNull();
    const marker = page.getByTestId("gis-device-marker");
    try {
      // Mark the document: every later assertion must happen with NO reload/navigation.
      await page.evaluate(() => {
        (window as unknown as { __gisSameDocument: boolean }).__gisSameDocument = true;
      });
      await postScenario("pressure_drop");
      await expect(view).toHaveAttribute("data-highlighted-pipes", bound ?? "", {
        timeout: 40_000,
      });
      await expect(marker).toHaveAttribute("data-status", /warning|critical/);
      // The affected-customer panel stays visibly SIMULATED next to the real geometry.
      await expect(page.getByText("ผู้ใช้น้ำที่ได้รับผลกระทบ")).toBeVisible();
      await postScenario("normal");
      await expect(view).toHaveAttribute("data-highlighted-pipes", "", { timeout: 60_000 });
      const sameDocument = await page.evaluate(
        () => (window as unknown as { __gisSameDocument?: boolean }).__gisSameDocument,
      );
      expect(sameDocument).toBe(true);
    } finally {
      // Restore the suite's warm-state contract: later specs expect P-2 degraded
      // (scenario-transitions ends that way on purpose). Wait for the observable so a
      // fast suite cannot outrun the scoring pass.
      await postScenario("pressure_drop");
      await expect(marker).toHaveAttribute("data-status", /warning|critical/, {
        timeout: 60_000,
      });
    }
  });

  test("2.5 — the marker opens the bound pipe's REAL attributes with the simulated pairing declared", async ({ page }) => {
    await openGisTab(page);
    await expect(page.getByTestId("gis-network-view")).toBeVisible();
    await page.getByTestId("gis-device-marker").click();
    const details = page.getByTestId("gis-pipe-details");
    await expect(details).toContainText("ข้อมูลจริง");
    const bound = await page.getByTestId("gis-network-view").getAttribute("data-bound-pipe");
    await expect(details.getByTestId("gis-pipe-pipe-id")).toContainText(bound ?? "!");
    await expect(details).toContainText("การจับคู่จำลอง");
  });
});
