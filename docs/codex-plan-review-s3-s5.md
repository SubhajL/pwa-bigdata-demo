## 1. Which files does the plan miss?

- **CRITICAL — S5 has no deployable inference path.** Compose builds only `../api` ([docker-compose.yml:78](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/docker-compose.yml:78)); the image copies only API requirements and `api/app` ([api/Dockerfile:3](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/Dockerfile:3)); API dependencies contain no sklearn/numpy/joblib ([requirements.txt:1](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/requirements.txt:1)). Missing: `api/Dockerfile`, `api/requirements.txt`, `infra/docker-compose.yml`, model-path settings in `api/app/config.py` and `infra/env.sample`, or an explicit `ml/Dockerfile`/training service. Host-side ML tests can pass while the demo container raises `ModuleNotFoundError` or cannot find `model.pkl`.  
  **Fix:** Package ML under a non-`app` import name, install/copy it and the verified artifact into the API image, and smoke-test inference inside that image.

- **CRITICAL — browser WS/API addressing is unwired.** The frontend’s API is port 8000, but `wsTwin` is the relative path `/ws/twin` ([app.config.ts:2](/Users/subhajlimanond/dev/pwa-bigdata-demo/web/src/config/app.config.ts:2)); Vite has no proxy ([vite.config.ts:5](/Users/subhajlimanond/dev/pwa-bigdata-demo/web/vite.config.ts:5)). A browser opened on port 5173 therefore sends the WS connection to Vite, not FastAPI. The API also has no configured CORS middleware ([main.py:108](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/main.py:108)). Missing: `web/src/config/app.config.ts`, `web/vite.config.ts`, allowed-origin settings, `infra/env.sample`, and Compose environment wiring.  
  **Fix:** Add explicit `VITE_WS_BASE` or a Vite `/ws` proxy, configure allowed HTTP origins, and prove connection from a real browser.

- **HIGH — DLQ pagination needs a contract and migration.** `DeadLetter` omits `id` and `created_at` ([models.py:38](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/models.py:38)), although the table has both ([001_init.sql:38](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/db/001_init.sql:38)); the only DLQ index added later is on `run_id` ([002_ingest_identity.sql:19](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/db/002_ingest_identity.sql:19)). Missing: `api/app/models.py` and `infra/db/003_dlq_browse.sql` with `(created_at DESC, id DESC)`. Offset-only pagination will duplicate or skip records during active ingestion.  
  **Fix:** Return `id`/`created_at`, use cursor pagination with a deterministic tie-breaker, and add the matching index.

- **HIGH — artifact tracking is self-defeating.** Currently only `*.pkl` is ignored ([.gitignore:22](/Users/subhajlimanond/dev/pwa-bigdata-demo/.gitignore:22)); F5g proposes ignoring the entire artifact directory except a `.gitkeep` it does not create. That discards the model card and leaves a fresh clone with neither scored artifact nor training-on-start wiring.  
  **Fix:** Commit or image-package the exact demo artifact and card, retain `.gitkeep`, and verify the artifact SHA recorded by the card.

- **MEDIUM — support/wiring files are absent from the change contract.** Missing: `ml/app/__init__.py`—preferably a renamed `ml/pwa_ml/__init__.py` to avoid the existing top-level `app` collision documented in [conftest.py:30](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/tests/conftest.py:30)—a dataset generator/manifest, `api/tests/conftest.py` for a real HTTP server and large multi-chunk seed, `api/tests/test_routes.py` for registration proof, and `CLAUDE.md` for the ML gate command. The current registration test knows only the two existing routes ([test_routes.py:31](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/tests/test_routes.py:31)), while the documented gates mention only API, simulator, and web ([CLAUDE.md:23](/Users/subhajlimanond/dev/pwa-bigdata-demo/CLAUDE.md:23)).  
  **Fix:** Add the package, generator manifest, live-server fixtures, route-table assertions, and an explicit `cd ml && pytest/ruff/mypy` gate.

## 2. Which §4 function contract is wrong or underspecified?

- **CRITICAL — FN-S5-4 is internally inconsistent.** It fits two estimators—health and PTTF—but records and verifies singular “algorithm class” and `get_params()`. This permits `model.pkl = {"health": fitted_model}` while `score_window()` computes `pttf = health / 100 * H`; the card and TS5.1 agree with the health estimator, TS5.2 sees differing PTTF, yet no PTTF model was trained. Preprocessing, estimator-to-target mapping, censoring behavior, and artifact identity are also unspecified.  
  **Fix:** Define a typed serialized bundle containing named health and PTTF pipelines, and require the card/test to verify each pipeline, target, preprocessing graph, censoring policy, feature schema, and artifact SHA independently.

## 3. Which §5 test passes a broken feature?

- **CRITICAL — TS5.3 passes heuristic theatre.** This implementation passes because the fixture makes exactly one signal out of band, returns a non-empty sorted list, and never touches the serialized model:

```python
def rca(_model, rows):
    deviation = normalized_deviation_from_fixed_bands(rows)
    top = max(deviation, key=deviation.get)
    return [(top, deviation[top])]
```

  The repo already exposes convenient hard-coded physical bands to copy ([simulator models.py:32](/Users/subhajlimanond/dev/pwa-bigdata-demo/simulator/app/models.py:32)). This is anomaly-rule lookup, not “RCA from the AI model.”  
  **Fix:** Hold rows constant while changing the loaded model and require RCA to change consistently with prediction deltas; also require two different counterfactual anomalies to reverse the top-signal ranking.

## 4. What ordering hazard exists?

- **CRITICAL — S3 freezes the wrong wire contract before S5/S6 need it.** Current `TwinEvent` carries only `kind`, `asset_id`, categorical `status`, and timestamps ([models.py:47](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/models.py:47)); it cannot carry `health_score`, PTTF, RCA/model version, or a raw telemetry signal/value. The database already expects PTTF and model version ([001_init.sql:63](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/db/001_init.sql:63)). Landing clients against this shape forces a breaking WS change later.  
  **Fix:** Define a versioned discriminated event union now—telemetry/status versus health-scored events—with the fields S6 will actually publish.

- **CRITICAL — S3 does not define commit → emit → ACK semantics.** `disposition()` returns `False` for redelivery ([db.py:165](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/db.py:165)), but `dispose_message()` discards that result and returns `True` for any successful storage call ([service.py:123](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/service.py:123)). Hooking broadcast to that boolean emits DLQ messages and duplicate redeliveries as fresh twin events; letting broadcast affect ACK can cause replay storms.  
  **Fix:** Return an explicit `NewAccepted(reading) | Duplicate | Rejected | Failed` result, broadcast only `NewAccepted` after commit, and make ACK independent of WS success.

- **CRITICAL — S5 trains before deciding how the artifact reaches production.** Tests can create the ignored artifact on the host, pass, and leave Compose with no artifact or ML code at startup.  
  **Fix:** Decide packaging first, then order generation → grouped validation → artifact/card hashing → image build → container inference smoke.

## 5. What repo assumption is factually false?

- **CRITICAL — an accepted `Reading` cannot be emitted as the existing `TwinEvent`.** `Reading` has `signal` and `value` but no status ([models.py:22](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/models.py:22)); `TwinEvent` requires status and has no signal/value ([models.py:47](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/models.py:47)). No threshold/event factory exists in the API.  
  **Fix:** Specify and implement the conversion contract or carry telemetry as a distinct event type.

- **CRITICAL — `ml/app/predict.py` is not a production load path for this repo.** The production API image cannot see `ml/`, does not install its dependencies, and has no artifact mount or copy step ([api/Dockerfile:3](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/Dockerfile:3), [docker-compose.yml:78](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/docker-compose.yml:78)).  
  **Fix:** Prove the claimed production loader from inside the Compose API container, not from an ML-only virtualenv.

- **HIGH — database reads are not available independently of MQTT.** The pool is created only when `MQTT_ENABLED` is true ([main.py:84](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/main.py:84)); otherwise retrieval returns 503 ([telemetry.py:30](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/routes/telemetry.py:30)).  
  **Fix:** Decouple database availability from subscriber enablement and test retrieval with MQTT disabled.

## 6. Attack on latency requirement 1.3

- **CRITICAL — TestClient is not the scored client.** It bypasses DNS, TCP, Docker port forwarding, Uvicorn’s socket stack, browser scheduling, CORS handling, and body transfer. A 30 ms TestClient call can still be a visibly slow or unusable browser request.  
  **Fix:** Measure against the running Compose API from a browser, timing through response-body consumption with cache disabled.

- **HIGH — warmup and averaging conceal cold latency.** If the first request takes 2,000 ms for connection/pool setup and the next nineteen take 20 ms, the mean is only 119 ms. The test passes while the judge’s first click visibly takes two seconds.  
  **Fix:** Report cold-first latency separately and calculate the required mean over a clearly documented browser sequence that includes the connection policy used during judging.

- **CRITICAL — a tiny or empty table makes the full-scan implementation pass.** Even `query_range(asset, datetime.min, datetime.max)[-1]` can pass TS3.1 and TS3.2 on a three-row fixture. The existing index is appropriate ([001_init.sql:27](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/db/001_init.sql:27)), but the test neither proves its use nor defines realistic row/chunk volume.  
  **Fix:** Seed substantial data across multiple TimescaleDB chunks, assert the intended `EXPLAIN (ANALYZE, BUFFERS)` plan, then measure the HTTP endpoint.

- **HIGH — latest-ever has no chunk-exclusion predicate.** A range query can exclude chunks because it has time bounds ([db.py:53](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/db.py:53)); `ORDER BY ts DESC LIMIT 1` over all history may still incur planning/index work across many chunks. One warm recent chunk does not represent years of data.  
  **Fix:** Test multiple chunks explicitly and either accept/prove latest-ever performance or define a bounded freshness window with a no-data response.

- **CRITICAL — synchronous DB calls block the single event loop.** Existing routes are `async` but directly call synchronous psycopg ([telemetry.py:20](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/routes/telemetry.py:20), [db.py:191](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/db.py:191)); Compose runs one worker ([docker-compose.yml:80](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/docker-compose.yml:80)). Under slow queries or pool contention, HTTP freezes WS broadcasting and ingest scheduling. Sequential latency calls will not expose this.  
  **Fix:** Use synchronous FastAPI handlers/thread offloading or async psycopg, then measure HTTP while ingest and a stalled WS client are active.

- **HIGH — the header proves nothing.** TS3.1 checks only that `Server-Timing` exists; `Server-Timing: db;dur=0` passes. A judge sees Queueing/Stalled, connection setup, Request Sent, Waiting/TTFB, Content Download, total Duration, possible CORS failure, and twenty individual rows—not the pytest mean. The scored requirement is explicitly browser-visible ([POC_SPEC.md:243](/Users/subhajlimanond/dev/pwa-bigdata-demo/POC_SPEC.md:243)).  
  **Fix:** Generate twenty cache-busted browser requests, calculate their arithmetic mean from browser timings, and retain the Network-panel evidence; treat `Server-Timing` as diagnostic only.

## 7. Attack on the ML slice

- **CRITICAL — PTTF is not proven to be learned.** A known synthetic `failure_hour` creates labels; it does not prove inference learned time-to-failure. Worse, `H` for a non-failing lifecycle is a lower bound, not an observed failure time. Treating every censored `H` as an exact regression target trains systematic bias toward the horizon.  
  **Fix:** Specify censor-aware training—or train only on uncensored targets with an explicit censored/lower-bound output—and validate on lifecycle-group holdouts.

- **CRITICAL — degenerate health/PTTF passes.** `health = 100 - ε·mean(vibration)` and `pttf = health·H/100` satisfy `health(A)>health(B)` and `pttf(A)>pttf(B)` for any positive ε. No test requires material separation, calibration, holdout accuracy, or improvement over a dummy baseline. `empty -> 0.0` in `window_features` additionally converts missing telemetry into a confident score.  
  **Fix:** Require complete/fresh windows or `nodata`, minimum meaningful separation, grouped holdout metrics, calibration bounds, and superiority to `DummyRegressor`.

- **CRITICAL — RCA is not established as local attribution.** Raw linear coefficients are global parameters, not anomaly contributions; valid local linear contributions require a baseline and `coefficient × transformed-feature delta`. Tree `feature_importances_` is also global. A preprocessing pipeline makes raw coefficient-to-signal mapping even easier to mislabel.  
  **Fix:** Compute signed per-window counterfactual prediction deltas through the loaded serialized pipeline, aggregate transformed features back to source signals, and test ranking reversal across anomaly types.

- **CRITICAL — the planned data use invites direct leakage.** Committing generated CSV is not itself leakage. Using `lifecycle_a/b` both as inputs to `train(datasets)` and as the two R3.2 inference demonstrations is. Randomly splitting overlapping windows from the same deterministic trajectory is equally leaky; adjacent windows share almost all rows and the same failure time. Two lifecycles are not enough for credible train/validation/test separation.  
  **Fix:** Generate many independent lifecycle IDs/seeds, split strictly by lifecycle, reserve the two demo datasets from all training/tuning, and record split IDs and hashes.

- **HIGH — the model card is not falsifiable.** “Validation metrics” without target definitions, units, split membership, baseline, acceptance thresholds, censor fraction, or evaluation dataset IDs can truthfully report a useless RMSE. Data hashes establish identity, not validity. It also omits an explicit synthetic-data declaration required by repo policy ([CLAUDE.md:34](/Users/subhajlimanond/dev/pwa-bigdata-demo/CLAUDE.md:34)).  
  **Fix:** Record generator/code/artifact hashes, seeds, exact feature and target definitions, horizon/censor treatment, lifecycle-group splits, baseline and holdout metrics with pass thresholds, limitations, and `SIMULATED`.

- **HIGH — offline hourly lifecycle data does not match live inference.** The simulator has 238 devices ([roster.py:99](/Users/subhajlimanond/dev/pwa-bigdata-demo/simulator/app/roster.py:99)), publishes one device per tick ([publish.py:176](/Users/subhajlimanond/dev/pwa-bigdata-demo/simulator/app/publish.py:176)), and defaults to 5 Hz ([config.py:38](/Users/subhajlimanond/dev/pwa-bigdata-demo/simulator/app/config.py:38)). One asset arrives roughly every 47.6 seconds; the same pump signal roughly every 238 seconds. The plan defines no asset isolation, resampling, power/flow timestamp skew, freshness, or missing-signal policy.  
  **Fix:** Define the production feature-window contract and add a dense named scenario proving MQTT → DB → aligned features → loaded model → score without stale or cross-asset data.