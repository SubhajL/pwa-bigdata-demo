# Phased PR Plan → 100% demonstrable on ผนวก ๑๓

Nine PRs, merge-ordered, each independently green. Every PR names the **scored items
it unlocks** and the **evidence a judge sees**. Built from `docs/DREP-demo-poc.md`
(slices S0–S7 + S-D), hardened by the Codex adversarial pass.

**What "100%" means here (honest):** if every PR lands green *and* PR-7's rehearsal
shows each of the 16 items live, then **all 16 scored behaviours are demonstrable,
fully and correctly**. That is the controllable target. The committee's pen is not.

**Owner:** Claude implements all PRs directly (no DeepSeek delegation) for bid
reliability — the correctness cores (DLQ conservation, model math, demo director)
were never-delegate anyway.

**Branch/PR mechanics:** one branch per PR (`feat/sN-*`), each gated by `g2-qcheck`
before merge. Repo has **no GitHub remote yet** → "PR" = feature branch + squash to
`main` locally; wire a remote when you want real GitHub PRs (I can do that on request).

---

## Merge order & dependency graph

```
PR-0 infra ─┬─ PR-1 simulator ─ PR-2 pipeline/DLQ ─ PR-3 retrieval/WS ─┐
            └─ PR-4 model ──────────────────────────────────┐         │
                                                             ▼         ▼
                                              PR-5 twin ◄────┴── PR-6 predictive API
                                                             │         │
                                                             ▼         ▼
                                                    PR-7 demo director + E2E  (the score gate)
                                                             │
                                                             ▼
                                                    PR-8 monitor/predictive UI polish
```

---

## PR-0 — Infra & scaffold  · slice S0 · **never-delegate**

**Scope.** Docker Compose (Mosquitto + TimescaleDB pinned by digest + api + simulator + web);
`infra/db/001_init.sql` — full schema incl. `timescaledb` extension, `telemetry` **hypertable**,
`dead_letter`, **`ingress_ledger`** (Codex #2), `device`, `customer_service_point`, `pipe_edge`,
`health`; FastAPI skeleton with `/healthz` and the **correct concurrency structure** —
paho `loop_start()` on its own thread → `asyncio.Queue` via `loop.call_soon_threadsafe`,
single uvicorn worker (Codex #11); shared contracts (`Reading`, `Device`, WS-event, scenario types);
**all seeds** loaded from `data/curated/` (Codex #10); Vite+React+TS scaffold + config file;
pinned `requirements.txt` (Codex #12); gate configs.

**Unlocks (scored):** none directly — begins **2.5** (config + ≥3 components structure).
**Acceptance:** `docker compose up` → all healthy (T0.1); `pytest`/`ruff`/`mypy` and
`vitest`/`eslint`/`tsc` green on skeleton.
**Judge evidence:** `docker compose up` shows the stack healthy; repo structure in the IDE.

## PR-1 — Telemetry simulator · slice S1

**Scope.** `simulator/` publishes device signals seeded from the real roster, with **injectable**
anomalies, bad-Asset-ID, malformed-payload, and lifecycle-degradation scenarios (feeds later demos).
**Unlocks:** **1.1** (continuous ingest source).
**Acceptance:** T1.1 broker-only — a subscriber receives published messages of the right shape.
**Judge evidence:** live message flow at a controlled rate.

## PR-2 — Ingest pipeline: validate → DLQ → TSDB · slice S2 · **never-delegate**

**Scope.** `api/app/db.py` (`insert_telemetry`, `insert_dead_letter`, `query_range`, ledger writes);
`api/app/ingest.py` — `decode()` + `validate(payload, known_asset_ids)` (Codex #3), `on_message`
with **atomic disposition** + conservation over *uniquely-accepted deliveries* (Codex #2),
`run_forever` with `loop_start` + **reconnect ≤30s** measured disconnect→SUBACK→first message,
subscribe in `on_connect` (Codex #3).
**Unlocks (scored):** **1.1, 1.2, 1.4, 1.5** (25 pts).
**Acceptance:** T1.1, T1.2 (<30s), T1.4 (hypertable catalog assertion + ordered range),
T1.5 (`good→BAD→good`: telemetry+DLQ rows, loop continues; conservation holds under
duplicate/malformed/DB-fault injection).
**Judge evidence:** publish `good/BAD/good` → DLQ row + main continues; restart broker → reconnect <30s.

## PR-3 — Retrieval, latency & WebSocket · slice S3

**Scope.** Routes `GET /api/telemetry/{id}`, `/range`, `/api/pipeline/status`, `/api/dlq`;
`WS /ws/twin`; latency instrumentation + `(asset_id, ts)` index so p-mean < 500ms.
**Unlocks (scored):** **1.3** (5 pts); enables **2.2** (live push).
**Acceptance:** T1.3 — client-measured arithmetic-mean latency < 500ms over N calls (Codex #7).
**Judge evidence:** DevTools/Network shows mean < 500ms; live status endpoint.

## PR-4 — Predictive model & scoring core · slice S5 · **never-delegate**

**Scope.** `ml/train.py` → `artifacts/model.pkl` + `model_card.json` (estimator class, `get_params()`,
training-data hash, dep versions — Codex #12); `ml/features.py` — `health_score`, **`pttf`** rigorously
defined (hours to simulator latent-health threshold, censored at horizon H — Codex #5), `rca`
(attribution on the *loaded* model); committed seeded **lifecycle datasets** with known failure times.
**Unlocks (scored):** **3.1, 3.2, 3.6** (15 pts).
**Acceptance:** T3.1 (artifact + card load), T3.2 (health/PTTF differ across 2 datasets via the
production load path — Codex #9), T3.6 (RCA names top signals, changes with the anomaly).
**Judge evidence:** model file + algorithm/params; two datasets → different Health/PTTF; RCA.

## PR-5 — Digital twin frontend · slice S4

**Scope.** `web/src/twin/`: `Schematic` (SVG zoom, no blur), `DeviceNode` (status + **SEC tooltip**
from live values — FN5 rejects `flow≤0`/non-finite, Codex #4), `PipeLayer` (highlight +
**affected customers** via `pipe_edge` traversal — FN6, Codex #4), `useTwinSocket`, `twin.config.ts`.
**Unlocks (scored):** **2.1, 2.2, 2.3, 2.4, 2.5** (35 pts).
**Acceptance:** T2.1–T2.5 + a **real-browser Playwright vertical** (publish scenario → assert pre/post
DOM without reload, hover+zoom, pipe/customer output, visible SIMULATED badges — Codex #8).
**Judge evidence:** live twin; zoom; pump anomaly tooltip; pressure→highlighted pipe + customer list; ≥3 components + config in IDE.

## PR-6 — Predictive API + twin emit · slice S6

**Scope.** `002_feedback.sql` (Codex #10); routes `GET /api/health/{id}`, `/api/worklist`,
`POST /api/feedback`, `GET /api/rca/{id}`; `score_all` periodic task → WS twin event with
`observed_at/scored_at/published_at`, wall-clock **≤30s to DOM** (Codex #6); FastAPI Swagger at `/docs`.
**Unlocks (scored):** **3.3, 3.4, 3.5** (15 pts); completes **3.3** with PR-5's twin.
**Acceptance:** T3.3 (persisted degraded reading → WS receipt → DOM change < 30s, monotonic clock),
T3.4 (`/openapi.json` lists feedback; Swagger "Try it out" → 200 + row persisted), T3.5 (worklist reorders by risk).
**Judge evidence:** Swagger feedback call persists; ranked worklist; Health<threshold → twin symbol flips ≤30s.

## PR-7 — Demo director + runbook + E2E · slice S-D · **never-delegate · THE SCORE GATE**

**Scope.** `docs/demo-runbook.md` (timed operator script: per item → trigger → screen/IDE/DevTools
evidence → expected value → reset); `demo/scenarios/*.json`; `scripts/demo-preflight.sh`,
`demo-reconnect.sh`, `show-hypertable.sql`; run-ID-scoped **scenario API** `POST /api/demo/scenario`;
**Playwright E2E covering all 16 items** end-to-end (Codex #1, #14).
**Unlocks:** makes **all 16** visibly, repeatably demonstrable — the difference between "tests pass"
and "a judge sees each item score."
**Acceptance:** full E2E green; cold-start rehearsal; a second operator runs the sequence unaided.
**Judge evidence:** one command drives the whole scored demo, each item shown on cue.

## PR-8 — Monitor & predictive UI polish · slice S7

**Scope.** `web` `PipelineMonitor` (MQTT status, reconnect, latency, DLQ table) + `PredictivePanel`
(health, worklist, RCA) wired to real APIs; matches S8/S10 design targets.
**Unlocks:** presentation quality for topics ๑ & ๓ (behaviour already proven in PR-2/3/6).
**Acceptance:** component tests + axe; wired (non-test import + runtime call site).
**Judge evidence:** the S8/S10 mockups, now live.

---

## Score coverage check — every point routed

| Topic | Items (pts) | PRs that make them demonstrable |
|---|---|---|
| ๑ Pipeline (35) | 1.1(5) 1.2(5) 1.3(5) 1.4(10) 1.5(10) | PR-1, **PR-2**, PR-3 → shown in PR-7/PR-8 |
| ๒ Twin (35) | 2.1(5) 2.2(5) 2.3(10) 2.4(10) 2.5(5) | PR-3(WS), **PR-5** → shown in PR-7 |
| ๓ Predictive (30) | 3.1(5) 3.2(5) 3.3(5) 3.4(5) 3.5(5) 3.6(5) | **PR-4**, **PR-6**, PR-5(twin) → shown in PR-7 |
| **Total** | **100** | all 16 routed; PR-7 makes them judge-visible |

No scored item is unrouted. PR-7 is the gate that converts green tests into a scored demo.

## Per-PR definition of done (applies to every PR)

1. Acceptance tests authored first, RED-proven (or mutation-verified where RED is unavailable).
2. Gates green under Claude's own hand: test · lint · typecheck · build.
3. Wiring verified — every new export has a non-test import **and** a runtime call site.
4. Tests 3× no flakiness.
5. `g2-qcheck` passed with an independent reviewer; CRITICAL/HIGH fixed.
6. Squash-merged to `main` on green; coding log appended.
7. **No unlabelled synthetic value; DLQ-not-crash; one y-axis; tokens from `tokens.map.md`** (CLAUDE.md MUSTs).
