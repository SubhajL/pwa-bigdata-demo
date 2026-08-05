# Coding Log — PR-E: literal Swagger, worklist, and RCA operator proof

Date: 2026-08-05 06:43
Branch: test/predictive-operator-proof (off origin/main 47b4f24, PR-D merge)
Lifecycle: g-coding (plain git + gh)
QCHECK: Tier 1 = review workflow · Tier 2 = Codex g-check skill (user directive 2026-08-05)

## Scope (roadmap PR-E, criteria 3.4/3.5/3.6)

- 3.4: literal Swagger Try-it-out e2e (expand POST /api/feedback, execute twice, ids
  strictly increase), DB-side bounded persistence verification via marker note, harness
  cleans exactly its own rows. New e2e/lib helpers feedbackCountByNote/deleteFeedbackByNote
  (compose-exec psql, bounded, read-only + targeted delete).
- 3.5: first-three rendered↔API worklist correspondence — rows expose exact
  data-rank/data-asset/data-health-score; e2e samples both sides until a quiet window, each
  sample compared literally.
- 3.6: induced rendered-cause variation — RcaPanel bars expose data-signal (ranked);
  e2e drives EXISTING allow-listed modes: anomaly (above-band vibration) then
  pressure_drop (below-band pressure) → top rendered bar follows the model's local
  attribution and CHANGES. Decision: **no new DemoMode needed** — the two existing modes
  already drive different signals, so the roadmap's conditional bearing_anomaly surface
  stays closed.
- ml: test_rca_reverses_through_the_SHIPPED_artifact — the reversal proof through
  ml/artifacts/model.pkl itself. (Not RED-first: it pins already-correct local-attribution
  behavior; non-vacuity is structural — a global-importance implementation fails it by
  construction, per the test_model sibling's argument.)
- docs/demo-coverage.md: 24→26 specs; 3.4/3.5/3.6 rows stay ◑ with oracles delivered,
  Gate A1 boundary intact.

## Gates so far

Component tests 14 green (worklist row attrs + rca data-signal cases added), eslint,
tsc (web+e2e), evidence-docs 6 (26-spec pin) green. Live warm demo-e2e with the three new
specs: in flight.

## Live RED round 1 and the bearing_anomaly decision (reversing the earlier no-new-mode call)

First live run: 24/26 — 3.5 GREEN first try; 3.4b and 3.6b genuinely RED.

**3.4b:** the double-execute design was flaky (second Swagger Execute never fired; only one
row persisted). Redesigned to a STRONGER single-execution oracle: the id rendered in
Swagger must EQUAL the persisted row's database id (`feedbackIdByNote`) — ack↔row identity
beats two increasing ids. Cleanup asserts exactly 1 row removed.

**3.6b:** pressure never topped RCA — investigated live, not assumed:
- Under `pressure_drop`, P-2's contributions were vibration +14.7 · power +14.0 · bearing
  +13.96 · pressure +10.0 — a WEAR-window signature.
- Repro on the healthiest pump (70 health): `anomaly` topped vibration in 5 s, then
  `pressure_drop` left vibration on top for 40+ s.
- Root cause in `demo.py:237`: every fault mode rides `WORN_WEAR`, and the worn
  trajectory's vibration dominates local attribution regardless of the injected instant —
  mode-vs-mode discrimination is STRUCTURALLY impossible with the original two faults.
This is precisely the contingency the roadmap pre-authorized: **added demo-only
`DemoMode="bearing_anomaly"`** — HEALTHY trajectory with every `bearing_temp_c` bucket
pinned a full band-width above high band (the magnitude the §2.2/2.4 tuning notes
establish), + the instant band event. The one deviating signal IS the cause, the exact
counterfactual shape `ml/tests` proves the model discriminates on. Additive Literal;
DEMO_CONTROLS-gated route unchanged; panel gains "จำลองลูกปืนร้อนผิดปกติ"; e2e/web clients
typed together.

RED→GREEN: `test_bearing_anomaly_gives_a_DIFFERENT_top_cause_than_anomaly` (422 RED →
top flips vibration→bearing_temp_c GREEN) and
`test_bearing_anomaly_still_degrades_health_out_of_normal` (first pin +25% excursion left
health normal — RED — raised to full band-width → GREEN). Demo suite 38/38; solver test
updated for the mode param. e2e 3.6b now drives anomaly vs bearing_anomaly on P-2 and
restores the pressure_drop end-state convention.

## Review (2026-08-05 07:12:44 +07) - working-tree PR-E operator workflow vs origin/main 47b4f24

### Reviewed
- Repo: /Users/subhajlimanond/dev/worktrees/pwa-bigdata-review-remediation.BO7ugG
- Branch: test/predictive-operator-proof
- Scope: working tree at HEAD 47b4f24578c5c7fab70b650a04ae21319982782f versus origin/main 47b4f24578c5c7fab70b650a04ae21319982782f
- Commands Run: `git status --porcelain=v1`; bounded name/stat and targeted diffs; exact-string/source inspection; `git diff --check`; targeted `ruff`; web component Vitest (20 passed), typecheck, lint, and E2E TypeScript compile; API solver pytest (20 passed); ML pytest (50 passed); evidence-doc pytest (6 passed); direct OpenAPI enum probe; solver-bound probe. DB-backed API scenario pytest could not start because the managed sandbox forbids binding a local socket (`PermissionError: [Errno 1] Operation not permitted`); Docker inspection was likewise denied at the OrbStack socket. The supplied warm-stack evidence was therefore not independently rerun.

### Findings
CRITICAL
- None.

HIGH
- **`bearing_anomaly` cannot recover to a normal status on an already-open twin.** The new mode emits a `bearing_temp_c` warning (`api/app/demo.py:164-166`), but every replacement returns only its new primary signal event (`api/app/demo.py:289-319`). A subsequent `normal` application therefore emits an in-band `pressure_bar` frame, never a newer bearing frame. The browser intentionally retains independent per-signal states (`web/src/features/twin/useTwinSocket.ts:76-80`) and renders their maximum severity (`web/src/features/twin/twinClient.ts:49-59`), so the stale bearing warning continues to win even after model health recovers to normal. This breaks the literal operator recovery path and makes the new scenario non-repeatable on the same loaded twin. Fix by defining replacement as a complete status transition: insert/reserve and broadcast newer readings for every signal whose prior state must be superseded (or add an explicit, persisted clear protocol), without bypassing conservation. Add API/WS/browser coverage for `bearing_anomaly -> normal` and `bearing_anomaly -> anomaly -> normal`, asserting both per-signal state and the rendered device status return to normal without reload.

MEDIUM
- **The capped solver can write physically impossible values, and the hotter pin makes the gap material.** `scenario_trajectory` targets a 115 C bearing bucket (`api/app/demo.py:189-194`), while `solve_injection` caps `k` at 240 but always solves exactly with an unbounded `x` (`api/app/demo.py:129-133`). With a realistic warm bucket `(n=15, mean=55, target=115, reserved=85)`, it writes 135.67 C rows; with a heavily sampled bucket `(n=10000, ...)`, it writes 2615.125 C. The existing cap test checks only row count, not value plausibility (`api/tests/test_demo_solver.py:49-52`). Such finite values pass ingestion/features and undermine the claim that injected telemetry remains realistic. Enforce per-signal safe bounds and fail closed when the capped row count cannot reach the target, or derive a sufficient bounded count; test the new bearing target at realistic and cap-triggering counts plus transaction rollback/conservation on rejection.
- **The “first-three” worklist oracle passes when only one or two rows exist.** The predicate rejects only an empty API response and iterates over `api.length` (`e2e/tests/topic3-predictive.spec.ts:193-209`). A regression that truncates both served/rendered worklists to one valid row therefore satisfies the test while `docs/demo-coverage.md:23,47` claims first-three correspondence. Require exactly three API items and at least three rendered rows before comparing all three identities/ranks/scores; add a test double or component/integration case proving one- and two-row responses cannot satisfy this proof.
- **Feedback markers cross both shell and SQL interpolation boundaries without escaping.** `feedbackSql` builds a shell command string and the exported helpers splice `note` directly into SQL literals (`e2e/lib/api.ts:144-166`). The current timestamp marker is safe, but a future marker containing an apostrophe, quote, command substitution, or backtick can break the query, execute shell syntax, or broaden the cleanup DELETE beyond the harness row. That contradicts the helper's exact-cleanup contract. Use an argv-based child-process API and a parameter/psql-variable-safe database query (plus a strict marker grammar as defense in depth); add apostrophe and shell-metacharacter tests and retain the execution timeout.

LOW
- **The RCA test restores shared state only on its success path.** `pressure_drop` is posted after every assertion (`e2e/tests/topic3-predictive.spec.ts:241-260`), not in `finally`, and the test does not poll the restored RCA/health state. Any poll/assertion failure leaves the serialized shared stack in `anomaly` or `bearing_anomaly`, so the stated end-state convention is not guaranteed and later diagnosis begins from contaminated state. Put restoration in `finally`, preserve the primary error, and wait for the intended restored observable before returning.
- **Swagger cleanup can replace the useful failure with a cleanup-count failure.** The unconditional `finally` expects exactly one delete (`e2e/tests/topic3-predictive.spec.ts:169-172`) even when navigation, Swagger interaction, or persistence failed before a row existed. The gate still fails, but reports the secondary `0 != 1` instead of the operator-path defect. Track whether persistence was reached; always delete by marker, but require one deletion only after the persisted-row oracle succeeded and avoid masking the original exception.
- **The readiness document contradicts its own PR-E status.** The matrix says the three PR-E literal oracles are delivered and only exact-SHA Gate A1 remains (`docs/demo-coverage.md:19-25,46-48`), but the summary still says “PR-D/PR-E … remain the boundary,” “remaining PR-D/PR-E evidence gaps,” and “missing literal oracles” (`docs/demo-coverage.md:50-53,89-93`). Refresh the heading/bottom line to distinguish delivered-but-unaccepted PR-E evidence from the still-pending Gate A1. The 26-spec count is correct, and the current evidence-doc tests do not catch this semantic contradiction.

### Open Questions / Assumptions
- This review assumes the operator applies `normal` on the same loaded twin after the new bearing scenario, which is the scenario panel's intended interaction. A full reload can hide the stale socket state after topology health catches up, but a reload is not an acceptable recovery for the no-refresh demo contract.
- `bearing_anomaly` is intentionally demo-only. Static inspection confirms `DEMO_CONTROLS=1` gating, `simulated: true` responses/raw rows, and visible `SIMULATED` UI labeling; no path was found that represents it as real SCADA.
- DemoMode is currently in parity: Python request/response Literal, generated OpenAPI request/response enums, `web` demoClient, and E2E lib all include exactly `bearing_anomaly`. There is no cross-language generated contract, so an explicit OpenAPI enum regression assertion remains advisable.

### Recommended Tests / Validation
- Add a same-page browser test for `bearing_anomaly -> normal` that observes bearing warning, model/RCA transition, and final normal twin status without reload; add the equivalent reducer/API event assertions.
- Parameterize conservation, replacement-count, advisory-lock, repeated-application, raw `simulated` provenance, and instant-event tests across `bearing_anomaly` as well as the existing pressure mode.
- Add solver-bound cases for the 115 C trajectory with/without the reserved 85 C instant, including cap activation and fail-closed rollback.
- Make 3.5 require three API and three DOM rows; add safe-marker tests for all feedback SQL helpers; add an OpenAPI enum membership test.
- After remediation, rerun the DB-backed demo scenario suite and the full 26-spec warm `make demo-e2e` gate at the exact candidate SHA. Gate A1 remains a separate exact-SHA acceptance step.

### Rollout Notes
- Treat the HIGH recovery defect and the MEDIUM oracle/helper issues as merge blockers for PR-E's claimed operator proof.
- The new API enum value is additive, and the web/E2E unions are synchronized. The route remains default-off outside the explicitly demo-enabled stack.
- Keep “source delivered,” “warm suite passed,” and “Gate A1 accepted at one exact merged SHA” distinct. The existing 26/26 warm evidence is useful prior-run evidence, not a substitute for a post-remediation candidate-bound rerun.

## QCHECK round 1 — findings and dispositions (Tier-1 wf: 20 agents/0 errors · Tier-2 g-check)

| Finding | Disposition |
|---|---|
| **HIGH (g-check)** — a prior mode's per-signal warning (hot bearing, vibration) survives `normal` on the open twin: replacement broadcast only its primary signal, while the twin renders MAX severity across per-signal states that persist until a NEWER same-signal frame | **FIXED** — every replacement is now a COMPLETE status transition: `_scenario_instants` emits one instant per signal (primary band event first, hour-0 trajectory values for the rest — SEC-pair behavior preserved), `_replace_scenario` broadcasts them all. API test pins all-five coverage + in-band bearing on recovery; new panel-driven spec proves bearing→normal recovery on the SAME loaded twin (also closes the "panel path proven only by composition" LOW). The bug predated PR-E for `anomaly` (never browser-proven — the suite deliberately ends degraded); the fix covers both. |
| MEDIUM (g-check) — capped solver can write implausible values (2 615 °C bearing on a pathological bucket) | **FIXED** — `ScenarioImplausible` fail-closed guard in `_solved_rows` (band ± 2 widths); route maps it to 422; realistic-case (135.67 ≤ 155) and pathological-case tests added |
| MEDIUM (g-check) — 3.5 passes with <3 rows | **FIXED** — predicate requires exactly 3 API rows AND ≥3 rendered rows |
| MEDIUM (both) — psql helpers interpolate through shell+SQL | **FIXED** — argv `execFileSync` + strict marker grammar asserted before any SQL splice |
| MEDIUM (wf, mutation-proven) — discrimination test survives the pin drop (instant alone tops a NORMAL device) | **FIXED** — the discrimination test now pins `health < WARNING_BELOW` itself |
| MEDIUM/LOW (both) — 3.4b finally masks pre-persistence failures | **FIXED** — `persisted` flag; exact-removal assert on the success path; finally sweeps + verifies emptiness only |
| LOW (both) — 3.6b restore not in finally | **FIXED** — try/finally + poll the restored degraded observable |
| LOW (wf) — 3.6b passes with a healthy device | **FIXED** — asserts status warning|critical under bearing_anomaly |
| LOW (wf) — 3.5 proves attributes, not visible cells | **FIXED** — rendered rank cell + asset label compared too |
| LOW (wf ×2) — ml test `type: ignore` + `list[object]` | **FIXED** — typed `list[LifecycleRow]`, ignores removed |
| LOW (wf) — models.py DemoMode comment stale | **FIXED** — vocabulary comment describes all five modes |
| LOW (both) — coverage doc contradictions & stale captions | **FIXED** — header/summary/bottom-line distinguish delivered vs Gate-A1-accepted; 3.4–3.6 spec captions updated; 27 specs |

Broadcast-contract test updated (5 frames, primary first, all signals). API 326 green single-run;
mypy/ruff clean; e2e tsc clean. 27-spec warm E2E + 3× battery + tier re-runs pending.

## Review (2026-08-05 07:40:29 +07) - working-tree PR-E round 2 vs origin/main 47b4f24

### Reviewed
- Repo: /Users/subhajlimanond/dev/worktrees/pwa-bigdata-review-remediation.BO7ugG
- Branch: test/predictive-operator-proof
- Scope: second-round working tree at HEAD 47b4f24578c5c7fab70b650a04ae21319982782f versus origin/main 47b4f24578c5c7fab70b650a04ae21319982782f; round-1 FIX dispositions treated as settled and checked only for closure/regression
- Commands Run: `git status --porcelain=v1`; bounded name/stat and targeted diffs; exact-string/source inspection; `git diff --check`; targeted `ruff`; targeted source `mypy`; web Vitest (64 files, 540 tests passed), typecheck, and lint; E2E TypeScript compile; `playwright test --list` (27 tests); six evidence-doc functions invoked directly; pure all-mode product-function probe for five-instant ordering/classification/hour-0 bucket means. Docker/OrbStack inspection was denied by the managed socket, and host collection of API/ML pytest was blocked by absent `psycopg_pool`/`sklearn`, so the supplied 27/27 warm-stack result and prior API 326 run were not independently rerun here.

### Findings
CRITICAL
- None.

HIGH
- None.

MEDIUM
- **The new five-reserved-instant conservation path has only a three-instant bucket-mean regression test.** `test_solved_rows_leave_the_instant_buckets_mean_on_trajectory` says it supplies one instant per signal, but constructs only `pressure_bar`, `power_kw`, and `flow_m3h` (`api/tests/test_demo_solver.py:74-93`). The production loop currently reserves all five correctly, and a direct probe measured every mode's five final hour-0 means within 0.001 of `scenario_trajectory`; however, a future regression that stops reserving the newly added `vibration` or `bearing_temp_c` instant can drift the feature bucket while the all-five event-count test and broad model-health tests remain green. Build the test inputs from `_scenario_instants(...)`, assert primary-first/all-five membership, and check all five final means against `scenario_trajectory(...)`; include `normal`, `pressure_drop`, and `bearing_anomaly` so the WORN secondary vibration and hot-bearing target are pinned.
- **The second-operator runbook is stale after adding the hot-bearing panel path.** The runbook promises that a second operator can execute every scored item, but still says the scenario card has four buttons and omits **จำลองลูกปืนร้อนผิดปกติ** (`docs/demo-runbook.md:3-4,32-38`); its 3.6 row still describes only clicking a worklist device, not the newly delivered anomaly→bearing top-cause variation (`docs/demo-runbook.md:122`). The UI now exposes five controls (`web/src/features/twin/DemoScenarioPanel.tsx:14-22`), so a judge following the authoritative runbook cannot reproduce PR-E's new literal 3.6 proof. Update §0b and the 3.6 trigger/expect/reset cells with the two scenario buttons, expected top causes, and final normal reset; extend `test_evidence_docs.py` to pin the panel/runbook vocabulary and prevent this drift.

LOW
- None.

### Round-1 Closure Verification
- The stale per-signal recovery finding is closed: `_scenario_instants` builds a primary-first five-signal map, `_replace_scenario` reserves and broadcasts every entry, `normal` uses five in-band healthy instants, the API tests pin all-five/in-band bearing behavior, and the panel-driven spec exercises bearing→normal on one loaded twin. The direct probe also confirmed all-five hour-0 means for all four telemetry modes; the WORN pressure-drop trajectory deliberately carries a secondary vibration warning, which `normal` supersedes.
- The implausible-solver finding is closed in implementation: `_solved_rows` rejects solve values outside band ± two widths with `ScenarioImplausible`, the route maps it to 422, and realistic/pathological unit cases are present. The WORN trajectory's out-of-band vibration remains comfortably inside the envelope and did not trip the direct all-mode probe.
- The 3.5 truncation finding is closed: the predicate requires exactly three API rows and at least three DOM rows, then compares all three ranks/assets/scores plus the judge-visible rank and asset cells. No broader visible-cell scope was re-litigated in this round.
- The feedback-helper finding is closed: `execFileSync` receives a fixed argv vector, and every SQL-spliced marker is first constrained by `^[a-z0-9][a-z0-9-]{0,80}$`.
- The remaining round-1 FIX items are present as dispositioned: 3.4b success-path deletion plus unconditional empty sweep; 3.6b `finally` restore plus degraded-state poll; non-normal discrimination/health assertions; typed shipped-artifact test without ignores; five-mode vocabulary comment; visible worklist rank/asset cells; and delivered-vs-Gate-A1 coverage wording with a verified 27-test count. No round-1 finding was reopened.

### Open Questions / Assumptions
- The direct five-instant probe loaded the product functions with isolated type/dependency stubs because the host lacks the API database packages; it exercised the real trajectory, instant, solve, plausibility, and classifier code but is not a replacement for the DB transaction or WebSocket integration suite.
- The user-supplied 27/27 warm Playwright result is treated as prior evidence. This review independently confirmed collection of 27 tests and local TypeScript/web gates, not the mutable live-stack behavior.
- `bearing_anomaly` remains demo-only, visibly simulated, and in parity across Python, web, and E2E mode unions. No new production exposure was found.

### Recommended Tests / Validation
- Replace the manual three-entry solver-test fixture with `_scenario_instants(...)` and assert all-five primary ordering plus final hour-0 means for normal, pressure_drop, and bearing_anomaly.
- Add an evidence-doc regression that compares the panel's five modes/labels with the runbook and requires the 3.6 anomaly→bearing→normal operator sequence.
- After remediation, rerun the DB-backed demo scenario suite and the full serialized 27-spec warm `make demo-e2e` gate at the exact candidate SHA; retain Gate A1 as the separate exact-merged-SHA acceptance boundary.

### Rollout Notes
- The round-1 correctness defects are closed, but the two new MEDIUM evidence/test gaps should be fixed before PR-E claims merge-ready second-operator proof.
- The five-frame event expansion is additive inside the demo-only route. Buffer keys are per `(asset, kind, signal)`, so the frames do not coalesce over one another; primary-first ordering remains intact.
- Keep local source gates, prior warm-stack rehearsal, exact-candidate rerun, and Gate-A1 acceptance reported as distinct evidence states.

## QCHECK round 2 — dispositions (g-check r2: round 1 CLOSED, 0 C/H, 2 new M · Tier-1 wf r2: 17 agents/0 errors)

Both tiers confirm every round-1 fix closed. Round-2 set, all fixed:

| Finding | Disposition |
|---|---|
| M (g-check) — solver bucket-mean test used a hand-rolled 3-instant fixture | **FIXED** — parametrized across all four telemetry modes, fixture built by the production `_scenario_instants`, asserts primary-first + all-five membership + every hour-0 mean on `scenario_trajectory` |
| M (g-check) — runbook stale (four buttons; 3.6 row lacks the two-anomaly sequence) | **FIXED** — §0b lists five buttons incl. จำลองลูกปืนร้อนผิดปกติ; 3.6 row walks anomaly→bearing→normal; new evidence test pins every panel label into the runbook + the 3.6 sequence |
| M (wf, coverage-proven) — ScenarioImplausible→422 mapping unexecuted by any test | **FIXED** — route-level test (monkeypatched refusal → 422 with detail) |
| M (wf) — judge-visible health numeral seam (WorklistRow→HealthMeter) untested | **FIXED** — `worklist-health-cell` testid; component test pins 30.4→"30"/61.9→"62"; e2e 3.5 compares the rendered numeral per row via replicated formatInt |
| L (wf) — dead `signal, value = next(iter(...))` + stale comment | **FIXED** — deleted (mutation-proven no-op by the verifier) |
| L (wf) — module docstring claimed non-primary instants are in-range (false for WORN secondaries) | **FIXED** — honest wording: worn secondaries may sit out of band and are superseded the same way |
| L (wf) — route docstring omitted the 422 implausible cause | **FIXED** |
| L (wf) — 4 ms instant stagger can cross the hour boundary, escaping the reserved solve | **FIXED** — timestamps clamped to the bucket's hour start |
| L (wf) — recovery test pinned in-band classification for bearing only | **FIXED** — all five frames must classify normal |
| L (wf ×2) — 3.4b finally could skip the sweep when the success-path delete failed / mask via DB probes | **FIXED** — unconditional idempotent sweep + emptiness verify only; exact-removal assert stays on the success path |
| L (wf) — 3.6b restore poll converged on the previous degraded state | **FIXED** — polls the restore's own `active_run_id` (mode-specific observable) |

Targeted greens: api demo/solver/evidence 52 · components 14 · ruff/mypy/eslint/tsc clean.
Final 3× battery + 27-spec warm E2E + verification-only g-check round 3 pending.

## Review (2026-08-05 08:09:26 +07) - working-tree PR-E round-3 verification vs origin/main 47b4f24

### Reviewed
- Repo: /Users/subhajlimanond/dev/worktrees/pwa-bigdata-review-remediation.BO7ugG
- Branch: test/predictive-operator-proof
- Scope: third-round verification-only working tree at HEAD 47b4f24578c5c7fab70b650a04ae21319982782f versus origin/main 47b4f24578c5c7fab70b650a04ae21319982782f; prior round-1/round-2 dispositions were not re-litigated
- Commands Run: `git status --porcelain=v1`; bounded name/stat and targeted diffs; exact-string/source inspection; complete current Coding Log read; `git diff --check`; focused web Vitest (20 passed: predictive components 14 and demo panel 6); web typecheck; E2E TypeScript compile; direct execution of `test_runbook_names_every_scenario_button_the_panel_renders` (passed); attempted Docker/OrbStack inspection (denied by the managed socket); attempted targeted Python ruff (host module unavailable). User-supplied live evidence reviewed separately: API 331 x3, ML 50, web 540 x3, components 14, static gates clean.

### Findings
CRITICAL
- None.

HIGH
- None.

MEDIUM
- **The new runbook regression test does not actually pin the promised anomaly -> bearing -> normal order.** The current 3.6 row is correct, but `api/tests/test_evidence_docs.py:178-181` only checks that each of the three labels occurs somewhere in the row. A reversed or otherwise unsafe operator sequence such as normal -> bearing -> anomaly still passes, despite the test docstring claiming to enforce the sequence. This leaves the round-2 runbook evidence fix incomplete and can let the authoritative second-operator script drift again. Assert increasing label positions (anomaly before bearing before normal), or match an explicit ordered subsequence; add a negative test/probe showing a reordered row fails.

LOW
- **The round-2 docstring-honesty cleanup left two pre-fix claims behind.** `api/app/demo.py:17-20` says the feature window is worn for faults and healthy only for normal, but `bearing_anomaly` is a fault intentionally run on `HEALTHY_WEAR` (`api/app/demo.py:290-294`). `api/app/routes/demo.py:11-13` still says the handler broadcasts one instant `TwinEvent`, while it now loops over all five `result.events` (`api/app/routes/demo.py:107-109`). These do not change runtime behavior, but they misdescribe the exact counterfactual and broadcast contracts this round was meant to document honestly. Name the healthy-baseline bearing exception and make the route-module wording plural; a small static assertion can prevent both claims from regressing.

### Open Questions / Assumptions
- The solver fixture is complete for the requested closure: all four telemetry modes use production `_scenario_instants`, assert primary-first and exact all-five membership, and verify every hour-0 mean against `scenario_trajectory`.
- The current runbook itself is correct: section 0b lists five panel buttons including `จำลองลูกปืนร้อนผิดปกติ`, and row 3.6 currently walks anomaly -> bearing -> normal. The finding is the regression test's false-positive surface, not current operator prose.
- The 422 mapping/test, visible health-number seam, dead-assignment deletion, hour-start clamp, all-five in-band recovery check, unconditional idempotent 3.4b sweep, and restore-owned `active_run_id` poll are present and sufficient within this verification scope. No new runtime correctness regression was found in them.
- Docker/API/ML/live-stack execution could not be independently reproduced because the managed environment denied the OrbStack socket; the API 331 x3, ML 50, web 540 x3, components 14, and static-clean battery is therefore user-supplied evidence, not a command result from this review. The host also lacks the API pytest/ruff dependency set.

### Recommended Tests / Validation
- Strengthen `test_runbook_names_every_scenario_button_the_panel_renders` with an ordered anomaly < bearing < normal assertion and prove a reordered row fails.
- Correct the two module-level docstrings and optionally pin the bearing healthy-baseline and multi-event broadcast vocabulary in the static evidence test.
- Retain the supplied full 3x battery as candidate evidence, then rerun the exact-SHA acceptance gate after the working tree is committed; HEAD currently still equals origin/main and the reviewed changes are uncommitted.

### Rollout Notes
- No CRITICAL or HIGH findings. The round-2 solver and runtime workflow fixes are behaviorally closed; one MEDIUM evidence-test gap and one LOW documentation-honesty gap remain.
- This review made no product-code edits. It appended only this mandatory g-check report to the current Coding Log.
- Keep user-supplied warm/live evidence, committed candidate evidence, exact-SHA Gate A1 acceptance, and promotion proof distinct.

## QCHECK round 3 (g-check, verification-only) and final state

Round-2 closures all confirmed. Residuals fixed:
- **M** — the runbook-sequence test pinned membership, not ORDER: now asserts strictly
  increasing label positions (anomaly → bearing → normal). **Mutation-proven**: swapping
  the row's order fails the test; reverted → green.
- **L** — two stale docstring claims: demo.py module docstring now names the
  bearing_anomaly healthy-baseline exception; routes/demo.py describes the plural
  all-signals broadcast.

No round 4: zero product defects since round 1's fixes; round-3 items were doc/test-order
strength with their own executable mutation evidence recorded above.

## Final gates (tree as committed)

- ruff · mypy strict (56) · eslint · tsc (web+e2e) · vite build — clean
- API pytest **331 ×3** (+ final single 331 on the landing tree) · web vitest **540 ×3** ·
  ml **50** — no flakes
- Warm `make demo-e2e` (TSDB_PORT=5435): **27/27**, DEMO READY, provenance probe green;
  final run post-round-2 fixes; round-3 edits were docs/tests only
- QCHECK: Tier 1 = review workflow ×2 rounds (20/17 agents, 0 errors) · Tier 2 = Codex
  g-check skill ×3 rounds. Every finding dispositioned above; no deferrals left in PR-E
  scope (the five-case behavioral preflight harness remains PR-F's, as accepted in PR-D).
