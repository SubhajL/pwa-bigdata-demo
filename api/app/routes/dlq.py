"""`GET /api/dlq` — browse the dead-letter queue (slice S3).

Scored item 1.5 is demonstrated by *showing* the rejected messages and why they were
rejected, so the table needs a reachable, ordered, bounded read surface rather than a
psql session.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from ..db import MAX_DLQ_LIMIT, MAX_DLQ_OFFSET, recent_dead_letters

router = APIRouter(prefix="/api/dlq", tags=["pipeline"])


@router.get("", summary="Recent dead letters, newest first (demo item 1.5)")
def list_dead_letters(
    request: Request,
    limit: int = Query(default=50, ge=1, le=MAX_DLQ_LIMIT),
    offset: int = Query(default=0, ge=0, le=MAX_DLQ_OFFSET),
) -> dict[str, Any]:
    """Most recent rejected messages, with the reason each was rejected."""
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="database not configured (MQTT_ENABLED=0)")

    items = recent_dead_letters(pool, limit=limit, offset=offset)
    return {
        "count": len(items),
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "message_id": item.message_id,
                "run_id": item.run_id,
                "asset_id": item.asset_id,
                "reason": item.reason,
                "raw": item.raw,
            }
            for item in items
        ],
    }
