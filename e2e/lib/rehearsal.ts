/**
 * Gate A2 rehearsal evidence — pure verdict + archive assembly.
 *
 * The live measurement (rehearsal/rehearsal.spec.ts) drives the literal judge sequence and
 * records four wall-clock timings; this module turns those raw numbers + provenance into the
 * archived `demo-rehearsal/v1` evidence object, deciding pass/fail against fixed budgets. Kept
 * pure (no browser, no clock, no fs) so the verdict math is unit-tested deterministically.
 */

/** The four judge-sequence timings, in milliseconds, measured on a real clock. */
export interface RehearsalTimings {
  /** injection (pressure_drop) → the พื้นที่แรงดันต่ำจำลอง footprint appears. */
  readonly trigger_to_area_ms: number;
  /** click the footprint → the 200-account impact drawer is visible. */
  readonly click_to_drawer_ms: number;
  /** injection → device health renders `critical` (item 3.3 budget, ≤ 30 s). */
  readonly model_critical_ms: number;
  /** recovery (normal) → footprint AND drawer both cleared. */
  readonly recovery_ms: number;
}

export type RehearsalThresholds = RehearsalTimings;

/**
 * Upper bounds each timing must not exceed. `model_critical_ms` is the load-bearing one — the
 * ผนวก ๑๓ item-3.3 "critical within 30 s" budget; the others mirror the tolerances the P1 E2E
 * already enforces (footprint ≤ 30 s, drawer open ≤ 20 s, recovery clear ≤ 45 s).
 */
export const DEFAULT_REHEARSAL_THRESHOLDS: RehearsalThresholds = {
  trigger_to_area_ms: 30_000,
  click_to_drawer_ms: 20_000,
  model_critical_ms: 30_000,
  recovery_ms: 45_000,
};

/** A git commit id: 40-hex (sha1) or 64-hex (sha256). */
const COMMIT_SHA = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;
/** A model artifact digest: exactly 64-hex (sha256), same shape demo-acceptance.sh enforces. */
const SHA256 = /^[0-9a-f]{64}$/;

export interface RehearsalEvaluation {
  readonly within_thresholds: boolean;
  /** One human-readable string per failing timing; empty when every timing is within budget. */
  readonly breaches: readonly string[];
}

const TIMING_KEYS: readonly (keyof RehearsalTimings)[] = [
  "trigger_to_area_ms",
  "click_to_drawer_ms",
  "model_critical_ms",
  "recovery_ms",
];

/**
 * A timing passes only when it is a finite, non-negative number AND within its budget. A NaN or
 * negative measurement (a probe bug) is a breach, never a silent pass.
 */
export function evaluateRehearsal(
  timings: RehearsalTimings,
  thresholds: RehearsalThresholds,
): RehearsalEvaluation {
  const breaches: string[] = [];
  for (const key of TIMING_KEYS) {
    const value = timings[key];
    const budget = thresholds[key];
    if (!Number.isFinite(value) || value < 0) {
      breaches.push(`${key} invalid (${value})`);
    } else if (value > budget) {
      breaches.push(`${key} ${value} > ${budget}`);
    }
  }
  return { within_thresholds: breaches.length === 0, breaches };
}

/** Source identity of the measured build — recorded so a dirty/off-main run cannot masquerade as
 *  evidence for a clean commit (parity with the demo-acceptance/v2 manifest). */
export interface RehearsalSource {
  readonly branch: string;
  /** true iff `git status --porcelain` was empty when the rehearsal ran. */
  readonly clean: boolean;
  readonly origin_main: string;
}

export interface RehearsalArchiveInput {
  readonly timings: RehearsalTimings;
  readonly thresholds: RehearsalThresholds;
  readonly sha: string;
  readonly artifact_sha256: string;
  readonly captured_at_utc: string;
  readonly source: RehearsalSource;
  /** warm (default) vs a future cold rehearsal; recorded for parity with the acceptance manifest. */
  readonly mode?: string;
}

export interface RehearsalArchive {
  readonly schema: "demo-rehearsal/v1";
  readonly captured_at_utc: string;
  readonly sha: string;
  readonly artifact_sha256: string;
  readonly mode: string;
  readonly source: RehearsalSource;
  readonly thresholds: RehearsalThresholds;
  readonly timings: RehearsalTimings;
  readonly breaches: readonly string[];
  readonly within_thresholds: boolean;
  readonly result: "passed" | "failed";
}

/**
 * Assemble the archived evidence object; `result` is `passed` iff every timing is within budget.
 *
 * Provenance is validated here (not merely stamped): a malformed HEAD sha or a missing/garbage
 * model `artifact_sha256` THROWS, so a green run can never carry hollow provenance — the archive
 * that proves *which commit and which model* was rehearsed is only ever written with real ids.
 */
export function buildRehearsalArchive(input: RehearsalArchiveInput): RehearsalArchive {
  if (!COMMIT_SHA.test(input.sha)) {
    throw new Error(`rehearsal sha must be a 40/64-hex commit id, got ${JSON.stringify(input.sha)}`);
  }
  if (!SHA256.test(input.artifact_sha256)) {
    throw new Error(
      `rehearsal artifact_sha256 must be a 64-hex digest, got ${JSON.stringify(input.artifact_sha256)}`,
    );
  }
  const evaluation = evaluateRehearsal(input.timings, input.thresholds);
  return {
    schema: "demo-rehearsal/v1",
    captured_at_utc: input.captured_at_utc,
    sha: input.sha,
    artifact_sha256: input.artifact_sha256,
    mode: input.mode ?? "warm",
    source: input.source,
    thresholds: input.thresholds,
    timings: input.timings,
    breaches: evaluation.breaches,
    within_thresholds: evaluation.within_thresholds,
    result: evaluation.within_thresholds ? "passed" : "failed",
  };
}
