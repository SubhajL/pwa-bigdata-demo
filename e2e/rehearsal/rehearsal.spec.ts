import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { type Page, expect, test } from "@playwright/test";

import { API_BASE, REPO, apiJson, postScenario } from "../lib/api";
import {
  DEFAULT_REHEARSAL_THRESHOLDS,
  type RehearsalSource,
  type RehearsalTimings,
  buildRehearsalArchive,
} from "../lib/rehearsal";

// The literal judge sequence (docs/demo-runbook.md item 2.4 + the ≤30 s item-3.3 budget), driven
// against the LIVE stack, timed on a real clock, and archived as demo-rehearsal/v1 evidence stamped
// with HEAD, source cleanliness, and the model artifact hash — the last open Gate A2 exit-gate item.
//
// MEASUREMENT CAPS ARE DELIBERATELY LARGER THAN THE THRESHOLDS so a modest overshoot RETURNS and is
// recorded as a breach (the "evidence survives a breach" contract) rather than throwing. Their
// worst-case SUM (plus setup) is bounded below the config per-test timeout so the archive write is
// always reachable when every wait returns. The single gate is the post-write within_thresholds
// assertion — not the caps.
const CAP = { area_ms: 45_000, drawer_ms: 40_000, critical_ms: 45_000, recovery_ms: 60_000 };

const P2 = '[data-asset="P-2"]';

const p2Status = (page: Page): Promise<string | null> =>
  page.locator(P2).getAttribute("data-status");

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: REPO }).toString().trim();
}

async function openTwin(page: Page): Promise<void> {
  await page.goto("/operations");
  await expect(page.locator(P2)).toBeVisible();
  await expect(page.getByText("เชื่อมต่อแล้ว")).toBeVisible({ timeout: 15_000 });
}

async function resetToNormal(page: Page): Promise<void> {
  await postScenario("normal");
  await expect.poll(() => p2Status(page), { timeout: 45_000 }).toBe("normal");
  await expect(page.getByTestId("low-pressure-area")).toHaveCount(0);
}

test("Gate A2 rehearsal — the judge sequence, timed and archived", async ({ page }) => {
  // Provenance precondition: refuse to produce evidence with a hollow model hash (mirrors the
  // ^[0-9a-f]{64}$ guard in demo-acceptance.sh). Fetched before measuring so a broken/unloaded
  // model fails fast rather than after a 25 s sequence. Also serves as the API readiness probe
  // (this config has no globalSetup — `make demo-rehearsal` runs preflight first).
  const model = await apiJson<{ artifact_sha256: string }>("/api/model");
  expect(model.artifact_sha256, "model artifact hash must be a 64-hex digest (is the model loaded?)")
    .toMatch(/^[0-9a-f]{64}$/);

  await openTwin(page);
  await resetToNormal(page);

  const footprint = page.getByTestId("low-pressure-area");
  const drawer = page.getByTestId("impact-drawer");

  const injectedAt = Date.now();
  await postScenario("pressure_drop");

  // (1) trigger→footprint and (3) model-critical are measured CONCURRENTLY from the SAME injection,
  // so model_critical_ms reflects the true time-to-`critical` (item 3.3, ≤30 s) and is never floored
  // by footprint-render latency. Both resolve before any drawer opens, so the P-2 symbol is present
  // throughout. Neither is asserted here — the ≤budget check happens once, in the final gate.
  const areaAppeared = footprint
    .waitFor({ state: "visible", timeout: CAP.area_ms })
    .then(() => Date.now() - injectedAt);
  const criticalRendered = expect
    .poll(() => p2Status(page), { timeout: CAP.critical_ms, intervals: [50, 100, 200] })
    .toBe("critical")
    .then(() => Date.now() - injectedAt);
  const [trigger_to_area_ms, model_critical_ms] = await Promise.all([areaAppeared, criticalRendered]);

  // (2) click the footprint → the exactly-200 impact drawer is visible.
  const clickedAt = Date.now();
  await footprint.click();
  await expect(drawer).toBeVisible({ timeout: CAP.drawer_ms });
  // \b200\b, not "200": a substring match would also accept "1,200"/"2000".
  await expect(drawer.getByTestId("impact-count")).toContainText(/\b200\b/, { timeout: CAP.drawer_ms });
  const click_to_drawer_ms = Date.now() - clickedAt;

  // (4) recovery: normal → footprint AND drawer both cleared, measured as ONE bounded wait (not two
  // sequential caps) so worst-case recovery is a single cap, keeping the total under the timeout.
  const recoveredAt = Date.now();
  await postScenario("normal");
  await expect
    .poll(async () => (await footprint.count()) === 0 && (await drawer.count()) === 0, {
      timeout: CAP.recovery_ms,
      intervals: [100, 250, 500],
    })
    .toBe(true);
  const recovery_ms = Date.now() - recoveredAt;

  const timings: RehearsalTimings = {
    trigger_to_area_ms,
    click_to_drawer_ms,
    model_critical_ms,
    recovery_ms,
  };

  // Source identity of the measured build. The shell passes REHEARSAL_SHA so the archive filename
  // and the in-file sha agree; a direct run falls back to reading HEAD.
  let origin_main = "";
  try {
    origin_main = git("rev-parse", "origin/main");
  } catch {
    origin_main = "";
  }
  const source: RehearsalSource = {
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    clean: git("status", "--porcelain", "--untracked-files=normal") === "",
    origin_main,
  };
  const sha = process.env.REHEARSAL_SHA ?? git("rev-parse", "HEAD");
  // Compact UTC stamp, matching demo-acceptance/v2's captured_at_utc so cross-schema tooling agrees.
  const captured_at_utc = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const archive = buildRehearsalArchive({
    timings,
    thresholds: DEFAULT_REHEARSAL_THRESHOLDS,
    sha,
    artifact_sha256: model.artifact_sha256,
    captured_at_utc,
    source,
  });

  const outPath =
    process.env.REHEARSAL_OUT ??
    path.join(tmpdir(), "pwa-demo-evidence", `rehearsal-${sha.slice(0, 12)}-${process.pid}-${Date.now()}.json`);
  mkdirSync(path.dirname(outPath), { recursive: true });
  // Exclusive create ("wx") refuses to silently clobber prior evidence (parity with demo-acceptance).
  writeFileSync(outPath, `${JSON.stringify(archive, null, 2)}\n`, { flag: "wx" });
  console.log(`rehearsal archive: ${outPath}`);
  console.log(
    `rehearsal timings (ms): ${JSON.stringify(timings)} — clean=${source.clean} — API_BASE ${API_BASE}`,
  );

  // The archive is on disk BEFORE this gate, so a breach leaves a result:failed archive for evidence.
  expect(archive.within_thresholds, `timing breaches: ${archive.breaches.join("; ")}`).toBe(true);
});
