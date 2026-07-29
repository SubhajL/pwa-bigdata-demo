"""RS2.c — the consumer survives an UNEXPECTED failure, not just an expected rejection.

The distinction matters and was found by mutation. Routing a malformed payload to the DLQ
exercises no exception at all: `_classify` converts decode/validation failures into a
`Rejected` outcome and the write succeeds normally. So a test that only publishes poison
messages passes identically whether or not the consumer is supervised — removing the
`try/except` from `run_consumer` did not fail it.

What actually threatens the pipeline is the failure nobody enumerated: a database blip, a
driver bug, an unexpected type. CLAUDE.md's rule is that such a message must never stall
ingest. These tests inject exactly that.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

import psycopg
import pytest
from psycopg_pool import ConnectionPool

from app import service
from app.db import Accepted, Rejected, conservation_counts
from app.ingest import PipelineStatus, RawMessage
from app.service import Disposition, IngestDeps, consume_once, load_roster, run_consumer

pytestmark = pytest.mark.integration

SEEDED_ASSET = "P-2"


def _raw(run_id: str, tick: int) -> RawMessage:
    import json

    payload = json.dumps(
        {
            "message_id": f"{run_id}-{tick}",
            "run_id": run_id,
            "ts": datetime.now(tz=UTC).isoformat(),
            "asset_id": SEEDED_ASSET,
            "signal": "pressure_bar",
            "value": 1.0 + tick,
        }
    ).encode()
    return RawMessage(topic=f"pwa/telemetry/{SEEDED_ASSET}", payload=payload, mid=tick, qos=1)


def _deps(dsn: str) -> IngestDeps:
    pool = ConnectionPool(dsn, min_size=1, max_size=3, open=True)
    return IngestDeps(pool=pool, roster=load_roster(pool), status=PipelineStatus())


async def test_a_transient_storage_failure_is_retried_not_lost(
    timescale_dsn: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A blip must cost latency, not data.

    Leaving the delivery unacked is not enough on its own: MQTT only promises to
    redeliver an unacknowledged QoS-1 message when the client RECONNECTS, so while the
    connection stays healthy a transient database failure would strand that message
    indefinitely. The consumer therefore retries in-process, and BOTH messages must end
    up stored — the earlier version of this test happily passed while losing the first one.
    """
    run_id = f"resil-{uuid.uuid4().hex[:8]}"
    deps = _deps(timescale_dsn)
    queue: asyncio.Queue[RawMessage] = asyncio.Queue()
    real = service.disposition
    calls = {"n": 0}

    def flaky(
        conn: psycopg.Connection[Any],
        *,
        message_id: str,
        run_id: str | None,
        raw: bytes | dict[str, Any],
        outcome: Accepted | Rejected,
    ) -> bool:
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("simulated driver explosion")
        return real(conn, message_id=message_id, run_id=run_id, raw=raw, outcome=outcome)

    monkeypatch.setattr(service, "disposition", flaky)
    task = asyncio.create_task(run_consumer(deps, queue))
    try:
        await queue.put(_raw(run_id, 0))
        await queue.put(_raw(run_id, 1))
        await asyncio.wait_for(queue.join(), timeout=30)

        assert not task.done(), "the consumer died on an unexpected exception"
        counts = conservation_counts(deps.pool, run_id)
        assert counts["telemetry"] == 2, (
            "a transient failure lost a message instead of retrying it "
            f"(stored {counts['telemetry']}/2)"
        )
        assert calls["n"] >= 3, "the failing message was never retried"
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        deps.pool.close()


async def test_a_failed_message_is_left_unacked_for_redelivery(
    timescale_dsn: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A message we could not store must NOT be acknowledged.

    Acking it would tell the broker the message was handled and let it drop the only
    remaining copy — silent data loss that the conservation count could never detect,
    because the ledger row was never written either.
    """
    run_id = f"unacked-{uuid.uuid4().hex[:8]}"
    deps = _deps(timescale_dsn)
    acked: list[int] = []

    class _Client:
        def ack(self, mid: int, qos: int) -> None:
            acked.append(mid)

    deps.client = _Client()
    def _explode(*_a: object, **_k: object) -> bool:
        raise RuntimeError("db down")

    monkeypatch.setattr(service, "disposition", _explode)
    queue: asyncio.Queue[RawMessage] = asyncio.Queue()
    await queue.put(_raw(run_id, 0))

    await consume_once(deps, queue)

    assert acked == [], "a message that failed to persist was acknowledged anyway"
    deps.pool.close()


async def test_a_stored_message_is_acknowledged(timescale_dsn: str) -> None:
    """The other half: successful storage must ack, or the broker redelivers forever."""
    run_id = f"acked-{uuid.uuid4().hex[:8]}"
    deps = _deps(timescale_dsn)
    acked: list[int] = []

    class _Client:
        def ack(self, mid: int, qos: int) -> None:
            acked.append(mid)

    deps.client = _Client()
    queue: asyncio.Queue[RawMessage] = asyncio.Queue()
    await queue.put(_raw(run_id, 7))

    await consume_once(deps, queue)

    assert acked == [7]
    assert conservation_counts(deps.pool, run_id)["telemetry"] == 1
    deps.pool.close()


async def test_a_failure_escaping_the_db_layer_still_does_not_stall_the_loop(
    timescale_dsn: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Containment at the CONSUMER boundary, not just inside the DB helper.

    `dispose_message` catches database errors itself, so patching `disposition` never
    exercises the layer above it — mutation showed the consumer's own `try/except` could
    be deleted with every other test still green. This injects a failure that escapes
    `dispose_message` entirely, which is the only thing that proves the drain loop is
    genuinely supervised.
    """
    run_id = f"escape-{uuid.uuid4().hex[:8]}"
    deps = _deps(timescale_dsn)
    queue: asyncio.Queue[RawMessage] = asyncio.Queue()
    real = service.dispose_message
    calls = {"n": 0}

    def exploding(d: IngestDeps, raw: RawMessage) -> Disposition:
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("escaped the db layer entirely")
        return real(d, raw)

    monkeypatch.setattr(service, "dispose_message", exploding)
    task = asyncio.create_task(run_consumer(deps, queue))
    try:
        await queue.put(_raw(run_id, 0))
        await queue.put(_raw(run_id, 1))
        await asyncio.wait_for(queue.join(), timeout=30)

        assert not task.done(), "the consumer died on an exception from below it"
        assert calls["n"] == 2, "the message after the failing one was never attempted"
        assert conservation_counts(deps.pool, run_id)["telemetry"] == 1
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        deps.pool.close()


async def test_run_consumer_survives_an_exception_from_consume_once(
    timescale_dsn: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The outermost supervision layer, exercised directly.

    Every other resilience test injects a failure that a lower layer already contains, so
    `run_consumer`'s own `try/except` could be deleted with all of them still green
    (mutation confirmed this). Raising from `consume_once` itself is the only way to pin it.
    """
    deps = _deps(timescale_dsn)
    queue: asyncio.Queue[RawMessage] = asyncio.Queue()
    real = service.consume_once
    calls = {"n": 0}

    async def flaky(d: IngestDeps, q: asyncio.Queue[RawMessage], **kw: object) -> None:
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("consume_once itself exploded")
        await real(d, q)

    monkeypatch.setattr(service, "consume_once", flaky)
    task = asyncio.create_task(run_consumer(deps, queue))
    try:
        await asyncio.sleep(0.3)
        assert calls["n"] >= 2, "run_consumer did not retry after consume_once raised"
        assert not task.done(), "run_consumer died instead of restarting its loop"
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        deps.pool.close()
