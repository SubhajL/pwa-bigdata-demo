"""The hub keeps a device's health and per-signal status frames distinct (DREP-PR7b R4-hub).

The bug this pins: `scoring` (health) and `ingest` (per-signal status) can both broadcast for
the SAME asset within one event-loop turn — before the awakened socket task drains anything.
With a flat asset→frame map the second broadcast (`status:normal`) overwrites the first
(`health:critical`), so the twin flashes red and reverts and the client NEVER receives the
critical frame. A prompt-draining client cannot fix what it never gets.

The two-tier buffer keeps one frame per (kind, signal) per asset, so both survive and the
frontend takes the max severity. The per-ASSET capacity bound is preserved (existing
`test_twin_ws.py` still passes verbatim).

Authored by Claude; the implementer must not modify this file (DREP §10).
"""
from __future__ import annotations

import asyncio

from app.models import Signal, TwinEvent, TwinStatus
from app.ws import TwinHub


def _status(asset: str, signal: Signal, status: TwinStatus) -> TwinEvent:
    return TwinEvent(kind="status", asset_id=asset, status=status, signal=signal)


def _health(asset: str, status: TwinStatus) -> TwinEvent:
    return TwinEvent(kind="health", asset_id=asset, status=status, health_score=20.0)


async def test_a_normal_status_frame_does_not_clobber_a_pending_critical_health_frame() -> None:
    """The flash-red race, reproduced: broadcast both for one asset with NO yield between,
    while a drainer is already awaiting. Both must be delivered."""
    hub = TwinHub()
    sub = hub.subscribe()

    getter = asyncio.ensure_future(sub.get())
    await asyncio.sleep(0)  # let the getter start awaiting the wakeup

    # Two producers, same asset, same event-loop turn (no await between).
    hub.broadcast(_health("P-2", "critical"))
    hub.broadcast(_status("P-2", "pressure_bar", "normal"))

    first = await asyncio.wait_for(getter, timeout=2.0)
    second = await asyncio.wait_for(sub.get(), timeout=2.0)

    delivered = {(f.kind, f.signal): f.status for f in (first, second)}
    assert delivered[("health", None)] == "critical", "the critical health frame was lost"
    assert delivered[("status", "pressure_bar")] == "normal"


async def test_two_different_signals_for_one_asset_are_both_retained() -> None:
    hub = TwinHub()
    sub = hub.subscribe()

    hub.broadcast(_status("P-2", "pressure_bar", "warning"))
    hub.broadcast(_status("P-2", "flow_m3h", "normal"))

    drained = []
    while sub.qsize():
        drained.append(await asyncio.wait_for(sub.get(), timeout=2.0))
    by_signal = {f.signal: f.status for f in drained}

    assert by_signal["pressure_bar"] == "warning", "a different signal's frame masked pressure"
    assert by_signal["flow_m3h"] == "normal"


async def test_same_kind_same_signal_still_coalesces_newest_wins() -> None:
    # Two readings of the SAME signal DO coalesce — the twin wants the newest state.
    hub = TwinHub()
    sub = hub.subscribe()

    hub.broadcast(_status("P-2", "pressure_bar", "warning"))
    hub.broadcast(_status("P-2", "pressure_bar", "normal"))  # recovered

    assert sub.qsize() == 1
    frame = await asyncio.wait_for(sub.get(), timeout=2.0)
    assert frame.status == "normal", "same-signal frames must coalesce to the newest"


async def test_capacity_counts_assets_not_frames() -> None:
    # One asset with several signal frames must not consume the whole queue; a second asset
    # still gets admitted.
    hub = TwinHub(max_queue=2)
    sub = hub.subscribe()

    for sig in ("pressure_bar", "flow_m3h", "power_kw", "vibration"):
        hub.broadcast(_status("P-2", sig, "warning"))  # 4 frames, ONE asset
    hub.broadcast(_status("V-9", "pressure_bar", "critical"))  # a SECOND asset

    drained = []
    while sub.qsize():
        drained.append(await asyncio.wait_for(sub.get(), timeout=2.0))
    assets = {f.asset_id for f in drained}
    assert assets == {"P-2", "V-9"}, "the second asset was evicted by one asset's own signals"
