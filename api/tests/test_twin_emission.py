"""What the twin is actually told, and what must never block telling it.

Two properties that a naive wiring gets wrong:

* **Only newly-accepted readings become twin events.** `dispose_message()` reports success
  for a *stored* message, and a dead-lettered bad asset is stored just as successfully as
  a good reading. Hooking the broadcast to that boolean would light a device up as
  "normal" on the strength of a message that was rejected — and would re-announce every
  QoS-1 redelivery as fresh news.
* **The HTTP handlers must not run the database on the event loop.** They are served by
  one uvicorn worker that also runs the ingest consumer and the WS fan-out, so a
  synchronous psycopg call inside an `async def` handler stalls ingest and the twin for
  the duration of the query.
"""
from __future__ import annotations

import asyncio
import inspect
import uuid
from datetime import UTC, datetime
from typing import Any

import psycopg
import pytest
from psycopg_pool import ConnectionPool

from app.db import Accepted, Rejected
from app.ingest import PipelineStatus, RawMessage
from app.service import Disposition, IngestDeps, consume_once, load_roster
from app.ws import TwinHub

pytestmark = pytest.mark.integration

SEEDED_ASSET = "P-2"
UNKNOWN_ASSET = "PWA-UNKNOWN-DEVICE-000"


def _raw(run_id: str, tick: int, asset_id: str = SEEDED_ASSET) -> RawMessage:
    import json

    payload = json.dumps(
        {
            "message_id": f"{run_id}-{tick}",
            "run_id": run_id,
            "ts": datetime.now(tz=UTC).isoformat(),
            "asset_id": asset_id,
            "signal": "pressure_bar",
            "value": 3.0,
        }
    ).encode()
    return RawMessage(topic=f"pwa/telemetry/{asset_id}", payload=payload, mid=tick, qos=1)


def _deps(dsn: str, hub: TwinHub) -> IngestDeps:
    pool = ConnectionPool(dsn, min_size=1, max_size=3, open=True)
    return IngestDeps(
        pool=pool, roster=load_roster(pool), status=PipelineStatus(),
        run_id=f"emit-{uuid.uuid4().hex[:8]}", twin_hub=hub,
    )


async def test_an_accepted_reading_produces_one_twin_event(timescale_dsn: str) -> None:
    hub = TwinHub()
    sub = hub.subscribe()
    deps = _deps(timescale_dsn, hub)
    queue: asyncio.Queue[RawMessage] = asyncio.Queue()
    await queue.put(_raw(deps.run_id, 1))
    try:
        await consume_once(deps, queue)

        frame = await asyncio.wait_for(sub.get(), timeout=2.0)
        assert frame.asset_id == SEEDED_ASSET
        assert frame.kind == "status"
    finally:
        deps.pool.close()


async def test_a_dead_lettered_message_produces_NO_twin_event(timescale_dsn: str) -> None:
    """A rejected message is stored successfully — that is not a reason to light up a device."""
    hub = TwinHub()
    sub = hub.subscribe()
    deps = _deps(timescale_dsn, hub)
    queue: asyncio.Queue[RawMessage] = asyncio.Queue()
    await queue.put(_raw(deps.run_id, 2, asset_id=UNKNOWN_ASSET))
    try:
        await consume_once(deps, queue)
        await asyncio.sleep(0.2)

        assert sub.qsize() == 0, "a dead-lettered message was announced to the twin"
    finally:
        deps.pool.close()


async def test_a_redelivered_message_produces_NO_second_twin_event(timescale_dsn: str) -> None:
    """QoS-1 redelivery is not new information."""
    hub = TwinHub()
    sub = hub.subscribe()
    deps = _deps(timescale_dsn, hub)
    queue: asyncio.Queue[RawMessage] = asyncio.Queue()
    message = _raw(deps.run_id, 3)
    await queue.put(message)
    await queue.put(message)          # the broker redelivering the same message_id
    try:
        await consume_once(deps, queue)
        await consume_once(deps, queue)
        await asyncio.sleep(0.2)

        assert sub.qsize() == 1, f"expected exactly one twin event, got {sub.qsize()}"
    finally:
        deps.pool.close()


async def test_disposition_reports_which_outcome_occurred(timescale_dsn: str) -> None:
    """The boolean it used to return could not distinguish these three cases."""
    from app.service import dispose_message

    hub = TwinHub()
    deps = _deps(timescale_dsn, hub)
    good = _raw(deps.run_id, 10)
    bad = _raw(deps.run_id, 11, asset_id=UNKNOWN_ASSET)
    try:
        assert dispose_message(deps, good) is Disposition.ACCEPTED
        assert dispose_message(deps, good) is Disposition.DUPLICATE
        assert dispose_message(deps, bad) is Disposition.REJECTED
    finally:
        deps.pool.close()


@pytest.mark.parametrize(
    "module_name,handler_name",
    [
        ("app.routes.telemetry", "telemetry_range"),
        ("app.routes.telemetry", "telemetry_latest"),
        ("app.routes.dlq", "list_dead_letters"),
        ("app.routes.pipeline", "pipeline_status"),
    ],
)
def test_database_backed_handlers_are_not_coroutines(module_name: str, handler_name: str) -> None:
    """Sync handlers get a threadpool from FastAPI; `async def` ones run ON the event loop.

    psycopg is synchronous here, so an `async def` handler holds the single worker's loop
    for the whole query — stalling ingest and every connected twin alongside it.
    """
    import importlib

    handler = getattr(importlib.import_module(module_name), handler_name)

    assert not inspect.iscoroutinefunction(handler), (
        f"{module_name}.{handler_name} is `async def` but calls synchronous psycopg; "
        "declare it `def` so FastAPI runs it in a worker thread"
    )


class _RecordingAcker:
    def __init__(self) -> None:
        self.acked: list[int] = []

    def ack(self, mid: int, qos: int) -> object:
        self.acked.append(mid)
        return None


async def test_rejected_and_duplicate_are_each_acked_once(timescale_dsn: str) -> None:
    """Every outcome except FAILED must be acknowledged, or the broker redelivers forever.

    The emission tests above attach no MQTT client, so "ack only ACCEPTED" survived them
    untouched — which would have turned every dead letter into an infinite redelivery.
    """
    hub = TwinHub()
    deps = _deps(timescale_dsn, hub)
    acker = _RecordingAcker()
    deps.client = acker
    queue: asyncio.Queue[RawMessage] = asyncio.Queue()

    good = _raw(deps.run_id, 20)
    bad = _raw(deps.run_id, 21, asset_id=UNKNOWN_ASSET)
    for message in (good, good, bad):        # accepted, duplicate, rejected
        await queue.put(message)
    try:
        for _ in range(3):
            await consume_once(deps, queue)

        assert acker.acked == [20, 20, 21], (
            f"every stored outcome must be acked exactly once; got {acker.acked}"
        )
    finally:
        deps.pool.close()


async def test_a_retried_message_is_acked_once_after_it_finally_commits(
    timescale_dsn: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A transient failure costs latency, not an ack — and must not ack twice either."""
    from app import service

    hub = TwinHub()
    deps = _deps(timescale_dsn, hub)
    acker = _RecordingAcker()
    deps.client = acker
    # Inject at the DATABASE call, which is where a real transient failure occurs.
    # `dispose_message` converts that into Disposition.FAILED, which is what the retry
    # loop reacts to; raising from `dispose_message` itself is contained but not retried.
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
            raise RuntimeError("transient storage failure")
        return real(conn, message_id=message_id, run_id=run_id, raw=raw, outcome=outcome)

    monkeypatch.setattr(service, "disposition", flaky)
    queue: asyncio.Queue[RawMessage] = asyncio.Queue()
    await queue.put(_raw(deps.run_id, 30))
    try:
        await consume_once(deps, queue)

        assert acker.acked == [30], f"expected exactly one ack after retry, got {acker.acked}"
        assert calls["n"] >= 2, "the message was never retried"
    finally:
        deps.pool.close()
