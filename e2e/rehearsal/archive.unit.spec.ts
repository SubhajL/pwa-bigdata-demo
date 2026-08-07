import { expect, test } from "@playwright/test";

import {
  DEFAULT_REHEARSAL_THRESHOLDS,
  type RehearsalSource,
  type RehearsalTimings,
  buildRehearsalArchive,
  evaluateRehearsal,
} from "../lib/rehearsal";

// Pure verdict/assembly logic for the rehearsal evidence archive. No browser — runs under the
// rehearsal config alongside the live measurement so the verdict math is proven every run.

const GOOD: RehearsalTimings = {
  trigger_to_area_ms: 1_200,
  click_to_drawer_ms: 180,
  model_critical_ms: 18_500,
  recovery_ms: 4_300,
};

const SHA = "c67bd54ec3cdf2426e2b3a1f6c01b8e88c788772"; // 40-hex
const ARTIFACT = "43abe804615a52b05755ceb949803098513fd41a8102851942edbe0a5bcc2332"; // 64-hex
const SOURCE: RehearsalSource = { branch: "main", clean: true, origin_main: SHA };

test("evaluateRehearsal: all timings within budget → within_thresholds, no breaches", () => {
  const v = evaluateRehearsal(GOOD, DEFAULT_REHEARSAL_THRESHOLDS);
  expect(v.within_thresholds).toBe(true);
  expect(v.breaches).toEqual([]);
});

test("evaluateRehearsal: model-critical over the 30 s budget is a named breach", () => {
  const v = evaluateRehearsal({ ...GOOD, model_critical_ms: 30_001 }, DEFAULT_REHEARSAL_THRESHOLDS);
  expect(v.within_thresholds).toBe(false);
  expect(v.breaches.join(" ")).toContain("model_critical_ms");
});

test("evaluateRehearsal: exactly at the budget passes (≤, not <)", () => {
  const v = evaluateRehearsal({ ...GOOD, model_critical_ms: 30_000 }, DEFAULT_REHEARSAL_THRESHOLDS);
  expect(v.within_thresholds).toBe(true);
});

test("evaluateRehearsal: a non-finite / negative measurement can never pass silently", () => {
  const nan = evaluateRehearsal({ ...GOOD, trigger_to_area_ms: Number.NaN }, DEFAULT_REHEARSAL_THRESHOLDS);
  expect(nan.within_thresholds).toBe(false);
  expect(nan.breaches.join(" ")).toContain("trigger_to_area_ms");

  const neg = evaluateRehearsal({ ...GOOD, recovery_ms: -1 }, DEFAULT_REHEARSAL_THRESHOLDS);
  expect(neg.within_thresholds).toBe(false);
  expect(neg.breaches.join(" ")).toContain("recovery_ms");
});

test("buildRehearsalArchive: carries provenance verbatim and derives result=passed when clean", () => {
  const archive = buildRehearsalArchive({
    timings: GOOD,
    thresholds: DEFAULT_REHEARSAL_THRESHOLDS,
    sha: SHA,
    artifact_sha256: ARTIFACT,
    captured_at_utc: "20260807T000000Z",
    source: SOURCE,
  });
  expect(archive.schema).toBe("demo-rehearsal/v1");
  expect(archive.sha).toBe(SHA);
  expect(archive.artifact_sha256).toBe(ARTIFACT);
  expect(archive.captured_at_utc).toBe("20260807T000000Z");
  expect(archive.mode).toBe("warm");
  expect(archive.source).toEqual(SOURCE);
  expect(archive.timings).toEqual(GOOD);
  expect(archive.within_thresholds).toBe(true);
  expect(archive.result).toBe("passed");
});

test("buildRehearsalArchive: a breach STILL builds an archive, with result=failed (evidence survives)", () => {
  const archive = buildRehearsalArchive({
    timings: { ...GOOD, model_critical_ms: 45_000 },
    thresholds: DEFAULT_REHEARSAL_THRESHOLDS,
    sha: SHA,
    artifact_sha256: ARTIFACT,
    captured_at_utc: "20260807T000000Z",
    source: { branch: "main", clean: false, origin_main: SHA },
  });
  expect(archive.result).toBe("failed");
  expect(archive.within_thresholds).toBe(false);
  expect(archive.breaches.length).toBeGreaterThan(0);
  expect(archive.source.clean).toBe(false); // a dirty run is recorded, not hidden
});

test("buildRehearsalArchive: refuses hollow provenance — a non-64-hex artifact hash throws", () => {
  expect(() =>
    buildRehearsalArchive({
      timings: GOOD,
      thresholds: DEFAULT_REHEARSAL_THRESHOLDS,
      sha: SHA,
      artifact_sha256: "cafe",
      captured_at_utc: "20260807T000000Z",
      source: SOURCE,
    }),
  ).toThrow(/artifact_sha256/);
});

test("buildRehearsalArchive: refuses a malformed HEAD sha", () => {
  expect(() =>
    buildRehearsalArchive({
      timings: GOOD,
      thresholds: DEFAULT_REHEARSAL_THRESHOLDS,
      sha: "deadbeef",
      artifact_sha256: ARTIFACT,
      captured_at_utc: "20260807T000000Z",
      source: SOURCE,
    }),
  ).toThrow(/sha/);
});
