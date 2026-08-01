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
