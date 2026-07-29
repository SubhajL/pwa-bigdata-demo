No CRITICAL findings. Four HIGH findings are release blockers; I would not defend the 25 points yet.

## HIGH

1. **A transient DB failure can wedge ingestion indefinitely.**  
   `api/app/service.py:98-109,112-122`; `api/app/config.py:38-40`

   `consume_once()` removes the delivery from the queue, `dispose_message()` returns `False`, and `task_done()` discards the local reference. Nothing retries it or resets MQTT. An unacknowledged QoS-1 message is only required to be redelivered when the client reconnects—not while the same connection remains healthy. Eventually the broker’s in-flight window can fill while status remains `connected`. [MQTT 3.1.1 §4.4](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/csd01/mqtt-v3.1.1-csd01.html)

   Concrete test: fail disposition for message A with Mosquitto’s in-flight limit set to one, restore the DB without reconnecting MQTT, then require A and later message B to commit within a bound.

   `test_a_failed_message_is_left_unacked_for_redelivery` still passes because it proves only that a fake `ack()` was not invoked. It observes no broker and no redelivery. `test_an_unexpected_disposition_error_does_not_stall_the_loop` also passes while permanently losing its first message.

   Fix: retain and retry failed messages with bounded backoff, or deliberately reconnect so the durable session redelivers them. Expose a degraded state meanwhile.

2. **Valid wire inputs can fail both telemetry and DLQ persistence.**  
   `api/app/ingest.py:83-88,126-132`; `api/app/db.py:89-98`; `api/app/service.py:82-108`

   For `"value":1e10000`, Python decodes the number as infinity. Validation correctly rejects it, but `encode_raw(dict)` serializes it as `Infinity`, which PostgreSQL rejects for JSONB. JSON strings containing `\u0000` fail similarly. The transaction rolls back, no DLQ row exists, and finding 1 takes over. PostgreSQL explicitly rejects infinity and `\u0000` in JSONB. [PostgreSQL JSONB restrictions](https://www.postgresql.org/docs/16/datatype-json.html)

   A sufficiently large integer can instead make `float(value)` raise `OverflowError`, bypassing `MessageRejected` entirely.

   Concrete test: publish both payloads, require one DLQ row per input, then require a following good message to commit.

   `test_validate_rejects_malformed_fields` still passes because it never persists the rejected dict. The E2E poison test covers only invalid JSON and unknown assets.

   Fix: retain the original bytes through classification; decode JSON strictly; and wrap any payload that JSONB cannot represent.

3. **The bounded queue admission is racy and uses `asyncio.Queue` from the wrong thread.**  
   `api/app/main.py:42-53`; `api/app/ingest.py:264-270`

   `queue.full()` runs on Paho’s thread, then `put_nowait()` is scheduled later. Several callbacks can all observe free capacity before the event loop processes any of them. Excess callbacks then raise `QueueFull` on the event loop, although `submit()` already returned `True`; overflow metrics remain unchanged and the application no longer holds those messages. `asyncio.Queue` is explicitly not thread-safe. [Python asyncio queue documentation](https://docs.python.org/3/library/asyncio-queue.html)

   Concrete test: capacity one, block the event loop, submit two messages from a worker thread, then release it. Require one accepted message, one explicit rejection, and no loop exception.

   No existing test exercises `IngestBridge` capacity or cross-thread admission.

   Fix: use a thread-safe bounded channel, or perform the capacity decision and enqueue atomically on the event-loop thread with an explicit result path.

4. **Malformed-message identity makes conservation impossible and eventually drops distinct deliveries.**  
   `api/app/service.py:75-83,100-109`; `api/app/db.py:24-29,160-168`; `infra/db/001_init.sql:30-35`

   `undecodable:{topic}:{mid}` is not an immutable event ID. MQTT packet identifiers are reusable after PUBACK. A later distinct malformed delivery on the same topic with a reused MID hits the ledger conflict; `dispose_message()` ignores `disposition()` returning `False` and acknowledges it anyway. That is silent loss.

   Worse, malformed messages use `run_id=NULL`, so the advertised run-scoped equation excludes the exact malformed fault mode being scored.

   Concrete test: sequentially disposition two different malformed payloads with the same topic/MID after acknowledging the first; require two DLQ rows and run attribution.

   `test_bad_messages_go_to_dlq_and_the_loop_keeps_running` explicitly excludes malformed traffic from its conservation count. Its global `LIKE 'undecodable:%'` query does not identify the published delivery. `test_conservation_against_an_independent_published_count` sends only parseable messages.

   Fix: carry immutable message/run identity outside the JSON body—MQTT v5 properties or a run-scoped topic envelope—or explicitly admit that conservation does not cover malformed traffic.

## MEDIUM

5. **`conservation_counts()` can report a violation that never existed.**  
   `api/app/db.py:160-168`

   The three `SELECT`s use separate READ COMMITTED snapshots. A disposition committing between the ledger and telemetry queries can produce `ledger=N, telemetry=N+1`. PostgreSQL documents that successive SELECTs in one READ COMMITTED transaction can see different snapshots. [PostgreSQL transaction isolation](https://www.postgresql.org/docs/16/transaction-iso.html)

   Concrete test: coordinate a second connection to commit between the first and second count queries.

   Every current conservation test runs after publishing has quiesced, so all remain green.

   Fix: calculate all three counts in one SQL statement or use REPEATABLE READ.

6. **`disposition()` does not enforce matching ledger/destination identity “by construction.”**  
   `api/app/db.py:119-133`

   Ledger identity comes from the function arguments; telemetry identity comes from `outcome.reading`. A caller can atomically commit ledger `(message=A, run=A)` and telemetry `(message=B, run=B)`, immediately breaking run-scoped conservation.

   Concrete test: deliberately pass mismatched identities and require rollback/rejection.

   `test_range_query_returns_rows_in_ascending_time_order` already passes mismatched message IDs: its ledger ID at lines 101-102 differs from `_reading()`’s generated ID at line 104.

   Fix: have one identity source and use it for both inserts, or validate equality before opening the transaction.

7. **The reconnect test does not prove the guarantees named in its comments.**  
   `api/tests/test_pipeline_e2e.py:251-286`; `api/tests/conftest.py:152-163`; `infra/mosquitto/mosquitto.conf:10-14`

   It starts timing only after disconnect is observed, restarts the broker immediately, and publishes only after a fresh SUBACK. It therefore still passes with:

   - `clean_session=True`;
   - broker persistence disabled;
   - automatic acknowledgment enabled;
   - the default 120-second reconnect cap, because only the first short retry occurs;
   - no restoration of an in-flight message.

   It also does not use the committed Mosquitto configuration or named persistence volume. Mosquitto’s default persistence interval is 30 minutes, so an abrupt crash can lose recent session state even though a clean `docker stop` writes it. [Mosquitto persistence documentation](https://mosquitto.org/man/mosquitto-conf-5.html)

   Concrete tests:

   - Blackhole the network and measure from the actual drop, keeping the broker unavailable through several failed reconnect attempts.
   - Leave a QoS-1 message unacknowledged, crash the broker, restart with the committed volume/config, and require that exact message to commit.

   The VERSION2 callback arities themselves are correct: connect, subscribe, disconnect, and message callbacks match Paho’s documented signatures. [Paho callback documentation](https://eclipse.dev/paho/files/paho.mqtt.python/html/client.html)

8. **Compose advertises the wrong run ID.**  
   `infra/docker-compose.yml:85-86,109-113`; `api/app/routes/pipeline.py:26-29`

   API and simulator independently generate `api-*` and `sim-*` IDs. The status endpoint reports the API ID, while persisted rows carry the simulator ID. A judge following the live indicator’s run ID will query zero rows.

   Concrete test: start the actual Compose API and simulator with blank defaults, publish one message, and require `/api/pipeline/status.run_id` to equal the persisted ledger run ID.

   `_start_ingest()` masks this by explicitly assigning the same test `run_id` to both API settings and payloads.

   Fix: share one Compose `RUN_ID`, or distinguish `subscriber_run_id` from `producer_run_id` honestly.

## LOW

9. **The “escaping failure” test still does not exercise `run_consumer` supervision.**  
   `api/tests/test_consumer_resilience.py:152-184`; `api/app/service.py:112-134`

   The injected exception is caught by `consume_once()`. Delete the entire `try/except` from `run_consumer()` and the test still passes.

   Concrete test: monkeypatch `consume_once()` itself to raise once, then require a subsequent invocation and successful message.

10. **The migration runner is not concurrent-safe.**  
    `scripts/migrate.py:51-64`

    Two runners can read the same `done` set and execute the same migration before racing on the ledger insert. Current DDL happens to tolerate replay; a future backfill may not.

    Concrete test: run two `apply_pending()` calls concurrently against a migration with an observable non-idempotent side effect.

    `test_migration_runner_is_idempotent` only examines a completed sequential rerun, so it cannot expose this race.

## Verified non-findings

The ledger-first transaction itself is sound: `conn.transaction()` keeps ledger and destination atomic, and the pool context commits or rolls back correctly. A destination failure does not leave a ledger row behind. [Psycopg pool semantics](https://www.psycopg.org/psycopg3/docs/advanced/pool.html)

The TIMESTAMPTZ handling, Timescale-compatible non-unique indexes, hypertable alteration, and sequential replay of migration 002 are otherwise reasonable.

`docker compose config --quiet` passed, including both profiles. Runtime pytest could not start because this review environment has no writable temporary directory, and the Docker daemon was unavailable.

This review targets the pasted working-tree diff at `bd6ef824`; the shared tree changed concurrently during review. The `g-check` Coding Log append could not be performed because the filesystem is read-only.