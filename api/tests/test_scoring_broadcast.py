"""The scoring burst must never evict the WORST device's frame (scored item 3.3).

Found by the P1 transition E2E on a warm stack: after ~24h every roster pump is
scoreable and non-normal, so one cycle broadcasts a burst of ~229 health frames in a
single event-loop turn — before the socket task gets a chance to drain any of them.
`score_all` returns events WORST-FIRST (mirroring its rows), and `Subscriber._offer`
evicts the least-recently-updated asset once the per-client buffer cap is exceeded.
Worst-first + least-recently-updated eviction = the critical device is offered first
and evicted first, every cycle, forever — precisely the frame the model→twin claim
(item 3.3) needs delivered. The demo's own status frames still arrived (they are not
burst-broadcast), which is what made the twin look alive while the health path was
silently dark.

The fix is ordering, not capacity: broadcast healthiest FIRST, so buffer pressure
sheds the healthiest pending assets and the worst survives to the wire.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from app.models import TwinEvent
from app.scoring import broadcast_scoring_events
from app.ws import TwinHub


def _health(asset_id: str, health: float, status: str) -> TwinEvent:
    return TwinEvent(
        kind="health",
        asset_id=asset_id,
        status=status,  # type: ignore[arg-type]
        health_score=health,
        observed_at=datetime.now(tz=UTC),
        published_at=datetime.now(tz=UTC),
    )


def test_the_worst_asset_survives_a_burst_larger_than_the_buffer() -> None:
    async def scenario() -> set[str]:
        hub = TwinHub(max_queue=2)
        sub = hub.subscribe()
        # Exactly what score_all returns: worst health first, everything non-normal.
        events = [
            _health("P-worst", 12.0, "critical"),
            _health("A", 55.0, "warning"),
            _health("B", 60.0, "warning"),
        ]
        await broadcast_scoring_events(hub, events)
        # Drain whatever survived the burst (buffer holds at most 2 assets).
        survivors: set[str] = set()
        for _ in range(2):
            survivors.add((await sub.get()).asset_id)
        return survivors

    survivors = asyncio.run(scenario())
    assert "P-worst" in survivors, f"critical frame was evicted; survivors: {survivors}"


def test_all_events_deliver_when_the_buffer_is_large_enough() -> None:
    async def scenario() -> set[str]:
        hub = TwinHub(max_queue=8)
        sub = hub.subscribe()
        events = [
            _health("P-worst", 12.0, "critical"),
            _health("A", 55.0, "warning"),
            _health("B", 60.0, "warning"),
        ]
        await broadcast_scoring_events(hub, events)
        return {(await sub.get()).asset_id for _ in range(3)}

    assert asyncio.run(scenario()) == {"P-worst", "A", "B"}


def test_a_recovery_frame_survives_the_burst_when_a_drainer_is_running() -> None:
    # Codex finding (Tier 2): a recovery (`normal`) frame is emitted ONCE — status
    # changed — and `Subscriber._evict_one` sheds all-normal buckets FIRST, so a burst
    # larger than the buffer silently destroys recoveries and a connected twin stays red
    # forever (a stale live health frame beats every later topology refetch client-side).
    # The broadcast must therefore YIELD to the event loop between frames, so a healthy
    # socket task drains at production rate and eviction pressure never builds.
    async def scenario() -> set[str]:
        hub = TwinHub(max_queue=2)
        sub = hub.subscribe()
        delivered: list[str] = []

        async def drain() -> None:
            while True:
                delivered.append((await sub.get()).asset_id)

        drainer = asyncio.create_task(drain())
        try:
            events = [
                _health("P-worst", 12.0, "critical"),
                _health("A", 55.0, "warning"),
                _health("B", 60.0, "warning"),
                _health("P-recovered", 92.0, "normal"),  # the one-shot recovery
            ]
            await broadcast_scoring_events(hub, events)
            # Let the drainer finish anything still pending.
            for _ in range(8):
                await asyncio.sleep(0)
        finally:
            drainer.cancel()
        return set(delivered)

    delivered = asyncio.run(scenario())
    assert "P-recovered" in delivered, f"recovery frame lost; delivered: {delivered}"
    assert "P-worst" in delivered
