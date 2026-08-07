# Coding Log — Gate A2 judge-rehearsal + archived-timings harness

**Date:** 2026-08-07 · **Branch:** `feat/gate-a2-rehearsal-harness` · **Parent:** `c67bd54` (main)
**Lifecycle:** g-coding (TDD + 2-tier QCHECK loop-until-dry)

## Goal

Close the last **Phase-4 / Gate A2 exit-gate item** (per `overall-phases-and-pr-roadmap.md`:
"Rehearse the literal judge sequence and archive trigger-to-area, click-to-drawer,
model-critical, and recovery timings"). Deliver a **reproducible, committed** harness — not a
hand-asserted number — mirroring the evidence discipline of `scripts/demo-acceptance.sh`.

## What was built

| File | Role |
|---|---|
| `e2e/lib/rehearsal.ts` | Pure verdict/archive assembly. Validates HEAD sha (40/64-hex) + model `artifact_sha256` (64-hex) → no hollow provenance. `demo-rehearsal/v1` schema with `source{branch,clean,origin_main}`. |
| `e2e/rehearsal/rehearsal.spec.ts` | Live measurement of the four timings against the running stack. |
| `e2e/rehearsal/archive.unit.spec.ts` | Unit tests of the pure verdict/assembly (boundary ≤, NaN/negative, hollow-provenance throws, breach-still-archives). |
| `e2e/playwright.rehearsal.config.ts` | Separate `testDir ./rehearsal` so the certified `demo-e2e` suite stays exactly **37**. |
| `scripts/demo-rehearsal.sh` | Orchestrator: preflight → measure → report; exit teeth on breach or dirty tree. |
| `Makefile` | `demo-rehearsal` target. |

The four timings: (1) trigger→footprint, (2) click→drawer(200), (3) model-critical
(injection→health `critical`, item-3.3 ≤30 s), (4) recovery (normal→footprint AND drawer cleared).
Archive stamped with HEAD sha, source cleanliness, and the model artifact hash.

## TDD

RED (unit spec imports missing module) → GREEN (pure lib) → live measurement spec + orchestrator +
Makefile wiring. Pure verdict math is unit-tested (8 cases); the live measurement is
integration-verified (it is live I/O, not unit-testable).

## QCHECK — 2-tier, loop-until-dry (Codex quota-blocked → Opus substitute, per standing directive)

**Round 1** (contract-correctness + oracle/provenance):
- **HIGH-1** (both tiers) — "write evidence first, then gate" was FALSE: per-step waits used
  timeouts *equal to* the archive thresholds, so a breach threw before the write; a model-critical
  breach left **no archive**. → Decoupled measurement CAPs (generous) from thresholds; write archive,
  then a single `within_thresholds` gate.
- **HIGH-2** — archive didn't flag a dirty/off-main worktree (unlike demo-acceptance/v2). → Record
  `source.{branch,clean,origin_main}`.
- **MED-1** — `artifact_sha256` unvalidated → hollow provenance could pass. → Validate in the spec
  (early) and in `buildRehearsalArchive` (throws).
- **MED-3** — shell died at the playwright step on a breach; reporter had no exit teeth. → Capture
  exit code, always run reporter, reporter `sys.exit(1)`.
- LOWs — single sha (shell→spec via env), exclusive `wx` write.

**Round 2** (fix-completeness + merged-artifact/cross-file):
- **MED-1** (both tiers) — Σ(caps) ~300–415 s exceeded the 240 s per-test timeout → archive could be
  lost before the write (HIGH-1 re-opened under multi-phase degradation). → Concurrent area+critical
  measurement, recovery as ONE bounded poll, coherent caps + `timeout: 420_000`.
- **MED-2** — a dirty/off-main run printed a silent `✓ REHEARSED`. → Reporter exits 1 on dirty
  ("✗ NOT CERTIFIABLE"), warns on off-main.
- **MED-3** — `model_critical_ms` was floored by `trigger_to_area_ms` (footprint-gated poll). → Fixed
  by the concurrent measurement.
- LOWs — compact `captured_at_utc`; dropped `globalSetup` (unit tests now stack-independent);
  shell refuses a pre-existing `REHEARSAL_OUT`.

**Round 3** (delta verification): **DRY** — no CRITICAL/HIGH/MED. Verified the concurrent
`Promise.all` measurement (no dangling rejection/race; critical independent), the recovery poll's
satisfiability against the real component wiring (`normal` unmounts drawer + footprint), cap/timeout
coherence (~320 s < 420 s), and the provenance gate (dirty can never print ✓/exit 0).

## Empirical verification

- **Forced breach** (threshold→1, twice — pre- and post-restructure): archive written with
  `result:failed` + non-zero exit. The "evidence survives a breach" contract holds.
- **Dirty tree** `make demo-rehearsal` → `✗ NOT CERTIFIABLE` + exit 1 (archive still written).
- **3× flakiness** (×2): stable; model-critical ~7–13 s, all ≪ 30 s.
- Typecheck `tsc --noEmit` clean; certified `demo-e2e` still exactly **37** specs.

## Result

Harness landed. The certified Gate A2 rehearsal evidence is produced by running
`make demo-rehearsal` on clean `main` at the merged SHA (a dirty tree is refused by design).
