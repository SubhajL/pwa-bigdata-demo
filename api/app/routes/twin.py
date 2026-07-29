"""`WS /ws/twin` — the live channel the digital twin subscribes to (slice S3).

Each connection gets its own task draining its own bounded queue, so one wedged client
cannot delay another and cannot reach back into the ingest consumer. The socket task is
also the only place that awaits a send; `TwinHub.broadcast()` never does.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect

from ..models import ImpactResponse, SecResponse, TwinTopology
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


# ── read routes for the digital twin (slice S4a, scored items 2.1 / 2.3 / 2.4) ─────────
#
# Synchronous `def`, NOT `async def`: psycopg is synchronous, and an async handler would
# block the very event loop that carries the twin WebSocket above. The predictive routes
# document the same constraint.


TWIN_MAX_PAIR_SKEW_S = 120.0


@router.get(
    "/api/twin/topology",
    response_model=TwinTopology,
    summary="Process schematic (scored item 2.1)",
)
def twin_topology(request: Request) -> TwinTopology:
    """Nodes, pipes and placed devices with schematic geometry and latest status.

    Everything the SVG draws comes from here — CLAUDE.md forbids a component that bakes in
    its own coordinates or values.

    Raises:
        HTTPException: 503 when the database is not configured.
    """
    from fastapi import HTTPException

    from ..topology import load_topology

    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="database not configured")
    return load_topology(pool)


@router.get(
    "/api/twin/sec/{asset_id}",
    response_model=SecResponse,
    summary="Specific Energy Consumption, kWh/m3 (scored item 2.3)",
)
def twin_sec(request: Request, asset_id: str) -> SecResponse:
    """kWh per m3 for one pump, from its newest stored power and flow readings.

    A KNOWN asset with no usable pair returns 200 with `sec_kwh_per_m3 = None` and a
    `detail` — the UI renders an em dash. 404 is reserved for an asset that is not on the
    roster. Reporting "not found" for a pump that simply has not reported flow yet would
    send an operator looking for a missing device.

    Refuses to compute when the two readings are further apart than the skew budget, or
    when either is stale: a confident number from mismatched snapshots is worse than "—".

    Raises:
        HTTPException: 404 for an unknown asset; 503 when the database is not configured.
    """
    from datetime import UTC, datetime

    from fastapi import HTTPException
    from pwa_ml.features import specific_energy_consumption

    from ..db import latest_signal_pair
    from ..features import MAX_STALENESS_S

    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="database not configured")

    # Check the device exists on the roster.
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM device WHERE asset_id = %s", (asset_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail=f"unknown asset {asset_id!r}")

    pair = latest_signal_pair(pool, asset_id)
    now = datetime.now(tz=UTC)

    # No usable pair at all.
    if pair.power_kw is None and pair.flow_m3h is None:
        return SecResponse(asset_id=asset_id, detail="no power or flow readings")
    if pair.power_kw is None:
        return SecResponse(
            asset_id=asset_id,
            flow_m3h=pair.flow_m3h,
            flow_observed_at=pair.flow_observed_at,
            detail="no power_kw reading",
        )
    if pair.flow_m3h is None:
        return SecResponse(
            asset_id=asset_id,
            power_kw=pair.power_kw,
            power_observed_at=pair.power_observed_at,
            detail="no flow_m3h reading",
        )

    # Staleness check: either reading too old.
    stale_power = (
        pair.power_observed_at is not None
        and (now - pair.power_observed_at).total_seconds() > MAX_STALENESS_S
    )
    stale_flow = (
        pair.flow_observed_at is not None
        and (now - pair.flow_observed_at).total_seconds() > MAX_STALENESS_S
    )
    if stale_power or stale_flow:
        return SecResponse(
            asset_id=asset_id,
            power_kw=pair.power_kw,
            flow_m3h=pair.flow_m3h,
            power_observed_at=pair.power_observed_at,
            flow_observed_at=pair.flow_observed_at,
            skew_s=pair.skew_s,
            detail="readings are stale",
        )

    # Skew budget check.
    if pair.skew_s is not None and pair.skew_s > TWIN_MAX_PAIR_SKEW_S:
        return SecResponse(
            asset_id=asset_id,
            power_kw=pair.power_kw,
            flow_m3h=pair.flow_m3h,
            power_observed_at=pair.power_observed_at,
            flow_observed_at=pair.flow_observed_at,
            skew_s=pair.skew_s,
            detail=(
                f"skew {pair.skew_s:.0f}s exceeds budget {TWIN_MAX_PAIR_SKEW_S:.0f}s"
            ),
        )

    sec = specific_energy_consumption(pair.power_kw, pair.flow_m3h)
    detail = None if sec is not None else "non-positive flow or invalid inputs"
    return SecResponse(
        asset_id=asset_id,
        sec_kwh_per_m3=sec,
        power_kw=pair.power_kw,
        flow_m3h=pair.flow_m3h,
        power_observed_at=pair.power_observed_at,
        flow_observed_at=pair.flow_observed_at,
        skew_s=pair.skew_s,
        detail=detail,
    )


@router.get(
    "/api/twin/impact/{pipe_id}",
    response_model=ImpactResponse,
    summary="Customers downstream of a failed pipe (scored item 2.4)",
)
def twin_impact(request: Request, pipe_id: str) -> ImpactResponse:
    """Who loses water when `pipe_id` fails.

    Raises:
        HTTPException: 404 when `pipe_id` matches no edge; 503 when the DB is unavailable.
    """
    from fastapi import HTTPException

    from ..topology import downstream_customers

    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="database not configured")

    try:
        return downstream_customers(pool, pipe_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown pipe {pipe_id!r}") from None
