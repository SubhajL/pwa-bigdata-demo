# DREP — PR-9 (Predictive panel · Stitch S10) + PR-17 (S-D demo director / score gate)

Delegation-Ready Execution Plan. g2 lifecycle. Two PRs, landed in order: **PR-9 → (admin
merges origin/main → pull local main) → PR-17**. Read with `POC_SPEC.md` §4A (the 100-pt
rubric), `docs/DREP-demo-poc.md` §Reslice (defines slice **S-D**), and `docs/demo-coverage.md`.

---

## §0 Repo Profile

| Field | Value |
|---|---|
| Languages | Python 3.13 (api/, ml/, simulator/, scripts/) · TypeScript 5.7 / React 18 (web/) · Bash + SQL (infra/, scripts/) |
| **Backend** test | `cd api && pytest` (unit) / `pytest -m integration` (needs TimescaleDB) |
| Backend lint | `cd api && ruff check .` |
| Backend typecheck | `cd api && mypy .` (strict; `disallow_untyped_defs`) |
| ML test | `cd ml && pytest` |
| **Frontend** test | `cd web && pnpm test` (vitest run) |
| Frontend lint | `cd web && pnpm lint` (eslint src) |
| Frontend typecheck | `cd web && pnpm typecheck` (tsc --noEmit) |
| Frontend build | `cd web && pnpm build` |
| **E2E** (new, PR-17) | `cd e2e && pnpm test` (Playwright) — drives the live compose stack |
| Migration policy | `infra/db/NNN_*.sql`, whole dir mounted at initdb; existing volumes upgraded by the one-shot `migrate` service. **PR-9/PR-17 add NO migration.** |
| Coding log | `coding-logs/2026-07-31 Coding Log (PR9-PR17 …).md`; pointer in `.codex/coding-log.current` |

**Ownership:** Repo = **ours**. Runtime = **ours** (local/on-prem compose; not serverless).
Disposition = **may-become-production**. → design-context tools only (Stitch); no
runtime-owning builders. Confirmed by CLAUDE.md.

**Design profile (UI slice):** `design/manifest.json` → `projectId 16433260128763898652`,
`sourceUpdateTime: null`, `designFrozen: false`. Target screen **S10** (`design/screens/
S10-predictive.html` + `.png`), `demoCritical: true`. `design/tokens.map.md` +
`design/INTERACTIONS.md` present and committed. **tokens.map.md rule #5: do NOT read colours
from the Stitch HTML** — it drifted; use tokens only. Layout/structure may be taken from S10.

**Repo MUST NOT (restated verbatim from CLAUDE.md — reaches reviewer + implementer):**
- Hardcode a KPI/telemetry value in a component — values come from the API/DB.
- Present a synthetic value without a visible `SIMULATED` marker.
- Use a second y-axis, a rainbow categorical ramp for magnitude, or colour-only status.
- Block the ingest loop on a bad message (must DLQ and continue).
- Commit secrets; `.env` is git-ignored.
- `@ts-ignore` / bare `except:` to pass a gate.
- Raw hex in `src/` (eslint token rule) · duration string literals in production TS.
- `any` (TS) / untyped defs (Py). Functions ≤ 50 lines. No orphan components/routes.
- Thai UI text in IBM Plex Sans Thai; violet reserved for `SIMULATED` only.

---

## §1 Goal / Non-Goals

**Goal.** (PR-9) Put topic ๓ on screen: a `/predictive` panel (Stitch S10) rendering the
already-live predictive endpoints plus a new `GET /api/model`, so scored items **3.1–3.6**
are demonstrable behavior, not mockups. (PR-17) Deliver slice **S-D** — the rehearsed,
browser-visible **score gate**: a timed runbook, one-command cold-start/preflight, scenario +
reconnect scripts, and a Playwright E2E over **all 16** scored items against the **live**
stack — so a second operator can prove every rubric row to a judge. Refresh
`docs/demo-coverage.md` off its stale "0/16".

**Non-Goals.**
- No `POST /api/demo/scenario` control API (master-plan idea; user chose script-driven).
  Scenarios switch via existing `FAULT_MODE` env + broker restart.
- No new DB migration, no schema change, no new telemetry signal.
- No changes to the trained model, its features, or its numeric behavior (seed constant is
  *relocated*, value unchanged — proven by existing ml tests).
- No build of the other unbuilt screens (S1/S2/S3/S5/S6/S7/S9) — they stay `PlaceholderScreen`.
- PR-9 does not implement item 3.3's *twin* transition UI (that lives in the already-built
  twin screen, PR-7); PR-9 surfaces health/PTTF/RCA on the predictive screen and PR-17's E2E
  asserts the 3.3 twin transition end-to-end.
- No CI pipeline file (E2E is a local make/pnpm target; wiring it into CI is out of scope).

---

## §2 Requirements — testable

### PR-9 (Predictive panel)
- **R9.1** `GET /api/model` returns the trained-model card: `model_version`, per-target
  (`health`,`pttf`) `estimator_class`, `hyperparameters`, `preprocessing`, `target`, `units`;
  `metrics{model_mae,baseline_mae}` per target; `data_sha256`; `censoring`; `limitations[]`;
  `simulated:true`. (item 3.1)
- **R9.2** `GET /api/model` returns `datasets:[healthy,degraded]`, each `{name, lifecycle_id,
  health_score, pttf_hours, status}`, scored through the **shipped artifact** via
  `score_window`. Invariant: `healthy.health_score > degraded.health_score` **and**
  `healthy.pttf_hours >= degraded.pttf_hours`. (item 3.2)
- **R9.3** `GET /api/model` returns **503** when `app.state.bundle is None`; the route never
  raises and never disables the pipeline (topic ๑) endpoints. Registered in `/openapi.json`.
- **R9.4** The predictive screen renders at `/predictive`; `NAV_ITEMS[predictive].built` is
  `true`; its `<h1>` carries the nav `labelTh` "การพยากรณ์…" and renders **synchronously**,
  independent of any fetch (router.test/a11y mount it with no network).
- **R9.5** KPI row derives from `/api/worklist`: at-risk = count(status ∈ {warning,critical});
  avg health = mean(health_score); PTTF<7d = count(pttf_hours < 168); plus model_version from
  `/api/model`. No value hardcoded. (supports 3.5)
- **R9.6** Worklist table (`/api/worklist`) shows rank, asset_id, branch, health, pttf, status
  — status with icon+Thai label (never colour-alone); numerics right-aligned tabular-nums;
  clicking a row selects it for the RCA panel. (item 3.5)
- **R9.7** RCA panel (`/api/rca/{asset}`) for the selected device renders ranked signal
  contributions as horizontal bars, largest-|contribution| first, **one axis**; SIMULATED.
  (item 3.6)
- **R9.8** Two-dataset compare card renders `/api/model.datasets` — Dataset A (healthy) vs B
  (degraded) health + pttf, showing they differ. (item 3.2)
- **R9.9** Trained-model card renders `/api/model` — algorithm (Ridge), key hyperparameters,
  preprocessing, model_mae vs baseline_mae, data_sha256 (short), limitations. (item 3.1)
- **R9.10** Feedback panel POSTs `/api/feedback` and shows the persisted ack (`id`,
  `created_at`, `stored`); verdict is an enum select
  (`confirmed|false_alarm|repaired|deferred`); includes a visible link to the Swagger op
  `/docs` → `POST /api/feedback` (the judge-facing scored surface). (item 3.4)
- **R9.11** Every simulated value carries a `SimulatedBadge`; a footer states all model
  outputs are simulated. No raw hex; tokens only; IBM Plex Sans Thai.
- **R9.12** Five INTERACTIONS states: loading (skeleton), error (Alert, no throw/blank),
  empty (nodata), stale (dimmed last values + timestamp), normal — mirroring
  `PipelineMonitorScreen`. A failed poll never blanks the heading.
- **R9.13** dataviz: validated palette; one y-axis per chart; status never colour-alone;
  legend when ≥2 series; direct labels selective; RCA/health marks follow mark specs.

### PR-17 (S-D score gate)
- **R17.1** `docs/demo-runbook.md`: a timed operator runbook; for each of the 16 items a row
  {trigger → on-screen/IDE/DevTools evidence → expected value → reset}; runnable by a second
  operator with no developer present.
- **R17.2** `scripts/demo-preflight.sh`: one command that brings the stack up, waits every
  service healthy, verifies migrate/seed/backfill/model completed and a device is scoreable,
  prints a readiness table, and exits non-zero if not demo-ready. (cold-start)
- **R17.3** `scripts/demo-reconnect.sh`: restarts the broker, polls `/api/pipeline/status`,
  measures disconnect→(connected ∧ received advancing), prints the elapsed seconds and
  **fails if > 30s** (item 1.2).
- **R17.4** `scripts/demo-scenario.sh <normal|anomaly|pressure_drop|bad_asset>`: switches the
  simulator via `FAULT_MODE=<mode> docker compose up -d simulator`; `normal` resets.
- **R17.5** `scripts/show-hypertable.sql`: proves the hypertable (timescaledb catalog /
  `show_chunks`) and a time-range retrieval SELECT (item 1.4).
- **R17.6** Playwright E2E in `e2e/` covers **all 16** items against the live stack: real
  browser, no reload; asserts reconnect ≤30s (1.2), Server-Timing mean ≤500ms (1.3), DLQ grows
  and loop continues under bad_asset (1.5), SVG zoom crisp (2.1), twin status auto-updates
  (2.2), pump anomaly + SEC tooltip (2.3), pressure-drop highlight + affected customers (2.4),
  ≥3 twin components + config reachable (2.5), model card (3.1), two-dataset differ (3.2),
  health<threshold → twin change ≤30s (3.3), feedback persists via API/Swagger (3.4), worklist
  ranked (3.5), RCA named+ranked (3.6), MQTT ingest continuous (1.1), TSDB write+retrieval
  (1.4); asserts `SIMULATED` badges present where required.
- **R17.7** `make demo-e2e` (root `Makefile`): compose up → wait healthy → `pnpm --dir e2e
  test` → compose down; the cold-start rehearsal one-command gate. Also `make demo-up`,
  `make demo-down`, `make demo-preflight`.
- **R17.8** `docs/demo-coverage.md` refreshed: the "0/16 behavior" line and the per-item
  "Behavior demonstrable now" column reflect the true post-PR-9/PR-17 state, keyed to the E2E
  spec that proves each row.
- **R17.9** DevTools evidence (item 1.3) capture is documented in the runbook (open Network,
  read `Server-Timing: db;dur=…` and total; the pipeline `ResponseTimeTable` already renders
  the in-browser mean), and the E2E asserts the same header programmatically.

---

## §3 Change Contract

### PR-9
| ID | Path | Action | Anchor | New exports | Purpose |
|----|------|--------|--------|-------------|---------|
| F1 | `api/app/models.py` | MODIFY | after `RcaResponse` (L181) | `EstimatorCard`,`MetricPair`,`DatasetScore`,`ModelCardResponse` | `/api/model` contract (3.1/3.2) |
| F2 | `api/app/routes/predict.py` | MODIFY | new handler after `root_cause` (L226) | `model_card()` route | `GET /api/model` |
| F3 | `ml/pwa_ml/datasets.py` | MODIFY | module const near `N_LIFECYCLES` (L30) | `CORPUS_SEED = 20260729` | single home for the reserved-demo seed |
| F4 | `ml/pwa_ml/__main__.py` | MODIFY | `CORPUS_SEED` (L21) | — | import the const (dedup; value unchanged) |
| F5 | `scripts/build_demo_datasets.py` | MODIFY | `CORPUS_SEED` (L25) | — | import the const (dedup) |
| F6 | `api/Dockerfile` | MODIFY | after `RUN python -m pwa_ml` | — | ensure card readable at `/srv/artifacts/model_card.json` (already written there — assert, no COPY needed) |
| F7 | `web/src/features/predictive/types.ts` | CREATE | — | TS contracts | mirror verified backend JSON |
| F8 | `web/src/features/predictive/predictive.config.ts` | CREATE | — | `PREDICTIVE_CONFIG` | cadence, thresholds, verdicts, RCA top-N |
| F9 | `web/src/features/predictive/predictiveClient.ts` | CREATE | — | fetchers + pure reducers | HTTP seam + `kpiFromWorklist`,`rcaBars`,`healthBand`,`pttfDays` |
| F10 | `web/src/features/predictive/useWorklist.ts` | CREATE | — | `useWorklist()` | poll `/api/worklist` (owned poll) |
| F11 | `web/src/features/predictive/useDeviceInsight.ts` | CREATE | — | `useDeviceInsight(asset)` | fetch health+rca on selection |
| F12 | `web/src/features/predictive/useModelCard.ts` | CREATE | — | `useModelCard()` | fetch `/api/model` once |
| F13 | `web/src/features/predictive/useFeedback.ts` | CREATE | — | `useFeedback()` | POST feedback; ack/error state |
| F14 | `web/src/features/predictive/KpiRow.tsx` | CREATE | — | `<KpiRow>` | 4 KPI tiles |
| F15 | `web/src/features/predictive/WorklistTable.tsx` | CREATE | — | `<WorklistTable>` | item 3.5 table + row select |
| F16 | `web/src/features/predictive/RcaPanel.tsx` | CREATE | — | `<RcaPanel>` | item 3.6 bars |
| F17 | `web/src/features/predictive/ModelCard.tsx` | CREATE | — | `<ModelCard>` | item 3.1 card |
| F18 | `web/src/features/predictive/DatasetCompare.tsx` | CREATE | — | `<DatasetCompare>` | item 3.2 A/B |
| F19 | `web/src/features/predictive/FeedbackPanel.tsx` | CREATE | — | `<FeedbackPanel>` | item 3.4 form + ack + Swagger link |
| F20 | `web/src/features/predictive/HealthMeter.tsx` | CREATE | — | `<HealthMeter>` | one-axis health meter (reused in KPI/table) |
| F21 | `web/src/screens/PredictiveAnalyticsScreen.tsx` | CREATE | — | `PredictiveAnalyticsScreen` | composes the panel |
| F22 | `web/src/routes/routes.tsx` | MODIFY | `SCREENS` map (L25) | — | register `predictive:` screen |
| F23 | `web/src/routes/nav.ts` | MODIFY | `predictive` item (L138) | — | `built: true` |

### PR-17
| ID | Path | Action | Anchor | New exports | Purpose |
|----|------|--------|--------|-------------|---------|
| G1 | `docs/demo-runbook.md` | CREATE | — | — | timed runbook, 16 rows |
| G2 | `scripts/demo-preflight.sh` | CREATE | — | — | cold-start + readiness gate |
| G3 | `scripts/demo-reconnect.sh` | CREATE | — | — | reconnect timer (1.2) |
| G4 | `scripts/demo-scenario.sh` | CREATE | — | — | FAULT_MODE switch |
| G5 | `scripts/show-hypertable.sql` | CREATE | — | — | hypertable + range proof (1.4) |
| G6 | `Makefile` | CREATE | — | — | `demo-up/down/preflight/e2e` |
| G7 | `e2e/package.json` | CREATE | — | — | Playwright project (pnpm) |
| G8 | `e2e/playwright.config.ts` | CREATE | — | — | baseURL, projects, reporter |
| G9 | `e2e/tsconfig.json` | CREATE | — | — | isolate from web tsc |
| G10 | `e2e/lib/api.ts` | CREATE | — | helpers | poll status, restart broker, set fault, read Server-Timing |
| G11 | `e2e/tests/topic1-pipeline.spec.ts` | CREATE | — | — | items 1.1–1.5 |
| G12 | `e2e/tests/topic2-twin.spec.ts` | CREATE | — | — | items 2.1–2.5 |
| G13 | `e2e/tests/topic3-predictive.spec.ts` | CREATE | — | — | items 3.1–3.6 |
| G14 | `e2e/README.md` | CREATE | — | — | how to run; DevTools evidence steps |
| G15 | `docs/demo-coverage.md` | MODIFY | matrix + bottom line | — | refresh off "0/16" |
| G16 | `.gitignore` | MODIFY | add `e2e/node_modules`, `e2e/test-results`, `e2e/playwright-report` | — | keep artifacts out of git |

---

## §4 Function Contracts (key ones)

```
FN1  model_card(request: Request) -> ModelCardResponse            [F2]
     Does:   Serve the trained-model card (3.1) + two demo-dataset scores (3.2).
     Pre:    plain `def` (sync handler — psycopg/sklearn are sync; mirrors the file's rule).
     Post:   200 with card fields from the artifact's model_card.json AND datasets[] scored
             through app.state.bundle via pwa_ml.predict.score_window on the two reserved
             lifecycles (build_corpus(seed=CORPUS_SEED).demo_healthy/demo_degraded, last 24 rows).
             healthy.health_score > degraded.health_score; healthy.pttf_hours >= degraded's.
     Errors: 503 when app.state.bundle is None OR the card file is unreadable. Never raises to
             the client; never touches the pipeline routes.
     Notes:  ≤50 lines. The card JSON is read from the artifact dir resolved exactly like
             app.model.resolve_model_path (sibling model_card.json), with the repo-relative
             ml/artifacts/model_card.json dev fallback. Two-dataset scoring is cached
             (module-level lru_cache keyed on model_version) — build_corpus is deterministic
             and file-free but not free, and this route may be hit repeatedly by the demo.
```

```
FN2  read_model_card(artifact_dir: Path) -> dict[str, Any]        [F2 helper, app-side]
     Does:   Load model_card.json next to the resolved model.pkl.
     Errors: raises FileNotFoundError/ValueError → caught by FN1 → 503.
```

```
FN3  score_demo_datasets(bundle: Bundle) -> list[DatasetScore]    [F2 helper, app-side]
     Does:   build_corpus(seed=CORPUS_SEED); score demo_healthy & demo_degraded via
             score_window(bundle, run.rows[-24:]); map Score -> DatasetScore.
     Post:   len == 2; order [healthy, degraded]; both status ∈ normal|warning|critical
             (>=24 contiguous rows, so never nodata).
     Notes:  lru_cache(maxsize=1) on bundle.model_version — reuses the exact reserved
             lifecycles the model was trained to exclude (guarded by ml/test_shipped_artifact).
```

```
FN4  kpiFromWorklist(items: readonly WorklistItem[], pttfDaysThreshold: number)
       -> { atRisk: number; avgHealth: number | null; pttfUnder: number; total: number }   [F9]
     Does:   Pure fold. atRisk=count(status∈warning|critical); avgHealth=mean(health_score) or
             null when empty (never NaN); pttfUnder=count(pttf_hours!=null && <threshold*24).
     Post:   total===items.length; never throws on [].
     RED:    ImportError before F9; AssertionError on avgHealth of [] (NaN) before the guard.
```

```
FN5  rcaBars(contributions: readonly SignalContribution[], dims: BarDims)
       -> { bars: {signal,label,value,x,y,w,h}[]; axisX: number; max: number }              [F9]
     Does:   Pure geometry for a horizontal bar chart, ONE axis; bar length ∝
             |contribution| / max(|c|,1); ordered as given (already ranked by the API).
     Post:   [] -> { bars:[], max:1 }; widths never negative; max>0.
```

```
FN6  useWorklist(): { items; error; stale; lastAt; selected; select(asset) }               [F10]
     Mirrors usePipelineStatus: useOwnedPoll over fetchWorklist; failed poll -> stale, keeps
     last items; selection state defaults to items[0].asset_id once loaded.
```

```
FN7  submitFeedback(req: FeedbackRequest, signal?) -> Promise<FeedbackAck>                  [F9]
     POST /api/feedback via getJson({method:'POST',body,headers}); returns the ack. A 404
     (unknown asset) surfaces ApiError to useFeedback for an inline message.
```

Backend Pydantic (F1), typed to the card JSON already on disk:
```
EstimatorCard: estimator_class:str; hyperparameters:dict[str,Any]; target:str; units:str;
               preprocessing:list[str]
MetricPair:    model_mae:float; baseline_mae:float
DatasetScore:  name:str; lifecycle_id:str; health_score:float; pttf_hours:float; status:TwinStatus
ModelCardResponse: model_version:str; pipelines:dict[str,EstimatorCard];
               metrics:dict[str,MetricPair]; data_sha256:str;
               created_from:dict[str,int]; censoring:dict[str,Any]; limitations:list[str];
               datasets:list[DatasetScore]; simulated:bool=True
```

---

## §5 Test Plan (RED-proofs mandatory)

### PR-9 backend (append to `api/tests/test_predict_api.py`; new fixtures reuse existing)
```
T9.1  test_model_endpoint_is_registered_and_documented
      Type: unit (no DB). Covers R9.3.
      Act:  GET /openapi.json via TestClient(app).
      Assert: "/api/model" in paths; the 200 response schema $ref resolves to ModelCardResponse.
      RED:  KeyError — "/api/model" absent before F2.

T9.2  test_model_endpoint_serves_the_card_and_two_separating_datasets
      Type: integration (model_artifact fixture). Covers R9.1, R9.2.
      Act:  GET /api/model via _probe(pool).
      Assert: body["model_version"]=="pwa-health-pttf-v1";
              body["pipelines"]["health"]["estimator_class"]=="Ridge";
              body["metrics"]["health"]["model_mae"] < body["metrics"]["health"]["baseline_mae"];
              len(body["datasets"])==2 and names=={"healthy","degraded"};
              healthy.health_score > degraded.health_score;
              healthy.pttf_hours >= degraded.pttf_hours;
              body["simulated"] is True.
      RED:  404 before F2; after a stub that returns the card but not datasets, KeyError on
            body["datasets"]; after an unscoped/naive scorer that swaps the pair, the
            health_score ordering assertion fails (NOT a fixture error).

T9.3  test_model_endpoint_503_without_a_bundle
      Type: unit. Covers R9.3.
      Act:  TestClient(_probe_without_bundle()).get("/api/model").
      Assert: 503; and GET /api/pipeline/status on the same app still works (isolation).
      RED:  200 or 500 before FN1's bundle guard.
```

### PR-9 frontend
```
T9.4  predictiveClient.test.ts — kpiFromWorklist / rcaBars / pttfDays / healthBand
      Type: unit (no DOM). Covers R9.5, R9.7, R9.13.
      Assert: avgHealth([])===null (not NaN); atRisk counts warning+critical only;
              rcaBars([]).bars===[] and max===1; rcaBars widths ∝ |contribution|, one axisX;
              pttfDays(168)===7; healthBand(30)==="critical", healthBand(50)==="warning".
      RED:  ImportError before F9; NaN avgHealth before the empty guard.

T9.5  predictiveComponents.test.tsx
      Type: component (RTL). Covers R9.6, R9.7, R9.9, R9.10, R9.11, R9.13.
      Assert: WorklistTable renders a StatusChip (icon+label) per row, numerics right-aligned;
              RcaPanel renders one <svg> with a single axis and N bars, no second axis;
              ModelCard shows "Ridge" and a hyperparameter and MAE<baseline;
              FeedbackPanel verdict <select> has exactly the 4 options and a visible /docs link;
              every simulated card contains a SimulatedBadge (violet); no raw hex in output.
      RED:  render throws / queries miss before F14–F20.

T9.6  predictiveHooks.test.tsx
      Type: hook (RTL + fake fetch). Covers R9.12.
      Assert: useWorklist keeps last items and sets stale on a failed poll (never []);
              useFeedback exposes ack after a resolved POST and error after a 404;
              useModelCard fetches once.
      RED:  hook undefined before F10–F13; stale never set before the onError branch.

T9.7  PredictiveAnalyticsScreen.test.tsx
      Type: screen (RTL, no network). Covers R9.4, R9.12.
      Assert: <h1> with the Thai labelTh renders synchronously with fetch stubbed-absent;
              a failed initial load shows the Alert, not a blank; data-testid present.
      RED:  heading behind a fetch (blank) before the sync-render structure.

T9.8  predictiveWiring.test.tsx  (mirror pipelineWiring.test.tsx)
      Type: wiring. Covers R9.4 (no orphans).
      Assert: buildRoutes over NAV_ITEMS maps /predictive to PredictiveAnalyticsScreen (not
              PlaceholderScreen); nav predictive.built===true; every predictive component is
              imported by the screen (import-graph assertion or render-reaches).
      RED:  PlaceholderScreen rendered before F22/F23.

T9.9  (existing) router.test.tsx / a11y.test.tsx MUST STILL PASS
      Flipping built:true makes router.test expect the real screen by its labelTh; the sync
      heading (R9.4) is what keeps a11y's no-network mount green. Listed in §10 as must-not-break.
```

### PR-17 E2E (Playwright, live stack) — the acceptance oracle
```
E1.1 ingest_is_continuous            — poll /api/pipeline/status twice ≥3s apart; received advances.
E1.2 reconnect_within_30s            — restart broker; assert state→connected & received advances
                                       on a monotonic clock < 30_000ms. (mirrors demo-reconnect.sh)
E1.3 response_under_500ms_in_network — page.on('response') capture Server-Timing on /api/telemetry
                                       …/latest; assert total & db under budget; the on-screen
                                       ResponseTimeTable shows "under budget".
E1.4 tsdb_write_and_range            — GET /api/telemetry/P-2/range?minutes=15 returns ordered rows;
                                       RetrievalEvidence panel shows count>0.
E1.5 bad_asset_dlq_continues         — set FAULT_MODE=bad_asset; DLQ total grows AND received keeps
                                       advancing (loop not stalled); reset to normal.
E2.1 svg_zoom_crisp                  — zoom the twin; assert viewBox changes and it is <svg> vector
                                       (no raster blur), device symbols still present.
E2.2 twin_status_auto_updates        — with a fault live, a device's status class changes with NO
                                       page reload (assert DOM mutation, same document).
E2.3 pump_anomaly_sec_tooltip        — FAULT_MODE=anomaly; P-2 goes warning/critical; hover shows
                                       SEC tooltip with a kWh/m³ number + SIMULATED.
E2.4 pressure_drop_impact            — FAULT_MODE=pressure_drop; affected pipe highlighted +
                                       affected-customers list non-empty.
E2.5 source_structure               — assert ≥3 twin components in DOM + twin.config reachable
                                       (this spec references the files; runbook shows them in IDE).
E3.1 model_card_visible              — /predictive shows Ridge + a hyperparameter + MAE<baseline.
E3.2 two_datasets_differ            — Dataset A health > Dataset B health on screen.
E3.3 health_to_twin_within_30s      — drive a device below threshold; twin reflects the health
                                       status change < 30s, no reload (cross-screen; monotonic).
E3.4 feedback_persists              — POST /api/feedback via the panel; ack shows stored:true,id;
                                       re-GET proves persistence; Swagger op present at /openapi.json.
E3.5 worklist_ranked               — worklist rows are health-ascending, rank 1..n.
E3.6 rca_named_and_ranked          — RCA bars name signals, |contribution| descending.
GLOBAL simulated_markers           — SIMULATED badge present on predictive + twin simulated values.
```
Each E-spec is the behavior the matching demo-coverage row claims; the spec id is cited there.

---

## §6 Traceability

| Req | Tests | Files |
|-----|-------|-------|
| R9.1 | T9.2 | F1,F2 |
| R9.2 | T9.2 | F1,F2,F3 |
| R9.3 | T9.1,T9.3 | F2 |
| R9.4 | T9.7,T9.8,T9.9 | F21,F22,F23 |
| R9.5 | T9.4,T9.5 | F9,F14 |
| R9.6 | T9.5 | F15 |
| R9.7 | T9.4,T9.5 | F9,F16 |
| R9.8 | T9.5 | F18 |
| R9.9 | T9.5 | F17 |
| R9.10 | T9.5,T9.6 | F13,F19 |
| R9.11 | T9.5 | F14–F21 |
| R9.12 | T9.6,T9.7 | F10,F21 |
| R9.13 | T9.4,T9.5 | F9,F16,F20 |
| R17.1 | (runbook rehearsal) | G1 |
| R17.2 | manual + E-preflight | G2 |
| R17.3 | E1.2 | G3 |
| R17.4 | E2.3/E2.4/E1.5 use it | G4 |
| R17.5 | manual (SQL) | G5 |
| R17.6 | E1.1–E3.6,GLOBAL | G7–G13 |
| R17.7 | make demo-e2e green | G6 |
| R17.8 | matrix cites E-ids | G15 |
| R17.9 | E1.3 | G1,G11 |

Every R has ≥1 T; every T maps to ≥1 R. (Script-only R17.1/2/5 are verified by rehearsal, not
unit tests — stated, not hidden.)

---

## §7 Wiring Verification

| New component | Runtime caller | Registration | Schema/table |
|---|---|---|---|
| `GET /api/model` (F2) | HTTP; browser `useModelCard` | `predict_routes.router` already `include_router`ed in `main.py` L223 | reads `model_card.json` + scores in-memory (no table) |
| `ModelCardResponse` (F1) | FN1 return | imported in F2 | — |
| `PredictiveAnalyticsScreen` (F21) | router element | `SCREENS.predictive` (F22) + nav `built:true` (F23) | — |
| KpiRow/WorklistTable/RcaPanel/ModelCard/DatasetCompare/FeedbackPanel/HealthMeter (F14–F20) | imported by F21 | rendered in the screen | — |
| useWorklist/useDeviceInsight/useModelCard/useFeedback (F10–F13) | called by F21/components | — | `/api/worklist`,`/api/health/{id}`,`/api/rca/{id}`,`/api/model`,`/api/feedback` (all exist ✓, `/api/model` new) |
| `CORPUS_SEED` (F3) | FN3 + both scripts | exported from datasets.py | — |
| Playwright specs (G11–G13) | `pnpm --dir e2e test` | `playwright.config.ts` `testDir` | live stack |
| Make targets (G6) | operator / `make demo-e2e` | root Makefile | compose |

No §3 CREATE row lacks a wiring row.

---

## §8 Slice Plan

| ID | Scope (F/G · T) | Owner | Stop line | Oracle | Done when |
|----|-----------------|-------|-----------|--------|-----------|
| **S9-A** | F1,F3,F4,F5,F6,F2 · T9.1–T9.3 | **Claude** contract+tests; body delegate-eligible | SL-2 (Q2: new route + new contract, but strong pytest oracle) | pytest T9.1–T9.3 (unit + integration) | 3 tests green; card+datasets served; 503 isolation holds |
| **S9-B** | F7,F8,F9 · T9.4 | DeepSeek | SL-2 (types+reducers fixed by Claude; bodies filled) | vitest T9.4 + tsc + eslint | reducers green; no `any`; no raw hex |
| **S9-C** | F10–F13 · T9.6 | DeepSeek | SL-2 | vitest T9.6 | hooks green (stale/ack/error) |
| **S9-D** | F14–F20 · T9.5 | DeepSeek | SL-2 (component seams typed) | vitest T9.5 + a11y + eslint token rule | components green; StatusChip/SimulatedBadge/one-axis verified |
| **S9-E** | F21,F22,F23 · T9.7,T9.8,T9.9 | **Claude** | SL-3 (wiring is judgment; must not break router/a11y) | vitest T9.7–T9.9 + full `pnpm test`/`typecheck`/`build` | screen wired; router/a11y still green; PR-9 gates all green |
| **S17-A** | G2,G3,G4,G5 (scripts) | **Claude** | — (no strong automated oracle; touches docker/infra) | manual run + E1.2 corroborates reconnect | scripts run on the live stack; reconnect < 30s printed |
| **S17-B** | G7,G8,G9,G10,G16 (Playwright scaffold) | **Claude** | SL-3 | `pnpm --dir e2e test` collects; one smoke spec green vs live stack | harness runs a spec against compose |
| **S17-C** | G11,G12,G13 (16 specs) | **Claude** (acceptance tests never delegated) | SL-3 | all E-specs green vs live stack | 16 items pass in a real browser |
| **S17-D** | G1,G6,G14,G15 (runbook/make/docs) | **Claude** | — | second-operator rehearsal; `make demo-e2e` green | runbook complete; coverage refreshed off "0/16" |

**Delegation rationale (oracle-driven).** S9-B/C/D have strong automated oracles (Claude-authored
vitest + tsc + eslint) over typed seams → DeepSeek-eligible. S9-A's *contract* (Pydantic models,
the seed relocation, the two-dataset invariant) is judgment and stays Claude's; its handler body
has a pytest oracle and MAY be delegated once the contract+tests exist. S9-E (wiring) and all of
PR-17 (scripts touching infra; Playwright *are* the acceptance oracle) are never delegated.

Land: **S9-A→B→C→D→E as one PR (PR-9)**; then admin merges origin/main, pull local main; then
**S17-A→B→C→D as one PR (PR-17)**. No slice depends on an unmerged branch.

---

## §9 Risks, Rollout, Rollback

| Risk | Trigger | Blast radius | Gate / mitigation | Rollback |
|---|---|---|---|---|
| Seed relocation changes the model | F3/F4/F5 drift the value | model artifact + all 3.x | value is byte-identical (20260729); `ml/test_shipped_artifact` + `test_demo_datasets` re-run in S9-A | revert F3–F5 |
| `build_corpus` slow on `/api/model` | 40-lifecycle gen per request | 3.2 latency | lru_cache(model_version); computed once/process | serve card-only (drop datasets) behind the same route |
| `model_card.json` absent in image | Dockerfile layer change | 3.1 → 503 | FN1 falls to 503 (not crash); F6 asserts the file exists at build; dev fallback to `ml/artifacts/` | route already degrades to 503 |
| Playwright flakiness on live stack | timing/races | E2E only (not shipped app) | generous per-assert waits + poll-until on monotonic clocks; retries:1; specs assert *state reached*, not fixed sleeps | quarantine a spec; runbook still manual |
| E2E deps bloat / network | `pnpm install` + browser download | dev only | isolated `e2e/`; gitignored; documented one-time `pnpm --dir e2e exec playwright install chromium` | delete `e2e/` |
| Flipping `built:true` breaks router/a11y | S9-E | web test gate | T9.9 makes it a hard gate in S9-E | revert F23 |

Rollout: both PRs are additive; PR-9's only user-visible change is a new nav item going live.
No flag needed — an incomplete PR simply does not flip `built:true`.

---

## §10 Do-Not-Touch

Exact paths the implementer must not modify:
- **Every acceptance-test file** authored by Claude in §5: `api/tests/test_predict_api.py`
  (the new T9.* cases), all `web/src/features/predictive/*.test.tsx|ts`,
  `web/src/screens/PredictiveAnalyticsScreen.test.tsx`, and all `e2e/tests/*.spec.ts`.
- `web/src/routes/router.test.tsx`, `web/src/a11y.test.tsx` (must keep passing, not edited to pass).
- The model itself: `ml/pwa_ml/train.py`, `lifecycle.py`, `features.py`, `predict.py`
  (read-only; F3 touches ONLY the `CORPUS_SEED` constant in `datasets.py`, no logic).
- `ml/artifacts/model_card.json` (read, never write).
- Any `infra/db/*.sql` (no migration this cycle).
- The pipeline/twin feature dirs (`web/src/features/pipeline/*`, `features/twin/*`) except by
  import. PR-9 reuses `SimulatedBadge`, `StatusChip`, `ui/*`, `api/client`, `lib/format` — imports only.
- `simulator/app/*` (PR-17 drives it via FAULT_MODE env only — no code change).

---

## §11 Open items for the Codex adversarial pass (Phase 3)
Attack targets I most want challenged: (a) FN3 two-dataset scoring — is `build_corpus` truly
deterministic & file-free at runtime, and does `rows[-24:]` guarantee `>=MIN_WINDOW_HOURS`
contiguous rows? (b) does flipping `built:true` silently change any *other* existing test's
expectations beyond router/a11y? (c) is scoring the reserved demo lifecycles at runtime a
train/test leak risk, or is it exactly the shipped-artifact test's own path? (d) E2E ordering
hazards: scenario specs that leave `FAULT_MODE` non-normal and contaminate later specs.

---

## §12 Codex adversarial pass — findings & dispositions (Phase 3/4)

Ran `gpt-5.6-sol` xhigh, read-only, on the drafted plan (`scratchpad/codex-plan-attack.md`).
14 findings; **13 accepted, 1 accepted-with-reframe**. Confirmed clean: `build_corpus` is
deterministic & file-free; `rows[-24:]` is 24 contiguous rows (not `nodata`); no new train/test
leak; the card IS in the image; CORS is fine; `e2e/*.spec.ts` is NOT swept by web vitest/tsc/eslint.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| C1 | CRIT | E3.4 "re-GET proves persistence" — **there is no `GET /api/feedback`** | **ACCEPT.** Drop the re-GET. E3.4's oracle = the `FeedbackAck` body (`id>0`, `stored:true`, `created_at`) — which is *exactly* the persistence proof the backend was built to give (predict.py:156 docstring) — plus assert the `POST /api/feedback` op is in `/openapi.json`. **No new route.** |
| C2 | CRIT | E2E shares one mutable simulator + persistent volumes; Playwright parallel; only E1.5 resets | **ACCEPT.** Playwright `workers:1`, `fullyParallel:false`. Global setup/teardown + per-spec `afterEach` resets `FAULT_MODE→normal` with **observable** completion (poll status). **Delta-based counters** (assert received/DLQ *increased* from a captured baseline, never absolute). `make demo-e2e` runs `compose down -v` under a **bash trap** so teardown runs on failure. → revises G6/G8/G10 + every scenario E-spec. |
| H1 | HIGH | FN1 card↔model parity: `MODEL_PATH` can select any artifact; `Bundle` has no source path; a fallback card could pair with the wrong model | **ACCEPT.** In `main.py` lifespan, stash `app.state.model_card` = `read_model_card(resolve_model_path(settings.model_path).parent)` next to the **resolved** bundle, and assert `card["model_version"]==bundle.model_version` (else leave it None → 503). FN1 reads `app.state.model_card`, never re-resolves. → **new files in §3: `api/app/main.py` MODIFY, `api/app/model.py` (reuse exported `resolve_model_path`, no change)**; new test T9.2c (parity). |
| H2 | HIGH | FN3 scores a **post-failure, out-of-training-domain** degraded window (`rows[-24:]`) — "model-integrity theatre" | **ACCEPT (reframe).** Mirror the repo's OWN canonical A/B test verbatim: `ml/tests/test_model.py::test_health_and_pttf_separate_materially_on_the_holdout_datasets` scores `healthy.rows[:24]` and `degraded.rows[-24:]` and requires **≥15-pt** separation. FN3 uses those exact windows + `build_corpus(CORPUS_SEED)`, and a code comment cites that test as the blessed path. The extrapolation nuance is already disclosed in the card's `limitations`. |
| H3 | HIGH | `lru_cache` on `Bundle` (frozen dataclass w/ dicts) raises `TypeError`; caching by `model_version` conflates artifacts | **ACCEPT.** No `lru_cache` on `Bundle`. Memoize in a module-level `dict[str, list[DatasetScore]]` keyed on the **resolved model path string** (hashable, unique per artifact). FN3 signature: `score_demo_datasets(bundle, cache_key: str)`. |
| H4 | HIGH | T9.2 vacuous — hardcoded `{90,10}` passes without `score_window` | **ACCEPT.** T9.2 hits the real endpoint (→ real `score_window` on reserved ids through the loaded artifact); asserts status∈{normal,warning,critical} (not nodata), `healthy.health - degraded.health >= 15.0`, `healthy.pttf_hours >= degraded.pttf_hours`, and `lifecycle_id`s == the reserved pair. |
| H5 | HIGH | E3.3 can pass while model→twin is broken — an anomaly already emits a raw `status` event; UI shows max severity | **ACCEPT.** E3.3 correlates the twin change with the **health API**: poll `GET /api/health/{asset}` until `health_score < WARNING_BELOW`, take t0 there, then assert the twin DOM reaches a health-derived status < 30s. Comment documents the raw-status confound; the health-API correlation is what makes it non-vacuous. |
| H6 | HIGH | FN7 wrong: real `getJson(path, init)` forwards `RequestInit`; plan omitted path/`JSON.stringify`/`Content-Type` | **ACCEPT.** FN7 = `getJson<FeedbackAck>("/api/feedback", { method:"POST", body: JSON.stringify(req), headers:{ "Content-Type":"application/json" }, signal })`. T9.6 asserts the actual fetch call (url, method, body, header), not a bare resolved value. |
| H7 | HIGH | Cold-start not self-contained: no `e2e/pnpm-lock.yaml`, no dep/Chromium install; only `infra/docker-compose.yml` (needs `-f`); teardown must be trapped | **ACCEPT.** Add **G-lock `e2e/pnpm-lock.yaml`**; `make e2e-setup` runs `pnpm --dir e2e install --frozen-lockfile` + `playwright install --with-deps chromium`; every compose call uses `-f infra/docker-compose.yml`; teardown under trap (see C2). |
| M1 | MED | E1.3 timing: `/latest` emits only `db;dur=…` (no "total"); a global `page.on(response)` may catch poll traffic | **ACCEPT.** Bind the listener to the specific test-owned request URL; take round-trip from `response.request().timing()`; assert `db;dur` from Server-Timing on **that** response only. |
| M2 | MED | E2.1/E2.5 weak — `<svg>`+viewBox ≠ "no raster blur"; importing `twin.config` proves nothing | **ACCEPT.** E2.1: assert the schematic has vector primitives (`path`/`rect`/`circle`/`line`) and **no `<image>`**, and viewBox changes on zoom. E2.5 is inherently an IDE/manual item → runbook shows config+components in the IDE; E2E only corroborates that ≥3 distinct twin components render at runtime. Stated as manual-primary. |
| M3 | MED | §3 omits its own test files + fixtures | **ACCEPT.** Add test-file + fixture rows to §3 (below). |
| M4 | MED | "single home for seed" false — test literals remain | **ACCEPT (narrowed).** Canonical `CORPUS_SEED` lives in `ml/pwa_ml/datasets.py`; API + the two **non-test** scripts import it. Existing **test** literals left as independent guards (touching them = editing tests; out of scope). Noted, not hidden. |
| M5 | MED | NAV impact undercounted — `AppShell.test`/`pipelineWiring.test` also eval the route tree | **ACCEPT.** The gate is the **full `pnpm test`**, not T9.9 alone; §10 lists `AppShell.test.tsx` + `pipelineWiring.test.tsx` as must-still-pass. |
| L1 | LOW | `cd api && pytest` isn't "unit" (integration included unless deselected) | **ACCEPT.** §0 corrected: unit = `pytest -m 'not integration'`; integration = `pytest -m integration`. |

### §12 deltas folded into the contract

**§0 test commands (corrected):** backend unit `cd api && pytest -m 'not integration'`;
backend integration `cd api && pytest -m integration` (needs TimescaleDB); E2E `cd e2e && pnpm test`.

**§3 additions/changes:**
- F1a `api/app/main.py` MODIFY (lifespan L142 area) — stash `app.state.model_card` from the
  **resolved** artifact dir with a version-parity check (H1).
- F3 `ml/pwa_ml/datasets.py` MODIFY — add canonical `CORPUS_SEED = 20260729` **and** score-window
  export note; FN3 uses `build_corpus`+`[:24]`/`[-24:]` (H2/M4). (F4/F5 script dedup kept.)
- Test/fixture rows (M3): `api/tests/test_predict_api.py` (append T9.1–T9.3, +T9.2c parity),
  `web/src/features/predictive/predictiveClient.test.ts`, `predictiveComponents.test.tsx`,
  `predictiveHooks.test.tsx`, `predictiveWiring.test.tsx`,
  `web/src/screens/PredictiveAnalyticsScreen.test.tsx`, `web/src/mocks/predictive.ts` (typed
  fixtures), `e2e/lib/state.ts` (baseline/reset fixture), `e2e/global-setup.ts`.
- G-lock `e2e/pnpm-lock.yaml` CREATE (H7).

**§4 corrected contracts:**
- **FN1** reads `app.state.model_card` (set in F1a) — no in-handler card resolution; 503 when
  `app.state.bundle is None` **or** `app.state.model_card is None`.
- **FN3** `score_demo_datasets(bundle: Bundle, cache_key: str) -> list[DatasetScore]`:
  `build_corpus(seed=CORPUS_SEED)`; `score_window(bundle, corpus.demo_healthy.rows[:24])` and
  `score_window(bundle, corpus.demo_degraded.rows[-24:])`; module-level memo keyed on `cache_key`
  (resolved model path). Order `[healthy, degraded]`. Mirrors test_model.py:97.
- **FN7** as in H6.

**§5 corrected tests:** T9.2 (H4), +T9.2c parity (H1), T9.6 (H6). E-specs E1.3/E2.1/E2.5/E3.3/E3.4
revised per M1/M2/H5/C1; **all scenario specs reset `FAULT_MODE→normal` and use delta counters** (C2).

**§10 additions:** `AppShell.test.tsx`, `pipelineWiring.test.tsx` (must-still-pass, M5).

### Stop-line decisions (Phase 2a, recorded here)
- **S9-A → Claude implements (no delegation).** Q0-adjacent: the slice is small (1 route, ~4
  models, one scoring helper) but carries **model-integrity subtlety** Codex flagged (H1 parity,
  H2 correct windows, H3 memoization) where a weak delegate is high-risk and the token saving is
  negligible. Per the caveat "DeepSeek ≠ Claude on subtle logic," keep it. TDD per Phase 2c-ter.
- **S9-B/C/D → SL-2, DeepSeek-eligible** (Q2: new exports/types consumed by the screen; strong
  vitest+tsc+eslint oracle over typed seams). Re-confirmed per slice at implementation time.
- **S9-E, all of PR-17 → Claude** (wiring judgment; scripts touch infra; Playwright specs ARE the
  acceptance oracle — never delegated).
