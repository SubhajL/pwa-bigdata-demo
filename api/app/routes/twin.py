"""`WS /ws/twin` — the live channel the digital twin subscribes to (slice S3).

Each connection gets its own task draining its own bounded queue, so one wedged client
cannot delay another and cannot reach back into the ingest consumer. The socket task is
also the only place that awaits a send; `TwinHub.broadcast()` never does.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..ws import Subscriber, TwinHub

logger = logging.getLogger(__name__)

router = APIRouter(tags=["twin"])


@router.websocket("/ws/twin")
async def twin_socket(websocket: WebSocket) -> None:
    """Stream `TwinEvent` frames until the client goes away."""
    hub: TwinHub | None = getattr(websocket.app.state, "twin_hub", None)
    await websocket.accept()
    if hub is None:
        # Ingest disabled: say so and close cleanly rather than holding a dead socket.
        await websocket.send_json({"kind": "disabled", "detail": "MQTT_ENABLED=0"})
        await websocket.close()
        return

    try:
        sub = hub.subscribe()
    except TwinHub.TooManySubscribers:
        await websocket.send_json({"kind": "busy", "detail": "twin hub is at capacity"})
        await websocket.close(code=1013)  # try again later
        return

    # Two tasks, because a send-only loop CANNOT notice a client that disconnects while
    # telemetry is quiet: a disconnect is delivered as an ASGI *receive* event, and a
    # handler that only awaits `sub.get()` never performs one. Such a socket would leak
    # its subscriber until the next broadcast happened to fail — and with admission now
    # capped, leaked subscribers would eventually refuse real clients.
    sender = asyncio.create_task(_pump(websocket, sub))
    watcher = asyncio.create_task(_watch_for_disconnect(websocket))
    try:
        done, pending = await asyncio.wait(
            {sender, watcher}, return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
        for task in done:
            exc = task.exception()
            if exc is not None and not isinstance(exc, WebSocketDisconnect):
                logger.exception("twin socket failed", exc_info=exc)
    finally:
        # Always unsubscribe. A leaked subscriber keeps consuming fan-out work on the
        # ingest loop forever.
        hub.unsubscribe(sub)


async def _pump(websocket: WebSocket, sub: Subscriber) -> None:
    while True:
        event = await sub.get()
        await websocket.send_json(event.model_dump(mode="json"))


async def _watch_for_disconnect(websocket: WebSocket) -> None:
    """Drain client→server traffic purely so a disconnect is observed promptly."""
    while True:
        await websocket.receive()
