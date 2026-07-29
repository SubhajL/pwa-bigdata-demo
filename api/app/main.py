"""FastAPI app + lifespan concurrency structure.

Codex #11: paho's network loop is synchronous and runs on its OWN thread; it must
never block the event loop. Messages cross the thread boundary via
`loop.call_soon_threadsafe(queue.put_nowait, msg)`, and an asyncio consumer drains
the queue on the event loop (where DB writes and WS broadcasts happen). Uvicorn runs
a single worker so the in-process queue/WS state is coherent.

S0 established this structure broker-less (MQTT_ENABLED=0). S2 fills in the real
subscriber, validation and DLQ; the bridge below is the seam it plugs into. The queue
is now BOUNDED — unbounded, a database outage would let paho keep acknowledging while
memory grew until the process died.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI
from psycopg_pool import ConnectionPool

from .config import Settings, get_settings
from .db import get_pool
from .ingest import PipelineStatus, RawMessage
from .routes import dlq as dlq_routes
from .routes import pipeline as pipeline_routes
from .routes import telemetry as telemetry_routes
from .routes import twin as twin_routes
from .service import IngestDeps, load_roster, run_consumer, start_subscriber, stop_subscriber
from .ws import TwinHub

logger = logging.getLogger(__name__)


class IngestBridge:
    """Thread-safe hand-off from the paho thread to the asyncio event loop.

    `asyncio.Queue` is explicitly NOT thread-safe, so the capacity decision and the
    enqueue must happen together ON THE LOOP. Checking `queue.full()` from the paho
    thread and scheduling `put_nowait` separately is a race: several callbacks can each
    observe free capacity before the loop runs any of them, and the surplus then raises
    `QueueFull` inside the loop where nobody is watching — after `submit()` already
    reported success.
    """

    def __init__(self, maxsize: int = 0, status: PipelineStatus | None = None) -> None:
        self.queue: asyncio.Queue[RawMessage] = asyncio.Queue(maxsize=maxsize)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._status = status

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def _enqueue(self, message: RawMessage) -> None:
        """Runs on the event loop thread; the only place the queue is touched."""
        try:
            self.queue.put_nowait(message)
        except asyncio.QueueFull:
            # Not acked, so the broker keeps it and redelivers on reconnect. Recorded
            # rather than silently discarded.
            if self._status is not None:
                self._status.record_overflow()

    def submit(self, message: RawMessage) -> None:
        """Called from the paho thread. Never touches the queue directly."""
        if self._loop is None:  # pragma: no cover - guarded by lifespan ordering
            raise RuntimeError("IngestBridge not bound to a loop")
        self._loop.call_soon_threadsafe(self._enqueue, message)


def _open_pool(dsn: str) -> ConnectionPool | None:
    """Open the database independently of MQTT, or return None if it is unreachable.

    Retrieval (scored item 1.3) and the DLQ browser must work with the subscriber switched
    off — tying the pool to MQTT_ENABLED made every read return 503 in exactly the
    configuration the latency demo runs in.
    """
    pool = get_pool(dsn)
    try:
        with pool.connection(timeout=2.0):
            pass  # prove reachability now, so routes 503 cleanly instead of hanging
    except Exception:
        # Broad on purpose — any connection failure must leave the API serving /healthz
        # rather than crashing at startup — but never silent: without this line an
        # unreachable database looks identical to a healthy one with no data.
        logger.exception("database unreachable at startup; read endpoints will return 503")
        pool.close()
        return None
    return pool


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = get_settings()
    status = PipelineStatus()
    bridge = IngestBridge(maxsize=settings.ingest_queue_max, status=status)
    bridge.bind(asyncio.get_running_loop())

    app.state.bridge = bridge
    app.state.settings = settings
    app.state.ingest_queue = bridge.queue
    app.state.pipeline_status = status if settings.mqtt_enabled else None
    app.state.run_id = settings.api_run_id
    app.state.pool = None
    app.state.mqtt_client = None
    app.state.twin_hub = None

    pool = _open_pool(settings.database_url)
    app.state.pool = pool

    consumer: asyncio.Task[None] | None = None
    if settings.mqtt_enabled and pool is not None:
        hub = TwinHub()
        app.state.twin_hub = hub
        deps = IngestDeps(
            pool=pool, roster=load_roster(pool), status=status,
            run_id=settings.api_run_id, twin_hub=hub,
        )
        consumer = asyncio.create_task(run_consumer(deps, bridge.queue))
        deps.client = start_subscriber(deps, settings, bridge.submit)
        app.state.mqtt_client = deps.client
        logger.info("ingest started with %d known assets", len(deps.roster))

    try:
        yield
    finally:
        await stop_subscriber(app.state.mqtt_client)
        if consumer is not None:
            consumer.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await consumer
        if app.state.twin_hub is not None:
            app.state.twin_hub.close()
        if app.state.pool is not None:
            app.state.pool.close()


app = FastAPI(title="PWA Big Data Demo API", version="0.1.0", lifespan=lifespan)
app.include_router(pipeline_routes.router)
app.include_router(telemetry_routes.router)
app.include_router(dlq_routes.router)
app.include_router(twin_routes.router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness — no external deps, so the skeleton is testable broker-less."""
    return {"status": "ok"}
