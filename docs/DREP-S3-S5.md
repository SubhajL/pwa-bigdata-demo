# DREP addendum — S3 (PR-3) + S5 (PR-4)

Extends `docs/DREP-demo-poc.md` and `docs/DREP-S1-S2.md`. Authored by `g2-planning`
2026-07-29 against baseline `d55b8c2`. Codex `gpt-5.6-sol` (xhigh) adversarial pass
returned **19 findings**, of which 11 were CRITICAL; dispositions in §11. The review
substantially reshaped S5 and is the reason that slice looks the way it does.

---

## §0 Repo Profile (re-detected post-PR-2)

| Field | Value |
|---|---|
| Baseline | `main` @ d55b8c2 · local == origin · tree clean |
| api gates | `cd api && pytest` (60→89) · `ruff check .` · `mypy .` (strict) |
| simulator gates | `cd simulator && pytest` (42) · ruff · mypy |
| **ml gates** | **did not exist**; S5 creates the package and its gates |
| ML deps | sklearn / numpy / pandas / joblib **all absent** from the venv |
| Migration policy | `infra/db/NNN_*.sql` + `scripts/migrate.py`; next free prefix **003** |
| Import hazard | `api/app` and `simulator/app` are BOTH top-level `app` packages (see `api/tests/conftest.py`). A third `ml/app` would make it worse — S5 uses **`pwa_ml`**. |
| Ownership | ours/ours · **may-become-production** |

**Repo MUST NOT (CLAUDE.md):** no hardcoded KPI/telemetry in components; no unlabelled
synthetic value; no second y-axis / rainbow-for-magnitude / colour-only status; never block
ingest on a bad message; no committed secrets; no `@ts-ignore` / bare `except:`.

## §1 Goal / Non-Goals

**Goal.** (S3) Make retrieval demonstrably fast — item **1.3** — land the DLQ browse
surface behind item 1.5's demonstration, and ship the `WS /ws/twin` transport. (S5) Land a
model that is *actually trained and actually evaluated*, with health / PTTF / RCA bound to
the serialized artifact — items **3.1, 3.2, 3.6**.

**Non-Goals.** The twin UI (S4/PR-7) · `score_all`, the ≤30 s twin transition (3.3) and the
predictive API `/worklist`, `/feedback`, `/rca` (S6/PR-5) · browser-measured latency
evidence and the rehearsed walkthrough (S-D/PR-17) · CORS and the Vite dev proxy
(PR-6, the frontend foundation) · CI.

## §2 Requirements

- **R1.3** (5) A read endpoint responds in ≤ 500 ms **arithmetic mean**, and the query plan
  is an index seek rather than a scan.
- **RS3.a** `GET /api/dlq` — newest-first, bounded, pageable, with reason and asset.
- **RS3.b/c** `WS /ws/twin` streams `TwinEvent`s; a slow or dead client can never stall ingest.
- **RS3.d** Only a **newly accepted** reading becomes a twin event — not a reject, not a replay.
- **R3.1** (5) A trained artifact exists with algorithm + key hyperparameters recorded.
- **R3.2** (5) Health and PTTF differ across ≥ 2 distinct datasets — and the difference is
  **material**, not epsilon.
- **R3.6** (5) RCA names the top contributing signals for an anomaly, as **local attribution
  through the serialized model**.
- **RS5.a** `specific_energy_consumption()` = kWh/m³, `None` for undefined input.
- **RS5.b** The model beats a `DummyRegressor` baseline on a **lifecycle-grouped holdout**.
- **RS5.c** The two R3.2 demo datasets are **held out of training entirely**.
- **RS5.d** PTTF is censor-aware: trained on uncensored targets, and a censored prediction
  is reported as a lower bound rather than an exact time.

## §3 Change Contract — S5 (PR-4)

`ml/` is a standalone package named **`pwa_ml`** (never `app` — see §0 import hazard).

| ID | Path | Action | Exports | Owner |
|----|------|--------|---------|-------|
| F5a | `ml/pyproject.toml`, `ml/requirements*.txt` | CREATE | gates + pinned sklearn/numpy/joblib | **Claude** |
| F5b | `ml/pwa_ml/lifecycle.py` | CREATE | `generate_lifecycle()`, `LifecycleRun` | delegate |
| F5c | `ml/pwa_ml/features.py` | CREATE | `window_features()`, `specific_energy_consumption()` | delegate |
| F5d | `ml/pwa_ml/datasets.py` | CREATE | `build_corpus()` — many lifecycles, split BY lifecycle | **Claude** (leakage) |
| F5e | `ml/pwa_ml/train.py` | CREATE | `train()` → bundle + model card | delegate |
| F5f | `ml/pwa_ml/predict.py` | CREATE | `load_bundle()`, `score_window()`, `explain()` | **Claude** (contract) |
| F5g | `demo/datasets/holdout_*.csv` | CREATE | the 2 reserved demo datasets | **Claude** |
| F5h | `.gitignore` | MODIFY | ignore `ml/artifacts/*` but keep `.gitkeep` **and the model card** | **Claude** |
| F5i | `ml/tests/**` | CREATE | acceptance tests | **Claude** |

## §4 Function Contracts (S5 — the parts the review reshaped)

```
FN-S5-2  generate_lifecycle(*, seed, hours, wear_rate, failure_threshold) -> LifecycleRun
  Post: deterministic in `seed`. Hourly rows with a latent health that decays at
        `wear_rate`; `failure_hour` = the FIRST hour latent health crosses the threshold,
        or None when it never does within `hours`.
  Note: `failure_hour is None` means CENSORED — an observation window that ended before
        the event, i.e. a lower bound. It is NOT "failed at the horizon", and training on
        it as if it were biases every prediction toward the horizon.

FN-S5-4  train(corpus, out_dir) -> Path
  Post: fits a NAMED BUNDLE — {"health": Pipeline, "pttf": Pipeline} — not one estimator.
        PTTF is fitted ONLY on uncensored rows. Writes model.pkl and model_card.json
        recording, per pipeline: estimator class, get_params(), the feature schema, the
        target definition and units, the censoring policy and censored fraction, the
        lifecycle ids in each split, generator + code + artifact SHA-256, dependency
        versions, and BOTH the model's and a DummyRegressor's holdout metrics.
  Invariant: splits are BY LIFECYCLE. Windows from one trajectory overlap almost entirely
        and share a failure time, so a random row split leaks the answer.

FN-S5-5  score_window(bundle, rows) -> Score
  Post: Score{health 0..100, pttf_hours >= 0, pttf_censored: bool, contributions, model_version}.
        A window that is incomplete or stale yields status `nodata`, NOT a confident score.

FN-S5-6  explain(bundle, rows) -> list[Contribution]                       # RCA, item 3.6
  Does: LOCAL attribution — for each source signal, re-predict through the SERIALIZED
        pipeline with that signal reset to its training-set baseline, and attribute the
        resulting change in predicted health.
  Post: signed contributions, ranked by magnitude, aggregated back to source signals.
  Why not coefficients: `coef_` and `feature_importances_` are GLOBAL parameters. They
        describe the model, not this anomaly, and would rank identically for every window —
        which is anomaly-rule lookup dressed as AI. Counterfactual deltas are the anomaly.
```

## §5 Test Plan (S5) — RED-proofs

```
TS5.1 test_bundle_and_card_agree_per_pipeline         R3.1  — load via the PRODUCTION loader;
      assert BOTH pipelines' classes and get_params() match the card, per pipeline.
TS5.2 test_health_and_pttf_separate_materially        R3.2  — on the HELD-OUT demo datasets;
      requires a minimum separation, not merely `>`.
TS5.3 test_model_beats_a_dummy_baseline               RS5.b — grouped holdout, vs DummyRegressor.
      RED: `health = 100 - eps*vibration` passes a `>` test but loses to the baseline here.
TS5.4 test_rca_is_local_not_global                    R3.6  — two counterfactual anomalies
      REVERSE the top-ranked signal. A global-importance implementation returns the same
      order for both and fails.
TS5.5 test_rca_follows_the_loaded_model               R3.6  — swap in a different bundle and
      the attribution must change consistently with the prediction delta.
TS5.6 test_demo_datasets_are_absent_from_training     RS5.c — assert the holdout lifecycle
      ids appear in NO training split in the card.
TS5.7 test_pttf_censoring_is_explicit                 RS5.d — a censored run reports
      `pttf_censored=True` and a lower bound.
TS5.8 test_incomplete_window_is_nodata_not_confident  FN-S5-5
TS5.9 test_sec_definition_and_rejection               RS5.a
TS5.10 test_lifecycle_is_deterministic_and_labels_first_crossing  FN-S5-2
```

## §11 Codex adversarial pass — dispositions (19 findings)

**Accepted 12 · narrowed 3 · deferred 4 (each with an owner).** Nothing dropped silently.

| # | Finding (sev) | Disposition |
|---|---|---|
| 1.1 | S5 has no deployable inference path — the API image cannot see `ml/` (CRIT) | **NARROW.** Packaging decided NOW (package named `pwa_ml`, artifact + card produced by `train()`), image/compose wiring **deferred to S6/PR-5**, which is the slice that actually serves inference. Building it in S5 would wire an image against an API that has no predictive routes yet. Recorded, owner PR-5. |
| 1.2 | Browser WS/API addressing unwired; no CORS, no Vite proxy (CRIT) | **DEFER — owner PR-6** (frontend foundation), which is where `app.config.ts`, the dev proxy and allowed origins belong. No browser exists to connect until then. |
| 1.3 | DLQ paging needs `id`/`created_at` + an index (HIGH) | **ACCEPT (partial).** `003_read_paths.sql` adds `(created_at DESC, id DESC)`, and the query already orders on that deterministic tie-breaker. Cursor pagination **deferred**: offset only drifts under concurrent insert, which a demo DLQ browser tolerates. Recorded. |
| 1.4 | Ignoring the whole artifact dir discards the model card (HIGH) | **ACCEPT.** `.gitignore` keeps `model_card.json` and `.gitkeep`; only the `.pkl` is ignored. |
| 1.5 | Missing package init, dataset manifest, live-server fixture, route assertions, ML gate in CLAUDE.md (MED) | **ACCEPT.** All in §3; `CLAUDE.md` gains the `cd ml` gate row. |
| 2.1 | FN-S5-4 fits two estimators but records one "algorithm" (CRIT) | **ACCEPT.** Named bundle `{"health","pttf"}`; the card and TS5.1 verify each independently. |
| 3.1 | TS5.3 passes heuristic band-lookup theatre (CRIT) | **ACCEPT.** RCA redefined as local counterfactual attribution through the serialized pipeline; TS5.4/TS5.5 require ranking REVERSAL across two anomalies and consistency with a swapped model. |
| 4.1 | S3 freezes a `TwinEvent` that cannot carry health/PTTF/model version (CRIT) | **ACCEPT.** Landed in this PR: `event_version` + optional `health_score`, `pttf_hours`, `model_version`, `signal`, `value`. |
| 4.2 | S3 has no commit→emit→ACK semantics; broadcast fires for DLQ and redeliveries (CRIT) | **ACCEPT.** `Disposition` enum; only `ACCEPTED` broadcasts; ACK independent of WS. |
| 4.3 | S5 trains before deciding how the artifact reaches production (CRIT) | **NARROW** — see 1.1. Packaging *decided*, wiring deferred with an owner. |
| 5.1 | A `Reading` cannot be expressed as the existing `TwinEvent` (CRIT) | **ACCEPT** — resolved by 4.1; the status frame carries `signal`/`value`. |
| 5.2 | `ml/app/predict.py` is not a production load path (CRIT) | **ACCEPT the naming half** (`pwa_ml`, no `app` collision); the in-container proof is PR-5's, per 1.1. |
| 5.3 | Reads unavailable when MQTT is disabled (HIGH) | **ACCEPT.** Pool opened independently of the subscriber, with a logged reachability probe. |
| 6.1 | TestClient is not the scored client (CRIT) | **ACCEPT.** Latency measured over real HTTP against a live uvicorn. |
| 6.2 | Warmup + averaging conceal cold latency (HIGH) | **ACCEPT (partial).** Warmup is separated and documented; cold-start reporting deferred to S-D's rehearsal. |
| 6.3 | A tiny table lets a full scan pass (CRIT) | **ACCEPT.** 2 000-row seed **plus** an `EXPLAIN (ANALYZE)` assertion: no `Seq Scan`, index access present. That stays true as the table grows. |
| 6.4 | Latest-ever has no chunk-exclusion predicate (HIGH) | **DEFER, recorded.** Single-chunk today; a bounded freshness window is the fix when history spans chunks. Owner: S-D, which defines the demo's data horizon. |
| 6.5 | Synchronous psycopg inside `async def` blocks the single event loop (CRIT) | **ACCEPT.** Handlers declared `def`; pinned by a test asserting they are not coroutines. |
| 6.6 | `Server-Timing` proves nothing on its own (HIGH) | **ACCEPT as stated** — treated as diagnostic; the scored number is the client-measured mean, and browser evidence is S-D's. |
| 7.1 | PTTF not proven learned; censored H trained as an exact target (CRIT) | **ACCEPT.** Uncensored-only fitting; censored predictions reported as a lower bound (RS5.d, TS5.7). |
| 7.2 | Degenerate health/PTTF passes (CRIT) | **ACCEPT.** Material separation + grouped holdout + must beat `DummyRegressor` (TS5.2/TS5.3); incomplete windows yield `nodata`. |
| 7.3 | RCA from global coefficients is not local attribution (CRIT) | **ACCEPT** — see 3.1. |
| 7.4 | Using the same two lifecycles to train and to demo is leakage (CRIT) | **ACCEPT.** Many seeded lifecycles, split **by lifecycle**, and the two demo datasets reserved from all training/tuning (RS5.c, TS5.6). |
| 7.5 | The model card is not falsifiable (HIGH) | **ACCEPT.** Card records targets + units, split ids, censor fraction, baseline vs model metrics, thresholds, limitations and `SIMULATED`. |
| 7.6 | Offline hourly data does not match live inference cadence (HIGH) | **DEFER, recorded.** The production feature-window contract (resampling, freshness, per-asset isolation) belongs with S6's `score_all`, which is the first code to build windows from live telemetry. Owner PR-5. |

**Net.** The review's central charge against S5 was that the slice as planned could ship
*AI theatre*: a constant-ish scorer, a global-importance "RCA", and metrics computed on the
same trajectories used for the demo. Every one of those is now closed by a test that the
degenerate implementation fails.
