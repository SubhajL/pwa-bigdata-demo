# DREP addendum — S1 (PR-1) + S2 (PR-2)

Extends `docs/DREP-demo-poc.md` to g2 resolution for the next two slices.
Authored by `g2-planning` 2026-07-29. Codex `gpt-5.6-sol` (xhigh) adversarial pass returned
**31 findings**; dispositions in §11. Every claim spot-checked against the installed
`paho-mqtt==2.1.0` and the real schema before acceptance.

---

## §0 Repo Profile (re-detected 2026-07-29)

| Field | Value |
|---|---|
| Repo root | `/Users/subhajlimanond/dev/pwa-bigdata-demo` |
| Remote | `origin` → https://github.com/SubhajL/pwa-bigdata-demo (**public**, created 2026-07-29) |
| Baseline | `main` @ 35573c4 |
| Python | 3.13.5; venv `api/.venv` |
| api gates | `cd api && pytest` · `ruff check .` · `mypy .` (strict) — all green at baseline |
| simulator gates | **absent at baseline** (no pyproject/tests/dev-deps) → S1 creates them |
| Migration policy | `infra/db/NNN_name.sql`; **initdb mount is exact-file and does not re-run on an existing volume** → S2 adds a runner. Next free prefix **002**; S6's feedback table moves to **003**. |
| Coding log | `coding-logs/2026-07-28-2050 Coding Log (demo-poc).md`; pointer `.codex/coding-log.current` (verified non-dangling) |
| Docker | Engine 29.4.0 · Compose 2.32.1 |
| Ownership / disposition | ours / ours · **may-become-production** |

**Repo MUST NOT (CLAUDE.md, verbatim):** no hardcoded KPI/telemetry in components; no
unlabelled synthetic value; no second y-axis / rainbow-for-magnitude / colour-only status;
**never block the ingest loop on a bad message (DLQ + continue)**; no committed secrets;
no `@ts-ignore` / bare `except:`.

## Ground truth (Phase 1) — corrects stale assumptions

1. `scripts/seed_db.py` (tracked, S0) already seeds **239** devices from
   `data/curated/water_sold_by_branch.csv`: `PWA-000-P1 … PWA-234-P1` over 235 branches
   (`sorted()` by branch name — verified unique, 0 collisions) plus `P-1,P-2,M-3,V-9`.
   It is **manual** and wired into no service.
2. `telemetry.asset_id` **FK→`device.asset_id`** (001_init.sql:21). An unseeded DB fails every
   insert; a drifted roster dead-letters 100% of traffic. Highest-risk coupling in S1+S2.
3. `ingress_ledger` exists (message_id PK, `outcome CHECK IN ('TELEMETRY','DLQ')`, `raw JSONB`).
4. `api/app/main.py` has the `IngestBridge` (paho thread → `asyncio.Queue` via
   `call_soon_threadsafe`) and an empty `_consume()`. **Disposition happens in the consumer,
   not in `on_message`** — this relocates the "never stall" guarantee (Codex 2.1).
5. Verified paho-mqtt 2.1.0 facts that the plan must pin:
   `Client(callback_api_version=VERSION1)` **default is the deprecated V1** (V2-shaped
   callbacks raise `TypeError` on the network thread) · `subscribe(qos=0)` **default**
   (effective QoS = min(pub,sub), so QoS-1 publish alone is worthless) ·
   `connect(keepalive=60)` **default > the 30 s budget** ·
   `reconnect_delay_set(min_delay=1, max_delay=120)` **default 4× the budget** ·
   `clean_session` defaults **True**, and `mosquitto.conf` sets `persistence false` →
   a broker restart destroys subscriptions and in-flight state.
6. `raw JSONB NOT NULL` **cannot** store non-UTF8 bytes. Verified lossless representation:
   `{"_raw_b64": <base64>, "_decode_error": <str>}` — round-trips exactly, no schema change.

---

## §1 Goal / Non-Goals

**Goal.** Land the producer (S1) and consumer (S2) of the demo telemetry pipeline so scored
items **1.1, 1.2, 1.4, 1.5 (25 pts)** are provable by automated test: MQTT → decode →
validate → {hypertable | DLQ} with a conservation invariant checked against an
*independent* expected count, a loop that never stalls on a bad message, and reconnect
proven within 30 s on a monotonic clock.

**Non-Goals (S1+S2).** Retrieval latency R1.3 & `/api/dlq` (S3) · WebSocket twin (S3) · any
ML (S5/S6) · any UI · demo director (S-D) · historical backfill · auth · CI workflow
(recorded as follow-up, §11 #9) · a disk-backed durable spool (§9 residual risk).

## §2 Requirements

- **R1.1** (5) Subscriber connects to Mosquitto and ingests published messages continuously.
- **R1.2** (5) On disconnect the subscriber auto-reconnects and resumes ≤ 30 s, **observable
  via `GET /api/pipeline/status`**.
- **R1.4** (10) Valid messages land in the `telemetry` hypertable; a time-range query returns
  them correctly ordered.
- **R1.5** (10) Unknown/invalid Asset ID → `dead_letter` automatically, loop keeps processing.
- **RS1.a** Simulator publishes a contract-valid envelope for **every device in the seeded
  roster**, cycling the full roster, at the configured rate, QoS 1.
- **RS1.b** Injectable fault modes: `ANOMALY`, `BAD_ASSET`, `MALFORMED` (non-JSON bytes).
- **RS1.c** Simulator roster is identical to `scripts/seed_db.py`'s **by construction**.
- **RS2.a** Conservation: `published_count == ledger_count` **and**
  `ledger_count == telemetry_count + dlq_count`, scoped by `run_id`. The first conjunct is the
  independent counter that makes `0 == 0 + 0` impossible (Codex 6.8).
- **RS2.b** A redelivered `message_id` never double-writes telemetry.
- **RS2.c** Ingest survives a bad message *in the consumer*: the consumer task is supervised
  and never dies.
- **RS0.a** `simulator/` has real gates: pytest + ruff + mypy(strict), matching `api/`.

## §3 Change Contract

### S1 (PR-1) — `feat/s1-telemetry-simulator`
| ID | Path | Action | Anchor / exports | Owner |
|----|------|--------|------------------|-------|
| F1a | `simulator/app/roster.py` | CREATE | `load_devices()`, `CURATED`, `DEMO_BRANCH`, `NAMED_DEVICES` | delegate |
| F1b | `simulator/app/models.py` | CREATE | `Device`, `Envelope`, `FaultMode`, `Signal`, `DeviceKind` | delegate |
| F1c | `simulator/app/config.py` | CREATE | `SimSettings`, `get_settings()` | delegate |
| F1d | `simulator/app/publish.py` | MODIFY (replace stub `main()` L5–10) | `make_signal()`, `make_envelope()`, `run()`, `main()` | delegate |
| F1e | `simulator/pyproject.toml` | CREATE | ruff/mypy-strict/pytest config | **Claude** |
| F1f | `simulator/requirements.txt` | MODIFY (append) | pin pydantic + dev deps | **Claude** |
| F1g | `scripts/seed_db.py` | MODIFY (`_branch_index`,`_devices` L25–47) | delegate to F1a | **Claude** (seed path) |
| F1h | `infra/docker-compose.yml` | MODIFY (`simulator:` L57–67) | mount `../data/curated` ro; `RUN_ID`, `FAULT_MODE` env | **Claude** |
| F1i | `contracts/telemetry-envelope.v1.schema.json` | CREATE | the shared wire contract | **Claude** |
| F1j | `simulator/tests/{__init__,conftest,test_roster,test_publish,test_contract}.py` | CREATE | acceptance tests | **Claude** |

### S2 (PR-2) — `feat/s2-ingest-dlq-tsdb`
| ID | Path | Action | Anchor / exports | Owner |
|----|------|--------|------------------|-------|
| F2a | `infra/db/002_ingest_identity.sql` | MIGRATION | `run_id` on ledger/DLQ; `message_id`,`run_id` on telemetry; indexes | **Claude** |
| F2b | `scripts/migrate.py` | CREATE | idempotent ordered `NNN_*.sql` runner + `schema_migrations` | **Claude** |
| F2c | `api/app/db.py` | CREATE | `get_pool()`, `known_asset_ids()`, `disposition()`, `query_range()` | **Claude** |
| F2d | `api/app/ingest.py` | CREATE | `decode()`, `validate()`, `RawMessage`, `IngestService`, `PipelineStatus` | **Claude** |
| F2e | `api/app/main.py` | MODIFY (`_consume` L41–46, `lifespan` L49–64) | supervised consumer + service wiring | **Claude** |
| F2f | `api/app/config.py` | MODIFY (`Settings` L7–15) | keepalive, backoff, run_id, queue bound | **Claude** |
| F2g | `api/app/routes/pipeline.py` | CREATE | `GET /api/pipeline/status` | **Claude** |
| F2h | `api/app/models.py` | MODIFY (`Reading` L22–27) | add `message_id`, `run_id` | **Claude** |
| F2i | `infra/docker-compose.yml` | MODIFY | `migrate`+`seed` one-shot services; `MQTT_ENABLED=1`; mount `./db` dir | **Claude** |
| F2j | `infra/mosquitto/mosquitto.conf` | MODIFY (L11) | `persistence true` (+ data dir) | **Claude** |
| F2k | `api/tests/{conftest,test_ingest,test_db,test_reconnect,test_conservation}.py` | CREATE | acceptance tests | **Claude** |

## §4 Function Contracts

```
FN-S1-1  load_devices(csv_path: Path = CURATED) -> list[Device]                        # F1a
  REVISED during S1 review (Codex Tier-2 finding 3) — the original label-keyed model was wrong.
  Post:   exactly 238 Devices for the committed CSV; 234 `PWA-{branch_code}-P1` pumps
          ordered by branch_code, then P-1,P-2,M-3,V-9. asset_ids unique.
  Identity: a branch is its `branch_code`, NOT its Thai label. Code 5551014 is recorded
          as บ้านนาสาร in early months and เวียงสระ later, so label-keying yields 235
          branches for a dataset that has 234 in every month — a phantom device for a
          branch that no longer exists, published as real PWA geography. Geography is
          resolved as-of the latest month for that code. Position-derived ids would
          renumber on any insertion, and seed_db's ON CONFLICT DO NOTHING would leave
          stale geography on a reused id with the FK still green.
  Errors: FileNotFoundError; ValueError on a missing column, blank identity field,
          region outside 1..10, conflicting same-month geography, or an absent
          สมุทรสาคร demo branch (it must NOT fabricate geography — CLAUDE.md honesty rule).
  Invariant: PURE — no network, no DB. Byte-stable for a given input file.

FN-S1-2  make_signal(dev, tick: int, mode: FaultMode) -> tuple[Signal, float]           # F1d
  Post:   finite value; within the signal's physical band when mode is NORMAL; outside it
          for ANOMALY. Deterministic in (asset_id, tick, mode) — seeded, never bare random.

FN-S1-3  make_envelope(dev, tick, run_id, mode) -> Envelope                             # F1d
  Post:   message_id = uuid5(NS, f"{run_id}|{asset_id}|{tick}") — the LOGICAL EVENT id:
          stable within a run (so redelivery is idempotent), unique across runs because
          run_id is fresh per process start. This resolves the Codex 2.3 contradiction:
          delivery identity is MQTT's (mid); application identity is this.
  Post:   ts is tz-aware UTC RFC3339; serialises to JSON valid against F1i.

FN-S1-4  run(cfg, *, max_messages: int | None = None) -> int                            # F1d
  Post:   publishes to `pwa/telemetry/{asset_id}` at **qos=1**, cycling the FULL roster in
          order, honouring cfg.rate_hz; returns count published. max_messages is a test hook.

FN-S2-1  decode(raw: bytes) -> dict[str, Any]                                           # F2d
  Post:   utf-8 + JSON parse; must yield an object. Raises DecodeError otherwise.
          A decode failure is DLQ'd, never bypassed (Codex #2 of parent DREP).

FN-S2-2  validate(payload: dict, known_asset_ids: frozenset[str]) -> Reading            # F2d
  Pre:    already decoded. PURE — roster injected, not fetched.
  Post:   Reading iff asset_id ∈ known_asset_ids ∧ ts tz-aware ∧ signal known ∧ value finite.
  Errors: raises ValidationError(reason, raw). Never a partial Reading.

FN-S2-3  disposition(conn, *, message_id, run_id, raw_json, outcome: Outcome) -> bool   # F2c
  Does:   ONE transaction. INSERT ledger ... ON CONFLICT (message_id) DO NOTHING RETURNING 1;
          ONLY if a row was returned, insert the destination (telemetry | dead_letter).
  Post:   returns True iff newly dispositioned. Redelivery -> False, zero extra rows.
          Conservation holds by construction (Codex 2.2 / 6.10).
  Note:   Outcome is a tagged union: Accepted(reading) | Rejected(reason, asset_id|None).

FN-S2-4  IngestService.on_message(client, userdata, msg) -> None                        # F2d
  Does:   ONLY constructs an immutable RawMessage(topic, payload, mid, qos) and enqueues it.
  Post:   never touches the DB, never raises. On QueueFull -> does NOT ack, increments an
          overflow counter, so the broker redelivers (backpressure, Codex 6.13).
  NOTE:   the "loop never stalls" guarantee lives in the CONSUMER, not here (Codex 2.1).

FN-S2-5  _consume(bridge, service) -> None                                              # F2e
  Post:   per-message try/except/finally; ANY exception is caught and logged; a DB-reachable
          failure is dead-lettered; a DB-unreachable failure leaves the message unacked for
          redelivery. `task_done()` always runs. The task is SUPERVISED: if it dies it is
          restarted and the event recorded. This is the CLAUDE.md MUST NOT.
  Post:   manual ack: client.ack(mid, qos) is called ONLY after the disposition commits.

FN-S2-6  IngestService.run_forever(cfg) -> None                                         # F2d
  Post:   Client(CallbackAPIVersion.VERSION2, client_id=cfg.client_id, clean_session=False,
          manual_ack=True); connect(keepalive=10); reconnect_delay_set(min_delay=1,max_delay=4);
          loop_start() on its own thread; SUBSCRIBE(qos=1) inside on_connect; status becomes
          CONNECTED only on on_subscribe with granted qos == 1 (Codex 4.3 / 6.1 / 6.2).
  Post:   distinguishes retryable from terminal disconnect reason codes; a graceful shutdown
          does not retry.

FN-S2-7  query_range(pool, asset_id, t0, t1) -> list[Reading]                           # F2c
  Post:   t0 <= ts <= t1 for THAT asset_id only, ordered ts ASC, [] (never None) when empty.
```

## §5 Test Plan (RED-proofs)

```
TS1.1 test_roster_is_239_and_deterministic          RS1.a  unit
  Assert len==239; ids unique; first three == PWA-000-P1..PWA-002-P1; P-1/P-2/M-3/V-9 present;
  two calls equal.
  RED: before F1a -> ModuleNotFoundError; unsorted dict order -> AssertionError on first-3.

TS1.2 test_roster_matches_seed_db_exactly           RS1.c  unit  [DRIFT ORACLE]
  Assert {d.asset_id for d in load_devices()} == {r[0] for r in seed_db._devices(...)}.
  RED: any independent re-derivation -> AssertionError naming the symmetric difference.
  This is the test that stops S2 dead-lettering 100% of traffic.

TS1.3 test_envelope_matches_committed_contract      RS1.a  unit
  Assert json.loads(env.model_dump_json()) validates against contracts/…v1.schema.json;
  message_id stable for equal (run_id,asset_id,tick) and differs across ticks AND across run_ids.
  RED: missing run_id/message_id -> jsonschema ValidationError('required'), not KeyError.

TS1.4 test_fault_modes_are_injectable               RS1.b  unit
  Assert BAD_ASSET id ∉ roster; ANOMALY value outside the NORMAL band for the same (dev,tick);
  MALFORMED yields bytes that raise on json.loads.
  RED: a mode-ignoring make_signal returns the NORMAL value -> AssertionError on the band.

TS1.5 test_publishes_full_roster_to_real_broker     RS1.a  INTEGRATION (real Mosquitto)
  Arrange throwaway mosquitto on an ephemeral port; subscriber asserts SUBACK before act.
  Act run(cfg, max_messages=len(roster)).
  Assert received asset_id SET == roster asset_id set (full cycle, kills the Codex 3.1
  one-device stub); message_ids all distinct; granted subscription qos == 1; publish qos == 1;
  elapsed >= (n-1)/rate_hz (rate honoured).
  RED: readiness asserted first, so a broker-less env fails as fixture-error, distinguishable
  from 0-messages -> AssertionError.

TS2.1 test_subscriber_ingests_published_message     R1.1   INTEGRATION (broker+TSDB)
TS2.2 test_reconnect_within_30s                     R1.2   INTEGRATION
  Act hard-kill mosquitto, restart. Measure time.monotonic_ns() from the OBSERVED disconnect
  to successful SUBACK **and** a committed post-recovery ledger row. Assert < 30 s.
  Assert status transitions DISCONNECTED->CONNECTING->SUBSCRIBING->CONNECTED via the route.
  RED: with paho defaults (max_delay=120, keepalive=60) this exceeds 30 s -> AssertionError.
TS2.3 test_range_query_returns_ordered_rows         R1.4   INTEGRATION
  Insert 3 readings SHUFFLED at t,t+1,t+2; assert ascending; empty window -> [].
  Plus catalog assertion that `telemetry` IS a hypertable.
TS2.4 test_bad_asset_and_malformed_go_to_dlq_loop_continues   R1.5/RS2.c  INTEGRATION
  Publish [good, BAD_ASSET, malformed-bytes, good2].
  Assert telemetry has good & good2; dead_letter has both rejects with DISTINCT reasons;
  good2 present PROVES no stall; malformed stored as {_raw_b64,_decode_error}, byte-lossless.
  RED: a validate() raising into the consumer kills it -> good2 missing -> AssertionError,
  while `good` being present distinguishes this from a broken fixture.
TS2.5 test_redelivery_does_not_double_write         RS2.b  INTEGRATION + unit
  unit: call disposition() twice with one message_id -> True then False; 1 telemetry row.
  integration: with manual_ack, withhold the ack, force reconnect on a durable session so the
  broker genuinely redelivers with DUP; assert exactly one telemetry row and one ledger row.
TS2.6 test_conservation_against_independent_count   RS2.a  INTEGRATION
  Assert published_count == ledger_count AND ledger == telemetry + dlq, scoped by run_id.
  RED: the Codex 6.8 all-zero failure (0==0+0) now fails the FIRST conjunct.
TS2.7 test_migration_is_idempotent_and_upgrades     (F2a/F2b)  INTEGRATION
  Assert clean-install AND S0-volume upgrade both reach the same schema; runner is re-runnable.
```

## §6 Traceability
| Req | Tests | Files | Slice |
|---|---|---|---|
| RS0.a | gate run | F1e,F1f | S1 |
| RS1.a | TS1.1,TS1.3,TS1.5 | F1a,F1b,F1d,F1i | S1 |
| RS1.b | TS1.4 | F1d | S1 |
| RS1.c | TS1.2 | F1a,F1g | S1 |
| R1.1 | TS2.1 | F2c,F2d,F2e | S2 |
| R1.2 | TS2.2 | F2d,F2f,F2g | S2 |
| R1.4 | TS2.3 | F2c,F2a | S2 |
| R1.5 | TS2.4 | F2c,F2d,F2e | S2 |
| RS2.a | TS2.6 | F2c,F2a | S2 |
| RS2.b | TS2.5 | F2c | S2 |
| RS2.c | TS2.4 | F2e | S2 |
| (migration) | TS2.7 | F2a,F2b,F2i | S2 |

## §7 Wiring Verification
| Component | Runtime caller | Registration | Table |
|---|---|---|---|
| `load_devices()` | `publish.run()`, `seed_db.main()` | import in F1d + F1g | seeds `device` |
| `publish.run()` | container CMD `python -m app.publish` | compose `simulator` (profile `sim`) | — |
| envelope schema F1i | S1 test + S2 test | path constant in both conftests | — |
| `migrate.py` | compose `migrate` one-shot | `depends_on: timescaledb healthy` | `schema_migrations` |
| `seed_db.py` | compose `seed` one-shot | `depends_on: migrate completed_successfully` | `device`,`pipe_edge`,`customer_service_point` |
| `IngestService.run_forever` | lifespan startup (paho owns the thread via `loop_start()`; lifespan itself stays async and non-blocking) | `main.py` lifespan when `mqtt_enabled` | `telemetry`,`dead_letter`,`ingress_ledger` |
| `_consume` | supervised asyncio task | `main.py` lifespan | via `disposition()` |
| `GET /api/pipeline/status` | HTTP / demo UI | `app.include_router(pipeline)` in `main.py` | reads in-memory status |
| `get_pool()` | lifespan | `app.state.pool`; closed on shutdown | all |

## §8 Slice Plan
| ID | Scope | Owner | Stop line | Oracle | Done when |
|----|-------|-------|-----------|--------|-----------|
| **S1** | F1a–F1j | **DeepSeek** bodies of F1a–F1d; **Claude** F1e–F1j + all tests | **SL-2** (Q2: new package surface, >3 functions, crosses to broker + compose + a shared contract artifact) | TS1.1–TS1.5 | gates green, drift oracle green |
| **S2** | F2a–F2k | **Claude** — never-delegate | — (Q0: migration + the conservation/never-stall invariant; no cheap oracle) | TS2.1–TS2.7 | gates green, conservation vs independent count |

Land order S1 → S2. S2 depends on S1's merged roster + envelope contract; no branch-on-branch.

## §9 Risks
| Risk | Trigger | Blast radius | Gate / rollback |
|---|---|---|---|
| Roster drift sim↔seed | independent derivations | 100% DLQ; R1.1/R1.4 = 0 pts | F1g delegates to F1a + TS1.2 drift oracle |
| FK violation | unseeded `device` | every insert fails | compose `seed` as a completion dependency; conftest seeds |
| Stale schema on old volume | initdb doesn't re-run | new code, old schema | `migrate` service + TS2.7 upgrade test |
| Reconnect > 30 s | paho defaults (keepalive 60, backoff 120) | R1.2 (5 pts) | keepalive=10, max_delay=4, SUBACK-gated, TS2.2 |
| Silent QoS-0 downgrade | `subscribe()` default | at-most-once loss | subscribe(qos=1) + assert granted qos |
| Double-write on redelivery | unconditional insert | conservation false | ledger-first `RETURNING`, TS2.5 |
| Consumer task dies | unhandled exc in `_consume` | whole pipeline stalls | supervision + TS2.4 |
| Unbounded queue OOM | DB outage | process death | bounded queue; no-ack on overflow |

**Residual risk, stated not hidden:** with `persistence true` + `clean_session=False` +
manual-ack, a message is durable across a *broker restart* and a *DB outage*. It is **not**
durable across simultaneous broker-and-process loss with an unflushed broker DB. A disk-backed
application spool would close this; it is **deferred** (not silently dropped) — see §11 #4.
Conservation is therefore claimed over **deliveries the broker hands us**, measured against the
simulator's independent published count.

## §10 Do-Not-Touch (delegate)
- Every file under `simulator/tests/**` and `api/tests/**` (the contract).
- `contracts/telemetry-envelope.v1.schema.json`.
- `infra/db/**` (schema + migrations are Claude-only), `scripts/seed_db.py`, `scripts/migrate.py`.
- `infra/docker-compose.yml`, `infra/mosquitto/mosquitto.conf`.
- `data/curated/**`, `data/raw/**`, `design/**`.
- `POC_SPEC.md`, `docs/**`, `CLAUDE.md`.
- `.codex/coding-log.current`, `coding-logs/**`.
- Any `git`/`gh` command (PATH-shim blocked).

---

## §11 Codex adversarial pass — dispositions (31 findings)

**Accepted 27 · narrowed 3 · deferred 1.** No finding silently dropped.

| # | Codex finding (sev) | Disposition |
|---|---|---|
| 1 | No run/message identity on telemetry/DLQ → conservation unqueryable (CRIT) | **ACCEPT** → F2a migration + F2h |
| 2 | Compose hardcodes `MQTT_ENABLED=0`; S2 never enables it (CRIT) | **ACCEPT** → F2i |
| 3 | Seeding has no service/image/dependency edge (CRIT) | **ACCEPT** → `seed` one-shot in F2i |
| 4 | Durable spool requirement disappeared (CRIT) | **NARROW** → manual-ack-after-commit + `clean_session=False` + stable client_id + `persistence true` (F2j) + bounded queue. Disk spool **deferred**, residual risk stated in §9. |
| 5 | Reconnect observability has no route (HIGH) | **ACCEPT** → F2g `/api/pipeline/status` pulled forward from S3 |
| 6 | Test files absent from §3 (HIGH) | **ACCEPT** → F1j, F2k enumerated |
| 7 | "Committed envelope contract" didn't exist (HIGH) | **ACCEPT** → F1i |
| 8 | 002.sql not mounted; volume skips initdb (HIGH) | **ACCEPT** → F2b runner + mount `./db` dir |
| 9 | CI entirely absent (MED) | **DEFER, recorded** — no CI exists at all; a Docker-capable workflow is its own slice. Now meaningful (remote created today). Follow-up owner: next infra PR. |
| 10 | `on_message` is the wrong failure boundary (CRIT) | **ACCEPT** → FN-S2-4/5 restructured; guarantee moved to the supervised consumer |
| 11 | `disposition()` signature can't do its job; redelivery doubles (HIGH) | **ACCEPT** → FN-S2-3 tagged-union + ledger-first `RETURNING` |
| 12 | `make_envelope` self-contradictory (stable-on-replay vs unique-per-delivery) (HIGH) | **ACCEPT** → logical-event id vs MQTT delivery id split; run_id fresh per process |
| 13 | TS1.5 vacuous — one-device stub passes (HIGH) | **ACCEPT** → full-roster set equality + distinct ids + qos + rate bound |
| 14 | migration→seed→roster→publish order unenforced (CRIT) | **ACCEPT** → compose completion dependencies |
| 15 | Existing S0 volumes silently skip S2 schema (CRIT) | **ACCEPT** → TS2.7 upgrade path |
| 16 | SUBACK ≠ CONNACK; recovery probe lost (HIGH/CRIT) | **ACCEPT** → SUBSCRIBING state, SUBACK-gated CONNECTED |
| 17 | S1/S2 share no contract artifact (HIGH) | **ACCEPT** → F1i consumed by both test suites |
| 18 | "002 applied by initdb mount" factually false (CRIT) | **ACCEPT** — verified; corrected in §0 |
| 19 | Run-scoped conservation impossible on current schema; malformed bytes can't enter JSONB (CRIT) | **ACCEPT** — verified `UnicodeDecodeError`; `{_raw_b64,_decode_error}` round-trip verified lossless |
| 20 | "API lifespan thread" wording false (HIGH) | **ACCEPT** — §7 corrected; clean shutdown specified |
| 21 | `subscribe()` defaults to QoS 0; effective = min (CRIT) | **ACCEPT** — verified in installed paho; subscribe(qos=1) + assert granted |
| 22 | 20 s backoff cap doesn't bound recovery; keepalive 60 s unset (HIGH) | **ACCEPT** — keepalive=10, max_delay=4, deadline defined |
| 23 | clean_session=True + persistence off loses outage window (HIGH) | **ACCEPT** (see #4) |
| 24 | Callback API V1 default → V2 callbacks `TypeError` (HIGH) | **ACCEPT** — verified; pin VERSION2, classify reason codes |
| 25 | Clock endpoints wrong (HIGH) | **ACCEPT** — `time.monotonic_ns()`, disconnect→SUBACK→committed row |
| 26 | Paho ACKs before durability (CRIT) | **NARROW** → manual_ack, ack after commit (see #4) |
| 27 | `0 == 0 + 0` passes after data loss (CRIT) | **ACCEPT** — independent `published_count` conjunct in RS2.a/TS2.6 |
| 28 | Manual ACK still fails across broker restart (CRIT) | **NARROW** → persistence + durable session; residual stated in §9 |
| 29 | QoS-1 redelivery double-write (HIGH) | **ACCEPT** → ledger-first `RETURNING` |
| 30 | TS2.5 doesn't simulate real redelivery (HIGH) | **ACCEPT** → withhold ack + durable-session reconnect for a genuine DUP |
| 31 | Unbounded queue (MED) | **ACCEPT** → bounded queue, no-ack on overflow = backpressure |

**Net.** The review's centre of gravity: the plan had *correctness by discipline* where it
needed *correctness by construction*. Three classes of defect were caught before a line was
written — (a) the schema cannot express the invariant the plan claims to test, (b) paho's
defaults violate three separate stated bounds, and (c) the "never stall" guarantee was pinned
to the wrong function. All three would have shipped green tests over a broken demo.
