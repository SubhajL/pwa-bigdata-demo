# Coding Log: Overall Phases and PR Roadmap

Date: 2026-08-04 20:14:04 +0700  
Mode: planning only; no product implementation, branch, commit, push, or PR mutation  
Repository: `/Users/subhajlimanond/dev/pwa-bigdata-demo`  
Baseline: `main@a98a359c8a4f7c15bd1a43b557fff0c5bb2cab95`; `main == origin/main`  
Current GitHub state: PR #30 is the latest PR and is merged. Logical IDs below are authoritative; if no other PR is opened first, they are likely to become PRs #31–#40, but GitHub assigns numbers only at creation.

Input plans read in full:

- `coding-logs/2026-08-04-19-39-34 Coding Log (evaluation-criteria-evidence-improvement-roadmap).md`
- `coding-logs/2026-08-04T19-10 Coding Log (rayong-pipe-gis-sec-plan).md`
- `coding-logs/2026-08-04-20-03-45 Coding Log (map-ta-phut-200-customer-impact).md`

## Executive decision

Deliver ten small, sequential, independently landable PRs after PR #30:

| Logical PR | Likely number* | Phase | Purpose | Depends on |
|---|---:|---|---|---|
| PR-A | #31 | 0 | Evidence/documentation truth | PR #30 |
| PR-B | #32 | 1 | Topic 1 judge-visible browser proof | PR-A |
| PR-C | #33 | 1 | Induced SEC and strict 30-second timing | PR-B |
| PR-D | #34 | 1 | Model artifact provenance and dataset DOM proof | PR-C |
| PR-E | #35 | 1 | Swagger, worklist, and RCA operator proof | PR-D |
| PR-F | #36 | 2 | Exact-SHA acceptance harness and safe cold gate | PR-E |
| PR-G | #37 | 3A | Rayong GIS builder and fail-closed API, dark | PR-F + source audit |
| PR-H | #38 | 3A | MapLibre GIS view and official SEC context, dark | PR-G |
| PR-I | #39 | 3B | Map Ta Phut 200-customer schema, seed, and API | PR-H |
| PR-J | #40 | 3B | Clickable low-pressure area, drawer, and live E2E | PR-I |

`*` Numbering is descriptive, not reserved.

PRs are not stacked. Each starts from refreshed `main` after the previous PR is merged, passes its lifecycle, merges, lands into the local `main`, and receives post-merge verification before the next begins.

## Phase map

Indicative engineering effort, excluding review queues, external permission, and remediation: Phase 0 `0.5–1 day`; Phase 1 `4–6 days`; Phase 2/Gate A1 `1–2 days`; Phase 3A `3–5 days` after or in parallel with permission handling while remaining dark; Phase 3B `3–5 days`; Phase 4/Gate A2 `1–2 days`. Phase 5 is unscheduled because its inputs are external-authority blockers. These are planning ranges, not delivery promises.

### Phase 0 — evidence truth and guardrails

Purpose: make the repository describe current PR #30 behavior accurately before adding more proof or realism.

- PR-A only.
- Correct stale runbook/coverage/E2E language, warm-versus-cold semantics, false-real customer wording, and the demo-director bad-asset path description.
- No score claim and no product subsystem change.
- Exit gate: current mechanism, current test count, simulation provenance, and reset semantics agree across docs, UI narration, scripts, and test comments.

### Phase 1 — protect literal evaluation actions

Purpose: close the remaining gaps between implemented behavior and what a judge can visibly trigger and observe.

- PR-B protects Topic 1 items 1.1–1.5.
- PR-C protects induced 2.3 and the literal 3.3 timing boundary.
- PR-D protects 3.1 and 3.2.
- PR-E protects 3.4, 3.5, and 3.6.
- Exit gate: every remaining evidence-hardening row has a non-vacuous DOM/operator oracle tied to its runtime path.

### Phase 2 — exact-SHA acceptance checkpoint

Purpose: make warm, cold, §7, and candidate provenance reproducible rather than narrative.

- PR-F adds harness/guardrails only.
- After PR-F merges, run Gate A1 on merged `main`: full source gates, three consecutive §7 runs, warm E2E, exact SHA and artifact evidence.
- Request explicit approval before any `docker compose down -v` true-cold run.
- Exit gate: core 16-item evidence tranche is accepted independently of GIS.

### Phase 3A — Rayong GIS and official energy context

Purpose: add real Map Ta Phut pipe geometry as an optional synchronized view without inventing hydraulics or station telemetry.

- PR-G lands the audited builder/API contract dark.
- PR-H lands the MapLibre/provenance/energy UI dark.
- Source-derived artifacts are not committed, hosted, or activated until permission is recorded.
- Exit gate: real geometry and source attributes are reproducible; station placement, binding, direction, pressure, customers, and live SEC remain explicitly simulated where unverified.

### Phase 3B — exactly 200 Map Ta Phut simulated affected customers

Purpose: replace the five Samut Sakhon demo service points with a realistic, privacy-safe, clickable Map Ta Phut low-pressure incident.

- PR-I lands database/schema/seed/API with exactly 200 profiles and 2,400 readings.
- PR-J lands the simulated low-pressure footprint, pipe/area click interaction, drawer, detail, and same-DOM E2E.
- Exit gate: pressure drop -> pipe/area highlight -> click -> invariant 200 accounts -> mixed types -> detail/readings -> recovery clear.

### Phase 4 — final merged-main acceptance and rehearsal

Purpose: validate the complete evidence plus realism system at one exact SHA and bundle hash.

- No planned feature PR. Run acceptance on `main` after PR-J.
- Any defect produces a narrowly named remediation PR; do not patch acceptance evidence directly on `main`.
- Run warm evidence first; true-cold only after explicit destructive-reset approval.
- Exit gate: final source gates, live E2E, §7 three-run evidence, GIS/customer preflight, judge rehearsal, and archived SHA/hash/timings all agree.

### Phase 5 — authority-dependent integrations

Purpose: replace simulation only when real contracts and mappings exist.

- No PR is authorized yet for DMAMA, real customer records, hydraulic direction, station-specific SEC, or a real customer-to-pipe crosswalk.
- Candidate future sequence after prerequisites: source-interface refactor -> dark connector -> authority-backed mapping -> controlled activation.
- These PR numbers are not reserved and must not delay Phases 0–4.

## Shared lifecycle for every PR

1. Refresh `origin/main`; verify `main`, `origin/main`, current Coding Log, remote identity, and dirty files.
2. Create an isolated worktree and branch from the exact merged parent SHA. Preserve the dirty primary checkout.
3. Write named tests first and capture the expected RED for the intended defect.
4. Implement the smallest passing change; refactor only when required.
5. Run focused tests, then all touched-layer lint/type/build gates.
6. Run live Compose/Playwright coverage whenever the PR changes a live path or browser oracle.
7. Perform independent QCHECK, then formal `g-check`; resolve or explicitly disposition every finding.
8. Record commands, counts, timings, and exact candidate SHA in the active Coding Log.
9. Commit, push, open one standard GitHub PR, and verify actual required checks. An absent hosted-check configuration is not a passing check.
10. Merge only when review and gates are green; update local `main`, remove the worktree, and rerun proportionate post-merge verification at the merge SHA.

# Plan Draft A — ten risk-isolated PRs

## A1. Overview

Use ten sequential PRs aligned to evidence domains and runtime seams. This maximizes fault attribution, allows clean rollback, and prevents GIS/customer migration risk from contaminating the evidence-hardening tranche.

## A2. Goal, non-goals, and success criteria

### Goal

Land the full evidence, GIS, and Map Ta Phut customer roadmap through small PRs whose dependencies, public surfaces, tests, activation state, and rollback are explicit.

### Non-goals

- No stacked PRs or Graphite workflow.
- No implementation in this planning turn.
- No real customer, station, flow-direction, hydraulic, DMAMA, or station-SEC claim.
- No legacy five-customer fallback after the Map Ta Phut profile lands.
- No destructive cold reset without explicit approval.
- No assumption that a historical or hosted test result applies to a changed SHA.

### Success criteria

- Each PR is independently reviewable, tested, mergeable, and reversible.
- Core evidence acceptance completes before GIS/customer activation.
- GIS/customer code remains default-off until its own readiness contract passes.
- PR-J proves the exact click-to-200/recovery journey on one DOM.
- Final acceptance is tied to one merged SHA and one permitted GIS bundle hash.

## A3. PR implementation plan

### PR-A — evidence truth and documentation drift

- **Likely PR/title:** `#31 fix: reconcile demo evidence and provenance language`
- **Branch:** `fix/evidence-truth`
- **Criteria protected:** cross-cutting; especially 1.5, 2.2, 2.4, 3.3 and §7 claims.
- **Files:** `docs/demo-runbook.md`, `docs/demo-coverage.md`, `e2e/README.md`, `scripts/demo-scenario.sh`, `scripts/demo-preflight.sh`, `e2e/tests/scenario-transitions.spec.ts` comments, `web/src/features/twin/DemoScenarioPanel.tsx`, and a static docs test.
- **TDD:** add `test_demo_docs_match_current_director`, `test_no_real_customer_claim`, `test_preflight_is_not_called_cold_start`, and `test_bad_asset_narration_names_direct_injection`; observe RED on current stale strings; then correct only those claims.
- **Public surface:** UI narration and operator documentation only; no API/DB changes.
- **Done:** zero obsolete 17-test, real-customer, automatic cold-start, or MQTT-path claims remain; docs test is green.
- **Rollback:** revert PR; no data/state changes.

### PR-B — Topic 1 same-DOM judge evidence

- **Likely PR/title:** `#32 test: prove Topic 1 pipeline behavior in the open browser`
- **Branch:** `test/topic1-judge-visible`
- **Criteria protected:** 1.1–1.5, 35 points of evidence protection—not newly created functionality.
- **Files:** `e2e/tests/topic1-pipeline.spec.ts`, `e2e/lib/api.ts`, `web/src/features/pipeline/{ConnectionPill,KpiRow,ResponseTimeTable,RetrievalEvidence,DlqTable}.tsx`, related hooks/types/tests, `scripts/demo-reconnect.sh`, `scripts/demo-preflight.sh`, `scripts/show-hypertable.sql`.
- **TDD:** RED tests for committed count growth, visible outage/recovery plus post-reconnect persistence, all three five-sample latency rows with zero failures and means `<=500`, Timescale catalog proof, and visible MQTT DLQ plus later committed good row.
- **Functions:** add stable semantic selectors/value formatters only where current DOM is not observable; add bounded read-only Playwright helpers; keep production pipeline semantics unchanged.
- **Public surface:** no HTTP/WS schema change; preflight output gains Timescale catalog evidence.
- **Done:** one `/pipeline` DOM visibly proves all five requirements; integration and E2E distinguish received callbacks from committed rows.
- **Rollback:** revert PR; no migration.

### PR-C — induced SEC evidence and strict model clock

- **Likely PR/title:** `#33 feat: expose SEC derivation and enforce strict twin timing`
- **Branch:** `feat/sec-evidence-strict-timing`
- **Criteria protected:** 2.3 and 3.3.
- **Files:** `web/src/features/twin/SecTooltip.tsx`, its tests, `web/src/screens/OperationsTwinScreen.tsx` if stable selection metadata is required, `e2e/tests/scenario-transitions.spec.ts`, `api/tests/test_twin_routes.py` only if contract examples need tightening.
- **TDD:** RED anomaly transition test; RED visible power/flow/timestamps/skew/freshness/formula test; RED elapsed assertions for critical and recovery at `30,001 ms`.
- **Functions:** pure SEC display derivation/formatting; immediate `elapsed <= 30_000` oracle after WebSocket DOM transition.
- **Public surface:** no API fields are expected; existing `SecResponse` fields become visible. Stable DOM metadata is additive.
- **Done:** normal -> anomaly -> visible status/SEC derivation occurs on one page; 30.001-second critical/recovery fails.
- **Rollback:** revert UI/test changes; no schema state.

### PR-D — model artifact provenance and dataset DOM correspondence

- **Likely PR/title:** `#34 feat: expose loaded model hash and rendered dataset evidence`
- **Branch:** `feat/model-provenance-dataset-proof`
- **Criteria protected:** 3.1 and 3.2.
- **Files:** `api/app/model.py`, predictive route/models/tests, API Docker/preflight only as needed, `web/src/features/predictive/{ModelCard,DatasetCompare}.tsx`, TypeScript contracts/tests, `e2e/tests/topic3-predictive.spec.ts`.
- **TDD:** RED loaded-artifact hash test; RED OpenAPI/TypeScript contract test; RED browser assertions for matching hash, Health separation `>=15`, PTTF direction, and lower-bound marker.
- **Functions:** `artifact_sha256(path)` hashes the loaded bytes; response builder attaches the exact hash; DOM exposes typed values without recomputation drift.
- **Public surface:** additive `/api/model.artifact_sha256` field; OpenAPI and TypeScript update together.
- **Done:** running image, API, card, and preflight show one matching artifact hash; both displayed dataset outputs are compared literally.
- **Rollback:** additive API field can be reverted without DB change.

### PR-E — literal Swagger, worklist, and RCA workflow

- **Likely PR/title:** `#35 test: prove predictive operator workflows end to end`
- **Branch:** `test/predictive-operator-proof`
- **Criteria protected:** 3.4, 3.5, and 3.6.
- **Files:** `e2e/tests/topic3-predictive.spec.ts`, `e2e/lib/api.ts`, predictive components/tests, shipped-artifact ML tests; `api/app/demo.py`, demo models/client/panel only if a second allow-listed anomaly is needed for browser RCA discrimination.
- **TDD:** RED Swagger `Try it out` submission/persistence test; RED first-three DOM/API worklist comparison; RED shipped-artifact RCA reversal; RED different top rendered cause for two allow-listed simulated anomalies.
- **Functions:** bounded feedback verification helper; stable row serializers; if required, add `bearing_anomaly` as an explicit demo-only `DemoMode`, fully typed and gated.
- **Public surface:** possible additive `DemoMode=bearing_anomaly`; no feedback/worklist/RCA schema break.
- **Done:** a judge can use Swagger, see persisted ID, verify ordered worklist, and observe model-local attribution change.
- **Rollback:** revert demo mode/UI proof; persisted test feedback is cleaned by the harness.

### PR-F — acceptance harness and safe cold semantics

- **Likely PR/title:** `#36 chore: make exact-SHA warm and cold acceptance reproducible`
- **Branch:** `chore/exact-sha-acceptance-harness`
- **Criteria protected:** §7 plus evidence provenance for all 16 scored rows.
- **Files:** `Makefile`, `scripts/demo-preflight.sh`, new bounded acceptance/evidence script(s), docs, E2E README, Coding Log evidence conventions.
- **TDD:** shell/contract tests for confirmation guard, exact-SHA capture, three-run failure propagation, artifact/hash/catalog output, and warm/cold labels.
- **Functions/targets:** `make demo-acceptance-3x`; `make demo-e2e-cold CONFIRM_VOLUME_RESET=1`; evidence manifest writer captures SHA, stack state, counts and timings.
- **Public surface:** new Make targets; cold target refuses to run without exact confirmation.
- **Done:** merged-main Gate A1 can be executed reproducibly; no destructive command occurs implicitly.
- **Rollback:** remove targets/scripts; no product runtime impact.

### Gate A1 — core exact-SHA acceptance, no PR

- Run all Python package tests/lint/mypy, all web tests/lint/typecheck/build, and live E2E at PR-F's merged SHA.
- Run the §7 suite three consecutive times and archive counts.
- Run warm-stack rehearsal first.
- Ask for explicit approval before the cold run; record volume deletion and rebuild state.
- Any failure opens one remediation PR from the failing merged SHA; Gate A1 restarts after the fix.

### PR-G — audited Rayong GIS builder and API, dark

- **Likely PR/title:** `#37 feat: add fail-closed Rayong pipe GIS backend`
- **Branch:** `feat/rayong-gis-backend`
- **Criteria improved:** 2.1/2.5 realism; data foundation for 2.2–2.4.
- **Files:** `scripts/build_pipe_gis.py`, builder tests, `api/app/{config,gis,models}.py`, `api/app/routes/twin.py`, `api/tests/test_twin_gis.py`, `infra/env.sample`, `Makefile`, provenance docs. Generated bundle is permission-dependent.
- **TDD:** RED source audit, selection, reprojection, allowlist, manifest/hash, binding, path-confinement, disabled/missing/corrupt/size/scope/cache API tests.
- **Functions:** `inspect_source`, `select_map_ta_phut_features`, `normalize_properties`, `reproject_geometry`, `choose_demo_binding`, `build_manifest`, `load_gis_bundle`, `validate_manifest`, `get_network_scope`.
- **Public surface:** `PIPE_GIS_ENABLED=false`, `PIPE_GIS_DIR`, `PIPE_GIS_MAX_BYTES`; `GET /api/twin/gis/manifest`; `GET /api/twin/gis/network?scope=map-ta-phut|full`.
- **Done:** code lands dark; no arbitrary path reads; a missing/unpermitted bundle fails closed; source-derived files are not committed without permission.
- **Rollback:** disable flag or revert PR; no DB migration/PostGIS.

### PR-H — synchronized MapLibre GIS view and official SEC context, dark

- **Likely PR/title:** `#38 feat: add provenance-safe Map Ta Phut GIS twin view`
- **Branch:** `feat/rayong-gis-ui`
- **Criteria improved:** judge realism across 2.1–2.5.
- **Files:** `web/package.json`, lockfile, GIS types/client/config/adapter, `GisNetworkView`, `GisDeviceMarker`, `GisPipeDetails`, `TwinProvenanceLegend`, `EnergyContextCard`, `TwinViewSwitcher`, `OperationsTwinScreen`, component tests, `e2e/tests/topic2-gis.spec.ts`, docs.
- **TDD:** RED map source/layer/focus/cleanup tests; RED shared WebSocket state tests; RED exact source-pipe highlight; RED official reference wording and provenance; RED no-OneDrive-runtime-path test.
- **Functions:** `getGisManifest`, `getGisNetwork`, pure `gisFeatureState`, MapLibre mount/cleanup, synchronized view selection.
- **Public surface:** new GIS tab/view; no new backend schema beyond PR-G; MapLibre dependency pinned.
- **Done:** with a valid local bundle, real geometry renders and responds to the existing scenario; with flag/bundle off, explicit unavailable state appears and the logical view remains honestly distinct.
- **Rollback:** disable `PIPE_GIS_ENABLED`; logical twin remains.

### PR-I — Map Ta Phut 200-customer profile, schema, seed, and API

- **Likely PR/title:** `#39 feat: seed 200 simulated Map Ta Phut impact accounts`
- **Branch:** `feat/mtp-customer-profile-api`
- **Criteria improved:** 2.4 realism and inspectability.
- **Files:** `infra/db/007_map_ta_phut_demo_customers.sql`, profile generator/tests, `scripts/seed_db.py`, coherent Ban Chang/Rayong demo geography, API config/models/topology/routes/demo/tests, OpenAPI fixtures, preflight count checks.
- **TDD:** RED exact 200, 140/35/25 and subtype mix, synthetic-prefix/privacy, exactly 2,400 readings, arithmetic, idempotent forward migration/seed, exact 200 upstream and 80 last-leg traversal, detail 12 readings, disabled/unknown behavior.
- **Functions:** `build_map_ta_phut_profiles`, `build_monthly_readings`, `validate_demo_customer_profile`, `seed_demo_customer_profiles`, enriched `downstream_customers`, `get_demo_customer_detail`, `load_impact_zone`.
- **Public surface:** migration `007`; `MTP_CUSTOMER_IMPACT_ENABLED=false`; `MTP_CUSTOMER_PROFILE=mtp-low-pressure-200-v1`; enriched impact response; new `GET /api/twin/customers/{customer_id}` and GIS impact-zone route.
- **Done:** exactly 200/2,400 on fresh and upgraded stacks, no five-row fallback, no PII-like rows, OpenAPI/TypeScript fixture ready for PR-J.
- **Rollback:** disable feature; additive tables remain inert. Do not restore the old five rows as runtime fallback.

### PR-J — clickable low-pressure area and 200-customer live proof

- **Likely PR/title:** `#40 feat: show 200 customers from clickable low-pressure area`
- **Branch:** `feat/mtp-low-pressure-experience`
- **Criteria improved:** 2.4 judge-visible realism while retaining 2.2 and 3.3 transitions.
- **Files:** TypeScript impact/detail contracts/client, `GisLowPressureArea`, `ImpactPanel`, `AffectedCustomerDrawer`, `AffectedCustomerTable`, `CustomerDetailPanel`, `MonthlyMeterReadings`, `OperationsTwinScreen`, tests, `scenario-transitions.spec.ts`, `topic2-gis.spec.ts`, preflight/runbook/coverage.
- **TDD:** RED patterned/non-colour area test; RED identical area/pipe selection; RED `200` and `140/35/25`; RED 25 rows/eight pages; RED filters preserving incident total; RED account/meter/type/address/detail/12 readings; RED recovery closing/clearing; RED full same-DOM Playwright journey.
- **Functions:** `selectImpactZone`, `filterAndPageCustomers`, detail request cancellation, `clearRecoveredImpact`, MapLibre click registration/cleanup.
- **Public surface:** clickable `พื้นที่แรงดันต่ำจำลอง`, impact drawer, customer detail route consumption; no schema change beyond PR-I.
- **Done:** pressure POST -> WebSocket state -> pipe/area -> click -> exact 200 -> inspect -> recovery clear is browser-proven on one page; provenance remains REAL geometry / OFFICIAL reference / SIMULATED impact.
- **Rollback:** disable customer/GIS flags; additive tables remain; no false fallback.

### Gate A2 — final merged-main acceptance, no PR

- Exact SHA must include PR-J and all preceding merges.
- Preflight proves GIS permission/hash/CRS/counts, 200 profiles, 2,400 readings, 140/35/25, model hash, Timescale catalog, and feature flags.
- Run full source gates and E2E; run §7 three times.
- Rehearse the literal judge sequence and archive trigger-to-area, click-to-drawer, model-critical, and recovery timings.
- Run true-cold only after explicit approval.
- Do not call the work complete until local `main` is at the accepted merge SHA and post-merge verification is recorded.

## A4. Files-to-change rollup

| Cluster | PR owner |
|---|---|
| Documentation/evidence truth | PR-A |
| Pipeline components/scripts/E2E | PR-B |
| SEC UI/scenario timing | PR-C |
| Model API/card/datasets | PR-D |
| Swagger/worklist/RCA | PR-E |
| Acceptance Make/scripts/docs | PR-F |
| GIS builder/API/config | PR-G |
| GIS MapLibre UI/provenance | PR-H |
| Customer migration/generator/API | PR-I |
| Low-pressure customer UI/E2E | PR-J |

Sequential ownership intentionally permits later PRs to extend files merged earlier. No two product PRs are developed concurrently.

## A5. Test and gate matrix

| PR | Fast RED/GREEN | Full touched-layer gate | Live gate |
|---|---|---|---|
| A | docs/static + targeted web test | web lint/typecheck/test | optional smoke |
| B | Topic 1 component/E2E helpers | API + web full gates | Topic 1 Playwright + reconnect |
| C | SEC component + scenario spec | API/web full gates | scenario transitions |
| D | model/API/card/dataset tests | API/ML/web full gates | Topic 3 Playwright + preflight |
| E | feedback/worklist/RCA tests | API/ML/web full gates | Swagger/predictive Playwright |
| F | harness/guard tests | all source gates | Gate A1 after merge |
| G | builder + GIS API tests | scripts/API full gates | API with audited local bundle |
| H | GIS adapter/components | web full gates | Topic 2 GIS Playwright |
| I | migration/generator/topology/routes | scripts/API/simulator full gates | fresh + upgraded Compose seed/API |
| J | customer UI/components | web/API full gates | complete same-DOM scenario |

Canonical source gates:

- `cd api && pytest`, `ruff check .`, `mypy .`
- `cd simulator && pytest`, `ruff check .`, `mypy .`
- `cd ml && pytest`, `ruff check .`, `mypy .` where configured
- `cd web && pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`
- `make demo-e2e` for the warm live gate

## A6. Public interfaces and migration sequence

1. PR-D adds `/api/model.artifact_sha256`.
2. PR-E may add demo-only `bearing_anomaly` to `DemoMode`; it remains `DEMO_CONTROLS` gated.
3. PR-F adds safe acceptance Make targets.
4. PR-G adds GIS environment settings and read endpoints, default off.
5. PR-I applies additive migration `007`, adds customer settings/read endpoints, and enriches `ImpactResponse`, default off.
6. PR-J consumes the already-landed contracts and adds no new DB schema.

No incompatible public change is planned. Python/OpenAPI/TypeScript changes land in the same PR as their producer.

## A7. Edge cases, rollout, and backout

- A failing PR never gets merged merely to unblock a later PR.
- If a candidate or harness changes, its exact-SHA evidence is invalidated and rerun.
- Hosted checks absent/zero-step are reported as absent, not passing.
- GIS code can land dark without redistribution permission; activation cannot.
- GIS missing/corrupt/hash-drifted fails closed with explicit unavailable state.
- Migration `007` is additive; rollback disables customer impact instead of destructive downgrade.
- Exactly 199 or 201 customers, wrong type mix, incomplete readings, unsafe IDs/addresses, or API count mismatch blocks startup/preflight.
- A late 30.001-second transition fails.
- Recovery must cancel/clear customer state so stale 200-account impact cannot remain.

## A8. Dependencies

- Docker Compose, Mosquitto, TimescaleDB, built model artifact, Playwright/Chromium.
- GIS source permission before artifact packaging/activation.
- Exact source hash/CRS/counts and Map Ta Phut selection audit.
- Explicit approval for destructive true-cold rehearsal.
- No DMAMA credentials or customer PII required for PRs A–J.

## A9. Wiring verification

| Component | Entry point | Registration/consumer | Schema/table |
|---|---|---|---|
| Evidence docs guard | source test | test runner | files/strings only |
| Topic 1 browser proof | `/pipeline` Playwright | existing screen/hooks | telemetry/ledger/DLQ/catalog |
| SEC proof | selected pump on `/operations` | `SecTooltip` | existing `SecResponse` |
| Strict model clock | scenario POST | scorer -> WebSocket -> DOM | telemetry/health |
| Artifact hash | `/api/model` | predictive router/card/preflight | JSON/OpenAPI/TS |
| Predictive workflows | `/docs`, `/predictive` | existing routers/components | feedback/health/model |
| Acceptance harness | Make targets | scripts/Compose/Playwright | evidence manifest |
| GIS builder/API | `make gis-build`, `/api/twin/gis/*` | config/twin router | manifest/GeoJSON |
| GIS view | `/operations` tab | `OperationsTwinScreen` | GIS REST + WS state |
| Customer migration/seed | migrate/seed services | Compose dependency order | profile/readings/service points |
| Customer impact API | pipe/area selection | twin router/client | topology + profile + readings |
| Clickable impact UI | MapLibre/pipe click | shared screen state | `ImpactResponse`/detail |
| Final evidence | Gate A2 | preflight + E2E | SHA/hash/count/timing archive |

## A10. Cross-language schema verification

- PR-D: Python `ModelCardResponse`, OpenAPI, TypeScript `ModelCard` share `artifact_sha256`.
- PR-G/H: Python and TypeScript `GisManifest` validate the same versioned fixture and GeoJSON property allowlist.
- PR-I/J: SQL `customer_service_point`, `demo_customer_profile`, `demo_customer_meter_reading`; Python `AffectedCustomer`/`DemoCustomerDetail`; TypeScript equivalents share canonical snake-case JSON fields.
- PR-E: any new `DemoMode` is updated in Pydantic, route validation, TypeScript client, panel controls, tests, and OpenAPI together.

# Plan Draft B — six broad phase PRs

## B1. Overview

Compress the roadmap into six PRs: truth; all core evidence; acceptance harness; all GIS; all customer backend/UI; final runbook. This reduces PR overhead but couples unrelated failures and produces larger review surfaces.

## B2. Goal, non-goals, and success criteria

- **Goal:** complete the same product/evidence result with fewer merges.
- **Non-goals:** no stacked PRs, real-customer claims, unsupported GIS/hydraulic claims, or implicit cold reset.
- **Success:** six PRs pass the same final Gate A2 and preserve default-off realism features.

## B3. PR sequence

1. Truth and documentation.
2. All Topic 1/2/3 browser evidence plus artifact provenance.
3. Acceptance harness and Gate A1.
4. GIS builder/API/UI.
5. Customer migration/API/UI/E2E.
6. Final operator documentation and preflight.

## B4. Files and implementation sequence

- Uses the same complete file set, functions, and tests as Draft A.
- Within each large PR, follow tests-first order: stub RED -> confirm defect -> smallest implementation -> minimal refactor -> full touched-layer and live gates.
- Public interfaces are identical; they simply land in fewer commits.

## B5. Test coverage and validation

- Every named test from Draft A remains mandatory.
- Each broad PR must run all Python/web source gates and relevant live E2E because affected surfaces cannot be isolated safely.
- Gate A1 follows PR 3; Gate A2 follows PR 6.

## B6. Edge cases, rollout, and backout

- Same fail-closed behavior as Draft A.
- Rollback granularity is worse: a GIS UI issue can revert its backend, and a customer drawer issue can revert migration/API work.
- Review/QCHECK cost and merge-conflict risk are higher.

## B7. Dependencies

- Same technical/external dependencies as Draft A.
- Requires longer uninterrupted implementation/review windows.

## B8. Wiring verification

Draft A's wiring table remains mandatory; broad PR descriptions do not excuse missing registration or schema edges.

## B9. Cross-language schema verification

Same contracts as Draft A, but larger PRs must prove all producer/consumer changes together.

# Comparative analysis

| Dimension | Draft A: 10 isolated PRs | Draft B: 6 broad PRs |
|---|---|---|
| Failure attribution | Strong | Mixed across domains |
| Review size | Small/medium | Large |
| Rollback safety | Per evidence/runtime seam | Coarse |
| Migration/UI coupling | Deliberately separated | Combined |
| PR overhead | Higher | Lower |
| Exact-SHA reruns | More frequent focused gates | Fewer but much larger gates |
| GIS permission handling | Backend/UI land dark separately | One broad blocked/conditional PR |
| Recommended | **Yes** | No |

Draft A is selected. The extra PR overhead is justified because this work spans evidence tests, shell harnesses, new APIs, a new frontend dependency, external GIS, a database migration, and a large interactive customer surface. Independent merges keep every failure and rollback bounded.

# Unified execution plan

## U1. Overview

Use Draft A's ten-PR sequence and two acceptance checkpoints. Keep PR numbers logical until creation, develop one PR at a time from freshly merged `main`, and make all GIS/customer activation conditional on its own fail-closed readiness contract.

## U2. Ordered milestones

1. **M0 truth:** PR-A merged and post-merge verified.
2. **M1 core evidence:** PR-B through PR-E merged; remaining literal evidence gaps closed.
3. **M2 core acceptance:** PR-F merged and Gate A1 passed on exact merged SHA.
4. **M3 GIS dark delivery:** PR-G and PR-H merged; permission controls activation.
5. **M4 customer delivery:** PR-I and PR-J merged; exactly 200 click-through impact proven.
6. **M5 final acceptance:** Gate A2 passed and local `main` landed at accepted SHA.
7. **M6 authority track:** only after real contracts/mappings; separately planned.

## U3. Merge dependency chain

`#30/a98a359 -> A -> B -> C -> D -> E -> F -> Gate A1 -> G -> H -> I -> J -> Gate A2`

No PR is developed against an unmerged sibling. If another PR lands on `main`, refresh and rerun affected gates before continuing.

## U4. Unified success criteria

- All ten PR definitions of done are satisfied.
- Every PR completes worktree -> TDD -> focused/full gates -> QCHECK/g-check -> PR -> merge -> local-main landing -> post-merge verification.
- Gate A1 proves core evaluation readiness without GIS.
- Gate A2 proves the complete GIS/customer experience.
- No external-authority claim crosses into `REAL` provenance without evidence.
- Final exact SHA, model hash, GIS bundle hash, counts, timings, and warm/cold state are archived together.

## U5. Unified acceptance commands

- Touched-package commands from the canonical source gate list.
- `make demo-e2e` for warm live evidence.
- Planned `make demo-acceptance-3x` for §7 repeatability.
- Planned `make demo-e2e-cold CONFIRM_VOLUME_RESET=1` only after explicit approval.
- GIS/customer preflight exact expectations: 9,273 full pipes, 19 Map Ta Phut focus features, exactly 200 profiles, exactly 2,400 readings, and type counts 140/35/25.

## U6. Unified files-to-change ownership

The A4 rollup is normative: PR-A owns evidence truth; B pipeline proof; C SEC/timing; D model provenance/datasets; E Swagger/worklist/RCA; F acceptance harness; G GIS backend; H GIS frontend; I customer schema/seed/API; J customer UI/E2E. A later PR may extend a file merged earlier, but no active PRs edit the same product file concurrently.

## U7. Unified TDD and function sequence

For every PR: write the named test, run and capture the correct RED, implement the smallest passing function/component, refactor only if necessary, run focused gates, then run full touched-layer and live gates. Critical new functions are `artifact_sha256`, GIS builder/loader functions, `build_map_ta_phut_profiles`, `build_monthly_readings`, `validate_demo_customer_profile`, `get_demo_customer_detail`, `selectImpactZone`, `filterAndPageCustomers`, and `clearRecoveredImpact`; their behavior is defined under their owning PR.

## U8. Unified test coverage

The A5 matrix and every named test under PR-A through PR-J are mandatory. Coverage must fail on stale documentation, pre-commit ingest evidence, invisible reconnect, incomplete latency rows, stale SEC arithmetic, late model transitions, model-hash drift, DOM/API disagreement, static RCA, GIS hash/path/provenance defects, 199/201 customers, wrong type mix, incomplete readings, broken click wiring, and stale recovery state.

## U9. Unified public interfaces, dependencies, and rollout

- Interfaces land in order: model hash -> optional demo anomaly enum -> acceptance Make targets -> GIS flags/routes -> migration `007` and customer routes -> consuming UI.
- Dependencies are Docker Compose, Mosquitto, TimescaleDB, the built model, Playwright, MapLibre, source authorization, and an explicit cold-reset approval.
- Core evidence ships before optional realism. GIS/customer features remain default-off until their preflight passes; backout disables flags and leaves additive tables inert.

## U10. Unified edge and failure behavior

All trust boundaries fail closed. Missing checks are not passing checks; changed candidates invalidate prior evidence; unpermitted/corrupt GIS is unavailable; invalid customer counts/mix/readings block readiness; 30.001-second transitions fail; recovery cancels and clears incident details; no old five-customer fallback appears.

## U11. Unified wiring and cross-language verification

The A9 wiring table and A10 schema rules are normative. Before each merge, trace the relevant runtime chain from entry point through registration to schema and DOM; PR-D, PR-E, PR-G/H, and PR-I/J must prove their Python/OpenAPI/TypeScript contracts with shared fixtures or generated OpenAPI assertions.

## U12. Decision-complete checklist

- [x] Phase boundaries and exit gates are explicit.
- [x] Ten PRs have purpose, dependency, files, tests, public surface, done condition, and rollback.
- [x] Logical versus GitHub-assigned PR numbering is explicit.
- [x] Core evidence is accepted before optional realism activation.
- [x] GIS permission is an activation gate, not an excuse for false provenance.
- [x] Customer migration and UI are separate PRs.
- [x] Warm and destructive cold rehearsals are distinct.
- [x] Every new component/API/migration has runtime wiring coverage.
- [x] Cross-language contract changes land atomically.
- [x] Authority-dependent work is deferred without blocking current delivery.

## Review (2026-08-05 03:44:44 +0700) - merged PR-A/#31, PR-B/#32, PR-C/#33

### Reviewed
- Repo: `/Users/subhajlimanond/dev/pwa-bigdata-demo`
- Branch: `main`
- Scope: PR #31 `a98a359..10975a4`; PR #32 `10975a4..3e67196`; PR #33 `3e67196..3fffdc7`
- Commands Run: compact `gh pr view` metadata and `gh pr checks`; bounded `git diff --stat`, `--name-status`, and targeted path diffs; direct source/test inspection; API focused pytest (40 passed), targeted ruff and mypy; web Vitest (533 passed), lint, typecheck, build; E2E TypeScript compile; merged warm `make demo-e2e` (23 passed)

### Findings
CRITICAL
- No findings.

HIGH
- PR-A refreshed a judge-facing `16/16 demonstrable, verified by make demo-e2e` claim even though the approved roadmap explicitly says Phase 0 makes no score claim and PR-D/PR-E still own literal proof for 3.1/3.2 and 3.4-3.6. `docs/demo-coverage.md:12-16`, `:42-44`, and `:80-82` overstate the current E2E: `e2e/tests/topic3-predictive.spec.ts:18-25` checks the dataset numbers in the API but only visibility in the DOM; `:40-53` uses the custom form rather than Swagger Try it out; `:55-63` validates API ordering but only worklist visibility; and `:65-76` validates API RCA ordering but only panel visibility. This can turn a green rehearsal into an unsupported bid-readiness claim. Replace the blanket score statement with `16/16 built and wired`, list the remaining PR-D/PR-E operator/DOM proof gaps, and add a documentation guard that cannot return to `16/16 E2E-proven` until Gate A1 is complete.
- PR-B's manual item-1.2 proof starts its stopwatch after `docker compose restart mosquitto` returns (`scripts/demo-reconnect.sh:37-38`), while the runbook presents that script as the <=30-second reconnect/resume evidence (`docs/demo-runbook.md:73`). A restart taking over 30 seconds can therefore still report a passing one- or two-second result. Start the clock immediately before Compose and keep restart, watermark acquisition, reconnect, and committed-row growth inside one budget. Add a shell-level regression with an injected slow Compose command that must fail past 30 seconds.

MEDIUM
- PR-B's DLQ coalescing guard uses `loading` as if it represented every request (`web/src/features/pipeline/useDlq.ts:45-62`), but `useOwnedAsync` deliberately leaves `loading=false` during reloads (`web/src/features/pipeline/ownedHooks.ts:29-35`, `:44-70`). When the two-second dead-letter total poll changes while a slow reload is running, another `reload()` aborts it; sustained bad-asset traffic can repeatedly starve page zero. The unit test fabricates `loading=true` during a reload and therefore does not exercise the real composition. Expose a real `refreshing`/in-flight signal or own coalescing inside `useDlq`, then test with a deferred real `fetchDlq` reload and multiple total changes.
- PR-C calls the SEC derivation judge-recomputable, but Playwright compares hidden raw `data-*` values (`e2e/tests/scenario-transitions.spec.ts:174-187`) while the visible UI rounds power and flow to one decimal and SEC to three (`web/src/features/twin/SecTooltip.tsx:46-48`, `:66-72`). The raw quotient can pass even when the displayed figures do not reproduce the displayed result. Render enough visible precision or label the displayed math approximate, and have Playwright parse and compare the visible formula/result.
- PR-C's freshness assertion still accepts a missing skew attribute: `Number(await getAttribute(...))` maps `null` to `0`, and the subsequent finiteness/budget checks pass (`e2e/tests/scenario-transitions.spec.ts:174-187`). The timestamp assertion only proves that the container exists, so both timestamps may be dashes. Require every raw attribute to be non-null before numeric conversion, expose or parse both observation timestamps, and add a negative test for missing freshness metadata.

LOW
- PR-B's item-1.3 E2E requires three clean latency rows but never checks that their `data-path` set is the three rubric endpoints (`e2e/tests/topic1-pipeline.spec.ts:129-155`; configured at `web/src/features/pipeline/pipeline.config.ts:15-19`). Assert the exact endpoint set so a future configuration substitution cannot leave a green but irrelevant three-row proof.

### Open Questions / Assumptions
- Assumed the approved overall roadmap remains authoritative: PR-D and PR-E have not been superseded by a formally accepted evidence-policy change.
- No GitHub review comments were posted and no product fixes were made; this review records findings only.
- GitHub reports no hosted checks for PRs #31-#33. The green evidence above is local and exact-current-main, not hosted CI.

### Recommended Tests / Validation
- Add the five regressions described above before treating Phase 1 as ready to continue: evidence-claim guard; slow-restart shell test; real deferred-reload coalescing test; visible SEC arithmetic test; missing skew/timestamp negative test.
- Rerun focused API/web gates and the merged warm `make demo-e2e` after remediation. A changed candidate invalidates today's 23/23 result.
- Keep PR-D and PR-E's planned literal browser/operator oracles; do not use the current 23/23 run to waive them.

### Rollout Notes
- PRs #31-#33 are already merged at `main == origin/main == 3fffdc73cff1f00d4f7e090e8de3cec6da0f6f28`; remediation needs a new narrow PR rather than edits on `main`.
- No database rollback is needed. The findings affect evidence truth, test-oracle strength, one shell timing boundary, and DLQ refresh concurrency.
- Warm-stack acceptance passed; no destructive cold-volume reset was run.
- After the browser gate, `scripts/demo-scenario.sh normal` restored the simulator and demo director; `/api/demo/scenario` reported an active `demo-normal-*` run.

## Review (2026-08-05 07:37:26 +0700) - merged PR-D/#35

### Reviewed
- Repo: `/Users/subhajlimanond/dev/pwa-bigdata-demo`
- Branch: detached exact merged SHA in isolated worktree; dirty primary checkout preserved
- Scope: merged PR #35, `5b76604292a8185735e0f2dc51ebc1f91504ac35..47b4f24578c5c7fab70b650a04ae21319982782f`
- Commands Run: compact `gh pr view`/`gh pr checks`; bounded range name/status/stat and targeted diffs; complete PR-D Coding Log and relevant roadmap/spec inspection; exact-string wiring searches; `git diff --check`; API focused pytest (42 passed); ML model pytest (17 passed); predictive component Vitest (12 passed); web lint/typecheck; E2E TypeScript compile and Playwright discovery (24 specs); `bash -n scripts/demo-preflight.sh`; two independent read-only QCHECKs

### Findings
CRITICAL
- No findings.

HIGH
- No findings.

MEDIUM
- PR-D does not complete its judge-visible full-hash oracle. `web/src/features/predictive/ModelCard.tsx:47-54` renders only the first 12 characters plus an ellipsis; the complete 64-character `artifact_sha256` exists only in the hidden `data-sha256` attribute and a native `title`. `e2e/tests/topic3-predictive.spec.ts:24-28` string-compares that hidden attribute to the API and checks only the same visible prefix. A judge therefore cannot literally compare `sha256sum model.pkl` with a complete on-card value, while `docs/demo-coverage.md:19-21,42` says the loaded-model SHA oracle is delivered. Render or explicitly reveal/copy the complete digest in the card, and assert exact visible text against `/api/model.artifact_sha256`; keep the existing API/load/preflight binding checks.

LOW
- PR-D does not pass its claimed diff-hygiene gate: `git diff --check 5b76604..47b4f24` reports trailing whitespace at `coding-logs/2026-08-05T04-48 Coding Log (pr-d-model-provenance).md:290`. Remove the trailing space and rerun the range check.

### Open Questions / Assumptions
- The `title` attribute can produce a browser-native hover tooltip, but PR-D neither verifies that interaction nor makes the complete digest persistently readable/copyable. This review therefore does not count it as the planned literal judge-visible card oracle.
- The backend provenance chain otherwise held: one byte snapshot produces the loaded bundle and digest; lifespan carries bundle/path/digest from one resolution; the card is artifact-bound; mismatches fail closed; and preflight validates/compares full digests.
- The 3.2 path otherwise held: raw DOM values correspond to the API, visible Health/PTTF text is asserted exactly, visible PTTF direction is protected, and lower-bound markers are explicit.

### Recommended Tests / Validation
- Add a component regression requiring the full visible/revealed 64-character hash and a Playwright assertion comparing that visible value exactly with the API. Mutation-check a wrong suffix with the same 12-character prefix.
- Remove the Coding Log whitespace and require `git diff --check` on the remediation range.
- Rerun the focused predictive unit/E2E TypeScript gates and the warm Topic 3/browser gate at the remediation SHA. This review did not mutate the running stack or repeat the claimed 24/24 warm rehearsal.

### Rollout Notes
- Review verdict: changes requested; one narrow post-merge remediation is needed before PR-D is treated as complete. If PR-E has already started, this can remain an independent prerequisite to Gate A1.
- PR #35 is already merged at `origin/main == 47b4f24578c5c7fab70b650a04ae21319982782f`; GitHub reports no hosted checks. The focused results above are local review evidence, not hosted-CI evidence.
- No product code, commit, push, merge, deployment, or runtime state was changed. This formal Coding Log append and the matching PR comment are the only review mutations.

## Review (2026-08-05 10:03:25 +0700) - merged PR-E/#36

### Reviewed
- Repo: `/Users/subhajlimanond/dev/pwa-bigdata-demo`
- Branch: detached merged tip in an isolated worktree; dirty primary checkout preserved
- Scope: merged PR #36, `47b4f24578c5c7fab70b650a04ae21319982782f..3b1eadc2f3b35048191596100c6f60818048bc57`
- Commands Run: compact `gh pr view`/checks metadata; bounded range stat and targeted source/test inspection; Auggie two-second attempt then direct-inspection fallback; `git diff --check`; focused API pytest (52 passed); focused web Vitest (20 passed); full web Vitest (540 passed), lint, typecheck, build; ML shipped-artifact pytest (6 passed); targeted Ruff; E2E TypeScript compile; two independent read-only QCHECKs

### Findings
CRITICAL
- No findings.

HIGH
- No findings.

MEDIUM
- The induced-RCA test proves the top cause only through hidden `data-signal` metadata (`e2e/tests/topic3-predictive.spec.ts:271-285`), while the judge reads the Thai label and value rendered by `web/src/features/predictive/RcaPanel.tsx:39-52`. A regression that leaves the visible label static or wrong can therefore pass both scenario transitions. Give the visible label a stable hook or parse the first row's visible text, then assert the expected vibration and bearing-temperature labels after their respective induced scenarios; add a mutation regression in which `data-signal` is correct but the label is wrong.
- The on-screen feedback workflow submits its default empty note (`e2e/tests/topic3-predictive.spec.ts:121-134`); `web/src/features/predictive/FeedbackPanel.tsx:37-45` persists that as `note: null`. Unlike the Swagger test's unique marker and `finally` cleanup, the row is untagged and cannot be safely identified for deletion, so every warm/three-run rehearsal permanently grows feedback data. Fill a unique marker through the visible textarea and delete it in an unconditional, idempotent `finally`, or clean up by the acknowledged database id; add a repeated-run test that proves the database returns to its baseline count.
- The new visible worklist-health check uses substring containment (`e2e/tests/topic3-predictive.spec.ts:214-228`). Because the marked cell contains the rendered numeral (`web/src/features/predictive/WorklistTable.tsx:92-97`), expected `3` would also accept visible `30`, and expected `30` would accept `130`; the hidden raw attribute can remain correct while the judge-visible value is wrong. Mark or parse the exact numeral and compare equality after the same formatter; add a wrong-prefix/suffix mutation case.

LOW
- No findings.

### Open Questions / Assumptions
- The review treats PR-E's purpose as literal judge-visible evidence, so hidden `data-*` agreement alone is not sufficient where the operator reads a label or numeral.
- The final merged code was inspected statically and compiled locally. No provisioned-stack Swagger interaction or live induced-scenario recovery was rerun during this review.
- GitHub reports no hosted checks for PR #36; the results above are local evidence at the current merged tip, not hosted CI.

### Recommended Tests / Validation
- Add the three negative/mutation regressions described above: wrong visible RCA label with correct metadata, repeated feedback submission with baseline-count restoration, and a wrong visible health numeral that contains the expected digits.
- Rerun the focused API/web gates, E2E TypeScript compile, and the live Topic 3 Playwright cases after remediation. A changed candidate invalidates the current green counts.

### Rollout Notes
- Review verdict: changes requested. PR #36 is already merged at `3b1eadc2f3b35048191596100c6f60818048bc57`; use a narrow remediation PR before treating PR-E's operator proof as complete.
- No database reset or runtime mutation was performed. Product code, commits, branches, merge state, and deployment state were not changed by this review.

## Review (2026-08-05 10:03:25 +0700) - merged PR-F/#37

### Reviewed
- Repo: `/Users/subhajlimanond/dev/pwa-bigdata-demo`
- Branch: detached exact merged SHA in an isolated worktree; dirty primary checkout preserved
- Scope: merged PR #37, `3b1eadc2f3b35048191596100c6f60818048bc57..51486a101d5f87e61bf16a301a9734595cbbd371`
- Commands Run: compact `gh pr view`/checks metadata; bounded range stat and targeted source/test inspection; Auggie two-second attempt then direct-inspection fallback; `git diff --check`; focused acceptance/docs pytest (36 passed); targeted Ruff; shell syntax checks; E2E TypeScript compile; behavioral temp-directory reproductions for a valid-shaped forged receipt and alternate Compose path; independent read-only QCHECK

### Findings
CRITICAL
- No findings.

HIGH
- A caller can mint a production-class cold acceptance without running the guarded reset. `scripts/lib/volume-reset.sh:37-44` writes epoch, compose path, and a nonce, but `scripts/demo-acceptance.sh:72-90` trusts a caller-selected receipt directory and validates only the epoch and compose text; the nonce is never consumed or authenticated. Behaviorally, a hand-written receipt containing a fresh `epoch=<now>` and the default `compose_file` produced exit 0 with `result=passed` and `mode=cold`. The existing regression at `api/tests/test_acceptance_harness.py:415-428` writes only a malformed bare epoch, so it does not exercise the accepted shape. Couple reset and cold acceptance in one guarded process/transaction, or use an issuer-authenticated, volume-generation-bound capability; add a well-formed forged-receipt test that must refuse before evidence is written.
- The claimed cold capability is not bound to the stack the score gate actually exercises. Reset/receipt validation and the post-run database probe honor `COMPOSE_FILE_PATH` (`scripts/lib/volume-reset.sh:22-33`; `scripts/demo-acceptance.sh:36,79-90,148`), but the nested gate is fixed to `make demo-e2e` (`scripts/demo-acceptance.sh:58`) and that target/preflight hard-code `infra/docker-compose.yml` (`Makefile:3,29-33`; `scripts/demo-preflight.sh:15,25`). A reset and receipt for alternate Compose B can therefore precede a warm default-Compose A gate and still yield a passed `cold` manifest; the behavioral harness accepted this path. The receipt also omits the effective `COMPOSE_PROJECT_NAME`, so one file path does not identify one Compose project. Route a single resolved compose file and project identity through reset, preflight, Playwright, and provenance—or reject overrides—and add alternate-file plus project-A/project-B regressions.

MEDIUM
- Production acceptance records a dirty flag but never enforces the clean merged-SHA Gate A1 precondition: `scripts/demo-acceptance.sh:96-102` samples `dirty`, and `:189-193` still emits `result=passed` and `ACCEPTED` when it is true. This conflicts with the Gate A1 contract in `docs/demo-runbook.md:170-177` and permits changed source to execute under an old commit id. Refuse a dirty tree before creating evidence and recheck the same clean SHA after the final run, or emit a clearly non-acceptance schema; test tracked dirt, untracked dirt, and source mutation during a run.

LOW
- No findings.

### Open Questions / Assumptions
- The trusted-operator-machine limitation does not waive these findings: PR-F explicitly claims the cold label is earned, stack-bound, and resistant to a fabricated receipt. These are correctness properties of the harness, not host-security attestation.
- A successful test-mode harness record is intentionally non-production-class. The behavioral reproductions above used production mode with PATH-stubbed external commands and temporary state/evidence directories; no Docker volume was touched.
- GitHub reports no hosted checks for PR #37; the results above are local evidence at exact merged SHA, not hosted CI.

### Recommended Tests / Validation
- Add production-mode regressions for a valid-shaped hand-written receipt, an alternate compose file, a changed `COMPOSE_PROJECT_NAME`, initial tracked/untracked dirt, and a SHA/worktree mutation during the gate.
- After remediation, rerun acceptance/docs pytest, Ruff, shell syntax, E2E TypeScript compile, a safe warm three-run rehearsal, and only then the explicitly authorized destructive cold proof at the exact clean merged SHA.

### Rollout Notes
- Review verdict: changes requested. PR #37 is already merged at `origin/main == 51486a101d5f87e61bf16a301a9734595cbbd371`; Gate A1 should remain unaccepted until a narrow remediation lands.
- No destructive cold reset, live warm rehearsal, product-code edit, commit, push, merge, deployment, or runtime-state change was performed. The formal Coding Log append and matching PR comments are the only review mutations.
