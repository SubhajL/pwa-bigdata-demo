"""`WS /ws/twin` — the live channel the digital twin subscribes to (slice S3).

Each connection gets its own task draining its own bounded queue, so one wedged client
cannot delay another and cannot reach back into the ingest consumer. The socket task is
also the only place that awaits a send; `TwinHub.broadcast()` never does.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response, WebSocket, WebSocketDisconnect

from ..bands import SIGNAL_BANDS
from ..gis import GisBundle, build_cache_headers, etag_matches
from ..models import (
    BandsResponse,
    DemoCustomerDetail,
    GisManifest,
    ImpactResponse,
    ImpactZoneCollection,
    SecResponse,
    SignalBand,
    TwinTopology,
)
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

    # When the Map Ta Phut feature is on, the response carries per-account profile detail and a
    # type breakdown; off, it stays the basic shape (never the old five rows).
    settings = getattr(request.app.state, "settings", None)
    enriched = bool(getattr(settings, "mtp_customer_impact_enabled", False))
    profile_version = getattr(settings, "mtp_customer_profile", None)
    try:
        return downstream_customers(
            pool, pipe_id, enriched=enriched, profile_version=profile_version
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown pipe {pipe_id!r}") from None


def _mtp_customer_impact_enabled(request: Request) -> bool:
    """Is the Map Ta Phut customer-impact feature on? Off → detail/zone routes 404 (dark)."""
    settings = getattr(request.app.state, "settings", None)
    return bool(getattr(settings, "mtp_customer_impact_enabled", False))


@router.get(
    "/api/twin/customers/{customer_id}",
    response_model=DemoCustomerDetail,
    summary="One simulated Map Ta Phut account + 12 monthly readings (PR-I, item 2.4)",
)
def twin_customer_detail(request: Request, customer_id: str) -> DemoCustomerDetail:
    """One SIMULATED account's profile and full 12-month reading history.

    Fail-closed: 404 for EVERY id when the feature is off (the surface simply does not exist),
    and 404 for an unknown or non-demo id when it is on.

    Raises:
        HTTPException: 404 when disabled or the id is not a demo customer; 503 when the DB is
            not configured.
    """
    from ..topology import get_demo_customer_detail

    if not _mtp_customer_impact_enabled(request):
        raise HTTPException(status_code=404, detail="customer impact feature is not enabled")
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="database not configured")
    profile_version = request.app.state.settings.mtp_customer_profile
    try:
        return get_demo_customer_detail(pool, customer_id, profile_version=profile_version)
    except KeyError:
        raise HTTPException(
            status_code=404, detail=f"unknown demo customer {customer_id!r}"
        ) from None
    except ValueError as exc:
        # A stored history that is not exactly 12 continuous months is a data-integrity failure,
        # not a missing customer — fail closed with a controlled 503, never a bare 500 traceback
        # (g2-qcheck round 2, Codex).
        raise HTTPException(
            status_code=503, detail="customer detail data integrity error"
        ) from exc


@router.get(
    "/api/twin/gis/impact-zones",
    response_model=ImpactZoneCollection,
    summary="Simulated low-pressure footprint (PR-I): a clickable zone, never real geometry",
)
def twin_impact_zones(
    request: Request, scenario_id: str | None = None
) -> ImpactZoneCollection:
    """The SIMULATED low-pressure footprint (GeoJSON). Defaults to the active profile's scenario.

    Raises:
        HTTPException: 404 when the feature is off or the scenario id is unknown.
    """
    from ..topology import load_impact_zone

    if not _mtp_customer_impact_enabled(request):
        raise HTTPException(status_code=404, detail="customer impact feature is not enabled")
    resolved = scenario_id or request.app.state.settings.mtp_customer_profile
    try:
        return load_impact_zone(resolved)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown scenario {resolved!r}") from None


# ── Rayong pipe-GIS bundle (PR-G, criterion 2 realism) ─────────────────────────────────
#
# Fail-closed contract (rayong-pipe-gis-sec-plan Phase 2): disabled -> 404 (this feature
# does not exist here); enabled but the startup load failed -> 503 (the dependency is
# broken; synthetic lines are never substituted); unknown scope -> 422 via the Literal.


def _gis_bundle(request: Request) -> GisBundle:
    """The verified bundle from the lifespan load, or the honest error status.

    Raises:
        HTTPException: 404 when `PIPE_GIS_ENABLED` is off; 503 when it is on but the
            bundle failed verification at startup.
    """
    settings = getattr(request.app.state, "settings", None)
    if not getattr(settings, "pipe_gis_enabled", False):
        raise HTTPException(
            status_code=404,
            detail="GIS view is not enabled (PIPE_GIS_ENABLED is off)",
        )
    bundle: GisBundle | None = getattr(request.app.state, "gis", None)
    if bundle is None:
        raise HTTPException(
            status_code=503,
            detail="GIS bundle unavailable — it failed verification at startup",
        )
    return bundle


@router.get(
    "/api/twin/gis/manifest",
    response_model=GisManifest,
    summary="Pipe-GIS bundle manifest (PR-G: provenance, binding, energy reference)",
)
def twin_gis_manifest(request: Request) -> GisManifest:
    """Source identity, dataset digests, demo binding, provenance boundary, and the
    official East Water energy reference for the loaded bundle."""
    return _gis_bundle(request).manifest


@router.get(
    "/api/twin/gis/network",
    summary="Pipe network GeoJSON (PR-G: real Rayong geometry)",
)
def twin_gis_network(
    request: Request, scope: Literal["map-ta-phut", "full"] = "map-ta-phut"
) -> Response:
    """The requested scope's GeoJSON, served from the startup-verified in-memory bytes
    with a strong ETag — never re-read from disk, so a post-startup file change cannot
    be served under a hash it does not have.

    The bundle is a static build artifact identified by content hash, so `If-None-Match`
    short-circuits to 304 — the full network is megabytes and the demo reloads pages.
    """
    bundle = _gis_bundle(request)
    headers = build_cache_headers(bundle, scope)
    if etag_matches(request.headers.get("if-none-match"), headers["ETag"]):
        return Response(status_code=304, headers=headers)
    return Response(
        content=bundle.payloads[scope],
        media_type="application/geo+json",
        headers=headers,
    )


@router.get(
    "/api/twin/bands",
    response_model=BandsResponse,
    summary="Signal operating bands (scored item 2.4)",
)
def twin_bands() -> BandsResponse:
    """The physical operating band per signal, so the twin can tell a drop from a spike.

    Static constants — no database, always available.
    """
    return BandsResponse(
        bands={
            sig: SignalBand(low=low, high=high)
            for sig, (low, high) in SIGNAL_BANDS.items()
        }
    )
