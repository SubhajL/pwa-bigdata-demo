# Coding Log: Evaluation Criteria Evidence and Improvement Roadmap

Date: 2026-08-04  
Mode: Review and planning only; no product implementation  
Repository: `/Users/subhajlimanond/dev/pwa-bigdata-demo`  
Baseline: `main@a98a359c8a4f7c15bd1a43b557fff0c5bb2cab95` (`main == origin/main`)  
Scope: all 16 scored sub-criteria in `POC_SPEC.md` §4A, plus separate §7 acceptance and realism upgrades

## Executive conclusion

All 16 scored sub-criteria have implemented and wired runtime paths. PR #30 on `a98a359` materially changed the evidence posture by adding a deterministic, demo-only scenario director and same-DOM transition tests for 2.2, 2.4, and 3.3. The remaining work is mostly evidence hardening, truth-in-narration, and literal judge-flow coverage—not missing subsystems.

Do not publish a predicted score such as `92–98/100`. The defensible statement is:

> All 16 rubric rows are implemented. Several rows have strong implementation and integration evidence but still need tighter browser-visible or operator-visible proof before the repository should claim that every literal judge action is fully automated. PR #30 closes the former transition gap for 2.2, 2.4, and 3.3; the next tranche should harden Topic 1 browser evidence, induced SEC evidence, Topic 3 DOM correspondence, documentation truth, and warm/cold acceptance evidence.

## Method and current evidence boundary

- Auggie semantic search was attempted first and timed out at the required two-second boundary. This assessment therefore uses direct file inspection and exact-string searches.
- Primary sources read: `CLAUDE.md`, `POC_SPEC.md:233-295`, `docs/DREP-demo-poc.md`, `docs/demo-runbook.md`, `docs/demo-coverage.md`, `e2e/README.md`, runtime entry points, migrations, frontend components, and Topic 1–3 tests.
- Reused the completed read-only Criterion 2/twin-architecture audits rather than repeating them.
- Delegated fresh read-only Topic 1 and Topic 3 audits. Topic 3 support ran focused non-live checks: ML artifact/dataset `7 passed`, Health/PTTF/RCA `4 passed`, predictive UI `30 passed`, scoring-burst `3 passed`, and OpenAPI generation. Docker and ports 8000/5173 were unavailable, so no fresh live-stack, Timescale, Swagger-UI, or Playwright run is claimed here.
- PR #30's recorded `api 306 / web 521 / e2e 22` result is exact-SHA historical delivery evidence, not a rerun in this review.
- Existing user-owned dirty Coding Log changes are preserved.

## Status vocabulary

- **Implemented:** the runtime path exists and is wired.
- **Automated evidence:** unit/integration/E2E oracles that fail on a defect.
- **Judge-visible proof:** the literal trigger and visible result can be observed in the intended surface.
- **Required improvement:** needed before making the strongest evidence claim.
- **Realism upgrade:** improves credibility but is not required to repair missing scored behavior.

## Detailed evaluation matrix

### Topic 1 — Real-time Data Pipeline (35 points)

#### 1.1 — MQTT broker connection and continuous ingest (5)

**Implemented**

- `infra/docker-compose.yml` starts Mosquitto, API subscriber, simulator, TimescaleDB, and web.
- `simulator/app/publish.py` publishes simulated telemetry at QoS 1 over the real broker.
- `api/app/ingest.py:build_client()` configures the durable Paho client; `api/app/service.py` bridges the network thread into a bounded supervised consumer.
- Accepted messages commit through `api/app/db.py:disposition()` into `ingress_ledger` and the `telemetry` hypertable.
- `/api/pipeline/status`, `ConnectionPill`, KPI rows, and ingest-rate chart expose the running path.

**Evidence today**

- `api/tests/test_pipeline_e2e.py::test_subscriber_ingests_a_published_message` uses a real broker and database and waits for committed telemetry.
- `e2e/tests/topic1-pipeline.spec.ts` proves that the `received` callback counter advances.

**Gap / required improvement**

- `received` increments before validation/persistence; the browser E2E does not prove that a visible committed-row KPI advances on one open `/pipeline` page.
- Add a browser assertion that a persisted/conservation or range count increases without reload and that the connection indicator remains live.

**Status:** implemented; backend proof strong; judge-visible committed-ingest proof should be tightened.

#### 1.2 — automatic reconnect within 30 seconds (5)

**Implemented**

- Paho is configured with durable session, manual post-commit acknowledgement, QoS 1, 10-second keepalive, and reconnect cap of 4 seconds.
- `PipelineStatus` exposes connection state, connect/disconnect counts, and errors.
- `scripts/demo-reconnect.sh` restarts the real broker and times reconnect plus resumed ingest.

**Evidence today**

- `api/tests/test_pipeline_e2e.py::test_reconnects_and_resumes_within_30s` stops/starts a broker and stops the clock only after a post-restart row commits.
- Playwright restarts the Compose broker and waits for API state `connected` plus `received` advance within 30 seconds.

**Gap / required improvement**

- Playwright does not observe the open pipeline UI transition. The 2-second poll can also miss a very short restart even though counters change.
- Add a controlled outage long enough to observe `data-kind=down|pending`, then assert return to `ok` and persisted `conservation.telemetry` growth within a strict 30-second elapsed bound.

**Status:** implemented and timed; literal same-DOM status-indicator proof remains partial.

#### 1.3 — average response time at or below 500 ms in Network Monitor (5)

**Implemented**

- `/api/telemetry/{asset_id}/latest` uses an indexed query and returns `Server-Timing: db;dur=...`.
- The pipeline page sequentially probes three endpoints five times each and renders per-endpoint browser round-trip means, DB time where available, counts, failures, and text/icon verdicts.

**Evidence today**

- `api/tests/test_latency.py` measures 20 warmed real-TCP calls for `/latest` and pins the index plan.
- Frontend tests pin arithmetic mean and inclusive `<=500 ms` behavior.
- Playwright checks one `/latest` DB duration and only the first visible `budget-ok` marker.

**Gap / required improvement**

- The E2E does not assert every displayed row, that each completed its five-call round, or that failures are zero. DB duration is not the same as browser round-trip average.
- Add stable row metadata/test IDs and assert all three displayed means are `<=500`, counts are complete, failures are zero, and `/latest` retains the separate Network/Server-Timing proof.

**Status:** implementation satisfies the rubric's singular endpoint reading; table-wide proof is incomplete.

#### 1.4 — time-series database write and correct historical retrieval (10)

**Implemented**

- `infra/db/001_init.sql` creates the TimescaleDB extension and `telemetry`/`health` hypertables.
- Accepted telemetry commits to the hypertable and the range query is asset/window scoped and ascending.
- `RetrievalEvidence` renders the historical result; `scripts/show-hypertable.sql` shows catalog, chunks, recent rows, and recent count.

**Evidence today**

- `api/tests/test_db.py::test_telemetry_is_a_real_hypertable` directly queries `timescaledb_information.hypertables`; this is genuine automated catalog proof in source.
- DB tests pin ascending/scoped retrieval; Playwright pins non-empty ascending API rows and a visible table row.

**Gap / required improvement**

- The catalog proof is not part of the judge-facing preflight/E2E artifact, and the SQL script displays newest-first while the API contract is ascending.
- Add a non-destructive catalog check to preflight and standardize the ordering explanation: API returns ascending for charts; the operator SQL may display newest-first for inspection.

**Status:** strongly implemented and automated; improve operator/evidence packaging.

#### 1.5 — invalid Asset ID to DLQ, main flow uninterrupted (10)

**Implemented**

- Pure validation rejects unknown Asset IDs.
- The supervised consumer atomically records `ingress_ledger` plus either telemetry or DLQ; bad input never retires the loop.
- `/api/dlq`, conservation counters, and `DlqTable` expose results.

**Evidence today**

- The strongest integration test publishes good → unknown/malformed → good through real MQTT and verifies the final good row persisted.
- Topic 1 Playwright uses simulator `FAULT_MODE=bad_asset`, observes DLQ growth, resets normal, and observes persisted telemetry growth.
- PR #30 also added a demo-director `bad_asset` test for DLQ/liveness.

**Gap / required improvement**

- The on-screen demo director's `bad_asset` mode directly inserts an `ingress_ledger`/`dead_letter` pair in `api/app/demo.py`; it does not traverse MQTT validation. `DemoScenarioPanel` currently claims all injections travel the same MQTT-consumer path, which is false for this mode.
- Keep the real MQTT path as the scored 1.5 proof. Either publish the bad envelope through MQTT from the director, or label the button as a direct demo DLQ injection and do not use it to prove 1.5.
- Extend the browser proof to show the new DLQ row/reason on `/pipeline` and a later committed good row on the same page.

**Status:** scored path strongly implemented; demo-control narration is inaccurate and must be corrected.

### Topic 2 — Real-time Digital Schematic / Twin (35 points)

#### 2.1 — SVG/Canvas schematic with resolution-independent zoom (5)

**Implemented**

- `ProcessSchematic` renders inline SVG primitives from API topology and changes only the `viewBox` during zoom.
- No raster `<image>` is used; device and pipe geometry comes from the topology contract.

**Evidence today**

- Component tests pin zoom math and structure.
- Playwright asserts vector primitives, absence of raster images, and a changed `viewBox` after zoom.

**Gap / improvement**

- No scored gap. Rayong GIS/MapLibre is a realism upgrade, not a repair for 2.1.

**Status:** strong implementation and literal browser proof.

#### 2.2 — device status automatically updates without refresh (5)

**Implemented**

- Telemetry band events and model-health events broadcast through `TwinHub` over `/ws/twin`.
- `useTwinSocket` validates frames, rejects stale frames, reconnects, and resynchronizes topology.
- `OperationsTwinScreen` merges live frames with persisted-health baseline.

**Evidence today**

- Unit/integration tests cover emission, coalescing, reconnect, ordering, and status merge.
- `scenario-transitions.spec.ts` opens `/operations` once, stamps a no-reload marker, injects `pressure_drop`, and observes the same symbol leave normal.

**Gap / improvement**

- No substantive scored gap after PR #30. Update stale docs and extend the same event state into a GIS marker only if the GIS tranche is approved.

**Status:** strong same-DOM transition proof.

#### 2.3 — pump anomaly, symbol change, and SEC tooltip (10)

**Implemented**

- `GET /api/twin/sec/{asset_id}` fetches the newest `power_kw` and `flow_m3h` independently, rejects stale or overly skewed pairs, and computes `power_kw / flow_m3h` through `specific_energy_consumption()`.
- `DeviceSymbol` uses shape plus status; `SecTooltip` displays kWh/m³ with a visible `SIMULATED` badge and renders unavailable values as an em dash.

**Evidence today**

- API tests cover missing signals, non-positive flow, freshness, pair skew, index plan, and calculation.
- Current Playwright only requires P-2 already be warning/critical, selects it, and checks the SEC title/unit. It does not induce `anomaly` or recompute the displayed value from visible inputs.

**Gap / required improvement**

- Add an anomaly-specific same-DOM E2E: reset normal, inject `anomaly`, observe symbol change, select P-2, assert power/flow/timestamps/freshness, and verify displayed SEC equals `power/flow` within rounding.
- Extend `SecTooltip` to show the contributing power, flow, observation times, skew/freshness, and formula. These values already exist in the API contract.
- If East Water context is added, label `0.54 kWh/m³` as `OFFICIAL · 2025 · SYSTEM-WIDE`, never Map Ta Phut station SEC, target, baseline, threshold, or live reading.

**Status:** calculation path strong; induced browser proof and visible derivation should be tightened.

#### 2.4 — pressure drop highlights pipes and lists affected customers (10)

**Implemented**

- Pressure frames are classified against bands; `OperationsTwinScreen` finds outgoing pipes and requests impact.
- `downstream_customers()` performs bounded, cycle-safe directed BFS over `pipe_edge` and joins `customer_service_point`.
- `PipeEdge` uses dashed/thick shape plus status color; `ImpactPanel` lists deduplicated customers.

**Evidence today**

- Topology tests pin composite edge identity, branch traversal, cycles, deduplication, and status.
- PR #30 Playwright injects pressure drop on one open page, observes highlighted pipes and customer rows, then observes recovery clearing both.

**Gap / required improvement**

- Geometry, direction, and five customer IDs are generated. UI badges are honest, but runbook/E2E comments call them `real customers` or a `real customer list`.
- Replace those phrases with `API-derived deterministic simulated affected customers`.
- Real Rayong geometry may replace only the displayed geometry after a crosswalk; do not call customers real until an authoritative customer-to-pipe mapping exists.
- Approved realism tranche: replace the five Samut Sakhon rows with exactly 200 deterministic Map Ta Phut-area simulated service accounts. A simulated low-pressure footprint and highlighted pipe must open the same 200-account drawer on click; see `coding-logs/2026-08-04-20-03-45 Coding Log (map-ta-phut-200-customer-impact).md`.

**Status:** strong transition proof; evidence-language correction is mandatory.

#### 2.5 — config file plus at least three frontend components (5)

**Implemented**

- `twin.config.ts`, `ProcessSchematic`, `DeviceSymbol`, `PipeEdge`, `SecTooltip`, `ImpactPanel`, `StatusCounters`, and `DemoScenarioPanel` are separated and imported into the live screen.

**Evidence today**

- Wiring tests and Playwright show the live component output; the judge opens the source in the IDE per runbook.

**Gap / improvement**

- No substantive scored gap. Update the runbook source list if GIS components become the chosen demonstration.

**Status:** strong.

### Topic 3 — AI Predictive Maintenance (30 points)

#### 3.1 — trained model artifact, algorithm, and key parameters (5)

**Implemented**

- The API image deterministically trains `/srv/artifacts/model.pkl` and `model_card.json` during build.
- The API only serves a card adjacent to and version-matched with the loaded bundle.
- `ModelCard` displays Ridge, alpha, StandardScaler, and model-vs-baseline MAE.

**Evidence today**

- Model/unit tests load the shipped artifact and validate its structure/metrics.
- Playwright verifies the model card and that model MAE beats the baseline.
- Focused fresh audit loaded the local artifact successfully; no fresh container proof was possible.

**Gap / improvement**

- `model.pkl` is intentionally untracked build output. Add the loaded artifact SHA-256 to `/api/model` and the UI, and verify the same hash inside the running image during preflight.

**Status:** strong reproducible artifact path; provenance can be made more judge-visible.

#### 3.2 — Health Score and PTTF differ across at least two datasets (5)

**Implemented**

- `score_demo_datasets()` scores reserved healthy/degraded holdout lifecycles through the loaded artifact at in-domain windows.
- `DatasetCompare` renders Health, PTTF, status, and the `>=` lower-bound indicator for out-of-range PTTF.

**Evidence today**

- ML tests prove material Health and PTTF separation; component tests prove Health values and PTTF lower-bound rendering.
- Current Playwright checks API Health separation and only verifies that both DOM tiles exist.

**Gap / required improvement**

- Extend Playwright to read both rendered Health and PTTF values, assert Health separation `>=15`, assert PTTF differs in the correct direction, and preserve the lower-bound semantics.

**Status:** implementation strong; literal DOM-value proof partial.

#### 3.3 — health threshold changes twin within 30 seconds (5)

**Implemented**

- A 10-second scoring loop builds windows, scores through the shipped model, persists health, and broadcasts status changes.
- PR #30 fixed warm-stack subscriber-buffer eviction so worst-device critical and recovery frames survive scoring bursts.

**Evidence today**

- `scenario-transitions.spec.ts` measures from scenario POST to health-originated critical on the same DOM and separately tests recovery.
- Focused scoring-burst tests passed in the delegated audit; live browser was not rerun here.

**Gap / required improvement**

- The critical poll uses a minimum one-second timeout and recovery explicitly tolerates 31 seconds. This creates approximately one second beyond the literal 30-second rubric.
- Add an immediate elapsed assertion `<=30_000 ms` for critical and recovery; mutation-test with a 30.001-second delayed frame.

**Status:** former evidence gap is closed; tighten the timing oracle.

#### 3.4 — Feedback Loop API through Swagger/Postman, real input persisted (5)

**Implemented**

- FastAPI exposes documented `POST /api/feedback` with a typed verdict enum.
- The handler validates the roster and persists to the `feedback` table using `INSERT ... RETURNING`.
- The UI form links Swagger and displays the returned ID and `stored=true`.

**Evidence today**

- Integration tests POST minimal/full payloads and SELECT the returned ID from the DB.
- Playwright submits the bespoke UI form, checks a positive ID, and confirms the OpenAPI path.
- Fresh audit regenerated the OpenAPI contract; live Swagger was unavailable.

**Gap / improvement**

- Add a literal Swagger-UI `Try it out` E2E or record a deterministic operator proof, then verify the returned ID via a read-only DB/API probe.

**Status:** strongly implemented; literal Swagger journey is manual today.

#### 3.5 — prioritized worklist from processing (5)

**Implemented**

- Latest scores are ordered by Health ascending, PTTF ascending/null-last, then Asset ID; the API assigns ranks 1..n.
- `WorklistTable` renders rank, Asset ID, Health, PTTF, status, and selection.

**Evidence today**

- Integration tests pin most-degraded-first, consecutive ranks, limit behavior, and simulated provenance.
- Playwright verifies API ordering/ranks and only that the rendered table is visible.

**Gap / required improvement**

- Assert that the first rendered rows' ranks, Asset IDs, and Health values exactly match `/api/worklist`; a reversed or stale client table must fail.

**Status:** strong backend; DOM correspondence partial.

#### 3.6 — Root Cause Analysis from the AI model (5)

**Implemented**

- `explain()` resets each signal's derived features to its training baseline, re-scores through the serialized pipeline, and ranks the health delta by absolute magnitude.
- `/api/rca/{asset_id}` and `RcaPanel` expose named signed contributions.

**Evidence today**

- Model tests prove the top explanation reverses between vibration and bearing-temperature anomalies; shipped-artifact tests prove current artifact contributions exist.
- Playwright verifies API ranking and only that the RCA panel is visible.

**Gap / required improvement**

- Add a shipped-artifact reversal test and a browser test that selects/injects two anomaly modes and observes a different top rendered signal. This makes a static reason map fail end-to-end.
- Narrate RCA as model-local counterfactual attribution, not real-world causal diagnosis.

**Status:** algorithm strong; rendered causal-discrimination proof partial.

## Separate §7 acceptance tier

`POC_SPEC.md:280-291` lists dashboard/content/accessibility/responsive/build criteria separate from the scored 100-point §4A demo. PR #30's `306 / 521 / 22` gate result does not alone revalidate every §7 row or the requirement that tests pass three consecutive runs. Before a release claim:

- Run all Python and web gates three consecutive times at the exact candidate SHA.
- Run axe/WCAG, responsive sm/md/lg/xl, Thai rendering, token discipline, and content-extreme suites.
- Run a non-destructive warm-stack rehearsal.
- Only with explicit approval, remove demo volumes and run a true-cold rehearsal.
- Archive the exact SHA, commands, counts, timings, screenshots/report, and stack state. Do not call `demo-preflight` a cold start unless volumes were first removed.

## Plan Draft A — score/evidence first

### Overview

Close only the gaps between implemented behavior and literal judge-visible proof, correct misleading evidence language, and rerun exact-SHA acceptance before adding realism features. This is the shortest route to a defensible 16-row evidence claim.

### Goal, non-goals, and success

- **Goal:** every rubric row has a trigger, observable result, reset, and non-vacuous automated or operator oracle aligned with the runbook.
- **Non-goals:** no model rewrite, no topology rewrite, no live SCADA/DMAMA, no real-customer claim, no GIS in the first tranche.
- **Success:** documentation agrees with code; the named evidence tests fail when their literal behavior is broken; warm-stack and approved cold-stack evidence are archived at one SHA.

### Files to change

- `docs/demo-runbook.md`, `docs/demo-coverage.md`, `e2e/README.md` — current truth and exact judge actions.
- `scripts/demo-preflight.sh`, `scripts/demo-scenario.sh`, `Makefile` — readiness/cold wording, catalog proof, safe cold target.
- `web/src/features/twin/DemoScenarioPanel.tsx` — correct bad-asset path narration.
- `e2e/tests/topic1-pipeline.spec.ts`, `scenario-transitions.spec.ts`, `topic3-predictive.spec.ts` — literal browser proof.
- `e2e/lib/api.ts` — read-only evidence helpers.
- `ResponseTimeTable.tsx`, `ConnectionPill.tsx`, `SecTooltip.tsx`, `DatasetCompare.tsx`, `WorklistTable.tsx`, `RcaPanel.tsx` — stable semantic evidence attributes/details.
- Corresponding component/unit tests.

### TDD implementation sequence

For each slice: add/stub the test; run it and confirm the right RED; implement the smallest change; refactor only if needed; run focused format/lint/type/test; then run the live browser gate. Do not combine unrelated rubric rows in one large PR.

1. RED static/document claim tests; correct docs/comments.
2. RED Topic 1 same-DOM and table-wide evidence; add only necessary semantics/helpers.
3. RED induced 2.3 anomaly/SEC evidence and strict 3.3 timing; expose existing SEC inputs.
4. RED Topic 3 DOM correspondence/reversal evidence; add stable row/value semantics.
5. Run warm acceptance; obtain explicit approval before true-cold reset.

### Test coverage

- `test_demo_docs_name_current_scenario_director` — current mechanism and 22-spec count.
- `test_no_real_customer_claim_for_simulated_impact` — blocks false customer provenance.
- `1.1 — committed ingest advances same pipeline DOM` — persisted evidence, no reload.
- `1.2 — connection pill observes outage and recovery` — visible transition within budget.
- `1.3 — every rendered endpoint mean meets budget` — all rows, counts, failures.
- `1.4 — preflight proves telemetry hypertable catalog` — real Timescale catalog evidence.
- `1.5 — MQTT bad asset appears then ingest continues` — visible DLQ plus committed good row.
- `2.3 — anomaly changes symbol and displays derived SEC` — power/flow formula and freshness.
- `3.3 — model critical and recovery are strictly <=30s` — no one-second grace.
- `3.2 — rendered Health and PTTF both separate` — values, direction, lower-bound.
- `3.5 — rendered worklist matches API ranking` — ranks/assets/health exact.
- `3.6 — rendered RCA changes with anomaly` — rejects static reasons.

### Public interfaces and failure modes

- Existing HTTP/WS contracts remain unchanged for the evidence tranche.
- Planned CLI: `make demo-e2e-cold CONFIRM_VOLUME_RESET=1`; fail closed without confirmation.
- `DEMO_CONTROLS` remains default-off; demo mutation endpoint remains unavailable outside compose.
- Catalog/readiness checks fail the gate if Timescale or model artifact proof is absent.
- Browser evidence fails on missing rows, stale values, failed latency probes, or late transitions; no silent skip.
- No DB migration.

### Rollout, dependencies, and validation

- Land documentation truth first, then Topic 1, Topic 2/3 evidence, then acceptance evidence.
- Dependencies: Docker Compose, Mosquitto, TimescaleDB, built model artifact, Playwright.
- Backout is per PR; no schema state to reverse.
- Validate focused tests, all repo gates, `make demo-e2e` warm, then explicitly approved cold gate.

### Wiring verification

| Component | Entry point | Registration / consumer | Schema/table |
|---|---|---|---|
| Topic 1 evidence helpers | Playwright specs | imports from `e2e/lib/api.ts` | `telemetry`, `dead_letter`, `ingress_ledger` read-only |
| Hypertable preflight check | `make demo-preflight` | `scripts/demo-preflight.sh` | `timescaledb_information.hypertables` |
| SEC evidence details | selected P-2 on `/operations` | `OperationsTwinScreen -> SecTooltip` | existing telemetry API contract |
| Topic 3 DOM evidence | `/predictive` Playwright | existing components | existing `/api/model`, `/worklist`, `/rca` |
| Safe cold gate | `make demo-e2e-cold` | Makefile confirmation guard | removes demo volumes only after explicit confirmation |

## Plan Draft B — realism first

### Overview

Implement Rayong GIS, East Water SEC context, and broader provenance before completing browser-evidence hardening. This produces a more impressive demonstration sooner but adds data permission, mapping, performance, and narrative risk.

### Goal, non-goals, and success

- **Goal:** real Rayong pipe geometry and official energy context visible in the live twin.
- **Non-goals:** no claim of real station telemetry, station-specific SEC, real flow direction, or real affected customers.
- **Success:** 19 Map Ta Phut-related features render in Canvas/WebGL, scenario status drives the map, and every field is labeled REAL/OFFICIAL/SIMULATED correctly.

### Files to change

- GIS builder/tests, permission-dependent generated bundle, API GIS loader/routes/tests.
- MapLibre dependency and twin GIS components/tests.
- Compose/preflight/Makefile feature configuration.
- Topic 2 E2E and provenance documentation.

### TDD implementation sequence

1. RED source-audit/reprojection/manifest tests.
2. Implement the smallest offline builder and validate 9,273 full / 19 focus features.
3. RED fail-closed API tests; add GIS manifest/network routes.
4. RED map adapter/component tests; add synchronized GIS view.
5. RED Topic 2 GIS scenario E2E; integrate provenance and SEC context.

### Test coverage

- `test_map_ta_phut_focus_has_19_features` — deterministic audited focus.
- `test_manifest_rejects_wrong_crs_or_hash` — fail closed on drift.
- `test_gis_api_never_reads_arbitrary_paths` — path confinement.
- `test_pressure_drop_highlights_bound_real_pipe` — scenario-to-source ID crosswalk.
- `test_energy_reference_is_system_wide_not_station` — evidence wording.
- `test_customers_remain_simulated` — prevents false-real impact.

### Public interfaces and failure modes

- `PIPE_GIS_ENABLED=false`, `PIPE_GIS_DIR`, `PIPE_GIS_MAX_BYTES`.
- `GET /api/twin/gis/manifest` and `GET /api/twin/gis/network?scope=map-ta-phut|full`.
- Enabled but missing/corrupt data returns 503; unknown scope 422; never substitute synthetic lines while claiming GIS.
- No DB migration or PostGIS in this phase.

### Rollout, dependencies, and validation

- Requires data-use/redistribution authorization and GDAL/MapLibre build support.
- Default off; local evaluation enablement first; rollback by disabling the feature.
- Validate source hash/count/CRS, API contracts, map rendering/performance, provenance labels, and extended Topic 2 E2E.

### Wiring verification

| Component | Entry point | Registration / consumer | Schema/table |
|---|---|---|---|
| GIS builder | `make gis-build` | generated manifest/bundles | source shapefile; no DB |
| GIS API | `/api/twin/gis/*` | twin router + app config | versioned JSON/GeoJSON |
| GIS view | `/operations` view switcher | `OperationsTwinScreen` | manifest/network contracts |
| Energy reference | `EnergyContextCard` | GIS manifest consumer | official reference JSON |

## Comparative analysis

| Dimension | Draft A: evidence first | Draft B: realism first |
|---|---|---|
| Protects literal scored actions | Highest and immediate | Indirect until evidence work follows |
| Scope/risk | Small, reversible, no migration | New data pipeline, dependency, map runtime |
| Data authority dependency | None for first tranche | Permission and crosswalk required |
| Judge credibility | Honest and reproducible | Visually stronger if labels stay precise |
| Failure impact | Individual evidence row | GIS enablement/performance/provenance |
| Recommended order | First | After Draft A core closure |

Draft A is selected as the foundation. Draft B's thin, provenance-first GIS overlay is then added as an optional realism tranche; its full topology alternative remains deferred.

## Unified execution plan

### Merge-ordered PR delivery map

The decision-complete PR boundaries and lifecycle are maintained in `coding-logs/2026-08-04-20-14-04 Coding Log (overall-phases-and-pr-roadmap).md`. The selected sequence is ten sequential PRs after merged PR #30:

1. PR-A evidence truth.
2. PR-B Topic 1 browser proof.
3. PR-C induced SEC and strict 30-second timing.
4. PR-D model provenance and dataset DOM proof.
5. PR-E Swagger/worklist/RCA proof.
6. PR-F acceptance harness, followed by core exact-SHA Gate A1.
7. PR-G GIS builder/API dark delivery.
8. PR-H MapLibre/provenance/official-SEC UI dark delivery.
9. PR-I 200-customer schema/seed/API.
10. PR-J clickable low-pressure customer experience, followed by final Gate A2.

Each PR starts from the previous merged `main`, completes the normal lifecycle independently, and is post-merge verified before the next starts. Logical IDs are authoritative; GitHub numbers are assigned at creation.

### Phase 0 — truth and evidence inventory (P0, 0.5–1 day)

1. Correct `e2e/README.md`, `docs/demo-coverage.md`, `docs/demo-runbook.md`, script comments, and E2E comments to current PR #30 behavior.
2. Replace every `real customers` phrase attached to seeded impact data.
3. Correct `demo-preflight` from `cold start` to `stack readiness`; document true cold reset separately.
4. Correct the demo director's bad-asset narration: direct DB injection is not MQTT validation.
5. Add a static documentation test so the stale phrases cannot return.

### Phase 1 — Topic 1 browser evidence (P1, 1–2 days)

1. 1.1: same `/pipeline` DOM observes committed telemetry/conservation growth.
2. 1.2: controlled broker outage is visible in `ConnectionPill`, then persisted ingest resumes within a strict 30 seconds.
3. 1.3: all three table rows complete five calls, show zero failures, and average `<=500 ms`; `/latest` separately exposes Server-Timing.
4. 1.4: add Timescale catalog proof to preflight and align ordering narration.
5. 1.5: preserve the real MQTT good/bad/good proof and show the resulting DLQ row plus later committed good row in the browser.

### Phase 2 — Topic 2 evidence completion (P1, 1 day)

1. Add an induced `anomaly` E2E separate from pressure drop.
2. Show SEC inputs, timestamps, pair skew/freshness, formula, and result.
3. Verify the displayed calculation against the API payload and rounding.
4. Tighten the current 3.3 clock while modifying the shared scenario spec.
5. Retain visible SIMULATED labels for telemetry/topology/customers.

### Phase 3 — Topic 3 literal DOM evidence (P1, 1–2 days)

1. Add loaded model artifact hash to model card/API and preflight.
2. Assert rendered Health and PTTF separation for both datasets.
3. Make critical and recovery fail at `>30_000 ms`.
4. Exercise the literal Swagger UI feedback flow or archive an equivalent operator proof tied to a persisted ID.
5. Assert rendered worklist rows match API order.
6. Add shipped-artifact and browser RCA reversal proof.

### Phase 4 — exact-SHA acceptance and rehearsal (P1, 1 day)

1. Run focused tests and full Python/web gates.
2. Run every §7 gate three consecutive times and record exact counts.
3. Run `make demo-e2e` on a warmed stack; save report/timings.
4. Request explicit destructive-reset approval.
5. Only after approval, run the confirmed cold target and repeat the full demo.
6. Archive SHA, stack state, manifest, reports, and any screenshot/operator evidence.

### Phase 5A — Rayong GIS and official SEC realism (P2, after Phase 4)

Use the detailed subordinate plan in `coding-logs/2026-08-04T19-10 Coding Log (rayong-pipe-gis-sec-plan).md`:

1. Obtain data-use permission and audit source hash/CRS/counts.
2. Build WGS84 GeoJSON for all 9,273 pipes and the 19-feature Map Ta Phut focus.
3. Add fail-closed GIS manifest/network APIs behind `PIPE_GIS_ENABLED=false`.
4. Add synchronized MapLibre GIS and logical schematic views.
5. Bind the scenario to one real `PIPE_ID` through a visibly simulated crosswalk.
6. Add East Water `0.54 kWh/m³` only as a 2025 system-wide official reference beside simulated live SEC.
7. Keep asset placement, direction, telemetry, customer impact, and station-specific SEC simulated/unclaimed.

### Phase 5B — Map Ta Phut 200-customer low-pressure impact (P2, after 5A)

Use the detailed decision-complete plan in `coding-logs/2026-08-04-20-03-45 Coding Log (map-ta-phut-200-customer-impact).md`:

1. Add a database-backed demo profile containing exactly 200 PWA-style synthetic service accounts and 12 monthly readings per account.
2. Lock the scenario mix at 140 residential/other, 35 government/small-business, and 25 state-enterprise/industrial/large-business accounts.
3. Replace the five Samut Sakhon customer rows; do not retain them as a fallback.
4. Render a visibly simulated low-pressure footprint plus the Criterion 2.4 pipe highlight.
5. Make clicks on either target open one shared drawer showing the invariant 200 total, type breakdown, paginated accounts, meter/account/address fields, and monthly readings.
6. Keep real GIS geometry, the pressure footprint, customer records, customer-to-pipe binding, and East Water bulk-water context as separately labelled provenance domains.
7. Extend same-DOM E2E through pressure injection -> footprint/pipe -> click -> 200 accounts -> detail -> recovery clearing.

### Phase 6 — authority-dependent strategic work (P3, separately planned)

- DMAMA adapter only after credentials and contract are available; it protects no missing §4A row today.
- Real affected-customer counts only after authoritative customer/service-point-to-pipe mapping.
- Full GIS topology, direction, PostGIS, and hydraulics only after source-owner/engineering validation.
- Station-specific SEC baseline only from aligned measured station power and flow.

## Unified files-to-change list

| File/group | Purpose |
|---|---|
| `docs/demo-runbook.md`, `docs/demo-coverage.md`, `e2e/README.md` | Current trigger/evidence/provenance truth |
| `scripts/demo-preflight.sh`, `scripts/demo-scenario.sh`, `Makefile` | Readiness, catalog proof, safe warm/cold semantics |
| `web/src/features/twin/DemoScenarioPanel.tsx` | Accurate bad-asset path narration |
| `e2e/tests/topic1-pipeline.spec.ts` | Same-DOM Topic 1 judge proof |
| `e2e/tests/scenario-transitions.spec.ts` | Induced 2.3 and strict 3.3 timing |
| `e2e/tests/topic3-predictive.spec.ts` | Literal Topic 3 DOM correspondence |
| `e2e/lib/api.ts` | Bounded read-only evidence helpers |
| Pipeline evidence components/tests | Stable semantic values/states for browser assertions |
| `SecTooltip.tsx` and tests | SEC inputs, timing, freshness, formula |
| Predictive components/tests | Stable Health/PTTF/worklist/RCA evidence semantics |
| `api/app/models.py`, `api/app/model.py`, predictive route/tests | Artifact SHA provenance only |
| GIS files from subordinate plan | Optional Phase 5A realism tranche |
| Migration/profile/API/UI/tests from Map Ta Phut customer plan | Phase 5B exact 200-account click-through impact |

## Unified public interfaces

Core evidence tranche:

- Existing REST/WS contracts remain stable.
- `/api/model` gains `artifact_sha256` only if Phase 3 provenance is adopted; TypeScript type updates in the same PR.
- Planned `make demo-e2e-cold CONFIRM_VOLUME_RESET=1` fails closed without explicit confirmation.
- No core DB migration.

GIS tranche:

- `PIPE_GIS_ENABLED=false`, `PIPE_GIS_DIR`, `PIPE_GIS_MAX_BYTES`.
- `GET /api/twin/gis/manifest`.
- `GET /api/twin/gis/network?scope=map-ta-phut|full`.
- Versioned GIS JSON/GeoJSON fixture shared between Python and TypeScript.
- No PostGIS migration.

Map Ta Phut customer-impact tranche:

- `MTP_CUSTOMER_IMPACT_ENABLED=false`, `MTP_CUSTOMER_PROFILE=mtp-low-pressure-200-v1`.
- Additive `demo_customer_profile` and `demo_customer_meter_reading` tables.
- `GET /api/twin/impact/{pipe_id}` gains type breakdown and profile summaries.
- `GET /api/twin/customers/{customer_id}` returns one demo profile plus 12 readings.
- GIS impact-zone GeoJSON is explicitly `SIMULATED_LOW_PRESSURE_FOOTPRINT`.

## Unified edge cases and failure modes

- Missing Docker/live stack: report source-delivered evidence only; never claim fresh E2E.
- Failed latency call: row is not allowed to pass through successful-sample mean alone; surface failure and fail E2E.
- Broker outage shorter than UI poll: use counters or a controlled hold to produce observable transition.
- Direct demo DLQ injection: never present as MQTT validation.
- Missing/stale/skewed power/flow: SEC displays unavailable, not zero or stale arithmetic.
- Late model frame at 30.001 seconds: test fails.
- Missing model artifact/card/hash mismatch: predictive preflight fails closed while non-predictive API remains available.
- GIS permission absent: do not commit/host derived artifacts; Phase 5 remains off.
- GIS bundle drift/corruption: GIS endpoints return 503; never relabel synthetic schematic as GIS.
- No customer crosswalk: impacted customers remain SIMULATED.

## Cross-language schema verification

Core database names verified across SQL/Python/API:

- `telemetry`, `ingress_ledger`, `dead_letter`, `device`.
- `pipe_edge` primary key `(pipe_id, from_node, to_node)`.
- `customer_service_point` joins by `node`.
- `health` and `feedback` contracts match Pydantic routes and TypeScript consumers.

No migration is planned for evidence hardening. If `artifact_sha256` is added, verify Python `ModelCardResponse`, OpenAPI, TypeScript `ModelCard`, component tests, and E2E fixture together. GIS uses a shared versioned JSON fixture; incompatible changes increment its schema version.

## Unified wiring verification

| Component/change | Runtime entry point | Registration/consumer | Schema/table |
|---|---|---|---|
| Pipeline same-DOM evidence | `/pipeline` Playwright | existing pipeline screen/hooks | status API + conservation fields |
| Reconnect evidence | broker stop/start helper | `ConnectionPill`, status poll | persisted `telemetry` confirmation |
| Latency row semantics | `ResponseTimeTable` | `PipelineMonitorScreen` | TypeScript `LatencySummary` |
| Hypertable preflight | `make demo-preflight` | bounded Compose SQL probe | Timescale catalog |
| MQTT DLQ browser proof | Topic 1 E2E | `DlqTable` + conservation | `ingress_ledger`, `dead_letter`, `telemetry` |
| SEC derivation details | selected pump | `OperationsTwinScreen -> SecTooltip` | existing `SecResponse` |
| Strict model timing | scenario E2E | `/api/demo/scenario -> scoring -> WS -> DOM` | `telemetry`, `health` |
| Model artifact hash | `/api/model` | model card + preflight | JSON/OpenAPI/TS contract |
| Dataset DOM proof | `/predictive` | `DatasetCompare` | `DatasetScore` |
| Worklist DOM proof | `/predictive` | `WorklistTable` | `WorklistItem` |
| RCA reversal | anomaly scenarios | `RcaPanel` | `RcaResponse` |
| GIS bundle | `make gis-build` | GIS API and map | manifest/GeoJSON, no DB |

## Decision-complete checklist

- [x] Current implementation and current evidence are separated for all 16 rows.
- [x] Historical `ee895fc` evidence is not presented as current truth.
- [x] PR #30's completed work is not planned again.
- [x] Core required improvements are separated from optional GIS/DMAMA realism.
- [x] Every behavior change has a test that can fail on the defect.
- [x] New public surfaces, flags, and safe cold-reset semantics are listed.
- [x] No DB migration is required for evidence hardening or thin GIS overlay.
- [x] Failure behavior is fail-closed for evidence, model provenance, cold reset, and GIS.
- [x] Wiring table covers every proposed runtime addition.
- [x] Data permission and authoritative customer/station mappings are explicit prerequisites, not implementer guesses.

## Review (2026-08-04 19:43:08 +0700) - system

### Reviewed

- Repo: `/Users/subhajlimanond/dev/pwa-bigdata-demo`
- Branch: `main@a98a359c8a4f7c15bd1a43b557fff0c5bb2cab95`; `main == origin/main`
- Scope: entire scored technical demonstration, all 16 §4A sub-criteria, separate §7 posture, and proposed realism sequence
- Commands Run: repository identity/status/log; complete `CLAUDE.md`; rubric and DREP reads; targeted numbered inspection of runtime entry points, routes, schemas, components, scripts, docs, and tests; no live stack or destructive cold reset
- Sources: `POC_SPEC.md`, `docs/DREP-demo-poc.md`, `docs/demo-*`, `e2e/*`, `infra/*`, simulator/API/ML/web runtime and tests, PR #30 delivery log
- Delegated evidence: Topic 1 read-only audit; Topic 3 read-only audit plus focused non-live tests (`7`, `4`, `30`, and `3` passing groups) and OpenAPI generation. No subagent edited files.

### As-Is Pipeline Diagram

Curated real PWA branch roster plus simulated signals feed the Python simulator, which publishes QoS-1 MQTT to Mosquitto. The API's durable Paho subscriber hands immutable messages to a bounded supervised asyncio consumer; validation atomically records each disposition in `ingress_ledger` plus either the Timescale `telemetry` hypertable or `dead_letter`. REST serves pipeline status, latency, history, DLQ, twin topology/SEC/impact, and predictive outputs; live signal and model-health frames flow through `TwinHub` over `/ws/twin` into React. A 10-second scorer builds feature windows, loads the serialized Ridge bundle, persists `health`, produces worklist/RCA/feedback surfaces, and broadcasts threshold changes. The demo-only scenario director can atomically steer P-2's telemetry window for deterministic Topic 2/3 transitions; its `bad_asset` mode is a direct DB/DLQ injection, unlike the real MQTT Topic 1 path.

### High-Level Assessment

- No critical subsystem is missing; all 16 rubric rows have real runtime paths.
- Topic 1 has unusually strong broker/database/invariant tests, but several Playwright tests observe API state rather than the literal open-screen result.
- Topic 2's former 2.2/2.4 transition gap is closed by PR #30. Its largest remaining risks are 2.3 induced SEC evidence and false-real customer wording.
- Topic 3's model, model card, worklist, feedback, and counterfactual RCA are substantive. Its remaining gaps are primarily DOM correspondence and a strict 30-second oracle.
- Documentation materially lags PR #30 and currently overstates both cold-start semantics and customer reality.
- GIS/official SEC context is a valuable P2 credibility enhancement, not the immediate fix for the core evidence gaps.
- No fresh full live-stack gate was run in this review; PR #30 counts remain historical exact-SHA delivery evidence.

### Strengths

- Atomic ingress conservation, manual post-commit MQTT acknowledgement, bounded queues, and supervised consumer behavior provide real failure semantics rather than a UI simulation.
- Timescale hypertable status is directly catalog-tested; telemetry range reads and indexes are pinned.
- Status is never color-only; vector SVG zoom and affected-pipe semantics are browser-observable.
- SEC refuses missing, stale, skewed, and non-positive-flow inputs instead of fabricating a number.
- PR #30's same-DOM transition test is attributable: band-warning precedes health-critical, with no reload and recovery.
- The model card is tied to the loaded artifact; reserved holdouts are scored through that artifact.
- RCA is per-window counterfactual re-scoring and reverses for different anomalies; it is not a static reason table.
- Demo mutation surfaces are environment-gated and default off.

### Drift Matrix

| Intended | Implemented | Impact | Fix direction |
|---|---|---|---|
| Every judge action has literal browser evidence | Several Topic 1/3 tests check API plus component visibility | A green suite may not prove the visible transition/value/order | Add same-DOM and DOM-to-API assertions |
| Item 1.5 proves invalid MQTT handling | Scored simulator path does; demo-panel bad-asset mode directly inserts DLQ | UI narration can imply a path it bypasses | Keep MQTT proof; relabel or republish through MQTT |
| All displayed latency averages satisfy 500 ms | UI calculates three means; E2E checks one DB duration and first passing badge | Table-wide claim is overbroad | Assert every row/count/failure/mean |
| Pressure impact lists affected customers honestly | UI badge says simulated; docs/comments say real | Judge may infer unsupported customer mapping | Replace false-real wording everywhere |
| 2.3 demonstrates induced anomaly plus derived SEC | Current E2E starts from already non-nominal P-2 and checks title/unit | Symbol transition and arithmetic are not literal E2E | Inject anomaly and verify inputs/formula/result |
| 3.2 proves both outputs in DOM | API Health separation plus tile visibility | PTTF or DOM binding could break green | Assert rendered Health and PTTF values |
| 3.3 is strictly <=30 seconds | Polling permits about one second of tolerance | A 30.001-second defect may pass | Add strict elapsed assertion and delayed mutation |
| §7 and cold readiness are fresh | PR #30 ran large gates once; preflight preserves volumes | Full 3x/true-cold claim remains unproven | Separate warm readiness and authorized cold evidence |

### Key Risks / Gaps (severity ordered)

CRITICAL

- None.

HIGH

- Evidence-language integrity: `real customers`, `cold start`, stale pre-PR #30 coverage, and the demo bad-asset path description contradict the implementation. A judge following the docs could make false claims even though the UI badges are safer.
- Literal browser-evidence gaps remain in 1.1–1.3, 2.3, 3.2, 3.5, and 3.6. The underlying features are implemented; the problem is that current E2E can stay green when the intended DOM proof is broken.
- The 1.5 director control bypasses MQTT validation. It must not be used as the scored proof unless reimplemented through the broker.

MEDIUM

- 3.3 permits approximately one second beyond the rubric's literal timing boundary.
- Model artifact provenance is build-reproducible but not hash-visible to a judge.
- Hypertable proof exists in integration tests and SQL but is not bundled into preflight evidence.
- PR #30 delivery gates do not by themselves revalidate every §7 row or three consecutive runs.
- Full Rayong GIS lacks authoritative direction, station attachment, and customer mapping; using it without field-level provenance would turn realism into evidence risk.

LOW

- SQL operator output and API range output use opposite sort directions; both are valid, but the distinction should be narrated.
- The current P-2 scenario is tied to a simulated roster/network; Map Ta Phut naming must remain a scenario profile until an authoritative crosswalk exists.

### Nit-Picks / Nitty Gritty

- `scripts/demo-scenario.sh` still says there is no scenario API and asks operators to wait 10–15 seconds, despite the director.
- `e2e/README.md` still states obsolete P-2 health and pressure behavior.
- `docs/demo-coverage.md` still reports 17 tests and cold-start dependence.
- `scenario-transitions.spec.ts` comments say `real customers render`; the rows are API-derived but seeded/simulated.
- `demo-preflight.sh` calls itself a cold-start gate while executing only `compose up -d --build`.
- `ResponseTimeTable` averages successful samples separately from failures; the E2E must not let a row with failures pass on its successful mean alone.

### Tactical Improvements (1–3 days)

1. Correct documentation, comments, customer provenance, warm/cold language, and bad-asset path narration. Done when a static test rejects every known stale phrase.
2. Harden Topic 1 browser proof. Done when one open `/pipeline` page shows committed ingest, visible disconnect/recovery, all latency rows, Timescale catalog evidence, and MQTT-driven DLQ continuity.
3. Add induced 2.3 anomaly/SEC proof. Done when the DOM shows state change and recomputable, fresh, aligned power/flow SEC.
4. Tighten 3.3 to a strict 30,000 ms elapsed oracle. Done when a 30.001-second mutation fails.
5. Harden 3.2/3.5/3.6 DOM correspondence. Done when broken value/order/reason bindings fail Playwright.
6. Add artifact hash provenance and a literal Swagger journey. Done when the running image/card hash matches and Swagger returns a persisted ID.
7. Run exact-SHA warm evidence, then obtain explicit approval for a destructive true-cold rehearsal and §7 three-run gate.

### Strategic Improvements (1–6 weeks)

1. Add the thin Rayong GIS/official SEC overlay after evidence closure. Migration: permission/hash audit -> static WGS84 bundle -> fail-closed API -> MapLibre view -> scenario crosswalk -> extended E2E. Default off; rollback by disabling the feature.
2. Add bounded run provenance: scenario run ID plus trigger, accepted, scored, published, and rendered timestamps. Why now: turns timing/narration into evidence. Why not first: PR #30 already protects the formerly exposed rows; remaining literal test gaps are smaller.
3. Plan DMAMA only after credentials/contracts. Introduce a source interface and dark adapter before switching any metric. Do not displace §4A evidence work.
4. Replace simulated customer impact only after authoritative service-point/pipe/direction data arrives. Until then, real branch totals remain context, never incident impact.

### Big Architectural Changes (only if justified)

- Proposal: no broad rewrite. Retain the current logical twin, scenario director, Timescale topology, and scoring pipeline. Add GIS as a separate synchronized geographic read model rather than overwriting `pipe_edge` schematic coordinates.
  - Pros: preserves proven deterministic transitions; uses real geometry without inventing hydraulics; feature can remain off.
  - Cons: dual-view/crosswalk/provenance complexity; data permission dependency.
  - Migration Plan: audited offline bundle -> versioned API contract -> field-level provenance -> synchronized map -> authoritative mappings only when supplied.
  - Tests/Rollout: source hash/count/CRS, fail-closed API, component feature-state, Topic 2 same-DOM E2E, default-off flag, local evaluation enablement, disable-to-rollback.

### Open Questions / Assumptions

- No official partial-credit rule was found; this plan does not predict a score.
- The simulated MQTT feed is permitted by the rubric; `real data` in 2.3 is interpreted as live device values rather than a hardcoded SEC constant, while the UI remains visibly SIMULATED.
- A true-cold run is destructive to demo volumes and requires explicit authorization before execution.
- GIS redistribution permission, authoritative Map Ta Phut station attachment, customer mapping, and DMAMA credentials are not currently established.
- The exact current live-stack result remains unverified in this review because Docker/web/API were unavailable to the delegated audit.
