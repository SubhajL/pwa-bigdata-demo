"""`/api/demo/scenario` — the deterministic demo director (P0).

A demo-only control surface, NOT a docker wrapper: it injects targeted telemetry through
`app.demo` so the scored transitions fire on command instead of waiting out the
simulator's ~48s per-asset round-robin. Environment-gated by `DEMO_CONTROLS=1`
(`Settings.demo_controls`): the POST answers 403 anywhere that flag is not explicitly
set, so the injection surface cannot reach a production path. The GET is ungated but
content-free when disabled — it exists so the UI can decide whether to show the control
at all, and to report the active run_id for traceability.

`async def` on purpose, unlike the twin's read routes: the handler must broadcast the
instant `TwinEvent` on the EVENT LOOP (`TwinHub` is not thread-safe — see `app.ws`),
while the database work runs in a worker via `asyncio.to_thread`. Same split as
`scoring.run_scoring_loop`.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request
from psycopg_pool import ConnectionPool

from ..demo import ScenarioConflict, apply_scenario, target_kind
from ..models import DemoScenarioRequest, DemoScenarioResponse, DemoStatusResponse

router = APIRouter(tags=["demo"])

#: Newest injected row's run label. Served by the tiny partial index on `source`
#: (`005_row_provenance.sql`) — demo rows are the exception, never the bulk.
_ACTIVE_RUN_QUERY = """
SELECT run_id FROM telemetry WHERE source = 'DEMO' ORDER BY ts DESC LIMIT 1
"""


def _demo_enabled(request: Request) -> bool:
    settings = getattr(request.app.state, "settings", None)
    return bool(getattr(settings, "demo_controls", False))


def _newest_demo_run(pool: ConnectionPool) -> str | None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(_ACTIVE_RUN_QUERY)
        row = cur.fetchone()
    return None if row is None else str(row[0])


async def _require_pump_target(pool: ConnectionPool, target: str) -> None:
    """404 for a target not on the roster, 422 for one that is not a pump.

    Only pumps report all five signals, so only a pump's window is scoreable.
    """
    kind = await asyncio.to_thread(target_kind, pool, target)
    if kind is None:
        raise HTTPException(status_code=404, detail=f"unknown asset {target!r}")
    if kind != "pump":
        raise HTTPException(
            status_code=422, detail=f"target must be a pump; {target!r} is a {kind}"
        )


@router.post(
    "/api/demo/scenario",
    response_model=DemoScenarioResponse,
    summary="Apply a targeted demo scenario (DEMO_CONTROLS=1 only)",
)
async def demo_scenario(request: Request, body: DemoScenarioRequest) -> DemoScenarioResponse:
    """Inject the scenario now and broadcast its instant frame.

    Raises:
        HTTPException: 403 when demo controls are off; 503 without a database; 404 for a
            target not on the roster; 422 for a target that is not a pump (only pumps
            report all five signals, so only a pump's window is scoreable); 409 when a
            concurrent application already holds the target's scenario lock.
    """
    if not _demo_enabled(request):
        raise HTTPException(status_code=403, detail="demo controls disabled; set DEMO_CONTROLS=1")
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="database not configured")

    if body.mode != "bad_asset":
        await _require_pump_target(pool, body.target)

    run_id = f"demo-{body.mode}-{uuid.uuid4().hex[:8]}"
    try:
        result = await asyncio.to_thread(
            apply_scenario,
            pool,
            mode=body.mode,
            target=body.target,
            now=datetime.now(tz=UTC),
            run_id=run_id,
        )
    except ScenarioConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    # On the loop, after the thread returned — never from inside it (app.ws contract).
    hub = getattr(request.app.state, "twin_hub", None)
    if hub is not None:
        for event in result.events:
            hub.broadcast(event)

    return DemoScenarioResponse(
        run_id=result.run_id,
        mode=body.mode,
        target=body.target,
        injected_readings=result.injected,
        dead_letters=result.dead_letters,
        removed_rows=result.removed,
    )


@router.get(
    "/api/demo/scenario",
    response_model=DemoStatusResponse,
    summary="Demo-control availability and the active scenario run",
)
async def demo_status(request: Request) -> DemoStatusResponse:
    """`enabled` gates the UI control; `active_run_id` is the newest TELEMETRY run.

    Scoped deliberately: `bad_asset` writes no telemetry (its evidence lives in the DLQ
    browser), so it does not move this pointer — the field answers "which scenario is
    steering the twin right now", not "what was the last thing POSTed".
    """
    if not _demo_enabled(request):
        return DemoStatusResponse(enabled=False)
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        return DemoStatusResponse(enabled=True, active_run_id=None)
    return DemoStatusResponse(
        enabled=True, active_run_id=await asyncio.to_thread(_newest_demo_run, pool)
    )
