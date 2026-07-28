"""FastAPI app + lifespan concurrency structure.

Codex #11: paho's network loop is synchronous and runs on its OWN thread; it must
never block the event loop. Messages cross the thread boundary via
`loop.call_soon_threadsafe(queue.put_nowait, msg)`, and an asyncio consumer drains
the queue on the event loop (where DB writes and WS broadcasts happen). Uvicorn runs
a single worker so the in-process queue/WS state is coherent.

S0 establishes this structure broker-less (MQTT_ENABLED=0). S2 fills the real
subscriber + validation + DLQ; the bridge below is the seam it plugs into.
"""
from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator
from typing import Any

from fastapi import FastAPI

from .config import Settings, get_settings


class IngestBridge:
    """Thread-safe hand-off from the paho thread to the asyncio event loop."""

    def __init__(self) -> None:
        self.queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def submit(self, message: dict[str, Any]) -> None:
        """Called from the paho thread (S2). Never touches the loop directly."""
        if self._loop is None:  # pragma: no cover - guarded by lifespan ordering
            raise RuntimeError("IngestBridge not bound to a loop")
        self._loop.call_soon_threadsafe(self.queue.put_nowait, message)


async def _consume(bridge: IngestBridge) -> None:
    """Drain the queue on the event loop. S2 replaces the body with disposition."""
    while True:
        _message = await bridge.queue.get()
        # S2: decode -> validate(payload, known_asset_ids) -> telemetry | DLQ
        bridge.queue.task_done()


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = get_settings()
    bridge = IngestBridge()
    bridge.bind(asyncio.get_running_loop())
    app.state.bridge = bridge
    app.state.settings = settings

    consumer = asyncio.create_task(_consume(bridge))
    # S2 starts the paho subscriber thread here when settings.mqtt_enabled is True.
    try:
        yield
    finally:
        consumer.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await consumer


app = FastAPI(title="PWA Big Data Demo API", version="0.1.0", lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness — no external deps, so the skeleton is testable broker-less."""
    return {"status": "ok"}
