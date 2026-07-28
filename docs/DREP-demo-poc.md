# DREP — PWA Technical-Demonstration POC (ผนวก ๑๓)

Delegation-Ready Execution Plan for the scored 100-point live demo. Requirements are
keyed to the demo checklist so traceability runs straight to the score.
Companion: `POC_SPEC.md` §4A. Authored by `g2-planning` 2026-07-28.

---

## §0 Repo Profile

| Field | Value |
|---|---|
| Repo root | `/Users/subhajlimanond/dev/pwa-bigdata-demo` (git initialised 2026-07-28) |
| Languages | Python 3.13 (api, simulator, ml) · TypeScript/React 18 (web) |
| Backend test / lint / typecheck | `pytest` · `ruff check .` · `mypy .` |
| Frontend test / lint / typecheck / build | `pnpm test` (vitest) · `pnpm lint` · `pnpm typecheck` (`tsc --noEmit`) · `pnpm build` (vite) |
| Python deps | `venv` + `pip` + `requirements.txt` (uv/poetry absent) |
| Infra | Docker Compose v2 (daemon confirmed up): mosquitto · timescaledb · api · simulator · web |
| Migration policy | SQL files in `infra/db/`, numbered `NNN_name.sql`, applied by TimescaleDB init + an idempotent runner |
| Coding-log | `coding-logs/2026-07-28-2050 Coding Log (demo-poc).md`; pointer `.codex/coding-log.current` |
| Repo / runtime ownership | **ours / ours** |
| Disposition | **may-become-production** → runtime-owning builders (v0/Lovable/Replit/Bolt) disqualified; local/on-prem Docker, not serverless |
| Design profile | `design/manifest.json` `designFrozen:false`; `tokens.map.md` + `INTERACTIONS.md` present & committed |

**Repo MUST NOT list** (from `CLAUDE.md`): no hardcoded telemetry/KPI in components; no
unlabelled synthetic value; no second y-axis / rainbow-for-magnitude / colour-only status;
never block ingest on a bad message (DLQ + continue); no secrets committed; no `@ts-ignore`
/ bare `except:`.

---

## §1 Goal / Non-Goals

**Goal.** Build a locally-runnable POC that passes the ผนวก ๑๓ demo: a real-time data
pipeline (MQTT→validate→DLQ→TimescaleDB→retrieval, ≤500ms, ≤30s reconnect), a live SVG
digital twin, and an AI predictive-maintenance model with a Swagger feedback API — scoring
the 100 technical points that carry 80% of the award.

**Question it answers / afterlife:** *Can we demonstrate all 16 scored items live on a
simulated-but-credible PWA data feed?* If yes, it becomes the demo shown to กปภ. and the
seed of the production build; if a topic can't be made to pass, that topic is cut from the
demo, not faked.

**Non-Goals.** Live SCADA/DMAMA connectivity (simulated broker per ผนวก ๑๓); auth/RBAC;
the role/admin/report/notification dashboards (S1–S3, S5–S7, S9 mockups — proposal-only);
production HA/DR; real customer PII (affected-customer list is synthetic over the real
roster); Vercel deployment.

---

## §2 Requirements — keyed to the demo checklist

Each `R` = one scored line; `Pts` is its demo weight. If it can't be shown live, it scores 0.

**Topic ๑ — Real-time Data Pipeline (35)**
- **R1.1** (5) Subscriber connects to the Mosquitto broker and ingests published device messages continuously.
- **R1.2** (5) On broker disconnect, the subscriber auto-reconnects and resumes within ≤ 30s, shown by a live status indicator.
- **R1.3** (5) A telemetry read endpoint responds in ≤ 500ms average, visible in browser DevTools/Network.
- **R1.4** (10) Valid messages are written to a TimescaleDB hypertable; a time-range query returns them correctly ordered.
- **R1.5** (10) A message with an unknown/invalid Asset ID is routed to a `dead_letter` table automatically and the main ingest loop keeps processing subsequent messages.

**Topic ๒ — Real-time Digital Twin (35)**
- **R2.1** (5) The schematic is SVG; zoom in/out changes scale without raster blur.
- **R2.2** (5) Device status on the twin updates via WebSocket push without a manual refresh.
- **R2.3** (10) When a pump's telemetry crosses an anomaly rule, its symbol changes state and a tooltip shows Specific Energy Consumption (SEC = kWh/m³) computed from that device's live values.
- **R2.4** (10) A pressure-drop event highlights the affected pipe segment on the twin and lists the customers served downstream of it.
- **R2.5** (5) The running app shows a config file and ≥ 3 separated frontend components in the source tree.

**Topic ๓ — AI Predictive Maintenance (30)**
- **R3.1** (5) A trained model artifact exists on disk with its algorithm name and key hyperparameters recorded.
- **R3.2** (5) Health Score and PTTF outputs differ across ≥ 2 distinct input datasets.
- **R3.3** (5) When a device's Health Score drops below threshold, its twin symbol changes state within ≤ 30s.
- **R3.4** (5) A Feedback Loop endpoint is documented in Swagger UI and accepts a real feedback payload (200 + persisted).
- **R3.5** (5) A Prioritized Worklist endpoint returns devices ranked by risk from model output.
- **R3.6** (5) A Root Cause Analysis output names the top contributing signals for an anomaly.

**Infra (unscored but blocking):**
- **R0.1** `docker compose up` brings mosquitto + timescaledb + api + simulator + web to healthy.
- **R0.2** All gate commands (§0) pass on the scaffold before feature work.

---

## §3 Change Contract (file-level; anchors named where MODIFY)

IDs are stable; `g2-coding` slices by them. CREATE unless noted.

| ID | Path | Action | Anchor / exports | Purpose | Slice |
|----|------|--------|------------------|---------|-------|
| F0a | `infra/docker-compose.yml` | CREATE | services: mosquitto, timescaledb, api, simulator, web | orchestration | S0 |
| F0b | `infra/mosquitto/mosquitto.conf` | CREATE | — | broker config (anon listener :1883, ws :9001) | S0 |
| F0c | `infra/db/001_init.sql` | CREATE | tables `device`, `telemetry` (hypertable), `dead_letter`, `customer`, `pipe_segment`, `health` | schema | S0 |
| F0d | `api/pyproject/requirements.txt`, `api/app/main.py` | CREATE | `app` (FastAPI), `/healthz` | API entrypoint + Swagger | S0 |
| F0e | `web/` (vite scaffold) | CREATE | `App.tsx`, `vite.config.ts` | frontend shell | S0 |
| F0f | `.env.example`, `.gitignore` | CREATE | — | config surface | S0 |
| F1a | `simulator/app/roster.py` | CREATE | `load_devices() -> list[Device]` | seed devices from `data/curated/` | S1 |
| F1b | `simulator/app/publish.py` | CREATE | `run(broker, rate)`, `make_signal(dev, t)` | publish telemetry incl. injectable anomalies/bad-IDs | S1 |
| F2a | `api/app/db.py` | CREATE | `get_pool()`, `insert_telemetry()`, `insert_dead_letter()`, `query_range()` | TSDB access | S2 |
| F2b | `api/app/ingest.py` | CREATE | `IngestService`, `validate(msg) -> Reading`, `on_message()`, `run_forever()` | subscriber + validate + DLQ + reconnect | S2 |
| F2c | `api/app/models.py` | CREATE | `Reading`, `Device`, `DeadLetter` (pydantic) | contracts | S2 |
| F3a | `api/app/routes/telemetry.py` | CREATE | `GET /api/telemetry/{asset_id}`, `GET /api/telemetry/{asset_id}/range` | retrieval + latency | S3 |
| F3b | `api/app/routes/status.py` | CREATE | `GET /api/pipeline/status`, `GET /api/dlq` | pipeline monitor data | S3 |
| F3c | `api/app/ws.py` | CREATE | `WS /ws/twin` | live device-status push | S3 |
| F4a | `web/src/twin/Schematic.tsx` | CREATE | `<Schematic>` (SVG, zoom/pan) | R2.1 | S4 |
| F4b | `web/src/twin/DeviceNode.tsx` | CREATE | `<DeviceNode>` (status symbol + SEC tooltip) | R2.2/R2.3 | S4 |
| F4c | `web/src/twin/PipeLayer.tsx` | CREATE | `<PipeLayer>` (highlight + affected customers) | R2.4 | S4 |
| F4d | `web/src/lib/useTwinSocket.ts` | CREATE | `useTwinSocket()` hook | WS client | S4 |
| F4e | `web/src/config/twin.config.ts` | CREATE | `TWIN_CONFIG` | R2.5 config file | S4 |
| F5a | `ml/train.py` | CREATE | `train() -> Path`; writes `ml/artifacts/model.pkl` + `model_card.json` | R3.1/R3.2 | S5 |
| F5b | `ml/features.py` | CREATE | `health_score()`, `pttf()`, `rca()` | scoring + RCA | S5 |
| F6a | `api/app/routes/predict.py` | CREATE | `GET /api/health/{asset_id}`, `GET /api/worklist`, `POST /api/feedback`, `GET /api/rca/{asset_id}` | R3.3–R3.6 + Swagger | S6 |
| F6b | `api/app/scoring.py` | CREATE | `score_all()`, threshold→WS event emit | R3.3 twin update | S6 |
| F7a | `web/src/pipeline/PipelineMonitor.tsx` | CREATE | `<PipelineMonitor>` (MQTT status, reconnect, latency, DLQ table) | topic ๑ view | S7 |
| F7b | `web/src/predict/PredictivePanel.tsx` | CREATE | `<PredictivePanel>` (health, worklist, RCA) | topic ๓ view | S7 |

---

## §4 Function Contracts (load-bearing functions; mechanical ones deepened per-slice in g2-coding)

```
FN1  validate(msg: dict) -> Reading            # File F2b
     Does:   parse an MQTT payload into a typed Reading; enforce Asset ID is known.
     Pre:    msg is decoded JSON (bytes already utf-8 parsed by caller).
     Post:   returns Reading iff msg.asset_id ∈ known device roster AND required
             fields present & numeric; otherwise raises ValidationError.
     Errors: raises ValidationError(reason, raw) for unknown asset_id, missing field,
             non-numeric value, or out-of-range timestamp. NEVER returns a partial Reading.
     Invariants: pure function; no I/O; deterministic.
     Notes:  ≤50 lines; full type hints.

FN2  on_message(client, userdata, msg) -> None  # File F2b
     Does:   the ingest hot path. validate() → insert_telemetry(); on ValidationError
             → insert_dead_letter() and RETURN (loop continues).
     Post:   exactly one of {telemetry row, dead_letter row} written per message.
             A raised exception inside handling is caught, logged, dead-lettered — the
             subscriber loop is never killed by one message. (R1.5 oracle hooks here.)
     Errors: swallows per-message errors by design; re-raises nothing to the loop.
     Invariants: total messages in == telemetry rows + dead_letter rows (conservation).

FN3  run_forever(cfg: IngestConfig) -> None     # File F2b
     Does:   connect to broker, subscribe, and maintain the connection with
             exponential backoff reconnect (cap ≤ 30s) using paho's loop + on_disconnect.
     Post:   after an induced disconnect, a new connection is established and message
             flow resumes within 30s; status transitions CONNECTED→RECONNECTING→CONNECTED
             are observable via GET /api/pipeline/status. (R1.2 oracle.)

FN4  insert_telemetry(pool, r: Reading) -> None ; query_range(pool, asset_id, t0, t1) -> list[Reading]   # File F2a
     Post:   insert writes to the `telemetry` hypertable. query_range returns rows with
             t0 ≤ ts ≤ t1 ordered by ts asc; empty list (never None) when none. (R1.4 oracle.)
     Invariants: query_range is scoped to the given asset_id only.

FN5  specific_energy_consumption(power_kw: float, flow_m3h: float) -> float | None   # File F5b or twin util
     Does:   SEC = power_kw / flow_m3h  (kWh per m³).
     Post:   returns None when flow_m3h == 0 (undefined), else a positive float.
             (R2.3 tooltip value — computed from the device's live telemetry, not a constant.)

FN6  affected_customers(pipe_id: str) -> list[Customer]   # File F2a/route helper
     Does:   return customers downstream of a pipe segment via the pipe_segment topology.
     Post:   returns the set reachable downstream of pipe_id; empty list if none.
             (R2.4 oracle — deterministic over the seeded topology.)

FN7  health_score(window: list[Reading]) -> float ; pttf(window) -> float ; rca(window) -> list[Contribution]   # File F5b
     Post:   health_score ∈ [0,100]; monotonically lower for more-degraded input.
             pttf ≥ 0 (hours/days to threshold). rca returns signals ranked by
             contribution, highest first, ≥1 element when health < threshold.
             health_score/pttf differ across two distinct windows (R3.2 oracle).

FN8  score_all(pool, model) -> list[HealthResult]   # File F6b
     Post:   scores every device; persists to `health`; for any device crossing below
             threshold, emits a WS twin event within one scoring cycle (≤30s). (R3.3 oracle.)
```

---

## §5 Test Plan (specified here; authored in g2-coding). RED-proof per test.

Types: **integration** against real Mosquitto + TimescaleDB (compose) unless noted —
per repo rule, the pipeline is not mock-tested; a mock would assert our belief about the
broker/DB, not their behaviour.

```
T1.1  test_subscriber_ingests_published_message      Covers R1.1  Type: integration
      Arrange: compose up broker+db+api; publish 1 valid msg.  Act: wait for consume.
      Assert:  a telemetry row for that asset_id/ts exists.
      RED-proof: before F2b, fails ImportError(IngestService); after a no-write stub,
                 fails AssertionError(0 rows) — not on missing broker fixture.

T1.2  test_reconnect_within_30s                       Covers R1.2  Type: integration
      Arrange: running subscriber.  Act: restart mosquitto; publish after it returns.
      Assert:  status goes RECONNECTING→CONNECTED and the post-restart msg is ingested,
               elapsed < 30s.
      RED-proof: with no on_disconnect handler, status stays DISCONNECTED and the
                 post-restart row never appears → AssertionError on timeout, not fixture error.

T1.3  test_read_latency_under_500ms                   Covers R1.3  Type: integration
      Assert:  GET /api/telemetry/{id} p50 over 20 calls < 500ms (server-timing header).
      RED-proof: fails 404 before F3a; fails on threshold if a naive full-scan query used.

T1.4  test_range_query_returns_ordered_rows           Covers R1.4  Type: integration
      Arrange: insert 3 readings at t, t+1, t+2.  Act: query_range(id, t, t+2).
      Assert:  3 rows, ascending ts.  Edge: empty window → [] (not None).
      RED-proof: before F2a, ImportError; before hypertable, rows unordered → AssertionError.

T1.5  test_bad_asset_id_goes_to_dlq_loop_continues    Covers R1.5  Type: integration
      Arrange: publish [good, BAD_ASSET, good2].  Act: consume all.
      Assert:  telemetry has good & good2; dead_letter has BAD_ASSET with reason; the loop
               processed good2 (proving no stall).  Invariant: in == telemetry + dlq.
      RED-proof: a validate() that raises into the loop kills the subscriber → good2 missing
                 → AssertionError; distinguishes from a broken fixture (good is present).

T2.1  test_schematic_is_svg_and_scales               Covers R2.1  Type: component (vitest+jsdom)
      Assert:  renders an <svg>; changing zoom prop changes viewBox, not a raster width.
      RED-proof: before F4a, cannot import <Schematic>.

T2.2  test_status_updates_from_socket_without_refresh Covers R2.2  Type: component
      Arrange: mock WS pushing a status frame.  Assert: DeviceNode reflects new status with
               no remount.  (Mock used only to inject the socket frame — stated per rule.)
      RED-proof: before useTwinSocket wiring, node keeps initial status → AssertionError.

T2.3  test_sec_tooltip_from_live_values               Covers R2.3  Type: unit + component
      Assert:  specific_energy_consumption(30, 120) == 0.25; tooltip shows computed SEC for a
               pump frame; flow 0 → tooltip shows "—" not NaN.
      RED-proof: FN5 absent → ImportError; constant tooltip → AssertionError on second frame.

T2.4  test_pressure_drop_lists_affected_customers     Covers R2.4  Type: integration (api) + component
      Arrange: seeded topology pipe P has customers c1,c2 downstream.  Act: pressure-drop on P.
      Assert:  affected_customers(P) == {c1,c2}; PipeLayer highlights P and renders c1,c2.
      RED-proof: FN6 absent → ImportError; wrong topology join → AssertionError on set.

T2.5  test_config_and_three_components_exist          Covers R2.5  Type: repo-structure test
      Assert:  web/src/config/twin.config.ts exists and ≥3 files under web/src/twin/ export a component.
      RED-proof: before F4a–F4e, count < 3 → AssertionError.

T3.1  test_model_artifact_and_card                    Covers R3.1  Type: integration
      Assert:  ml/artifacts/model.pkl loads; model_card.json has algorithm + hyperparams.
      RED-proof: before F5a train run, file missing → AssertionError(path).

T3.2  test_health_and_pttf_vary_by_dataset            Covers R3.2  Type: unit
      Arrange: healthy window vs degraded window.  Assert: health(healthy) > health(degraded);
               pttf(healthy) > pttf(degraded).
      RED-proof: a constant scorer → equal values → AssertionError.

T3.3  test_low_health_emits_twin_event_within_cycle   Covers R3.3  Type: integration
      Arrange: feed degraded telemetry.  Act: run score_all.  Assert: health row < threshold AND
               a WS twin event for that asset captured within one cycle.
      RED-proof: no emit path → event never captured → AssertionError(timeout).

T3.4  test_feedback_endpoint_documented_and_persists  Covers R3.4  Type: integration
      Assert:  /openapi.json lists POST /api/feedback; posting a valid body → 200 and a row persisted.
      RED-proof: route absent → 404 and openapi missing key → AssertionError.

T3.5  test_worklist_ranked_by_risk                    Covers R3.5  Type: integration
      Assert:  GET /api/worklist returns devices sorted by risk desc; the seeded worst device is first.
      RED-proof: unsorted return → first != worst → AssertionError.

T3.6  test_rca_names_top_signals                      Covers R3.6  Type: unit
      Assert:  rca(degraded_window)[0].signal is the dominant degraded signal; ≥1 contribution.
      RED-proof: empty/!ranked rca → AssertionError.

T0.1  test_compose_stack_healthy                      Covers R0.1  Type: smoke (CI-optional)
      Assert:  after compose up, /healthz 200 and DB reachable.
```

Every `R` above has ≥1 `T`; every `T` cites an `R` (matrix §6).

---

## §6 Traceability Matrix

| Req | Tests | Files | Slice |
|-----|-------|-------|-------|
| R0.1 | T0.1 | F0a–F0f | S0 |
| R1.1 | T1.1 | F1b,F2b,F2a | S1,S2 |
| R1.2 | T1.2 | F2b | S2 |
| R1.3 | T1.3 | F3a,F2a | S3 |
| R1.4 | T1.4 | F2a | S2 |
| R1.5 | T1.5 | F2b,F2a | S2 |
| R2.1 | T2.1 | F4a | S4 |
| R2.2 | T2.2 | F4b,F4d,F3c | S4 |
| R2.3 | T2.3 | F4b,F5b | S4 |
| R2.4 | T2.4 | F4c,F2a | S4 |
| R2.5 | T2.5 | F4a–F4e | S4 |
| R3.1 | T3.1 | F5a | S5 |
| R3.2 | T3.2 | F5b | S5 |
| R3.3 | T3.3 | F6b,F3c | S6 |
| R3.4 | T3.4 | F6a | S6 |
| R3.5 | T3.5 | F6a,F6b | S6 |
| R3.6 | T3.6 | F5b,F6a | S6 |

---

## §7 Wiring Verification

| New component | Runtime caller | Registration | Schema/table |
|---|---|---|---|
| `IngestService.run_forever` | api startup lifespan task | `main.py` lifespan | writes `telemetry`, `dead_letter` |
| `on_message` | paho client callback | `client.on_message = ` in `run_forever` | — |
| `GET /api/telemetry/*` | HTTP | `app.include_router(telemetry)` in `main.py` | reads `telemetry` |
| `GET /api/pipeline/status`, `/api/dlq` | HTTP | include_router(status) | reads status/`dead_letter` |
| `WS /ws/twin` | browser `useTwinSocket` | `app.add_websocket_route` | — |
| `POST /api/feedback` etc. | HTTP + Swagger | include_router(predict) | `feedback`, `health` |
| `score_all` | periodic task in lifespan | `main.py` scheduler | writes `health`, emits WS |
| `<Schematic>/<DeviceNode>/<PipeLayer>` | `App.tsx` route `/twin` | imported in `App.tsx` | — |
| `<PipelineMonitor>/<PredictivePanel>` | `App.tsx` routes | imported in `App.tsx` | — |
| simulator `publish.run` | simulator container CMD | compose `simulator` service | publishes to broker |
| `001_init.sql` | TimescaleDB init | compose volume mount + runner | all tables |

Every §3 CREATE has a row here — no orphans by construction.

---

## §8 Slice Plan

Stop lines assigned by the g2-coding Q0–Q3 tree; recorded reason in parens.

| ID | Scope | Owner | Stop line | Oracle | Done when |
|----|-------|-------|-----------|--------|-----------|
| **S0** | F0a–F0f infra+scaffold | **Claude** | — (Q0: no oracle until stack runs; irreversible infra choices) | T0.1 + all gates green empty | compose healthy, gates pass |
| **S1** | F1a,F1b simulator | DeepSeek | SL-2 (Q2: crosses to broker, new module) | T1.1 (msgs arrive) | valid+anomaly+bad-ID msgs publish |
| **S2** | F2a,F2b,F2c ingest+DLQ+TSDB | **Claude** | — (Q0: R1.5 DLQ + conservation invariant is the load-bearing correctness; no cheap oracle for "loop never stalls") | T1.1,T1.4,T1.5 + conservation | tests green |
| **S3** | F3a,F3b,F3c retrieval+WS | DeepSeek | SL-2 (Q2: adds routes) | T1.3 latency | endpoints + WS live |
| **S4** | F4a–F4e twin | DeepSeek | SL-3 (Q1: SVG zoom + topology join are the hard parts; Claude seeds FN5/FN6) | T2.1–T2.5 | twin renders + live |
| **S5** | F5a,F5b model | **Claude** | — (Q1: domain math — health/pttf/rca — is the judgment core) | T3.1,T3.2,T3.6 | artifact + scorers |
| **S6** | F6a,F6b predict API + twin emit | DeepSeek | SL-2 (Q2: routes + WS emit) | T3.3,T3.4,T3.5 | Swagger + worklist + emit |
| **S7** | F7a,F7b monitor+panel UI | DeepSeek | SL-1 (Q3: single-surface UI, pinned by API contracts) | manual + component render | screens wired |

Land order: S0 → S1 → S2 → S3 → (S4 ∥ S5) → S6 → S7. One PR each; no slice depends on an unmerged branch.

---

## §9 Risks, Rollout, Rollback

| Risk | Trigger | Blast radius | Gate / rollback |
|---|---|---|---|
| Docker daemon down at demo | judges' machine | whole demo | Pre-flight `compose up` check; fallback recorded screencast |
| Latency > 500ms under load | slow query / no index | R1.3 (5 pts) | TimescaleDB index on (asset_id, ts); measure in CI (T1.3) |
| Reconnect > 30s | backoff cap too high | R1.2 (5 pts) | cap backoff at 20s; T1.2 asserts < 30s |
| DLQ path stalls loop | exception escapes on_message | R1.5 (10 pts) + all downstream | conservation invariant test; try/except around handler body |
| Model gives constant scores | degenerate features | R3.2 (5 pts) | T3.2 asserts variation across datasets |
| Twin WS event > 30s | scoring cycle too slow | R3.3 (5 pts) | scoring cycle ≤ 15s; T3.3 asserts within cycle |
| Synthetic mistaken for real | unlabelled SIM signal | credibility / §3.2 | `SIMULATED` badge lint; review checklist |

Incomplete slices land dark: each feature behind its route; twin/predict pages not linked from nav until their slice is green.

---

## §10 Do-Not-Touch List (verbatim — consumed by diff audit)

Implementer (DeepSeek) must NOT modify:
- Any acceptance-test file authored in g2-coding under `api/tests/`, `web/src/**/*.test.tsx`, `ml/tests/` (the §5 tests).
- `POC_SPEC.md`, `docs/DREP-demo-poc.md`, `CLAUDE.md`.
- `data/curated/**`, `data/raw/**` (read-only seed).
- `design/**` (committed design contract).
- `infra/db/001_init.sql` schema once S0 lands (migrations add new numbered files).
- Claude-owned seams for S2 and S5 (FN1–FN4, FN5–FN7 signatures) — bodies of Claude-owned functions are Claude's.
- `.codex/coding-log.current` and the coding log.

---

## Phase 3–4 — Codex adversarial synthesis (2026-07-28, gpt-5.6-sol xhigh)

Codex returned 14 findings. **13 accepted, 1 partially accepted.** The review's core theme is
correct and important: *the DREP planned the implementation but not the demonstration — the
thing that actually scores.* Dispositions below; the plan sections above are amended by the
**Δ** deltas, and a new demonstration layer + reslice are added.

| # | Tag / sev | Disposition | Change |
|---|---|---|---|
| 1 | MISS / CRIT | **ACCEPT** — no judge-facing demo layer existed | Add slice **S-D** (demo director): `docs/demo-runbook.md`, `demo/scenarios/*.json`, `scripts/demo-preflight.sh`, `scripts/demo-reconnect.sh`, `scripts/show-hypertable.sql`, a run-ID-scoped **scenario API** (`POST /api/demo/scenario`). Each of the 16 rows maps to trigger → on-screen/IDE/DevTools evidence → expected value → reset. |
| 2 | CONTRACT / CRIT | **ACCEPT** — FN2 conservation false under redelivery / DB-outage / bad bytes | Δ FN2: immutable `message_id` + run_id; store raw payload; **ingress ledger** with outcome ∈ {TELEMETRY, DLQ}; one atomic disposition txn; MQTT QoS 1 + durable spool for DB-down; conservation redefined over **uniquely-accepted deliveries**. Decode failure (non-UTF8/JSON) → DLQ too (not bypass). |
| 3 | CONTRACT / HIGH | **ACCEPT** — FN1 purity + FN3 paho misuse | Δ FN1: `validate(payload, known_asset_ids)` — roster passed in, stays pure; separate `decode(raw)`. Δ FN3: use `loop_start()` (one mode), **subscribe in `on_connect`**, cap backoff ≪30s, measure disconnect→SUBACK→first post-recovery message. |
| 4 | CONTRACT / HIGH | **ACCEPT** — FN4/5/6 semantics unproven | Δ FN4: `CREATE EXTENSION timescaledb`, `create_hypertable`, `(asset_id, ts)` index, TIMESTAMPTZ, **catalog assertion** in T1.4. Δ FN5: reject non-finite / `flow ≤ 0` / stale / mismatched asset; return None only for those. Δ FN6: add `pipe_edge` + `customer_service_point` + topology version; recursive traversal with cycle guard. |
| 5 | CONTRACT / CRIT | **ACCEPT** — PTTF undefined; data can't train it (this is the one I asked Codex to attack) | Δ FN7 + new seeds: **PTTF ≝ hours from window-end until the simulator's latent-health threshold is first crossed, censored at horizon H.** Commit `demo/datasets/lifecycle_*.parquet` — seeded full-lifecycle runs with known failure times + distinct degradation slopes. Bind inference/RCA to the serialized model+version; RCA = attribution on **that** model. All outputs `SIMULATED`. |
| 6 | CONTRACT / HIGH | **ACCEPT** — FN8 not a wall-clock bound; proves emission not receipt | Δ FN8: record `observed_at/scored_at/published_at/model_version`; cap scheduler cadence + scoring runtime; T3.3 measures persisted-reading → **WS receipt → DOM change** on a monotonic clock < 30s. |
| 7 | VACUOUS / HIGH | **ACCEPT** — pipeline RED-proofs false-positive-prone | Δ T1.1–T1.5: unique run/message IDs; readiness assert before RED; shuffled insertion (order not from hypertable); **client-measured arithmetic mean** (not p50, not a fabricated header); fault-inject decode/DB/redelivery. |
| 8 | VACUOUS / HIGH | **ACCEPT** — twin tests check structure not chains | Δ: add a real-browser vertical (Playwright) — publish named MQTT scenario, assert pre/post DOM without reload, exercise hover+zoom, verify pipe/customer output + visible `SIMULATED` badges + actual component reachability. |
| 9 | VACUOUS / CRIT | **ACCEPT** — "AI theatre" could pass | Δ T3.*: run through the **production artifact-load/score path**; assert fitted estimator class + `get_params()` vs model-card; ≥2 counterfactual anomaly fixtures; assert worklist **reorder**; invoke feedback via `/docs`; measure real browser transition. |
| 10 | ORDERING / CRIT | **ACCEPT** — slices don't build in order | Reslice (below): shared wire/domain contracts + all seeds → **S0**; S1 gets a broker-only oracle; `002_feedback.sql` created in S6 (not frozen); SEC contract lands with S5 **before** S4; add end-to-end **S-D** integration slice before S7 acceptance. |
| 11 | STACK / CRIT | **ACCEPT** — blocking paho in async lifespan | Δ wiring: `run_forever` is **not** an async lifespan task. Uvicorn **1 worker**; paho `loop_start()` on its own thread; hand immutable msgs to an `asyncio.Queue` via `loop.call_soon_threadsafe`; DB writes + WS broadcast on the event loop; handle `WebSocketDisconnect` + backpressure. |
| 12 | STACK / HIGH | **ACCEPT** — TSDB/pickle as labels | Δ: pin Timescale image **digest** + Python deps (`requirements.txt` fully pinned); assert extension/hypertable metadata at startup + T1.4; model card records data hash, code rev, dep versions, estimator class, `get_params()`, validation metrics. |
| 13 | STACK / HIGH | **PARTIAL** — baseline claim | Correct that main has **0 commits** and artifacts are untracked; the DREP §0 line "committed" was aspirational. **Fix:** first action of the build is a baseline commit of planning artifacts (awaiting user go-ahead per session policy). The "one PR per slice" model resumes from that baseline. Not blocking planning. |
| 14 | SCORING / CRIT | **ACCEPT** — biggest risk = no rehearsed, browser-visible vertical demo | This reframes §9. The dominant risk is *green tests + a judge who can't see reconnect timing / DevTools mean / DLQ continuity / live twin / Swagger persistence*. **Fix:** S-D delivers a one-command run-ID-scoped **demo director** + timed operator runbook + cold-start + browser-E2E rehearsal + reset path + a second operator who can run it without the developer. |

### Reslice (supersedes §8 ordering)

`S0` (Claude) now also lands: shared contracts (`Device`, `Reading`, WS event schema, scenario
types), **all seed schemas** (`device`, `customer_service_point`, `pipe_edge`, topology+roster
seeds from `data/curated/`), and pinned infra digests. New **`S5` lands before `S4`** (SEC is a
shared contract from `ml/`/twin-util). New **`S-D`** (Claude-owned; demonstration layer + E2E)
lands **before S7 acceptance** and is the real gate on the 100 points. Feedback table =
`infra/db/002_feedback.sql` in **S6**, not frozen in S0.

**Revised land order:** S0 → S1 → S2 → S3 → S5 → S4 → S6 → **S-D** → S7.

### Net

The review changed the plan's centre of gravity from "build 3 subsystems" to "build 3
subsystems **plus a deterministic, rehearsed, browser-visible demonstration harness that a
judge scores**." That harness (S-D) is now the highest-value slice. PTTF is given a real,
defensible definition backed by seeded lifecycle data rather than a fabricated monotonic
number. The paho/async concurrency bug (finding 11) would have broken API startup and was
caught before a line was written — which is exactly why the adversarial pass runs.

Full Codex output: `scratchpad/codex-plan-attack.md`.
