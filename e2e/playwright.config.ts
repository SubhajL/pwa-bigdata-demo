import { defineConfig, devices } from "@playwright/test";

/**
 * E2E over the 16 scored ผนวก ๑๓ items against the LIVE compose stack (PR-17 / slice S-D).
 *
 * SERIALIZED on purpose (`workers: 1`, `fullyParallel: false`): the specs share ONE mutable
 * simulator (FAULT_MODE) and ONE persistent database. Parallel workers would race on that shared
 * state. Specs use delta-based counters where residual data could mislead; the scenario suite
 * deliberately ends with P-2 degraded (see scenario-transitions.spec.ts's header), the warm state
 * the later topic2/topic3 specs expect.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  globalSetup: "./global-setup.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.WEB_BASE ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
