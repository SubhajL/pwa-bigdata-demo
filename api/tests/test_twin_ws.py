"""TS3.4–TS3.6 — the WebSocket transport the digital twin consumes.

The hub is the one genuinely concurrency-sensitive piece in this slice, and it is called
from the ingest consumer. So the property that actually matters is not "a frame arrives"
but **"a slow or dead subscriber cannot slow ingest down"**. A naive implementation that
awaits `websocket.send_json()` inside the consumer would satisfy the happy-path test and
then wedge the entire pipeline the first time a browser tab is backgrounded.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from app.models import TwinEvent, TwinStatus
from app.ws import TwinHub

# api/pyproject.toml sets asyncio_mode = "auto", so async tests need no marker.


def _event(asset_id: str = "P-2", status: TwinStatus = "normal") -> TwinEvent:
    return TwinEvent(
        kind="status",
        asset_id=asset_id,
        status=status,
        observed_at=datetime.now(tz=UTC),
        published_at=datetime.now(tz=UTC),
    )


async def test_a_subscriber_receives_a_broadcast_frame() -> None:
    hub = TwinHub()
    sub = hub.subscribe()

    hub.broadcast(_event())

    frame = await asyncio.wait_for(sub.get(), timeout=2.0)
    assert frame.asset_id == "P-2"
    assert frame.kind == "status"


async def test_every_subscriber_receives_the_same_frame() -> None:
    hub = TwinHub()
    a, b = hub.subscribe(), hub.subscribe()

    hub.broadcast(_event(asset_id="P-1"))

    for sub in (a, b):
        frame = await asyncio.wait_for(sub.get(), timeout=2.0)
        assert frame.asset_id == "P-1"
    assert hub.subscriber_count == 2


async def test_unsubscribing_stops_delivery_and_frees_the_slot() -> None:
    hub = TwinHub()
    sub = hub.subscribe()
    hub.unsubscribe(sub)

    hub.broadcast(_event())

    assert hub.subscriber_count == 0
    assert sub.qsize() == 0


async def test_broadcast_never_raises_when_a_subscriber_has_vanished() -> None:
    """A client that disappears mid-broadcast must not take the ingest loop with it."""
    hub = TwinHub()
    doomed, healthy = hub.subscribe(), hub.subscribe()
    hub.unsubscribe(doomed)

    hub.broadcast(_event(asset_id="P-1"))  # must not raise

    frame = await asyncio.wait_for(healthy.get(), timeout=2.0)
    assert frame.asset_id == "P-1"


async def test_a_full_subscriber_queue_drops_the_OLDEST_frame() -> None:
    """A twin wants freshness, not history.

    Dropping the newest frame would leave the twin displaying a stale state forever, which
    is worse than a gap — so the eviction has to be from the front.
    """
    hub = TwinHub(max_queue=3)
    sub = hub.subscribe()

    for i in range(5):
        hub.broadcast(_event(asset_id=f"A-{i}"))

    received = [(await asyncio.wait_for(sub.get(), timeout=2.0)).asset_id for _ in range(3)]

    assert received == ["A-2", "A-3", "A-4"], f"expected the newest three, got {received}"
    assert hub.dropped == 2


async def test_a_stalled_subscriber_cannot_slow_the_broadcaster() -> None:
    """RS3.c — the load-bearing property.

    One subscriber never drains. Broadcasting must still return promptly and the OTHER
    subscriber must still see the newest frame. An implementation that awaits delivery
    would block here until the timeout fires.
    """
    hub = TwinHub(max_queue=2)
    stalled = hub.subscribe()
    healthy = hub.subscribe()

    started = asyncio.get_running_loop().time()
    for i in range(200):
        hub.broadcast(_event(asset_id=f"B-{i}"))
    elapsed = asyncio.get_running_loop().time() - started

    assert elapsed < 1.0, f"broadcasting 200 frames took {elapsed:.2f}s — it is blocking"
    assert stalled.qsize() == 2, "the stalled subscriber's queue grew past its bound"

    # The healthy subscriber is equally bounded, but what it holds is the NEWEST state.
    newest = [(await asyncio.wait_for(healthy.get(), timeout=2.0)).asset_id for _ in range(2)]
    assert newest == ["B-198", "B-199"]


async def test_hub_close_releases_every_subscriber() -> None:
    hub = TwinHub()
    hub.subscribe()
    hub.subscribe()

    hub.close()

    assert hub.subscriber_count == 0


async def test_event_carries_the_fields_S6_will_publish() -> None:
    """Pin the wire shape now so S6 does not have to break it.

    A client built against a status-only frame would need a breaking change the moment
    health scoring arrives — and `health` is already an advertised `kind`.
    """
    event = TwinEvent(
        kind="health",
        asset_id="P-2",
        status="warning",
        health_score=41.5,
        pttf_hours=72.0,
        model_version="health-v1",
    )
    wire = event.model_dump(mode="json")

    assert wire["event_version"] == 1
    assert wire["health_score"] == 41.5
    assert wire["pttf_hours"] == 72.0
    assert wire["model_version"] == "health-v1"


async def test_a_plain_status_frame_leaves_the_health_fields_empty() -> None:
    wire = _event().model_dump(mode="json")

    assert wire["kind"] == "status"
    assert wire["health_score"] is None
    assert wire["pttf_hours"] is None


async def test_queue_bound_of_zero_is_rejected_not_silently_unbounded() -> None:
    """`asyncio.Queue(maxsize=0)` means UNLIMITED — the opposite of what 0 reads like."""
    import pytest

    with pytest.raises(ValueError, match="max_queue"):
        TwinHub(max_queue=0)


async def test_admission_is_capped_so_fan_out_stays_bounded() -> None:
    """broadcast() walks every subscriber on the single event loop.

    Per-subscriber bounds do not bound the AGGREGATE: N leaked or hostile non-reading
    clients make every accepted MQTT message O(N). A measured probe put 100k subscribers
    at ~43ms per broadcast, which is event-loop starvation at ingest rate. So admission
    itself has to be limited.
    """
    hub = TwinHub(max_subscribers=3)
    subs = [hub.subscribe() for _ in range(3)]

    assert hub.subscriber_count == 3
    assert all(s is not None for s in subs)

    with __import__("pytest").raises(TwinHub.TooManySubscribers):
        hub.subscribe()


async def test_queued_frames_are_coalesced_per_asset() -> None:
    """Keeping the newest N frames GLOBALLY still loses the newest state per device.

    A `P-1: critical` update evicted by 64 updates for other assets leaves the twin
    showing P-1 as healthy forever, because there is no resynchronisation protocol. What
    the twin needs is the latest frame for each asset, so queued frames coalesce by id.
    """
    hub = TwinHub(max_queue=4)
    sub = hub.subscribe()

    hub.broadcast(_event(asset_id="P-1", status="critical"))
    for i in range(10):
        hub.broadcast(_event(asset_id=f"OTHER-{i}"))

    drained = []
    while sub.qsize():
        drained.append(await asyncio.wait_for(sub.get(), timeout=2.0))
    by_asset = {f.asset_id: f for f in drained}

    assert "P-1" in by_asset, "the critical device was evicted by unrelated chatter"
    assert by_asset["P-1"].status == "critical"


async def test_coalescing_keeps_the_newest_state_for_a_repeated_asset() -> None:
    hub = TwinHub(max_queue=8)
    sub = hub.subscribe()

    hub.broadcast(_event(asset_id="P-2", status="normal"))
    hub.broadcast(_event(asset_id="P-2", status="warning"))
    hub.broadcast(_event(asset_id="P-2", status="critical"))

    frames = []
    while sub.qsize():
        frames.append(await asyncio.wait_for(sub.get(), timeout=2.0))

    assert len(frames) == 1, f"expected one coalesced frame per asset, got {len(frames)}"
    assert frames[0].status == "critical", "coalescing kept a stale state"
