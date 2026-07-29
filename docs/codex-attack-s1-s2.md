## 1. Files the plan misses

- **CRITICAL — No migration can support run-scoped conservation.** `telemetry` lacks both `message_id` and `run_id`; the ledger and DLQ lack `run_id`; `Reading` drops both fields. RS2.a therefore cannot be queried honestly. See [001_init.sql:19](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/db/001_init.sql:19), [001_init.sql:30](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/db/001_init.sql:30), [001_init.sql:38](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/db/001_init.sql:38), and [models.py:22](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/models.py:22). Missing: `infra/db/002_ingest_identity.sql`, an `api/app/models.py` change, and a real migration runner.
  
  Fix: Persist `message_id` and `run_id` through ledger, telemetry, DLQ, and typed models before writing ingest code.

- **CRITICAL — S2 remains disabled in the advertised Compose runtime.** Compose hardcodes `MQTT_ENABLED: "0"` at [docker-compose.yml:43](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/docker-compose.yml:43), but S2 does not list Compose or [env.sample:1](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/env.sample:1).
  
  Fix: Add `infra/docker-compose.yml` and `infra/env.sample` to S2 and test that the composed API actually starts the subscriber.

- **CRITICAL — Runtime seeding has no service, image, or dependency edge.** Seeding is explicitly manual at [seed_db.py:9](/Users/subhajlimanond/dev/pwa-bigdata-demo/scripts/seed_db.py:9). API and simulator wait only for DB/broker health at [docker-compose.yml:46](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/docker-compose.yml:46) and [docker-compose.yml:64](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/docker-compose.yml:64). The API image does not contain the seed script or curated data ([api/Dockerfile:3](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/Dockerfile:3)).
  
  Fix: Add a one-shot seed service plus suitable Dockerfile/image contents, then require successful seed completion before API subscription and simulator publication.

- **CRITICAL — The already-accepted durable-spool requirement disappeared.** The parent DREP explicitly requires a durable spool for DB-down handling at [DREP-demo-poc.md:369](/Users/subhajlimanond/dev/pwa-bigdata-demo/docs/DREP-demo-poc.md:369). S2 contains no spool module, disk volume, retry worker, or manual-ACK coordination.
  
  Fix: Add a durable inbox/spool and its Compose volume, or enable durable broker sessions and ACK only after database commit.

- **HIGH — Reconnect observability has no file or route.** The existing API exposes only `/healthz` at [main.py:70](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/main.py:70). There is no status state, `on_subscribe` state transition, metric, or `/api/pipeline/status` route.
  
  Fix: Add a status model/store and route in S2, or stop claiming S2 satisfies the observable portion of R1.2.

- **HIGH — The tests named in §5 have no test files in §3.** F1i/F2e list only `conftest.py` and `__init__.py`; the repo currently has only health tests, while pytest searches `tests/` ([pyproject.toml:19](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/pyproject.toml:19)).
  
  Fix: List the actual `test_roster.py`, `test_publish.py`, `test_ingest.py`, `test_db.py`, and reconnect test modules as change-contract files.

- **HIGH — TS1.3 refers to a nonexistent “committed envelope contract.”** No JSON Schema file exists or is proposed.
  
  Fix: Add a versioned envelope schema artifact consumed by both producer and ingest tests.

- **HIGH — Adding `002_*.sql` is not enough.** Compose mounts exactly `001_init.sql`, not the DB directory ([docker-compose.yml:27](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/docker-compose.yml:27)); moreover, the named volume at [docker-compose.yml:29](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/docker-compose.yml:29) means init scripts do not rerun on existing stacks.
  
  Fix: Add an ordered migration runner and test upgrade of an existing S0 volume.

- **MEDIUM — CI is entirely absent.** The repository documents local gates only at [CLAUDE.md:23](/Users/subhajlimanond/dev/pwa-bigdata-demo/CLAUDE.md:23); there is no `.github/workflows` job capable of provisioning Mosquitto and TimescaleDB.
  
  Fix: Add a Docker-capable integration workflow with bounded readiness and failure diagnostics.

No `__init__.py` export change is inherently required; direct module imports are sufficient. Do not add ceremonial exports to disguise the real wiring gaps.

## 2. Wrong or underspecified function contract

- **CRITICAL — FN-S2-4 assigns correctness to the wrong failure boundary.** The existing architecture makes `on_message` a thread-to-queue handoff; actual disposition occurs later in `_consume()` ([main.py:24](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/main.py:24), [main.py:41](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/main.py:41)). Therefore “`on_message` never raises” does not prevent a decode/DB exception from killing the sole asyncio consumer. “ANY exception is dead-lettered” is also impossible when the exception is a DB outage and DLQ uses that same DB.
  
  Fix: Make `on_message` enqueue an immutable raw-message DTO only; put per-message `try/except/finally`, transient retry/spooling, task supervision, and `task_done()` in the consumer.

- **HIGH — FN-S2-3 cannot perform its stated job from its signature.** `disposition(conn, message_id, raw, outcome)` receives neither a `Reading` nor DLQ `reason`, `asset_id`, or `run_id`. It also permits `INSERT ledger ON CONFLICT DO NOTHING` followed by an unconditional telemetry insert; telemetry has no uniqueness constraint, so redelivery doubles it.
  
  Fix: Accept a typed success-or-rejection disposition and insert the destination only when the ledger insert returns a newly inserted row.

- **HIGH — FN-S1-3 contradicts itself.** A UUID stable on replay is an idempotency key for a logical event, not an ID “unique per delivery.” Reusing `run_id|asset_id|tick` after a simulator restart silently suppresses legitimate new data.
  
  Fix: Define logical-event identity separately from MQTT delivery identity and enforce fresh `run_id` lifecycle semantics.

## 3. Vacuous test

- **HIGH — TS1.5 passes a simulator that never cycles the roster, uses QoS 0, ignores rate, and repeats one message forever.** This exact broken implementation satisfies its assertions:

```python
def run(cfg, *, max_messages=None):
    dev = load_devices()[0]
    payload = make_envelope(dev, 0, cfg.run_id, FaultMode.NORMAL).model_dump_json()
    count = max_messages or 20
    for _ in range(count):
        client.publish(f"pwa/telemetry/{dev.asset_id}", payload, qos=0)
    return count
```

It emits 20 schema-valid messages whose topic matches the payload, so TS1.5 passes while 238 devices are never published, every `message_id` is duplicated, configured rate is ignored, and the required QoS is wrong.

Fix: Observe a full roster cycle; assert exact asset-ID coverage, distinct logical message IDs, QoS 1 delivery, and a bounded rate interval.

## 4. Ordering hazards

- **CRITICAL — The required runtime order is migration → seed → roster load/subscription → publication, but Compose enforces none of it.** A fresh DB has an empty `device` table; telemetry then violates the FK at [001_init.sql:21](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/db/001_init.sql:21). If `known_asset_ids()` is cached before the manual seed, every legitimate message remains invalid until restart.
  
  Fix: Make migration and seed successful-completion dependencies, load the roster afterward, and start the simulator last.

- **CRITICAL — Existing S0 volumes silently skip S2 schema.** Even if PR-2 adds `002`, the current exact-file init mount and persistent volume mean developers can run new code against old schema.
  
  Fix: Prove both clean-install and S0-to-S2 upgrade paths with an explicit migration command.

- **HIGH — SUBACK ordering is missing.** `on_connect` means CONNACK was received, not that the subscription is active. Publishing immediately after broker restart can land before SUBACK and disappear, especially with broker persistence disabled.
  
  Fix: Introduce `SUBSCRIBING`; transition to `CONNECTED` only after a successful `on_subscribe`, then publish the recovery probe.

- **HIGH — S1 and S2 do not share a real contract artifact.** S1 creates simulator-side models; S2 validates separate API-side literals at [models.py:9](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/models.py:9). PR-1 can merge a wire format PR-2 silently interprets differently.
  
  Fix: Land and test a versioned schema in S1; make S2 consume that exact artifact.

## 5. Factually false assumptions

- **CRITICAL — “`002_*.sql` is applied by the TimescaleDB initdb mount” is false.** Only `001_init.sql` is mounted ([docker-compose.yml:28](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/docker-compose.yml:28)), and initdb does not upgrade the existing named volume.
  
  Fix: Replace this assumption with a real migration mechanism.

- **CRITICAL — “Conservation for a run” is possible on the current schema is false.** There is no run identity on telemetry or DLQ, and malformed bytes cannot be stored unchanged in their mandatory `JSONB raw` columns ([001_init.sql:34](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/db/001_init.sql:34), [001_init.sql:43](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/db/001_init.sql:43)).
  
  Fix: Migrate the schema and define a lossless JSON representation such as base64 plus encoding and transport metadata.

- **HIGH — “API lifespan thread” is false.** Lifespan is an async context manager and `_consume` is an asyncio task ([main.py:49](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/main.py:49), [main.py:57](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/main.py:57)). Only Paho’s network loop should own a thread.
  
  Fix: Specify nonblocking lifespan startup and explicit `disconnect()`, `loop_stop()`, consumer cancellation, and pool closure.

- **HIGH — “The subscriber runs in Compose after S2” is false under the declared file list.** Compose still supplies `MQTT_ENABLED=0`.
  
  Fix: Put Compose enablement in S2 and cover it with a composed smoke test.

- **HIGH — “Reconnect status is observable” is false in the current/proposed surface.** There is no status route or live indicator; the scored specification explicitly requires one at [POC_SPEC.md:241](/Users/subhajlimanond/dev/pwa-bigdata-demo/POC_SPEC.md:241).
  
  Fix: Add the observable surface or reduce the claimed S2 score until the later UI slice lands.

## 6. Reconnect and conservation attacks

### Reconnect

- **CRITICAL — Publish-before-SUBACK loses the recovery probe.** Concrete sequence: broker restarts with empty state; subscriber receives CONNACK and calls `subscribe()`; publisher reconnects faster and publishes; broker accepts/ACKs it before subscription installation; no subscriber receives it. Broker persistence is explicitly off at [mosquitto.conf:10](/Users/subhajlimanond/dev/pwa-bigdata-demo/infra/mosquitto/mosquitto.conf:10).
  
  Fix: Measure recovery only after successful SUBACK and then publish repeatedly or publish a uniquely identified probe.

- **CRITICAL — The contract never requires subscription QoS 1.** Paho’s `subscribe()` defaults to QoS 0 ([client.py:1894](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/.venv/lib/python3.13/site-packages/paho/mqtt/client.py:1894)). Publishing at QoS 1 does not help: effective delivery QoS is the minimum of publish and subscription QoS.
  
  Fix: Require and assert `subscribe(topic, qos=1)` and the granted SUBACK QoS.

- **HIGH — A 20-second backoff cap does not prove recovery within 30 seconds.** It bounds one retry sleep, not broker downtime, multiple failed attempts, TCP/CONNACK/SUBACK, processing, or DB commit. A silent network blackhole is worse: current config has no keepalive setting ([config.py:7](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/config.py:7)), while installed Paho defaults to 60 seconds.
  
  Fix: Define detection and recovery deadlines, configure keepalive below the budget, and test both hard socket close and silent loss.

- **HIGH — Session semantics permit outage-window loss.** Paho 2.1 defaults to MQTT 3.1.1 with `clean_session=True` when unspecified ([client.py:733](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/.venv/lib/python3.13/site-packages/paho/mqtt/client.py:733), [client.py:780](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/.venv/lib/python3.13/site-packages/paho/mqtt/client.py:780)); Mosquitto persistence is off. Broker restart therefore destroys subscriptions, queued messages, and in-flight state.
  
  Fix: Specify stable client ID and durable-session semantics plus broker persistence, or explicitly exclude outage-window messages and stop claiming continuous conservation.

- **HIGH — Callback API and reason-code handling are unspecified.** Paho 2.1 defaults to deprecated callback API V1, whose MQTT 3 `on_disconnect` takes three arguments; V2 takes five ([client.py:4358](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/.venv/lib/python3.13/site-packages/paho/mqtt/client.py:4358)). A V2-shaped callback on the default client raises `TypeError` in the network thread. Normal shutdown, server disconnect, auth/protocol rejection, and transport loss also must not all trigger identical retry behavior.
  
  Fix: Pin callback API V2 and define retryable reason codes, terminal reason codes, and graceful-shutdown behavior.

- **HIGH — The clock endpoints are wrong unless explicitly defined.** “Docker stop/start elapsed” and `CONNECTED` at CONNACK can pass without an active subscription or durable ingest. Wall-clock timestamps can jump.
  
  Fix: Use `time.monotonic_ns()` from observed unexpected disconnect to successful SUBACK plus committed post-recovery ledger/telemetry row.

### Conservation

- **CRITICAL — Paho ACKs before durability.** Concrete interleaving: `on_message` enqueues M and returns; Paho sends PUBACK; `_consume` starts later; DB fails or the process dies before commit; broker discards M; no ledger, telemetry, or DLQ row remains. Paho explicitly auto-ACKs QoS 1 after the callback unless manual acknowledgement is enabled ([client.py:4147](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/.venv/lib/python3.13/site-packages/paho/mqtt/client.py:4147)).
  
  Fix: Enable manual ACK and ACK only after committed disposition, backed by durable spooling for broker/process failure.

- **CRITICAL — The proposed equation can report success after data loss.** In the preceding failure, database counts are `ledger=0`, `telemetry=0`, `dlq=0`; therefore `0 == 0 + 0` passes even though one broker delivery vanished. The invariant has no independent accepted-input counter.
  
  Fix: Define acceptance at durable-spool insertion or ledger commit and reconcile broker/spool receive counts against dispositions.

- **CRITICAL — Manual ACK alone still fails across broker restart.** If DB is down, M remains unacknowledged, then Mosquitto restarts with persistence off, M and the subscriber session disappear. There is nothing to redeliver.
  
  Fix: Persist broker state and durable sessions, or synchronously persist an application inbox before returning from the callback.

- **HIGH — QoS 1 redelivery can double-write under the stated transaction contract.** Sequence: DB transaction commits; connection drops before PUBACK reaches broker; broker redelivers; ledger insert conflicts; code nevertheless inserts telemetry because FN-S2-3 does not require branching on `RETURNING`. `telemetry` has no message-ID uniqueness constraint.
  
  Fix: Insert the ledger first with `ON CONFLICT DO NOTHING RETURNING`; insert exactly one destination only when a row was returned, then ACK duplicates.

- **HIGH — TS2.5 does not simulate QoS redelivery.** Publishing the same application `message_id` twice is an ordinary duplicate publish, not “commit succeeded, PUBACK was lost, broker redelivered with DUP.”
  
  Fix: Force disconnect after DB commit but before ACK and assert one durable outcome after genuine broker redelivery.

- **HIGH — Malformed bytes have neither a usable application ID nor JSONB representation.** Random IDs double-count a broker redelivery; a content hash collapses two distinct identical deliveries; Paho `mid` is session-scoped and reusable. Non-UTF8 bytes cannot be inserted directly into the current JSONB columns.
  
  Fix: Define transport-level durable identity and lossless byte encoding before claiming malformed-message conservation.

- **MEDIUM — The queue is unbounded.** `asyncio.Queue()` has no limit at [main.py:28](/Users/subhajlimanond/dev/pwa-bigdata-demo/api/app/main.py:28). During DB outage, Paho keeps ACKing while memory grows until process death.
  
  Fix: Use a bounded durable buffer with explicit backpressure, retry, overflow metrics, and a DB-down recovery test.