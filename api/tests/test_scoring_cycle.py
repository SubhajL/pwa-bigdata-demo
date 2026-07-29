"""The scoring cycle and the twin's health events — scored item 3.3 (slice S6).

Item 3.3 is a *latency* claim: when a device's Health Score drops below threshold, its twin
symbol changes state within 30 seconds. The half that lives in this slice is "a scoring pass
notices and tells the twin"; the browser half lands with the twin UI.

These run against a real TimescaleDB and the real serialized artifact — scoring through
anything else would certify a model the demo does not load.

Two of these tests exist because review found the first version green over real defects:
the emit test now drives `run_scoring_loop` with a subscriber ALREADY AWAITING and asyncio
debug on, because the original called `score_all` directly and could not see that the hub
was being touched from a worker thread; and the stale-window test exists because nothing
advanced the clock, so a fleet that had gone dark still looked healthy.
"""
from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, timedelta
from typing import cast

import pytest
from psycopg_pool import ConnectionPool
from pwa_ml.predict import CRITICAL_BELOW, WARNING_BELOW, Bundle

from app.features import MAX_STALENESS_S
from app.health_store import latest_health
from app.model import get_bundle
from app.scoring import ScoringDeps, run_scoring_loop, score_all
from app.ws import TwinHub


def _bundle() -> Bundle:
    bundle = get_bundle("")
    assert bundle is not None, "the shipped artifact must load; build it with `python -m pwa_ml`"
    return bundle


def _deps(pool: ConnectionPool, hub: TwinHub | None = None, **kw: float) -> ScoringDeps:
    return ScoringDeps(pool=pool, bundle=_bundle(), twin_hub=hub, **kw)  # type: ignore[arg-type]


def _stored(pool: ConnectionPool, asset_id: str) -> object | None:
    return latest_health(
        pool, asset_id, warning_below=WARNING_BELOW, critical_below=CRITICAL_BELOW
    )


@pytest.mark.integration
def test_every_backfilled_pump_is_scored_and_persisted(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object
) -> None:
    result = score_all(_deps(pool), now=datetime.now(tz=UTC))

    assert {row.asset_id for row in result.rows} == set(backfilled)
    for asset_id in backfilled:
        stored = _stored(pool, asset_id)
        assert stored is not None, f"{asset_id} was scored but no health row was written"


@pytest.mark.integration
def test_a_device_without_enough_history_is_left_unscored(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object
) -> None:
    """`nodata` is a real answer. Inventing a score for a silent device is the failure."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT asset_id FROM device WHERE kind = 'pump' AND asset_id <> ALL(%s) LIMIT 1",
            (backfilled,),
        )
        row = cur.fetchone()
    assert row is not None, "the roster should hold more pumps than the backfill covers"
    unscored = row[0]

    scored = {r.asset_id for r in score_all(_deps(pool), now=datetime.now(tz=UTC)).rows}

    assert unscored not in scored
    assert _stored(pool, unscored) is None


@pytest.mark.integration
def test_a_stale_fleet_writes_no_rows_and_invents_no_scores(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object
) -> None:
    """The guard that stands between a dark fleet and a fabricated fleet-wide failure.

    `scoreable_assets` counts hourly BUCKETS, so it still returns all 12 pumps long after
    their telemetry has gone stale; only `build_window` refuses them. Delete the
    `window.scoreable` check and `score_window` scores an empty window as `health=0.0`,
    which bands `critical` — twelve invented failures at the head of the worklist.
    """
    later = datetime.now(tz=UTC) + timedelta(seconds=MAX_STALENESS_S + 600)

    result = score_all(_deps(pool), now=later)

    assert result.rows == [], "a stale fleet must produce no health rows at all"
    assert result.events == []
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM health WHERE scored_at = %s", (later,))
        assert (cur.fetchone() or [1])[0] == 0


@pytest.mark.integration
def test_the_most_worn_pump_scores_worse_than_the_least(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object
) -> None:
    """Scored item 3.2's claim, made against live rows rather than the training corpus."""
    result = score_all(_deps(pool), now=datetime.now(tz=UTC))
    rows = {r.asset_id: r.health_score for r in result.rows}

    healthiest, most_worn = backfilled[0], backfilled[-1]

    assert rows[most_worn] < rows[healthiest], (
        f"{most_worn} has the highest wear rate but scored {rows[most_worn]:.1f} against "
        f"{healthiest}'s {rows[healthiest]:.1f}"
    )


@pytest.mark.integration
def test_score_all_returns_rows_worst_first(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object
) -> None:
    scores = [r.health_score for r in score_all(_deps(pool), now=datetime.now(tz=UTC)).rows]

    assert scores == sorted(scores)


@pytest.mark.integration
def test_one_failing_asset_does_not_discard_the_rest_of_the_fleet(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """CLAUDE.md's "never block the loop on one bad message", applied to scoring.

    With containment around the whole cycle instead of per asset, one poison device throws
    away every score already computed — and because the fleet is scored in a deterministic
    order, the next cycle dies at the same device. The predictive half never recovers.
    """
    from app.features import build_window as real_build

    victim = backfilled[0]

    def _explode_for_victim(readings: list[object], **kw: object) -> object:
        if readings and getattr(readings[0], "asset_id", None) == victim:
            raise RuntimeError("poison device")
        return real_build(readings, **kw)  # type: ignore[arg-type]

    monkeypatch.setattr("app.scoring.build_window", _explode_for_victim)

    result = score_all(_deps(pool), now=datetime.now(tz=UTC))

    scored = {r.asset_id for r in result.rows}
    assert victim not in scored
    assert scored == set(backfilled) - {victim}, "one bad device cost the whole cycle"


@pytest.mark.integration
async def test_a_degraded_pump_reaches_a_client_that_is_already_waiting(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object
) -> None:
    """Item 3.3 end to end, through the REAL loop, with a subscriber already awaiting.

    This is the shape that catches the cross-thread bug: `score_all` runs in a
    `to_thread` worker, and `TwinHub.broadcast` ends in `asyncio.Event.set()`, which is not
    thread-safe. Broadcasting from the worker can queue the frame while leaving this
    `sub.get()` asleep — the frame exists, the twin never updates, and a test that merely
    inspected `qsize()` afterwards would still pass. Debug mode makes the violation loud.
    """
    loop = asyncio.get_running_loop()
    loop.set_debug(True)
    hub = TwinHub()
    sub = hub.subscribe()
    deps = _deps(pool, hub, interval_s=0.05)

    task = asyncio.create_task(run_scoring_loop(deps))
    try:
        event = await asyncio.wait_for(sub.get(), timeout=30.0)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        loop.set_debug(False)

    assert event.kind == "health"
    assert event.status in ("warning", "critical")
    assert event.model_version
    assert event.published_at is not None
    assert event.health_score is not None


@pytest.mark.integration
async def test_a_healthy_pump_is_not_announced_as_news(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object
) -> None:
    """Only a change, or a device actually in trouble, is worth a frame."""
    now = datetime.now(tz=UTC)

    score_all(_deps(pool), now=now)                     # establishes each stored status
    result = score_all(_deps(pool), now=now)            # nothing has changed since

    announced = {e.asset_id for e in result.events}
    healthy = {r.asset_id for r in result.rows if r.status == "normal"}
    assert healthy, "the backfill spread must leave at least one healthy pump"
    assert not (announced & healthy), (
        f"unchanged healthy devices were re-announced: {sorted(announced & healthy)}"
    )


@pytest.mark.integration
async def test_a_device_whose_status_changed_is_announced_even_when_it_is_healthy(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object
) -> None:
    """The recovery edge — the ONLY thing that clears a red symbol off the twin.

    Drop the `previous != current` half of the emit rule and a repaired pump stays red
    forever, while every other test in this file still passes.
    """
    now = datetime.now(tz=UTC)
    score_all(_deps(pool), now=now)

    # Re-band only the PREVIOUS status, so healthy devices read as having just changed.
    shifted = _deps(pool, warning_below=100.0, critical_below=0.0)
    result = score_all(shifted, now=now + timedelta(seconds=1))

    healthy = {r.asset_id for r in result.rows if r.status == "normal"}
    announced = {e.asset_id for e in result.events}
    assert healthy, "expected at least one healthy pump"
    assert healthy & announced, "a status transition back to normal was never announced"


@pytest.mark.integration
def test_scoring_is_idempotent_within_one_instant(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object
) -> None:
    """`health` is keyed (asset_id, scored_at); a repeated cycle must not duplicate rows."""
    now = datetime.now(tz=UTC)

    first = score_all(_deps(pool), now=now)
    second = score_all(_deps(pool), now=now)

    assert [r.asset_id for r in first.rows] == [r.asset_id for r in second.rows]
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM health WHERE scored_at = %s AND asset_id = %s",
            (now, backfilled[-1]),
        )
        assert (cur.fetchone() or [0])[0] == 1, "the repeated cycle duplicated a health row"


def test_the_banding_thresholds_come_from_the_model_module() -> None:
    """Copied literals would drift from `pwa_ml` and forge a transition every cycle.

    `row.status` is banded by the model; the previous status is re-banded from the stored
    score with these. If the two disagree, `previous != current` is true forever and the
    twin gets a duplicate frame every 10 seconds for that device.
    """
    deps = ScoringDeps(pool=cast(ConnectionPool, None), bundle=cast(Bundle, None))

    assert deps.warning_below == WARNING_BELOW
    assert deps.critical_below == CRITICAL_BELOW


async def test_the_scoring_loop_never_blocks_the_event_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Codex #11, and the defect that cost slice S3 a review round.

    Asserted on ELAPSED TIME, not call count: a loop-blocking implementation still calls
    `score_all` and still lets the ticker finish — just late.
    """
    import app.scoring as scoring_module

    blocked_for = 0.5
    calls: list[datetime] = []

    def _blocking_score(deps: ScoringDeps, *, now: datetime) -> scoring_module.ScoringResult:
        calls.append(now)
        time.sleep(blocked_for)
        return scoring_module.ScoringResult(rows=[], events=[])

    monkeypatch.setattr(scoring_module, "score_all", _blocking_score)
    deps = ScoringDeps(
        pool=cast(ConnectionPool, None), bundle=cast(Bundle, None), interval_s=0.01
    )

    task = asyncio.create_task(scoring_module.run_scoring_loop(deps))
    started = time.perf_counter()
    for _ in range(20):
        await asyncio.sleep(0.02)
    elapsed = time.perf_counter() - started
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

    assert calls, "run_scoring_loop never invoked score_all"
    assert elapsed < blocked_for + 0.25, (
        f"the event loop was stalled: 0.4s of sleeps took {elapsed:.2f}s, which means "
        "score_all ran ON the loop instead of via asyncio.to_thread"
    )


async def test_a_failing_cycle_leaves_the_loop_running(monkeypatch: pytest.MonkeyPatch) -> None:
    """A transient database error must not silently retire scoring for the whole process."""
    import app.scoring as scoring_module

    calls: list[int] = []

    def _explode(deps: ScoringDeps, *, now: datetime) -> scoring_module.ScoringResult:
        calls.append(1)
        raise RuntimeError("transient database failure")

    monkeypatch.setattr(scoring_module, "score_all", _explode)
    deps = ScoringDeps(
        pool=cast(ConnectionPool, None), bundle=cast(Bundle, None), interval_s=0.01
    )

    task = asyncio.create_task(scoring_module.run_scoring_loop(deps))
    await asyncio.sleep(0.25)
    still_running = not task.done()
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

    assert still_running, "the scoring loop died on the first failing cycle"
    assert len(calls) > 1, "the loop stopped retrying after the first failure"
