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
from fastapi.middleware.cors import CORSMiddleware
from psycopg_pool import ConnectionPool

from .config import Settings, get_settings
from .curated import load_curated
from .db import get_pool
from .gis import GisUnavailable, load_gis_bundle
from .ingest import PipelineStatus, RawMessage
from .model import get_loaded
from .routes import curated as curated_routes
from .routes import demo as demo_routes
from .routes import dlq as dlq_routes
from .routes import pipeline as pipeline_routes
from .routes import predict as predict_routes
from .routes import telemetry as telemetry_routes
from .routes import twin as twin_routes
from .scoring import ScoringDeps, run_scoring_loop, stop_scoring
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
    app.state.bundle = None
    app.state.model_path = None
    app.state.artifact_sha256 = None
    app.state.scoring_deps = None
    app.state.curated = None
    app.state.gis = None

    # The pre-built pipe-GIS bundle (PR-G). Verified ONCE here; a failure leaves
    # `app.state.gis` None, which the /api/twin/gis routes report as 503 while the
    # logical twin carries on. Disabled (the default) simply stays None -> 404.
    if settings.pipe_gis_enabled:
        try:
            app.state.gis = load_gis_bundle(settings)
            logger.info("pipe-GIS bundle loaded from %s", settings.pipe_gis_dir)
        except GisUnavailable:
            logger.exception("pipe-GIS bundle unavailable; /api/twin/gis will return 503")

    # The REAL dataset, parsed once. Built HERE rather than at import time on purpose:
    # `/healthz` is deliberately dependency-free (see below), and an import-time read
    # would let a missing bind-mount take down liveness along with it. A failure leaves
    # `app.state.curated` None, which the curated routes report as 503 while every other
    # route carries on.
    if settings.curated_path:
        try:
            app.state.curated = load_curated(settings.curated_path)
            logger.info("curated dataset loaded from %s", settings.curated_path)
        except (OSError, ValueError):
            logger.exception(
                "curated dataset unreadable at %s; /api/curated will return 503",
                settings.curated_path,
            )
    else:
        logger.info("CURATED_PATH unset; /api/curated will return 503")

    pool = _open_pool(settings.database_url)
    app.state.pool = pool

    # Loaded once per process: unpickling a scikit-learn pipeline is not free, and both the
    # scoring cycle and the on-demand routes need it. None here disables the predictive
    # endpoints without touching the pipeline ones — topic ๑ must not depend on topic ๓.
    loaded = get_loaded(settings.model_path)
    bundle = None if loaded is None else loaded.bundle
    app.state.bundle = bundle
    # Path and digest come from the SAME load event as the bundle — never re-resolved, so
    # `/api/model` reads the card that shipped WITH the loaded artifact and can never serve
    # a hash of bytes the process didn't load (item 3.1 provenance; g-check HIGH rounds 1–2:
    # a second `resolve_model_path` here could pair this bundle with a different path).
    app.state.model_path = None if loaded is None else loaded.path
    app.state.artifact_sha256 = None if loaded is None else loaded.artifact_sha256

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

    # Scoring is deliberately NOT gated on MQTT: health is computed from a window of STORED
    # telemetry, so a brief broker outage — the state the item-1.2 reconnect demo creates —
    # does not stop the predictive half.
    #
    # It is not immune to a long one, and that is intentional: `features.MAX_STALENESS_S`
    # refuses a window whose newest reading is over five minutes old, so a fleet that has
    # genuinely gone dark reports `nodata` rather than serving a confident score from stale
    # history. The publisher therefore has to keep running for the demo to keep scoring,
    # which is why compose no longer hides the simulator behind a profile.
    scorer: asyncio.Task[None] | None = None
    if settings.scoring_enabled and pool is not None and bundle is not None:
        scoring_deps = ScoringDeps(
            pool=pool,
            bundle=bundle,
            twin_hub=app.state.twin_hub,
            interval_s=settings.scoring_interval_s,
        )
        app.state.scoring_deps = scoring_deps
        scorer = asyncio.create_task(run_scoring_loop(scoring_deps))
        logger.info("scoring loop started (model %s)", bundle.model_version)

    try:
        yield
    finally:
        await stop_subscriber(app.state.mqtt_client)
        await stop_scoring(scorer)
        if consumer is not None:
            consumer.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await consumer
        if app.state.twin_hub is not None:
            app.state.twin_hub.close()
        if app.state.pool is not None:
            app.state.pool.close()


app = FastAPI(title="PWA Big Data Demo API", version="0.1.0", lifespan=lifespan)

# Until PR-6 there was NO CORS middleware, so a browser could not call this API at all
# (SESSION-HANDOFF §3). In the normal setup the Vite dev proxy makes the browser
# same-origin and this never fires; it covers the direct cross-origin cases — a judge
# calling the API from another port, or a built `dist/` served elsewhere.
#
# Origins are an explicit allow-list read from CORS_ORIGINS. Never "*": a wildcard with
# credentials is rejected by browsers regardless, and reflecting an arbitrary origin is
# not a thing to ship.
#
# Added at import time because middleware is attached to this module-level singleton;
# mutating CORS_ORIGINS after import cannot reconfigure it, which is why `test_cors.py`
# builds a fresh app instead.
_cors_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    # So a browser can read the item-1.3 latency evidence the telemetry routes emit.
    expose_headers=["Server-Timing"],
)

app.include_router(pipeline_routes.router)
app.include_router(telemetry_routes.router)
app.include_router(dlq_routes.router)
app.include_router(twin_routes.router)
app.include_router(predict_routes.router)
app.include_router(curated_routes.router)
app.include_router(demo_routes.router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness — no external deps, so the skeleton is testable broker-less."""
    return {"status": "ok"}
