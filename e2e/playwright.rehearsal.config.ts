import { defineConfig, devices } from "@playwright/test";

/**
 * Gate A2 "judge rehearsal + archived timings" harness (Phase 4 exit-gate item).
 *
 * DELIBERATELY separate from playwright.config.ts (testDir ./tests): the rehearsal specs mutate
 * scenario state and measure wall-clock timings, so they must NOT run inside the certified
 * `make demo-e2e` score gate. `make demo-rehearsal` runs THIS config against the live stack.
 *
 * No globalSetup: the pure archive.unit.spec.ts must run without a live stack, and the measurement
 * spec does its own readiness (an early /api/model probe + openTwin) and its own `normal` reset —
 * `make demo-rehearsal` additionally runs demo-preflight.sh before this config.
 */
export default defineConfig({
  testDir: "./rehearsal",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Worst-case bounded-wait wall-clock must fit here so the archive write is ALWAYS reachable when
  // every wait returns (the "evidence survives a breach" guarantee): setup (openTwin ~35 s +
  // resetToNormal ~65 s) + concurrent area/critical (≤45 s) + click/drawer (≤80 s) + recovery
  // (≤60 s) ≈ 300 s, comfortably under this budget.
  timeout: 420_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.WEB_BASE ?? "http://localhost:5173",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
