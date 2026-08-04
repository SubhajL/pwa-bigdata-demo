"""Periodic scoring and the twin's health events (slice S6, scored item 3.3).

Item 3.3 is a *latency* claim — "when a device's Health Score drops below threshold, its
twin symbol changes state within ≤ 30s" — so the budget is the whole chain: the reading
lands, a cycle picks it up, the model scores it, and the frame reaches the browser. The
cycle interval is therefore set well inside the budget rather than at it.

Concurrency (Codex #11, and the defect that cost slice S3 a review round): psycopg is
synchronous and scikit-learn holds the GIL through `predict`. `score_all` is a **blocking**
function and is called from the loop via `asyncio.to_thread`. Calling it directly on the
event loop would stall ingest and the twin socket for the length of a scoring pass.

**But the thread may not touch the hub.** `TwinHub.broadcast` ends in
`asyncio.Event.set()` (`ws.Subscriber._offer`), which is not thread-safe: called from the
`to_thread` worker it can leave an already-waiting socket task asleep, so the frame is
queued and never delivered — precisely the 30s deadline item 3.3 is scored on, missed in a
way no synchronous test would notice. The ingest path has always got this right by
broadcasting only after `to_thread` returns.

So the split is explicit: `score_all` computes and persists on the worker thread and
returns the frames it *would* send; `run_scoring_loop` broadcasts them ON THE EVENT LOOP.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from psycopg_pool import ConnectionPool
from pwa_ml.predict import (
    CRITICAL_BELOW,
    MIN_WINDOW_HOURS,
    WARNING_BELOW,
    Bundle,
    score_window,
)

from .db import query_range
from .features import WINDOW_HOURS, build_window
from .health_store import HealthRow, insert_health, latest_statuses, scoreable_assets
from .models import TwinEvent
from .ws import TwinHub

logger = logging.getLogger(__name__)

#: Seconds between scoring passes. Item 3.3 allows 30s for the ENTIRE chain, so the cycle
#: takes a third of it and leaves the rest for the model, the socket and the browser.
SCORING_INTERVAL_S = 10.0


@dataclass(frozen=True)
class ScoringDeps:
    """Everything a scoring pass needs, injected so it is testable without a broker."""

    pool: ConnectionPool
    bundle: Bundle
    #: Optional fan-out to connected twin clients. None when the twin transport is off.
    twin_hub: TwinHub | None = None
    window_hours: int = WINDOW_HOURS
    interval_s: float = SCORING_INTERVAL_S
    #: Banding thresholds. IMPORTED from the model module, not copied: `row.status` comes
    #: from `score_window` (which bands with pwa_ml's own constants) while the previous
    #: status is recomputed from the stored score with these. Literals here would drift
    #: from the model and make every unchanged device look like a fresh transition, so the
    #: twin would receive a duplicate frame every cycle, forever.
    warning_below: float = WARNING_BELOW
    critical_below: float = CRITICAL_BELOW


@dataclass(frozen=True)
class ScoringResult:
    """One cycle's output: what was persisted, and what the twin should be told.

    The frames are RETURNED rather than sent, because `score_all` runs on a worker thread
    and the hub may only be touched from the event loop.
    """

    rows: list[HealthRow]
    events: list[TwinEvent]


def score_all(deps: ScoringDeps, *, now: datetime) -> ScoringResult:
    """Score every scoreable asset, persist the results, and report the frames to send.

    BLOCKING — see the module docstring. Never call this directly from the event loop, and
    note that it does NOT broadcast: the caller does that, on the loop.

    For each asset returned by `health_store.scoreable_assets` (over the last
    `deps.window_hours`, requiring at least `pwa_ml.predict.MIN_WINDOW_HOURS` hourly
    buckets):

    1. read its telemetry with `db.query_range` over the window;
    2. assemble the input with `features.build_window`;
    3. **skip** the asset when the window is not scoreable — no health row is written, so
       an under-reported device stays `nodata` rather than acquiring an invented score;
    4. score it with `pwa_ml.predict.score_window` through `deps.bundle`;
    5. report a `TwinEvent(kind="health", ...)` when the new status is not `"normal"`, or
       when it differs from that asset's previously persisted status. Both halves matter:
       the first keeps a degraded device visible to a client that connects late, and the
       second is the only thing that announces a RECOVERY (`critical -> normal`) — without
       it a repaired pump stays red on the twin forever.

    Every row is persisted with a SINGLE `health_store.insert_health` call, and the previous
    statuses are read with a SINGLE `latest_statuses` call — one round trip each per cycle,
    not one per device.

    Args:
        deps: pool, model bundle and twin hub.
        now: the instant this cycle is scored at; must be timezone-aware.

    Returns:
        A `ScoringResult` whose `rows` are the health rows written, worst health first, and
        whose `events` are the frames the CALLER must broadcast on the event loop. Both are
        empty when nothing was scoreable.

    Raises:
        ValueError: if `now` is naive.
    """
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")

    since = now - timedelta(hours=deps.window_hours)
    assets = scoreable_assets(deps.pool, since=since, min_hours=MIN_WINDOW_HOURS)
    previous = latest_statuses(
        deps.pool,
        assets,
        warning_below=deps.warning_below,
        critical_below=deps.critical_below,
    )

    rows = [row for row in (_score_one(deps, a, since=since, now=now) for a in assets) if row]
    if rows:
        insert_health(deps.pool, rows)

    rows.sort(key=lambda r: r.health_score)
    events = [
        _health_event(row, now)
        for row in rows
        if row.status != "normal" or previous.get(row.asset_id) != row.status
    ]
    return ScoringResult(rows=rows, events=events)


def _score_one(
    deps: ScoringDeps, asset_id: str, *, since: datetime, now: datetime
) -> HealthRow | None:
    """Score one asset, or None when it is unscoreable or its own scoring failed.

    Containment is PER ASSET on purpose. With one try/except around the whole cycle, a
    single device whose window or model call raises discards the scores already computed
    for every other device, and — since the fleet is scored in a deterministic order — the
    next cycle fails at the same device, so the predictive half never writes another row.
    That is the scoring-loop form of CLAUDE.md's "never block the ingest loop on a bad
    message": one bad device must cost exactly one device.
    """
    try:
        readings = query_range(deps.pool, asset_id, since, now)
        window = build_window(readings, now=now, hours=deps.window_hours)
        if not window.scoreable:
            # No row is written at all: an under-reported device stays `nodata` rather than
            # acquiring an invented score. `scoreable_assets` is a coarse pre-filter over
            # bucket COUNT; `build_window` is the real contract, and the two disagree
            # whenever telemetry is stale or thin.
            logger.debug("skipping %s: %s", asset_id, window.reason)
            return None
        score = score_window(deps.bundle, window.rows)
    except Exception:
        # Broad by necessity: this must degrade to "this one device is unscored", never to
        # "the fleet is unscored". Logged, never silent.
        logger.exception("scoring failed for %s; other devices continue", asset_id)
        return None

    return HealthRow(
        asset_id=asset_id,
        scored_at=now,
        observed_at=window.observed_at,
        health_score=score.health,
        pttf_hours=score.pttf_hours,
        model_version=score.model_version,
        status=score.status,
    )


def _health_event(row: HealthRow, now: datetime) -> TwinEvent:
    return TwinEvent(
        kind="health",
        asset_id=row.asset_id,
        status=row.status,
        health_score=row.health_score,
        pttf_hours=row.pttf_hours,
        model_version=row.model_version,
        observed_at=row.observed_at,
        published_at=now,
    )


async def broadcast_scoring_events(hub: TwinHub, events: Sequence[TwinEvent]) -> None:
    """Hand one cycle's frames to the hub, healthiest first, YIELDING between frames.

    Two burst pathologies, both found on a warm stack where every roster pump is
    scoreable (~229 health frames per cycle against a 64-asset subscriber buffer):

    * Offered worst-first in one event-loop turn, `Subscriber._offer` sheds the
      least-recently-updated asset — the WORST device, every cycle, forever. That
      starves exactly the frame item 3.3 is scored on. Hence healthiest FIRST.
    * Ordering alone cannot save a RECOVERY: `_evict_one` prefers all-`normal` buckets
      regardless of recency, and a recovery is emitted exactly once (on the status
      change), so one evicted frame leaves a connected twin red forever. Hence the
      `sleep(0)` after every offer — it hands the loop to the socket tasks, which drain
      at production rate, so pressure never builds on a healthy client. A genuinely
      wedged client still degrades exactly as `app.ws` documents (recoveries first).
    """
    for event in reversed(events):
        hub.broadcast(event)
        await asyncio.sleep(0)


async def run_scoring_loop(deps: ScoringDeps) -> None:
    """Score on a timer until cancelled, broadcasting each cycle's frames on the loop.

    `score_all` is dispatched through `asyncio.to_thread` because it blocks; the resulting
    frames are then handed to the hub HERE, on the event loop, because `TwinHub` is not
    thread-safe (see the module docstring). A failing cycle is logged and the timer
    continues — a transient database error must not retire scoring for the process —
    while `asyncio.CancelledError` propagates so lifespan shutdown is not swallowed.
    """
    while True:
        try:
            result = await asyncio.to_thread(score_all, deps, now=datetime.now(tz=UTC))
            if deps.twin_hub is not None:
                await broadcast_scoring_events(deps.twin_hub, result.events)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("scoring cycle failed; will retry after interval")
        await asyncio.sleep(deps.interval_s)


async def stop_scoring(task: asyncio.Task[None] | None) -> None:
    """Cancel the scoring task and wait for it to unwind. Safe to call with None."""
    if task is None:
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
