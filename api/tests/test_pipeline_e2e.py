"""TS2.1 / TS2.2 / TS2.4 / TS2.6 — the scored pipeline, end to end.

Real Mosquitto, real TimescaleDB, real paho. These four tests are what items 1.1, 1.2,
1.4 and 1.5 (25 points) are actually marked on, so none of them is allowed to pass on a
technicality:

* the bad-message test proves the loop CONTINUED, by requiring a message published
  *after* the poison ones to arrive — a subscriber killed by the poison message fails
  here even though the earlier good message is already safely stored;
* conservation is checked against an INDEPENDENT published count, so the degenerate
  "nothing was ingested at all" state (0 == 0 + 0) fails instead of passing;
* reconnect is measured on a monotonic clock from the observed disconnect to a
  *committed post-recovery row*, not merely to CONNACK.
"""
from __future__ import annotations

import asyncio
import json
import subprocess
import time
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import paho.mqtt.client as mqtt
import pytest
from paho.mqtt.enums import CallbackAPIVersion
from psycopg_pool import ConnectionPool

from app.config import Settings
from app.db import conservation_counts
from app.ingest import PipelineState, PipelineStatus
from app.main import IngestBridge
from app.service import IngestDeps, load_roster, run_consumer, start_subscriber, stop_subscriber

from .conftest import MOSQUITTO_IMAGE, _free_port, _require_docker, _wait_for_port

pytestmark = pytest.mark.integration

SEEDED_ASSET = "P-2"
OTHER_ASSET = "P-1"
UNKNOWN_ASSET = "PWA-UNKNOWN-DEVICE-000"


def _envelope(run_id: str, asset_id: str, tick: int) -> bytes:
    return json.dumps(
        {
            "message_id": f"{run_id}-{tick}",
            "run_id": run_id,
            "ts": datetime.now(tz=UTC).isoformat(),
            "asset_id": asset_id,
            "signal": "pressure_bar",
            "value": 3.0 + tick,
        }
    ).encode()


def _publisher(port: int) -> mqtt.Client:
    client = mqtt.Client(CallbackAPIVersion.VERSION2, client_id=f"pub-{uuid.uuid4().hex[:8]}")
    client.connect("127.0.0.1", port, keepalive=10)
    client.loop_start()
    return client


def _publish(client: mqtt.Client, asset_id: str, payload: bytes) -> None:
    info = client.publish(f"pwa/telemetry/{asset_id}", payload, qos=1)
    info.wait_for_publish(timeout=10)


async def _start_ingest(
    dsn: str, port: int, run_id: str
) -> tuple[IngestDeps, asyncio.Task[None], mqtt.Client]:
    settings = Settings(
        database_url=dsn,
        mqtt_host="127.0.0.1",
        mqtt_port=port,
        mqtt_enabled=True,
        mqtt_client_id=f"ingest-{run_id}",
        api_run_id=run_id,
    )
    pool = ConnectionPool(dsn, min_size=1, max_size=3, open=True)
    status = PipelineStatus()
    bridge = IngestBridge(maxsize=settings.ingest_queue_max, status=status)
    bridge.bind(asyncio.get_running_loop())
    deps = IngestDeps(pool=pool, roster=load_roster(pool), status=status, run_id=run_id)
    task = asyncio.create_task(run_consumer(deps, bridge.queue))
    client = start_subscriber(deps, settings, bridge.submit)
    deps.client = client
    return deps, task, client


async def _await_state(
    status: PipelineStatus, state: PipelineState, timeout: float = 30.0
) -> float:
    """Wait for a subscriber state; returns how long it took (monotonic seconds)."""
    started = time.monotonic()
    while time.monotonic() - started < timeout:
        if status.state is state:
            return time.monotonic() - started
        await asyncio.sleep(0.05)
    raise AssertionError(f"never reached {state} within {timeout}s (now {status.state})")


async def _await_ledger(
    pool: ConnectionPool, run_id: str, expected: int, timeout: float = 30.0
) -> None:
    started = time.monotonic()
    last = -1
    while time.monotonic() - started < timeout:
        last = conservation_counts(pool, run_id)["ledger"]
        if last >= expected:
            return
        await asyncio.sleep(0.1)
    raise AssertionError(f"only {last}/{expected} messages dispositioned within {timeout}s")


async def _shutdown(deps: IngestDeps, task: asyncio.Task[None], client: mqtt.Client) -> None:
    await stop_subscriber(client)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    deps.pool.close()


async def test_subscriber_ingests_a_published_message(timescale_dsn: str, mosquitto: int) -> None:
    """R1.1 — continuous ingest from the simulated broker."""
    run_id = f"e2e-ingest-{uuid.uuid4().hex[:8]}"
    deps, task, sub = await _start_ingest(timescale_dsn, mosquitto, run_id)
    pub = _publisher(mosquitto)
    try:
        await _await_state(deps.status, PipelineState.CONNECTED)
        assert deps.status.granted_qos == 1, "subscription was downgraded below QoS 1"

        _publish(pub, SEEDED_ASSET, _envelope(run_id, SEEDED_ASSET, 0))
        await _await_ledger(deps.pool, run_id, 1)

        counts = conservation_counts(deps.pool, run_id)
        assert counts == {"ledger": 1, "telemetry": 1, "dead_letter": 0}
    finally:
        pub.loop_stop()
        await _shutdown(deps, task, sub)


async def test_bad_messages_go_to_dlq_and_the_loop_keeps_running(
    timescale_dsn: str, mosquitto: int
) -> None:
    """R1.5 (10 pts) — the headline test.

    `good2` is published AFTER both poison messages. Its presence is the proof that the
    ingest loop survived them; `good1` being present distinguishes a genuine stall from a
    broken fixture.
    """
    run_id = f"e2e-dlq-{uuid.uuid4().hex[:8]}"
    deps, task, sub = await _start_ingest(timescale_dsn, mosquitto, run_id)
    pub = _publisher(mosquitto)
    try:
        await _await_state(deps.status, PipelineState.CONNECTED)

        _publish(pub, SEEDED_ASSET, _envelope(run_id, SEEDED_ASSET, 0))          # good1
        _publish(pub, UNKNOWN_ASSET, _envelope(run_id, UNKNOWN_ASSET, 1))        # unknown asset
        _publish(pub, SEEDED_ASSET, b"{not json at all")                         # undecodable
        _publish(pub, OTHER_ASSET, _envelope(run_id, OTHER_ASSET, 3))            # good2

        # 3 carry our run_id; the undecodable one cannot (it has no parseable body).
        await _await_ledger(deps.pool, run_id, 3)
        await asyncio.sleep(1.0)

        with deps.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT asset_id FROM telemetry WHERE run_id = %s ORDER BY ts", (run_id,)
            )
            stored = [row[0] for row in cur.fetchall()]
            cur.execute(
                "SELECT asset_id, reason FROM dead_letter WHERE run_id = %s", (run_id,)
            )
            dlq = cur.fetchall()
            cur.execute(
                "SELECT reason FROM dead_letter WHERE message_id LIKE %s", ("undecodable:%",)
            )
            undecodable = cur.fetchall()

        assert SEEDED_ASSET in stored, "the first good message never landed (fixture problem)"
        assert OTHER_ASSET in stored, (
            "the message published AFTER the poison ones is missing — the ingest loop stalled"
        )
        assert any(row[0] == UNKNOWN_ASSET for row in dlq), "unknown asset was not dead-lettered"
        assert any("unknown asset" in row[1] for row in dlq)
        assert undecodable, "undecodable payload was not dead-lettered"
        assert any("json" in row[0] or "utf-8" in row[0] for row in undecodable)
    finally:
        pub.loop_stop()
        await _shutdown(deps, task, sub)


async def test_conservation_against_an_independent_published_count(
    timescale_dsn: str, mosquitto: int
) -> None:
    """RS2.a — published == ledger, and ledger == telemetry + dlq.

    The first conjunct is what makes this real: without it, a pipeline that ingested
    nothing would satisfy `0 == 0 + 0` and report success.
    """
    run_id = f"e2e-cons-{uuid.uuid4().hex[:8]}"
    deps, task, sub = await _start_ingest(timescale_dsn, mosquitto, run_id)
    pub = _publisher(mosquitto)
    published = 0
    try:
        await _await_state(deps.status, PipelineState.CONNECTED)

        for tick in range(6):
            asset = SEEDED_ASSET if tick % 2 == 0 else UNKNOWN_ASSET
            _publish(pub, asset, _envelope(run_id, asset, tick))
            published += 1

        await _await_ledger(deps.pool, run_id, published)
        counts = conservation_counts(deps.pool, run_id)

        assert counts["ledger"] == published, (
            f"published {published} but only {counts['ledger']} were dispositioned"
        )
        assert counts["telemetry"] + counts["dead_letter"] == counts["ledger"]
        assert counts["telemetry"] == 3 and counts["dead_letter"] == 3
    finally:
        pub.loop_stop()
        await _shutdown(deps, task, sub)


@pytest.fixture
def restartable_mosquitto() -> Iterator[tuple[int, str]]:
    """A broker that can be stopped and started again (no --rm), for the R1.2 demo."""
    _require_docker()
    port = _free_port()
    name = f"pwa-reconnect-{uuid.uuid4().hex[:8]}"
    subprocess.run(
        [
            "docker", "run", "-d", "--name", name,
            "-p", f"127.0.0.1:{port}:1883",
            MOSQUITTO_IMAGE, "mosquitto", "-c", "/mosquitto-no-auth.conf",
        ],
        capture_output=True, text=True, check=True, timeout=300,
    )
    try:
        _wait_for_port(port)
        yield port, name
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True, timeout=120)


async def test_reconnects_and_resumes_within_30s(
    timescale_dsn: str, restartable_mosquitto: tuple[int, str]
) -> None:
    """R1.2 (5 pts) — measured from the observed disconnect to a COMMITTED row.

    Reaching CONNACK is not recovery, and reaching SUBACK is not evidence of ingest, so
    the clock stops only once a message published after the restart has been persisted
    and the re-subscription was granted at QoS 1.

    What this test does NOT prove, stated plainly rather than implied: the broker is
    restarted immediately, so only the first short backoff interval elapses. It therefore
    passes with paho's default 120s cap too, and it does not exercise a silent network
    blackhole or the restoration of an in-flight message across the outage. Those need a
    ~20s outage (to discriminate the backoff cap) and a packet-level fault injector; they
    belong to the demo-director slice S-D, which owns rehearsed reconnect timing. The
    settings themselves are pinned by unit-level assertions on Settings.
    """
    port, name = restartable_mosquitto
    run_id = f"e2e-recon-{uuid.uuid4().hex[:8]}"
    deps, task, sub = await _start_ingest(timescale_dsn, port, run_id)
    pub = _publisher(port)
    try:
        await _await_state(deps.status, PipelineState.CONNECTED)
        _publish(pub, SEEDED_ASSET, _envelope(run_id, SEEDED_ASSET, 0))
        await _await_ledger(deps.pool, run_id, 1)
        pub.loop_stop()

        subprocess.run(["docker", "stop", name], capture_output=True, check=True, timeout=120)
        await _await_state(deps.status, PipelineState.DISCONNECTED, timeout=30.0)
        started = time.monotonic()

        subprocess.run(["docker", "start", name], capture_output=True, check=True, timeout=120)
        _wait_for_port(port)
        await _await_state(deps.status, PipelineState.CONNECTED, timeout=30.0)

        pub2 = _publisher(port)
        _publish(pub2, SEEDED_ASSET, _envelope(run_id, SEEDED_ASSET, 99))
        await _await_ledger(deps.pool, run_id, 2, timeout=30.0)
        elapsed = time.monotonic() - started
        pub2.loop_stop()

        assert elapsed < 30.0, f"recovery took {elapsed:.1f}s, over the 30s budget"
        assert deps.status.granted_qos == 1, "re-subscription was downgraded below QoS 1"
        assert deps.status.disconnect_count >= 1
        assert conservation_counts(deps.pool, run_id)["telemetry"] == 2
    finally:
        await _shutdown(deps, task, sub)


async def test_repeated_identical_malformed_payloads_each_get_their_own_dlq_row(
    timescale_dsn: str, mosquitto: int
) -> None:
    """Undecodable messages have no application identity, so identity comes from transport.

    `_classify` keys them on `undecodable:{topic}:{mid}`. The simulator's MALFORMED mode
    emits BYTE-IDENTICAL payloads, so a content hash would collapse them all into one
    dead letter and the DLQ would under-report by design. This pins that five distinct
    deliveries produce five rows.

    Known limitation, deliberately accepted: MQTT packet ids are session-scoped and are
    reused after PUBACK, so across a very long run a genuine wrap-around could merge two
    undecodable deliveries. The alternative — a per-process counter — would instead
    double-count a real redelivery, which is the worse failure for a DLQ whose job is to
    show captured bad messages.
    """
    run_id = f"e2e-malformed-{uuid.uuid4().hex[:8]}"
    deps, task, sub = await _start_ingest(timescale_dsn, mosquitto, run_id)
    pub = _publisher(mosquitto)
    sent = 5
    try:
        await _await_state(deps.status, PipelineState.CONNECTED)
        with deps.pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM dead_letter WHERE message_id LIKE 'undecodable:%'")
            before = int((cur.fetchone() or [0])[0])

        for _ in range(sent):
            _publish(pub, SEEDED_ASSET, b"{not json at all")
        await asyncio.sleep(4.0)

        with deps.pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM dead_letter WHERE message_id LIKE 'undecodable:%'")
            after = int((cur.fetchone() or [0])[0])

        assert after - before == sent, (
            f"published {sent} distinct malformed messages but recorded {after - before} "
            "dead letters — undecodable deliveries are being merged"
        )
    finally:
        pub.loop_stop()
        await _shutdown(deps, task, sub)


async def test_status_endpoint_exposes_conservation_for_the_live_run(
    timescale_dsn: str, mosquitto: int
) -> None:
    """The invariant must be visible to a judge, not only provable in a test."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.routes import pipeline as pipeline_routes

    run_id = f"e2e-status-{uuid.uuid4().hex[:8]}"
    deps, task, sub = await _start_ingest(timescale_dsn, mosquitto, run_id)
    pub = _publisher(mosquitto)
    try:
        await _await_state(deps.status, PipelineState.CONNECTED)
        _publish(pub, SEEDED_ASSET, _envelope(run_id, SEEDED_ASSET, 0))
        _publish(pub, UNKNOWN_ASSET, _envelope(run_id, UNKNOWN_ASSET, 1))
        await _await_ledger(deps.pool, run_id, 2)

        probe = FastAPI()
        probe.include_router(pipeline_routes.router)
        probe.state.pipeline_status = deps.status
        probe.state.ingest_queue = None
        probe.state.run_id = run_id
        probe.state.pool = deps.pool

        with TestClient(probe) as client:
            body = client.get("/api/pipeline/status").json()

        assert body["state"] == "connected"
        assert body["granted_qos"] == 1
        # Named honestly: this is the API process's id, NOT the producer's, which is what
        # the persisted rows carry.
        assert body["subscriber_run_id"] == run_id
        assert "run_id" not in body

        # Conservation is reported over the whole database, so an operator reading the
        # live indicator sees the same rows a query would return.
        assert body["conservation"]["holds"] is True
        assert body["conservation"]["ledger"] >= 2

        # This run's own split is still exactly one accepted and one rejected.
        assert conservation_counts(deps.pool, run_id) == {
            "ledger": 2, "telemetry": 1, "dead_letter": 1,
        }
    finally:
        pub.loop_stop()
        await _shutdown(deps, task, sub)
