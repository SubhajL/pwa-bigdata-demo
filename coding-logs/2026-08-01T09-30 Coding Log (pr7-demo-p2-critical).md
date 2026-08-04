# Coding Log — PR-7 demo-data tuning: P-2 `critical` at cold start

**Slice:** `fix/pr7-demo-p2-critical` · **Owner:** Claude (no delegation) · **Date:** 2026-08-01
**Lifecycle:** g2-coding · **Gate:** g2-qcheck (Tier 1 + Tier 2)

## Goal
The score gate (PR-17) flagged that the twin showed no RED device, so items 2.2/2.3/3.3 had no
`normal → critical` state for a judge. Directive: "lower P-2's baseline health and drive pressure
below 2.0 bar."

## What the exploration actually found (the directive's premise was partly wrong)
- **Pressure was already fine.** `pressure_drop` measures **0.01–1.92 bar, all below the 2.0 low
  band** (empirically confirmed; `simulator/tests/test_pressure_drop.py`). The docs' "~2.9 bar stays
  inside the band" was **factually false** (2.9 is a NORMAL-mode reading, range ~2.23–5.89). → No
  simulator code change; the pressure half was a **doc correction**.
- **The real gap is the health path.** A single below-band reading can only classify `warning`
  (`api/app/bands.py`: `critical` needs distance > full band width, unreachable). So the ONLY path to
  a red symbol is model-health < `CRITICAL_BELOW=40`. P-2 sorts 2nd among pumps → default wear ≈0.05 →
  health ≈90 (`normal`). Ground truth confirmed against the live DB (P-2 = 61.1, warning) and a
  faithful cold-start oracle (`_rows_for` → `build_window` → shipped `model.pkl`).

## Stop line
**Claude implements directly, no delegation.** Walked Q0–Q3: no security/tenant/migration boundary;
spec became crisp only after empirical de-fuzzing (the "2.9" premise was wrong); the change is a
~5-line data tuning intertwined with honest doc rewrites (never delegated) and empirical verification
— "there is nothing to save" by handing off. Followed test → RED → implement → GREEN per Phase 2c-ter.

## Change
- `scripts/backfill_history.py`: `DEMO_WEAR_OVERRIDE = {"P-2": 0.34}` applied in `_wear_rate`
  (position-independent); `_WEAR_MAX 0.36 → 0.32`; `failure_threshold` promoted to `_FAILURE_THRESHOLD`.
- `api/tests/test_backfill_demo_health.py` (new): scores P-2's backfill window through the real
  cold-start path → `critical`; targeting guard; wear-mechanism pin; **pre-failure** invariant.
- `api/tests/conftest.py`: `backfilled` fixture sorts by actual wear (worst-health LAST) so
  `backfilled[-1]` stays "most degraded" now that a pump sorting early (P-2) is the worst.
- docs (`demo-coverage.md`, `demo-runbook.md`) + one e2e comment corrected.

## TDD / RED
- Behavioral RED proven: P-2 "scored normal at health 89.7" (missing behavior, not missing symbol).
- GREEN after the override; **mutation-verified** (emptying the override → the two P-2-critical tests
  fail; restored → green). 3× stable.

## Gates (Claude ran each)
- api `ruff check .` OK · `mypy .` OK (49 files) · new tests 5/5, 3× OK.
- Affected integration tests (test_predict_api + test_scoring_cycle) 36/36 OK — worklist #1 = P-2.
- **Regression caught & fixed honestly:** the `backfilled` fixture's "worst-health last" invariant
  broke because P-2 (sorts early) is now the worst → fixed by sorting the fixture on real wear. No
  assertion weakened.
- Pre-existing flake, NOT mine: `test_latency::test_latest_query_uses_the_index_and_does_not_scan`
  fails intermittently (~2/3) — confirmed identical rate on clean `origin/main`; this change alters
  row *values*, not the counts/timestamps the planner keys on.

## QCHECK (Phase 5) — Tier 1 (Claude, empirical) + Tier 2 (Codex `gpt-5.6-sol`, xhigh)
Tier 2 mandatory: data-model + domain-math change. Reviewers independent of the author.

**Finding (both tiers, de-duplicated — Codex HIGH, Tier-1 LOW) -> FIXED.** With wear 0.42 + 200h
run-up, P-2's latent crossed `failure_threshold=30` at hour ~167, so its scored window was ENTIRELY
post-failure — out of the model's training domain (`pwa_ml/datasets.py` drops post-failure windows),
PTTF pinned to 0, i.e. an "already failed" device presented as a prediction. Took the higher severity
(aligns with CLAUDE.md data-honesty MUST). **Fix:** wear 0.42 -> **0.34** (health ≈32, `failure_hour
is None` -> pre-failure, PTTF ≈145 h at the live window), and `_WEAR_MAX 0.36 -> 0.32` so the whole
fleet is pre-failure and P-2 (0.34 > 0.32) stays the single worst -> rank #1. New regression test pins
the pre-failure invariant. Re-ran gates + Tier 2.

**Finding (Codex LOW / Tier-1 LOW) -> FIXED.** Docs stated pressure "0.01–1.86 bar" — too narrow
(true theoretical bound ~0.00–1.92; counterexample 1.8877). Replaced with "below the 2.0 low band".

Tier-1 otherwise CONFIRMED: non-vacuous tests, strictly monotonic wear→health (no fixture inversion),
no stale `_wear_rate` caller, no fabricated/hardcoded data, no orphan. No other CRITICAL/HIGH.

**Tier-2 round 2 (on the fix):** "No CRITICAL/HIGH — the original post-failure HIGH is resolved."
Empirically re-confirmed: P-2 `failure_hour=None` (latent 32.35), health 32.2 (7.8 below gate),
uniquely worst by 4.06, whole fleet pre-failure, pre-failure test non-vacuous (0.42 → fails). Raised
three non-blocking findings, all FIXED in round 3:
- MEDIUM (finite-PTTF claim untested) → added `test_..._predicts_a_finite_pttf_once_live_telemetry_
  enters_the_window` (one live cycle → pttf 29.7 h > 0, still `critical`).
- MEDIUM (`_FAILURE_THRESHOLD` could drift from training) → added a drift test asserting it equals
  `pwa_ml.datasets.FAILURE_THRESHOLD` (same idiom as `test_bands.py`; kept local so the lean backfill
  container needn't import the dataset module).
- LOW (rank guard `>=`) → tightened to `>` (P-2 is UNIQUELY most-worn).

Round-3 changes are additive test coverage + one strictness tightening; re-verified by gates
(ruff/mypy/7 tests ×3) + mutation (empty override → 5 fail) + 36/36 integration. A third adversarial
Codex round was judged disproportionate for test-only additions — the gate + mutation re-run is the
verification. Final test count in the new file: 7.

## Not delegated
Everything (Claude-implemented). Delegate token cost: 0.

---

# 2026-08-05 Review-remediation report (PR-A through PR-C)

## Goal and evidence boundary

Remediate the formal changes-requested review recorded against merged
`main@3fffdc73cff1f00d4f7e090e8de3cec6da0f6f28`: two HIGH, three MEDIUM, and one LOW
finding. This is intentionally a narrow follow-up before PR-D. It does not claim Gate A1 or the
remaining PR-D/PR-E judge-visible evidence.

## Changes

- `docs/demo-coverage.md` now says **16/16 built and wired**, marks Gate A1 pending, lists the
  literal PR-D gaps for 3.1-3.2 and PR-E gaps for 3.4-3.6, and marks those five table rows partial.
  `api/tests/test_evidence_docs.py` prevents a broad 16/16 E2E/verified claim from returning before
  those gaps close.
- `scripts/demo-reconnect.sh` starts one budget before Compose, actively bounds the Compose child,
  and includes restart, committed-watermark acquisition, reconnect, and committed-row growth in the
  same default 30-second budget. New `api/tests/test_demo_reconnect_script.py` covers both elapsed
  fake-clock accounting and a genuinely hung Compose process.
- `web/src/features/pipeline/useDlq.ts` owns a real `refreshing` state and a request generation token.
  Live refresh coalesces repeated totals while a reload is in flight, then performs exactly one
  follow-up. `pipelineHooks.test.tsx` exercises a deferred real reload rather than manufacturing an
  impossible `loading=true` reload state.
- `SecTooltip.tsx` labels its visible SEC calculation approximate, renders four-decimal inputs, and
  exposes visible formula/result/timestamp/skew fields semantically. Unit and Playwright coverage
  parse and recompute the visible formula, reject missing or blank metadata before numeric
  conversion, cross-bind DOM metadata to the API, and verify visible timestamps/skew. A negative
  missing-metadata unit test proves dashes cannot satisfy the metadata oracle.
- `topic1-pipeline.spec.ts` pins the independent exact set of three required endpoint paths as well as
  probe counts, failures, and latency.

## TDD and regression proof

- RED API: focused run produced 2 failures / 4 passes: the coverage document lacked the bounded
  wording and slow Compose could false-pass the restart budget.
- RED web: focused run produced 2 failures / 12 passes: repeated totals caused four requests rather
  than two, and the visible SEC formula used rounded one-decimal inputs.
- Independent QCHECK then found the Compose call still needed an active watchdog, visible
  timestamp/skew fields and stronger API binding, an independent endpoint oracle, explicit partial
  coverage markers, and request-generation ownership. Follow-up RED runs proved the missing partial
  marker, hung subprocess, and semantic timestamp field before those fixes were applied.
- Final focused result: API 7/7 and web 14/14, each repeated three times without failure.

## Wiring verification

| Changed producer / contract | Runtime consumer | Verification |
|---|---|---|
| Coverage evidence boundary | PR-D/PR-E roadmap and Gate A1 reporting | Static evidence-doc test |
| Reconnect whole-operation budget | `make demo-e2e` and operator reconnect drill | Fake-clock, hung-process, and live broker restart |
| `useDlq.refreshing` and generation ownership | `PipelineMonitorScreen` live DLQ refresh | Deferred-hook unit test and Topic 1 live E2E |
| Visible SEC formula and metadata spans | `OperationsTwinScreen` / `SecTooltip` | Unit parsing plus API-bound scenario E2E |
| Independent required endpoint set | Pipeline response-time table | Topic 1 live E2E exact-set assertion |

## Validation at candidate contents

- API: `314 passed in 101.07s`; Ruff passed; mypy passed for 56 source files.
- Web: 64 files / `534 passed`; lint, typecheck, and production build passed.
- Focused stability: API 7 tests x3 and web 14 tests x3 passed.
- E2E TypeScript compilation, shell syntax, and `git diff --check` passed.
- Warm `make demo-e2e`: `23 passed (1.5m)` on the isolated candidate worktree.
- Real `scripts/demo-reconnect.sh`: reconnect and committed growth passed in 3 seconds.
- Runtime restored to `normal`; director API reported active run `demo-normal-c7a0b6f9`.

The first isolated-worktree preflight found that its ignored env file was absent and the default
TimescaleDB host port was occupied. No volume was removed. The candidate was rerun with the existing
primary checkout's Compose env-file path, which selects its configured non-conflicting port; no
secret values were printed or changed.

## Review disposition and remaining work

The delegated read-only QCHECK re-review reported no remaining CRITICAL, HIGH, MEDIUM, or LOW
findings in the six remediation scopes. This remains warm-stack evidence: no destructive cold reset
was performed. PR-D and PR-E still own the five literal DOM/operator proof gaps listed above, and
Gate A1 remains pending until those proofs exist.

## Review (2026-08-05 04:31 +0700) - review-evidence-remediation staged tree

### Reviewed

- Repository: `pwa-bigdata-demo`.
- Branch: `fix/review-evidence-remediation`.
- Scope: staged working tree based on `3fffdc73cff1f00d4f7e090e8de3cec6da0f6f28`, limited to
  the six requested review findings, their regressions, and this Coding Log report.
- Inspected the complete staged diffs for the reconnect script/tests, evidence document/guard,
  DLQ hook/tests, SEC component/tests/E2E, and endpoint-set E2E.
- Verified call-site wiring for `PipelineMonitorScreen`, `OperationsTwinScreen`, `make demo-e2e`,
  and the rendered response-time table; verified no migration, API schema, or deployment change.
- Review evidence: `git diff --cached --check`; API 314 tests + Ruff + mypy; web 534 tests + lint +
  typecheck + build; focused tests x3; E2E TypeScript compilation; warm 23-test live suite; real
  reconnect/committed-growth drill.

### Findings

- CRITICAL - No findings.
- HIGH - No findings.
- MEDIUM - No findings.
- LOW - No findings.

### Open Questions / Assumptions

- PR-D and PR-E remain responsible for the explicitly documented literal evidence gaps for
  criteria 3.1-3.2 and 3.4-3.6; this remediation intentionally does not pre-empt their scope.
- Gate A1 must run at its eventual exact merged candidate SHA before the coverage document can make
  a complete E2E-readiness claim.

### Recommended Tests / Validation

- Completed the full source, focused stability, TypeScript, warm browser, and live reconnect gates
  listed above. Repeat the exact-SHA warm suite after merge because merge identity is a distinct
  evidence boundary.

### Rollout Notes

- No schema, migration, feature flag, production deployment, or rollback step is involved.
- The live validation was non-destructive and warm-stack only. Runtime was explicitly returned to
  the normal simulator/director scenario after the reconnect drill.
