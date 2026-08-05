# Coding Log — PR-D / PR-E / PR-F Gap Remediation

- Created: 2026-08-05 12:01:07 +0700
- Planning baseline: `origin/main == 51486a101d5f87e61bf16a301a9734595cbbd371`
- Reviewed merged ranges: PR-D/#35 through PR-F/#37
- Primary checkout: intentionally preserved dirty at `3fffdc73cff1f00d4f7e090e8de3cec6da0f6f28`
- Read-only source checkout: `/Users/subhajlimanond/dev/worktrees/pwa-bigdata-review-remediation.BO7ugG`
- Planning only: no product code, runtime, Docker volume, branch, commit, PR, or deployment changed

## Exploration record

Auggie semantic search was attempted first and timed out at the required two-second boundary. This plan therefore uses direct file inspection plus exact-string searches. The primary agent inspected `CLAUDE.md`, the relevant rubric/runbook/coverage sections, the complete touched UI and harness entry points, their focused tests, and the cross-language contracts below. Two independent read-only Terra scans separately covered PR-D/E and PR-F and converged with the direct inspection.

Inspected paths:

- `CLAUDE.md`, `POC_SPEC.md`, `docs/DREP-demo-poc.md`
- `docs/demo-coverage.md`, `docs/demo-runbook.md`, `e2e/README.md`
- `web/src/features/predictive/ModelCard.tsx`
- `web/src/features/predictive/RcaPanel.tsx`
- `web/src/features/predictive/HealthMeter.tsx`
- `web/src/features/predictive/WorklistTable.tsx`
- `web/src/features/predictive/FeedbackPanel.tsx`
- `web/src/features/predictive/predictive.config.ts`
- `web/src/features/predictive/predictiveComponents.test.tsx`
- `web/src/screens/PredictiveAnalyticsScreen.tsx`
- `e2e/tests/topic3-predictive.spec.ts`, `e2e/lib/api.ts`, `e2e/playwright.config.ts`
- `Makefile`, `infra/docker-compose.yml`
- `scripts/demo-acceptance.sh`, `scripts/demo-preflight.sh`, `scripts/demo-reconnect.sh`, `scripts/demo-scenario.sh`
- `scripts/lib/volume-reset.sh`, `scripts/lib/artifact-provenance-probe.sh`
- `api/tests/test_acceptance_harness.py`, `api/tests/test_evidence_docs.py`
- `infra/db/004_feedback.sql`, `api/app/health_store.py`
- `coding-logs/2026-08-05T04-48 Coding Log (pr-d-model-provenance).md`

Settled constraints:

- PR-D owns complete loaded-artifact provenance and judge-visible dataset/model proof.
- PR-E owns literal operator/browser proof for feedback, worklist, and induced RCA variation.
- PR-F owns the exact-SHA acceptance harness and destructive cold boundary.
- Gate A1 remains pending until every remediation is merged and rerun at one exact clean merged SHA.
- No API endpoint, database migration, model artifact, scoring behavior, or simulator scenario needs to change.
- Warm rehearsal and destructive true-cold acceptance remain separate evidence states.

---

## Plan Draft A — one consolidated remediation PR

### Overview

Land one remediation PR containing all PR-D/E visible-oracle fixes and all PR-F acceptance-integrity fixes. Keep the public Make targets stable, remove the receipt mechanism, and make `scripts/demo-acceptance.sh` perform a confirmed reset itself whenever production mode is `cold`.

### Files to Change

PR-D/E surfaces:

- `web/src/features/predictive/ModelCard.tsx` — render the full artifact SHA as persistent, copyable visible text.
- `web/src/features/predictive/RcaPanel.tsx` — mark the visible signal label, not only its containing metadata row.
- `web/src/features/predictive/HealthMeter.tsx` — accept an optional test id for the visible numeral.
- `web/src/features/predictive/WorklistTable.tsx` — pass the worklist-only visible-numeral hook.
- `web/src/features/predictive/predictiveComponents.test.tsx` — pin full hash, exact RCA labels, exact health numerals, and non-null feedback markers.
- `e2e/tests/topic3-predictive.spec.ts` — replace hidden/substring oracles and own UI feedback cleanup.
- `docs/demo-runbook.md`, `docs/demo-coverage.md` — describe the literal full-hash and visible operator checks accurately.
- `api/tests/test_evidence_docs.py` — pin the full-digest operator instruction and Gate A1 boundary.
- `coding-logs/2026-08-05T04-48 Coding Log (pr-d-model-provenance).md` — remove the single trailing space at line 290.

PR-F surfaces:

- `scripts/lib/demo-compose.sh` — new shared Bash compose-context resolver.
- `Makefile` — export one compose file/project pair and keep the existing public targets.
- `scripts/demo-acceptance.sh` — remove receipt authorization, enforce source identity, own cold reset-to-gate sequencing, and write v2 manifests.
- `scripts/lib/volume-reset.sh` — retain the sole confirmed `down -v`; stop writing receipts.
- `scripts/demo-preflight.sh`, `scripts/demo-reconnect.sh`, `scripts/demo-scenario.sh`, `scripts/lib/artifact-provenance-probe.sh` — source the same compose context.
- `e2e/lib/api.ts` — use the same file/project pair for every Docker call.
- `api/tests/test_acceptance_harness.py` — replace receipt tests with reset-order, compose-context, and source-identity contracts.
- `docs/demo-runbook.md`, `docs/demo-coverage.md`, `e2e/README.md` — document the new fail-closed public contract.

### Implementation Steps

Tests-first sequence:

1. Add or tighten every unit, static, browser, and shell-contract test listed below.
2. Run the focused tests and record RED for the intended current defects: truncated visible SHA, metadata-only RCA, substring health pass, unowned feedback row, forged legacy receipt, compose mismatch, and dirty/source-drift acceptance.
3. Implement the smallest UI and harness changes that make each RED green.
4. Refactor only shared compose argument construction and acceptance helpers needed to keep functions below repository limits.
5. Run focused gates, full touched-layer gates, `git diff --check`, QCHECK, and formal g-check.

Named functions/components:

- `ModelCard()` — keep the artifact and data digests separately labelled, but render `card.artifact_sha256` in full in `model-artifact-sha`; use wrapping/monospace styles so all 64 characters remain readable and copyable.
- `RcaPanel()` — add `data-testid="rca-signal-label"` to the already-visible label span; the signal mapping remains `SIGNAL_LABEL_TH`.
- `HealthMeter()` — add optional `valueTestId?: string` and apply it only to the bare visible-number span.
- `WorklistRow()` — pass `valueTestId="worklist-health-visible"`; do not derive or duplicate the number outside `HealthMeter`.
- `feedback UI E2E` — fill `บันทึกเพิ่มเติม` with a grammar-safe `e2e-ui-<timestamp>` marker, compare the visible ack id with `feedbackIdByNote`, and use the established unconditional idempotent cleanup pattern.
- `load_demo_compose_context()` in `scripts/lib/demo-compose.sh` — canonicalize/export `COMPOSE_FILE_PATH`, default/export `COMPOSE_PROJECT_NAME=pwa-demo`, validate both, and expose a `DEMO_COMPOSE` Bash array with explicit `--file` and `--project-name` arguments.
- `require_gate_source()` in `scripts/demo-acceptance.sh` — in production, require clean source and `HEAD == origin/main` before any reset, gate, or manifest.
- `verify_gate_source()` — after the gate/probes and immediately before manifest creation, require unchanged HEAD/origin-main and a still-clean tree; source drift produces an invalid, non-accepted record.
- `run_acceptance()` — preserve consecutive-run and failed-run audit behavior; production `cold` first invokes the confirmed reset in the same script execution and never consults a receipt.
- `require_external_evidence_dir()` — in production, resolve `EVIDENCE_DIR` and refuse a destination inside the Git worktree; warm evidence must not dirty the candidate before a same-SHA cold run. Test mode may continue using temporary test directories.
- `write_manifest()` — emit `demo-acceptance/v2` or `/v2-test` with source-before/after and compose file/project fields; only a clean unchanged production run may have `result=passed`.
- `composeArgs()` / `runCompose()` in `e2e/lib/api.ts` — use `execFileSync` and the exported file/project pair for simulator, broker, and feedback SQL operations.

### Test Coverage

`web/src/features/predictive/predictiveComponents.test.tsx`:

- `shows complete artifact SHA visibly` — all 64 digest characters render literally.
- `renders exact visible RCA signal labels` — label text matches ranked signal identity.
- `exposes exact worklist health numeral` — bare formatted number equals served score.
- `submits marker-owned feedback note` — payload preserves unique non-null cleanup marker.

`e2e/tests/topic3-predictive.spec.ts`:

- `3.1b complete visible artifact provenance` — visible digest equals API string exactly.
- `3.4 UI feedback cleans its row` — ack id persists then marker disappears.
- `3.5 exact visible health correspondence` — numeral equality rejects substring false passes.
- `3.6b visible top labels vary` — vibration and bearing labels change visibly.

`api/tests/test_evidence_docs.py`:

- `test_runbook_requires_full_artifact_digest_comparison` — operator compares full visible and container hashes.
- `test_coverage_keeps_gate_a1_pending` — remediation does not pre-accept final gate.

`api/tests/test_acceptance_harness.py`:

- `test_well_formed_legacy_receipt_cannot_skip_reset` — planted capability never authorizes cold evidence.
- `test_cold_refuses_without_exact_confirmation` — no Docker, gate, or manifest occurs.
- `test_cold_resets_before_gate_in_one_execution` — reset precedes first score-gate command.
- `test_reset_and_gate_share_compose_context` — file and project arguments match exactly.
- `test_all_runtime_entrypoints_pin_compose_context` — Make, Bash, and E2E honor one pair.
- `test_dirty_source_refuses_before_side_effects` — dirty input cannot reset or execute.
- `test_non_main_sha_refuses_before_side_effects` — HEAD mismatch cannot produce Gate A1.
- `test_mid_run_source_drift_is_invalid` — changed SHA/dirt never prints accepted.
- `test_production_evidence_dir_must_be_external` — manifest output cannot dirty accepted source.
- `test_clean_unchanged_source_writes_v2_manifest` — verified identity and compose context persist.
- `test_test_mode_remains_non_production_class` — contract seam stays harmless and non-destructive.

### Decision Completeness

Goal:

- Close all eight recorded PR-D/E/F findings and make Gate A1 evidence judge-visible, stack-consistent, clean-SHA-bound, and non-forgeable by receipt creation.

Non-goals:

- No model retraining, API route, feedback schema, migration, simulator behavior, new scenario, scoring change, deployment, or cold run during implementation.
- No signed-receipt/key-management system and no legacy receipt fallback.

Success criteria:

- Full 64-character artifact digest is visibly readable and E2E-equal to `/api/model.artifact_sha256`.
- RCA top labels and worklist health numerals are exact visible-text assertions.
- UI feedback leaves zero marker-owned rows after success or failure.
- No production cold result can occur without a same-execution confirmed reset.
- Reset, preflight, Playwright controls, provenance, and post-run DB probe all use identical compose file/project values.
- Production acceptance refuses dirty/non-current source before side effects and cannot pass after source drift.
- PR-D historical range plus remediation passes `git diff --check`.

Public interfaces:

- Keep `make demo-e2e`, `make demo-acceptance-3x`, `make demo-e2e-cold`, and `make demo-down` names.
- Keep `ACCEPTANCE_MODE=warm|cold`, but production `cold` now always performs the reset itself and requires `CONFIRM_VOLUME_RESET=1`.
- Keep `COMPOSE_FILE_PATH`; formally support/export `COMPOSE_PROJECT_NAME` with default `pwa-demo`.
- Keep `EVIDENCE_DIR`, but require an explicit production path outside the worktree; test mode may use its temporary directory.
- Remove `ACCEPTANCE_STATE_DIR` and the external receipt contract without fallback.
- Bump manifest schema to `demo-acceptance/v2` and `demo-acceptance/v2-test`; add compose/source identity fields and `invalid` result semantics.
- No HTTP/OpenAPI, TypeScript wire type, or database schema change.

Edge cases / failure modes:

- Missing/near-miss reset confirmation: fail closed with exit 2 before Docker.
- Dirty tree or missing/mismatched `origin/main`: fail closed before reset, gate, or manifest.
- Production evidence path inside the worktree: fail closed before reset/gate so output cannot invalidate the candidate between warm and cold runs.
- Gate exit non-zero: exit 1 and retain a normal failed audit manifest.
- Source/remote-ref drift during a run: write `result=invalid`, exit 2, never print `ACCEPTED`.
- Invalid compose path/project: fail closed before Docker; no default-stack fallback.
- Alternate compose/project: supported only when the same explicit pair reaches every process and the manifest records it.
- Test mode: may use stubs/override and cold labels, but only in `/v2-test`; it never claims Gate A1.
- Feedback test failure: marker-only cleanup runs unconditionally and never deletes operator data.

Rollout and monitoring:

- Land once after full review; rollback is a single revert before Gate A1.
- Watch shell-contract failures, manifest `result`, source identity fields, compose file/project fields, and marker residue.
- Run warm acceptance before any destructive cold acceptance; cold remains separately authorized.

Acceptance checks:

- Focused UI/E2E/static and acceptance-harness tests all green.
- Full web test/lint/typecheck/build, API focused tests, Ruff, shell syntax, and E2E TypeScript all green.
- Warm `make demo-e2e` rehearsal at the remediation candidate.
- After merge, `EVIDENCE_DIR=<external-dir> make demo-acceptance-3x` yields one v2 warm manifest with three passed runs at exact clean `origin/main`.
- Only with explicit approval, `EVIDENCE_DIR=<same-external-dir> make demo-e2e-cold CONFIRM_VOLUME_RESET=1` yields one v2 cold manifest after exactly one `down -v` against the same stack.

### Dependencies

- Existing Node/Python dependencies, Docker Compose v2, running demo stack for browser rehearsal, and explicit destructive approval for true-cold proof.
- No new package or service dependency.

### Validation

- Run every focused RED/GREEN test, touched-layer gate, QCHECK, formal g-check, warm rehearsal, and final exact-SHA acceptance in the order above.
- Treat any candidate or harness change after a run as invalidating its prior evidence.

### Wiring Verification

| Component | Entry Point | Registration Location | Schema/Table |
|---|---|---|---|
| Full artifact SHA text | `/predictive` model card | `PredictiveAnalyticsScreen.tsx` -> `ModelCard` | `/api/model.artifact_sha256` |
| Visible RCA label hook | `/predictive`, selected worklist asset | `PredictiveAnalyticsScreen.tsx` -> `RcaPanel` | `Signal` -> `SIGNAL_LABEL_TH` |
| Visible worklist health hook | `/predictive` worklist row | `WorklistTable` -> `HealthMeter(valueTestId)` | `/api/worklist[].health_score` |
| Marker-owned feedback E2E | On-screen feedback form | `FeedbackPanel.onSubmit()` -> `POST /api/feedback` | `feedback.id`, `feedback.note` |
| `demo-compose.sh` | Every Bash Docker entry point | sourced by reset/preflight/reconnect/scenario/provenance/acceptance | `infra/docker-compose.yml` name `pwa-demo` |
| Compose context in E2E | Playwright simulator/broker/DB helpers | `e2e/lib/api.ts:runCompose()` | `COMPOSE_FILE_PATH`, `COMPOSE_PROJECT_NAME` |
| Warm acceptance | `make demo-acceptance-3x` | `Makefile` -> `demo-acceptance.sh` | `demo-acceptance/v2` manifest |
| Cold acceptance | `make demo-e2e-cold` | `Makefile` -> `demo-acceptance.sh` -> `volume-reset.sh` -> score gate | same v2 manifest, `mode=cold` |

### Cross-Language Schema Verification

- SQL defines `feedback.id` and nullable `feedback.note` in `infra/db/004_feedback.sql:14-29`.
- Python persists those fields through `api/app/health_store.py:77-82`.
- TypeScript verifies and deletes only exact marker notes in `e2e/lib/api.ts:149-186`.
- Compose context is a Make/Bash/TypeScript environment contract, not a DB migration.
- No schema change is planned; changing any table/column name is out of scope.

### Decision-Complete Checklist

- [x] Goal, non-goals, and measurable success are locked.
- [x] Public Make/env/manifest changes are explicit.
- [x] Every behavior change has a named failing test.
- [x] Failure semantics are fail closed where evidence/destruction matters.
- [x] Wiring covers UI, Bash, Make, TypeScript, JSON evidence, and feedback SQL.
- [x] Rollback and final warm/cold sequencing are specified.

---

## Plan Draft B — two PRs plus a dedicated cold wrapper

### Overview

Split delivery into two sequential PRs. PR-R1 closes only PR-D/E judge-visible evidence gaps; PR-R2 then replaces the PR-F receipt design with a warm-only public runner plus a dedicated cold reset-and-run wrapper and internal runner library.

### Files to Change

PR-R1 changes only the PR-D/E files listed in Draft A. PR-R2 changes the PR-F files listed in Draft A and additionally creates `scripts/demo-cold-acceptance.sh` and `scripts/lib/demo-acceptance-runner.sh`; production `scripts/demo-acceptance.sh` becomes warm-only.

### Implementation Steps

Tests-first sequence:

1. PR-R1 adds the four component tests, four Topic 3 browser assertions, evidence-doc guard, and PR-D whitespace check; confirm RED.
2. PR-R1 implements only visible UI hooks/text, feedback cleanup, docs, and whitespace; run full web/Topic 3 gates, QCHECK, g-check, merge, and land local main.
3. PR-R2 adds cold-wrapper/order/context/source-identity tests; confirm RED without invoking real Docker.
4. PR-R2 implements `load_demo_compose_context()`, `run_acceptance()`, warm and cold wrappers, reset simplification, E2E compose propagation, manifest v2, and docs.
5. Run shell/API/E2E static gates, QCHECK, g-check, merge, land local main, then run Gate A1 only at the combined exact SHA.

Named functions/components:

- PR-R1 uses the same `ModelCard`, `RcaPanel`, `HealthMeter`, `WorklistRow`, and marker-owned E2E changes as Draft A.
- `run_acceptance(mode)` in `demo-acceptance-runner.sh` centralizes identity checks, consecutive runs, probes, and manifest writing.
- `scripts/demo-acceptance.sh` calls `run_acceptance warm` and refuses production cold selection.
- `scripts/demo-cold-acceptance.sh` validates source, calls reset, then calls `run_acceptance cold` in one wrapper process.
- Compose helpers and E2E `runCompose()` match Draft A.

### Test Coverage

- PR-R1 uses all PR-D/E tests named in Draft A.
- PR-R2 uses all acceptance/compose/source tests named in Draft A, plus `test_warm_entrypoint_refuses_production_cold` and `test_cold_wrapper_is_only_cold_registration`.
- Each PR independently runs its range `git diff --check`, focused/full touched-layer gates, QCHECK, and g-check.

### Decision Completeness

Goal:

- Same functional goal as Draft A, with independent evidence-oracle and acceptance-integrity review boundaries.

Non-goals:

- Same as Draft A; additionally, no compatibility alias from the warm runner to legacy receipt-based cold mode.

Success criteria:

- PR-R1 is complete when all D/E literal visible oracles and cleanup pass.
- PR-R2 is complete when production cold is reachable only through the reset wrapper and all compose/source contracts pass.
- Gate A1 remains blocked until both are merged.

Public interfaces:

- Same stable Make targets and compose variables as Draft A.
- Direct `scripts/demo-acceptance.sh` becomes warm-only; `make demo-e2e-cold` hides the new wrapper.
- Same deliberate removal of `ACCEPTANCE_STATE_DIR`, receipt files, and v1 manifest production.

Edge cases / failure modes:

- Same fail-closed behavior as Draft A.
- A direct production cold request to the warm runner exits 2 without Docker, gate, or manifest.
- A wrapper reset failure prevents `run_acceptance cold` from being called.

Rollout and monitoring:

- Merge PR-R1 before PR-R2 because both touch runbook/evidence tests and because final acceptance must exercise the corrected browser suite.
- Either PR can be reverted independently before Gate A1; do not run cold between them.

Acceptance checks:

- PR-R1: focused/full UI/E2E checks plus a warm Topic 3/full score rehearsal.
- PR-R2: stubbed shell contracts plus final warm and explicitly authorized cold acceptance after merge.

### Dependencies

- Same existing dependencies as Draft A; PR-R2 depends on merged PR-R1 only for final candidate identity, not runtime code.

### Validation

- Two complete lifecycle passes, then one final exact-SHA Gate A1 sequence.

### Wiring Verification

| Component | Entry Point | Registration Location | Schema/Table |
|---|---|---|---|
| PR-R1 visible proof components | `/predictive` | existing `PredictiveAnalyticsScreen` composition | existing API payloads and feedback table |
| Warm runner | `make demo-acceptance-3x` | `Makefile` -> `scripts/demo-acceptance.sh` -> runner library | v2 warm manifest |
| Cold wrapper | `make demo-e2e-cold` | `Makefile` -> `scripts/demo-cold-acceptance.sh` -> reset -> runner library | v2 cold manifest |
| Shared compose context | all Docker entry points | Make export, sourced Bash helper, TS `runCompose()` | compose name `pwa-demo` |

### Cross-Language Schema Verification

- Same verified feedback and compose contracts as Draft A; no migration.

### Decision-Complete Checklist

- [x] Two PR boundaries and dependency order are explicit.
- [x] Warm and cold entry points are unambiguous.
- [x] Tests cover every new wrapper/library registration.
- [x] Public contract removals and manifest v2 are explicit.
- [x] Gate A1 remains after both merges.

---

## Comparative Analysis and Synthesis

### Draft A strengths

- Fewer files and runtime indirections.
- One branch/PR and one final review cycle.
- Existing `ACCEPTANCE_MODE` interface remains intuitive: cold always resets.

### Draft A gaps and trade-offs

- Mixes low-risk visible-test corrections with high-risk destructive shell orchestration.
- A single review/revert unit is broader than either problem domain.
- Documentation/test overlap is simpler, but a late PR-F defect blocks otherwise-ready PR-D/E fixes.

### Draft B strengths

- Separates judge-visible evidence from destructive acceptance integrity.
- Makes the only production cold registration structurally explicit.
- Enables independent review, g-check, and rollback of the shell boundary.

### Draft B gaps and trade-offs

- Adds wrapper and runner files whose registration must be tested.
- Warm/cold behavior is spread across more files.
- Two lifecycle passes take longer and share small documentation/test touchpoints.

### Synthesis decision

Use Draft B's two-PR delivery boundary, but use Draft A's smaller PR-F runtime design: do not add a cold wrapper or runner library. Keep one `scripts/demo-acceptance.sh`; in production `ACCEPTANCE_MODE=cold` always calls the confirmed reset itself before the gate. Add only the shared compose helper because six Bash entry points otherwise risk drifting again.

This yields two narrow review units without creating extra acceptance registrations. The final PR-F implementation has no receipt, no authenticate-later gap, and no alternate path that can label a run cold without resetting.

---

## Unified Execution Plan — selected plan

### Overview

Deliver two sequential remediation PRs. **PR-R1** closes PR-D/E's literal judge-visible and cleanup gaps. **PR-R2** removes receipt authorization, unifies Compose context, and makes Gate A1 accept only an unchanged clean `origin/main`; Gate A1 runs only after both merge.

### PR boundaries and merge order

1. **PR-R1 — `fix: close predictive judge-visible evidence gaps`**
   - Base: `origin/main@51486a101d5f87e61bf16a301a9734595cbbd371`.
   - Owns all PR-D/E UI, Topic 3 E2E, evidence-doc, and PR-D whitespace fixes.
   - No shell acceptance changes.
2. **PR-R2 — `fix: make Gate A1 cold and source evidence fail closed`**
   - Base: merged PR-R1 SHA.
   - Owns Compose context, reset/acceptance semantics, manifest v2, shell/E2E wiring, and operator docs.
   - Gate A1 remains blocked until this PR merges.

### Files to Change

PR-R1:

- `web/src/features/predictive/ModelCard.tsx`
- `web/src/features/predictive/RcaPanel.tsx`
- `web/src/features/predictive/HealthMeter.tsx`
- `web/src/features/predictive/WorklistTable.tsx`
- `web/src/features/predictive/predictiveComponents.test.tsx`
- `e2e/tests/topic3-predictive.spec.ts`
- `docs/demo-runbook.md`
- `docs/demo-coverage.md`
- `api/tests/test_evidence_docs.py`
- `coding-logs/2026-08-05T04-48 Coding Log (pr-d-model-provenance).md`
- this Coding Log for RED/GREEN/QCHECK/g-check/lifecycle evidence

PR-R2:

- `scripts/lib/demo-compose.sh` (new)
- `Makefile`
- `scripts/demo-acceptance.sh`
- `scripts/lib/volume-reset.sh`
- `scripts/demo-preflight.sh`
- `scripts/demo-reconnect.sh`
- `scripts/demo-scenario.sh`
- `scripts/lib/artifact-provenance-probe.sh`
- `e2e/lib/api.ts`
- `api/tests/test_acceptance_harness.py`
- `api/tests/test_evidence_docs.py`
- `docs/demo-runbook.md`
- `docs/demo-coverage.md`
- `e2e/README.md`
- this Coding Log for RED/GREEN/QCHECK/g-check/lifecycle evidence

### Implementation Steps

#### PR-R1 TDD sequence

1. Update `predictiveComponents.test.tsx` first:
   - require exact 64-character visible artifact text;
   - require exact first-row RCA labels for `vibration` and `bearing_temp_c` fixtures;
   - require exact bare worklist health numerals;
   - type a marker and require `submitFeedback(...note=marker)`.
2. Update `topic3-predictive.spec.ts` first:
   - `3.1b` uses exact visible `toHaveText(fullDigest)`;
   - `3.4` fills a unique marker and proves row id + unconditional cleanup;
   - `3.5` compares the scoped bare numeral with strict equality;
   - `3.6b` asserts the exact visible Thai/English top label after each induced mode.
3. Add the runbook/static evidence guard and confirm all intended RED failures on `51486a1`.
4. Implement the smallest component hooks/text changes:
   - render full digest in `ModelCard`;
   - mark visible RCA label;
   - add optional `HealthMeter.valueTestId` and pass it from worklist only.
5. Update runbook/coverage wording and remove only the trailing space at the PR-D Coding Log line.
6. Run focused then full UI/static/TypeScript gates; run a warm Topic 3/full score rehearsal only after static gates are green.
7. Run QCHECK, formal g-check, remediate every non-waived finding, commit, push, open PR-R1, merge, land local main, and verify exact SHA.

#### PR-R2 TDD sequence

1. Replace obsolete receipt tests with behavioral RED tests using PATH stubs and temporary state only:
   - planted well-formed legacy receipt plus missing confirmation must not reach Docker/gate;
   - confirmed cold must log reset before gate exactly once;
   - alternate file/project must appear identically in reset, preflight/gate, E2E helpers, provenance, and manifest;
   - dirty/non-main source must refuse before reset/gate/manifest;
   - a production evidence directory inside the worktree must refuse before reset/gate;
   - mid-run HEAD/dirt/origin-main drift must produce `invalid`, non-zero, and no `ACCEPTED`;
   - clean unchanged source must produce v2 passed evidence.
2. Add `scripts/lib/demo-compose.sh` and wire it into every Bash Docker caller. Keep functions short and fail closed on missing file/invalid project.
3. Update Make defaults/exports to `COMPOSE_FILE_PATH=<absolute repo compose>` and `COMPOSE_PROJECT_NAME=pwa-demo`; use explicit file/project arguments in `COMPOSE`.
4. Simplify `volume-reset.sh` to confirmation plus the sole explicit-project `down -v`; remove state directory, receipt, nonce, age, and symlink machinery.
5. Refactor `demo-acceptance.sh` into small functions:
   - validate mode/RUNS/test seam;
   - require a production evidence path outside the Git worktree;
   - capture and require production source identity;
   - if production cold, invoke reset immediately in the same execution;
   - run the unchanged score gate loop;
   - sample provenance;
   - verify source identity again;
   - write v2 passed/failed/invalid evidence.
6. Replace `execSync` Docker strings in `e2e/lib/api.ts` with `execFileSync` plus a single `composeArgs()` helper using the same env pair.
7. Update runbook, coverage, and E2E README only after behavioral tests pass; explicitly remove receipt/capability wording and `ACCEPTANCE_STATE_DIR`.
8. Run focused then full shell/API/TypeScript gates. Do not perform a real reset during PR validation.
9. Run QCHECK, formal g-check, remediate every non-waived finding, commit, push, open PR-R2, merge, land local main, and verify exact SHA.

#### Final Gate A1 sequence

1. Fetch `origin`, create/re-provision an isolated clean worktree at final `origin/main`, and confirm `HEAD == origin/main`, clean status, and expected branch/detached state.
2. Run all focused/full source gates at that exact SHA.
3. Create one durable evidence directory outside the worktree and run `EVIDENCE_DIR=<external-dir> make demo-acceptance-3x`; require three consecutive passes and a `demo-acceptance/v2` warm manifest whose before/after SHA equals final `origin/main`, both clean flags are true, and compose file/project match the runtime.
4. Restore/confirm the normal simulator/director scenario after warm rehearsal.
5. Only with separate explicit destructive authorization, run `EVIDENCE_DIR=<same-external-dir> make demo-e2e-cold CONFIRM_VOLUME_RESET=1`; require one confirmed `down -v`, a complete fresh bring-up, and one v2 cold passed manifest at the same exact SHA/context.
6. Restore and verify the normal simulator/director scenario after the cold run.
7. Copy/archive the verified manifests after both runs and append exact filenames/results to this Coding Log. Any product, test, or harness change requires re-provisioning and rerunning Gate A1.

### Test Coverage

PR-R1 named tests:

- `shows complete artifact SHA visibly` — full API digest remains human-comparable.
- `renders exact visible RCA labels` — metadata cannot mask wrong visible text.
- `exposes exact worklist health numeral` — substring mutations fail immediately.
- `submits marker-owned feedback note` — UI writes uniquely cleanable evidence.
- `3.1b complete visible artifact provenance` — browser text equals API digest.
- `3.4 UI feedback cleans its row` — persistence proof leaves no residue.
- `3.5 exact visible health correspondence` — first three numerals equal API formatting.
- `3.6b visible top labels vary` — induced faults change visible top cause.
- `test_runbook_requires_full_artifact_digest_comparison` — judge instruction remains literal.

PR-R2 named tests:

- `test_well_formed_legacy_receipt_cannot_skip_reset` — old capability shape is powerless.
- `test_cold_refuses_without_exact_confirmation` — destructive path remains fully guarded.
- `test_cold_resets_before_gate_in_one_execution` — cold label follows immediate reset.
- `test_reset_and_gate_share_compose_context` — alternate stack cannot cross evidence boundary.
- `test_all_runtime_entrypoints_pin_compose_context` — every Docker caller uses same pair.
- `test_dirty_source_refuses_before_side_effects` — modified code cannot claim Gate A1.
- `test_non_main_sha_refuses_before_side_effects` — stale branch cannot claim final acceptance.
- `test_mid_run_source_drift_is_invalid` — mutation invalidates otherwise-green runs.
- `test_production_evidence_dir_must_be_external` — output cannot invalidate same-SHA proof.
- `test_clean_unchanged_source_writes_v2_manifest` — exact identity is recorded twice.
- `test_test_mode_remains_non_production_class` — test seams cannot forge production evidence.

Existing regression tests to retain:

- positive RUNS validation and forced three-run Make target;
- failed-run propagation and audit manifest;
- manifest filename collision resistance;
- resolved gate executable recording;
- inherited Make flags sanitization;
- reset confirmation cannot be bypassed by `make -i`;
- provenance match/mismatch/failure/malformed-output matrix.

### Decision Completeness

Goal:

- Make PR-D/E judge evidence literal and PR-F acceptance evidence truthful before Gate A1.

Non-goals:

- No product-domain behavior, model, API, database, migration, simulator scenario, hosting, or deployment change.
- No receipt authentication scheme, signing keys, or compatibility fallback.
- No destructive cold run until separately authorized after both PRs merge.

Success criteria:

- All eight review findings have a named regression that fails on the old code and passes on remediation.
- Visible SHA/RCA/health assertions are exact, and UI feedback is residue-free.
- Cold acceptance cannot be separated from reset and cannot switch stacks between reset and proof.
- Production `passed` requires clean unchanged `HEAD == origin/main` before and after.
- Both PR ranges and the original PR-D-through-remediation range pass whitespace checks.
- Final warm and authorized cold manifests are exact-SHA/context v2 records.

Public interfaces and contracts:

- HTTP/OpenAPI: unchanged.
- Database: unchanged `feedback(id, note, ...)`; no migration.
- Make targets: unchanged.
- Environment:
  - keep `API_BASE`, `WEB_BASE`, `RUNS`, `EVIDENCE_DIR`, `ACCEPTANCE_MODE`, `ACCEPTANCE_TEST_MODE`, `DEMO_E2E_CMD` test-only, `CONFIRM_VOLUME_RESET`, `COMPOSE_FILE_PATH`;
  - explicitly support/export `COMPOSE_PROJECT_NAME`, default `pwa-demo`;
  - remove `ACCEPTANCE_STATE_DIR` and receipt semantics.
- Evidence JSON: v2/v2-test; add `origin_main_sha`, post-run SHA/clean state, compose file/project, and `invalid` result/failure reason.
- Evidence location: production `EVIDENCE_DIR` must resolve outside the Git worktree so warm and cold proofs can share one clean candidate SHA.
- UI test hooks: `rca-signal-label`, `worklist-health-visible`; `model-artifact-sha` changes from prefix text to full digest text.

Failure modes:

- Every destructive/evidence-integrity boundary fails closed as specified in Draft A.
- UI E2E cleanup is bounded to a grammar-safe unique note and is idempotent.
- No hidden metadata can satisfy the four judge-visible assertions by itself.
- A missing hosted-check system remains reported as absent; local evidence is not relabelled hosted CI.

Rollout, monitoring, and backout:

- Merge order is PR-R1 then PR-R2, one at a time.
- Revert PR-R1 for UI/oracle regression; revert PR-R2 for harness regression before any cold run.
- Existing external receipt files are ignored; no script consumes or migrates them.
- Monitor test residue, shell exit codes, manifest `result/failure_reason`, before/after SHA, and compose context.
- Gate A1 is the promotion boundary; no readiness wording changes to accepted before it passes.

Acceptance checks and expected outcomes:

PR-R1:

```bash
pnpm --dir web exec vitest run src/features/predictive/predictiveComponents.test.tsx
pnpm --dir web test
pnpm --dir web lint
pnpm --dir web typecheck
pnpm --dir web build
pnpm --dir e2e exec tsc --noEmit
api/.venv/bin/pytest -q api/tests/test_evidence_docs.py
CODEX_ALLOW_LARGE_OUTPUT=1 git diff --check 5b76604292a8185735e0f2dc51ebc1f91504ac35..HEAD
```

Expected: all green; the original PR-D trailing whitespace is absent through the remediation tip.

PR-R2:

```bash
api/.venv/bin/pytest -q api/tests/test_acceptance_harness.py api/tests/test_evidence_docs.py
api/.venv/bin/ruff check api/tests/test_acceptance_harness.py api/tests/test_evidence_docs.py
bash -n scripts/demo-acceptance.sh scripts/demo-preflight.sh scripts/demo-reconnect.sh scripts/demo-scenario.sh scripts/lib/demo-compose.sh scripts/lib/volume-reset.sh scripts/lib/artifact-provenance-probe.sh
pnpm --dir e2e exec tsc --noEmit
CODEX_ALLOW_LARGE_OUTPUT=1 git diff --check <PR-R2-base>..HEAD
```

Expected: all green using stubs only; zero real Docker resets.

Final merged Gate A1:

```bash
git fetch --prune origin
git rev-parse HEAD
git rev-parse origin/main
git status --porcelain
EVIDENCE_DIR=/absolute/path/outside/worktree/gate-a1 make demo-acceptance-3x
# separately authorized only:
EVIDENCE_DIR=/absolute/path/outside/worktree/gate-a1 make demo-e2e-cold CONFIRM_VOLUME_RESET=1
```

Expected: identical SHAs, empty pre-run status, warm v2 three-pass manifest, and—only when authorized—one cold v2 pass after a same-execution reset.

### Dependencies

- Docker Compose v2 and the current local demo dependencies.
- A clean isolated final worktree and fresh `origin/main` ref.
- Explicit approval before the true-cold volume reset.
- No new libraries, services, secrets, or migrations.

### Validation

- Follow strict RED -> minimal GREEN -> refactor -> focused gates -> full gates for each PR.
- Run independent QCHECK and formal g-check before each merge.
- Repeat acceptance after any candidate/harness change; do not carry evidence across SHAs.
- Preserve and restore the normal simulator/director state after live rehearsal.

### Wiring Verification

| Component | Entry Point | Registration Location | Schema/Table |
|---|---|---|---|
| Complete artifact SHA | Judge opens `/predictive` | `PredictiveAnalyticsScreen:PredictiveBody` imports/renders `ModelCard` | `/api/model.artifact_sha256` 64-hex |
| RCA visible top label | Select P-2 after scenario | `PredictiveBody` renders `RcaPanel`; `SIGNAL_LABEL_TH` maps signal | `RcaResponse.contributions[].signal` |
| Worklist health numeral | First three worklist rows | `WorklistRow` calls `HealthMeter(valueTestId)` | `/api/worklist[].health_score` |
| UI feedback marker | On-screen `FeedbackPanel` submit | `FeedbackPanel.onSubmit` -> `useFeedback` -> `POST /api/feedback` | `feedback.id`, `feedback.note` |
| Shared Bash compose context | Any Bash Docker command | each script sources `scripts/lib/demo-compose.sh` | `COMPOSE_FILE_PATH`; `COMPOSE_PROJECT_NAME`; compose `name: pwa-demo` |
| Make compose context | `demo-up`, reset trap, all demo targets | exported at Makefile top; explicit `--file/--project-name` | same env pair |
| E2E compose context | simulator/broker/feedback helpers | `e2e/lib/api.ts:composeArgs/runCompose` | same env pair |
| Confirmed volume reset | `demo-down` or cold acceptance | `volume-reset.sh` is sole `down -v` owner | selected Compose project's volumes |
| Warm acceptance | `make demo-acceptance-3x` | Make -> `demo-acceptance.sh` -> score gate | `demo-acceptance/v2`, `mode=warm` |
| Cold acceptance | `make demo-e2e-cold` | Make -> same acceptance script -> reset -> score gate | `demo-acceptance/v2`, `mode=cold` |
| Source identity verification | production acceptance before/after gate | `require_gate_source` / `verify_gate_source` | Git HEAD and local `origin/main` refs |

### Cross-Language Schema Verification

- `infra/db/004_feedback.sql` defines `feedback.id BIGINT` and `feedback.note TEXT`.
- `api/app/health_store.py:FEEDBACK_INSERT` writes `note` and returns `id`.
- `e2e/lib/api.ts` count/id/delete helpers use those exact names and marker equality.
- `infra/docker-compose.yml` declares project name `pwa-demo`; Make, Bash, and TypeScript use the same default/override contract.
- The embedded Python manifest writer and Python tests must agree on the v2 JSON fields.
- No migration or API schema edit is required.

### Decision-Complete Checklist

- [x] No open implementation choice remains: two PRs, selected shell architecture, and merge order are fixed.
- [x] Every public interface addition/removal is named consistently.
- [x] Every recorded finding has a regression that can fail.
- [x] Destructive, source-identity, and evidence failure semantics are explicit.
- [x] Validation commands and expected outcomes are concrete.
- [x] Wiring covers every new helper and every cross-language consumer.
- [x] Rollout, backout, warm rehearsal, and separately authorized cold proof are specified.

## 2026-08-05 13:04:08 +07 — PR-R1 implementation summary

### Scope and source identity

- Branch/worktree: `fix/predictive-evidence-gaps` in `/Users/subhajlimanond/dev/worktrees/pwa-prde-remediation.20260805`.
- Base and pre-commit source: `HEAD == origin/main == 51486a101d5f87e61bf16a301a9734595cbbd371`.
- The dirty primary checkout was not edited beyond the already-selected Coding Log pointer/artifact, and no destructive reset was performed.
- Auggie semantic search was attempted with its required two-second limit and returned `AUGGIE_TIMEOUT_2S`; implementation used direct file inspection and exact-string wiring searches.

### RED evidence

- `pnpm exec vitest run src/features/predictive/predictiveComponents.test.tsx`: 3 failed, 11 passed before production edits. Failures proved the complete artifact digest, visible worklist numeral, and visible RCA labels were absent.
- `api/.venv/bin/pytest -q api/tests/test_evidence_docs.py`: 1 failed, 7 passed before documentation edits because item 3.1 did not require the visible 64-character `sha256sum` comparison.
- `CODEX_ALLOW_LARGE_OUTPUT=1 git diff --check 5b76604292a8185735e0f2dc51ebc1f91504ac35..HEAD`: failed on the PR-D Coding Log trailing whitespace at line 290.
- The tagged feedback component assertion passed against the existing form because `note` was already wired; the defect was live-test ownership and cleanup, so the E2E test is the behavioral regression.

### Minimal GREEN implementation

- `ModelCard` renders the entire loaded-artifact SHA as wrapping visible monospace text; the browser compares its exact text with `/api/model.artifact_sha256`.
- `RcaPanel` exposes the already-visible bilingual signal label as the live oracle; induced vibration and bearing scenarios assert those exact labels.
- `HealthMeter` accepts an optional value test id, and the worklist browser proof compares the isolated visible numeral exactly with the corresponding API row.
- The UI feedback E2E fills a unique marker, proves the visible returned id equals the persisted row id, and deletes only marker-owned rows in unconditional cleanup.
- The runbook instructs the operator to execute `sha256sum` in the running API container and compare all 64 visible characters. Coverage wording preserves Gate A1 as pending.
- The PR-D Coding Log trailing whitespace was removed.

### Wiring verification

- `/predictive` -> `PredictiveAnalyticsScreen` -> `ModelCard`, `WorklistTable`, `RcaPanel`, and `FeedbackPanel` was verified by exact call-site search.
- `/api/model.artifact_sha256` is computed from loaded artifact bytes in `api/app/model.py`/`api/app/main.py`, returned in `api/app/routes/predict.py`, typed in `api/app/models.py` and `web/src/features/predictive/types.ts`, and rendered by `ModelCard`.
- Worklist health flows from `/api/worklist[].health_score` through `WorklistRow` into `HealthMeter`; RCA signals flow from `RcaResponse.contributions[].signal` through `SIGNAL_LABEL_TH` into the visible label.
- Feedback `note` and returned `id` are wired through `FeedbackPanel` -> predictive client -> `POST /api/feedback` -> `health_store.FEEDBACK_INSERT`; E2E DB helpers count, identify, and delete rows by exact marker equality.

### Validation

- Focused web: 14/14 passed, then 14/14 passed in three consecutive runs.
- Evidence docs: 8/8 passed, then 8/8 passed in three consecutive runs.
- Full web: 64 files, 540/540 tests passed; lint, typecheck, and production build passed.
- E2E TypeScript compilation passed.
- `CODEX_ALLOW_LARGE_OUTPUT=1 git diff --check` passed.
- First warm `make demo-e2e` stopped during preflight because unrelated `trend-paper-db` owns host port 5433. Read-only Docker inspection confirmed the conflict; that user service was preserved.
- `TSDB_PORT=15433 make demo-e2e` then passed all 27/27 live browser tests in 1.9 minutes without deleting volumes.
- `TSDB_PORT=15433 scripts/demo-scenario.sh normal` restored the simulator and director; `/api/demo/scenario` returned active normal run `demo-normal-570af50f` and the API, broker, simulator, TimescaleDB, and web services were running.

### Residual boundary

- This is warm PR-R1 evidence over an uncommitted worktree, not Gate A1 and not a true-cold acceptance result.
- The PR-F harness integrity work remains PR-R2. Gate A1 remains unaccepted until PR-R1 and PR-R2 merge and the exact merged SHA passes the required acceptance sequence.

## 2026-08-05 13:10:15 +07 — PR-R1 independent QCHECK disposition

Verdict: changes requested, then remediated.

- MEDIUM: `RcaPanel` placed its exact bilingual label in a fixed 9rem column with Tailwind `truncate`. Playwright's exact `toHaveText` saw the full DOM string even when a judge saw an ellipsis, so the original RCA hidden-oracle finding was not completely closed.
- Disposition: accepted. A browser assertion now requires both the exact label and computed/rendered absence of ellipsis or horizontal clipping. That new assertion failed against the existing container with `Expected: true, Received: false`.
- Fix: the RCA grid now uses a bounded responsive label column and the label wraps with `break-words` instead of clipping.
- GREEN: after rebuilding the web container, `TSDB_PORT=15433 pnpm --dir e2e exec playwright test tests/topic3-predictive.spec.ts -g '3.6b'` passed 1/1. The normal simulator/director state was restored afterward.
- No other correctness or cleanup regressions were found by the independent reviewer.

Additional primary-owner gates on the amended tree:

- API: 361/361 passed in 119.75 seconds.
- ML: 46 passed, 4 skipped.
- Ruff: passed.
- mypy from the configured `api/` project root: passed, 24 source files.
- Focused predictive components: 14/14 passed three consecutive times.
- Full web: 540/540 passed; lint, typecheck, and production build passed.
- E2E TypeScript and working-tree whitespace checks passed.

## 2026-08-05 13:10:58 +07 — Formal g-check: staged PR-R1 candidate

Review target: staged changes on `fix/predictive-evidence-gaps` against `51486a101d5f87e61bf16a301a9734595cbbd371`.

### Findings

No unresolved critical, high, medium, or low findings.

The independent QCHECK medium finding about visually ellipsized RCA labels was reproduced with a browser RED assertion and resolved before this formal review. The amended staged tree exposes the full hash and exact worklist/RCA text to the judge, bounds feedback rows to unique markers with unconditional exact cleanup, repairs PR-D whitespace, and preserves Gate A1 wording.

### Verification considered

- Focused RED/GREEN and three-run reliability evidence for predictive components and evidence documentation.
- Full API 361/361, full web 540/540, ML 46 passed/4 skipped, Ruff, mypy, lint, typecheck, production build, E2E TypeScript, and whitespace gates.
- Warm live `make demo-e2e`: 27/27 passed; targeted rendered-RCA overflow regression: RED before fix and 1/1 GREEN after fix.
- Exact call-site and cross-language wiring for model artifact provenance, worklist health, RCA labels, and feedback persistence/cleanup.
- Runtime restoration to the normal simulator/director scenario.

### Residual risks and evidence boundary

- Live evidence is warm and worktree-bound; it is not exact-merged-SHA Gate A1 evidence.
- The unrelated `trend-paper-db` owns host port 5433, so local rehearsal used the supported `TSDB_PORT=15433` override. This does not change internal service wiring.
- Browser overflow proof covers the configured desktop Chromium project; the wrapped layout is intentionally responsive, but no additional viewport matrix was required by this remediation.
- PR-R2 must still close PR-F acceptance integrity. No cold reset or cold acceptance was run because destructive approval remains separate.

Verdict: approve the staged PR-R1 candidate for commit and the normal PR lifecycle.
