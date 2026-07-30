"""Fan-out hub for the digital-twin WebSocket (slice S3).

`broadcast()` is called from the ingest consumer, so its contract is unusually strict:
**it is synchronous, it never blocks, and it never raises.** Anything else couples the
liveness of the data pipeline to the health of a browser tab, and CLAUDE.md's rule that
ingest must never stall would be violated by a backgrounded twin.

Three consequences follow.

* Delivery is *not* awaited. Each subscriber owns a bounded buffer that its own socket
  task drains, so a stalled reader can only fall behind — never push back on ingest.
* Queued frames **coalesce by `asset_id`**. A twin is a view of the present, and what it
  needs is the latest state of each device. Keeping the newest N frames *globally* would
  let 64 updates for other assets evict a `P-1: critical`, leaving the twin showing P-1 as
  healthy indefinitely, because there is no resynchronisation protocol.
* Admission is **capped**. Per-subscriber bounds do not bound the aggregate: `broadcast()`
  walks every subscriber on the single event loop, so N leaked or hostile non-reading
  clients would make each accepted MQTT message O(N). Measured, 100k subscribers cost
  ~43 ms per broadcast — event-loop starvation at ingest rate.
"""
from __future__ import annotations

import logging
from collections import OrderedDict

from .models import TwinEvent

logger = logging.getLogger(__name__)

#: Distinct ASSETS buffered per subscriber before the least-recently-updated is dropped.
#: The bound is per-asset, NOT per-frame: an asset may hold one frame per (kind, signal),
#: bounded by the signal repertoire (≤6), so the memory ceiling stays ~6·max_queue frames.
DEFAULT_MAX_QUEUE = 64

#: Concurrent twin clients. The demo has one browser; the cap exists so a leak or a
#: hostile client cannot turn fan-out into an ingest problem.
DEFAULT_MAX_SUBSCRIBERS = 64

#: The coalescing key WITHIN one asset's buffer: (kind, signal). `signal` is None for a
#: `health` frame. Two DIFFERENT signals — or a health frame vs a status frame — never
#: coalesce, so a pending `pressure_bar:warning` or `health:critical` is not overwritten by
#: a later `flow_m3h:normal` before the socket task drains it. Newest wins WITHIN a key.
FrameKey = tuple[str, str | None]


def _frame_key(event: TwinEvent) -> FrameKey:
    return (event.kind, event.signal)


class Subscriber:
    """One connected twin client.

    A two-tier buffer: `asset_id -> {(kind, signal) -> latest TwinEvent}`, least-recently-
    updated asset first. Keyed by asset for the CAPACITY bound (so the "N distinct assets"
    guarantee survives), and sub-keyed by (kind, signal) so a device's health frame and its
    per-signal status frames coexist instead of clobbering one another.

    The clobber this fixes is real even for a prompt client: `scoring` and `ingest` can both
    broadcast for the same asset within one event-loop turn, so with a flat asset->frame map
    a `status:normal` overwrites a pending `health:critical` before the awakened drainer runs
    — the twin flashes red and reverts, and the client never receives the critical at all.
    """

    __slots__ = ("_pending", "_max", "_wakeup")

    def __init__(self, max_queue: int) -> None:
        import asyncio

        self._pending: OrderedDict[str, OrderedDict[FrameKey, TwinEvent]] = OrderedDict()
        self._max = max_queue
        self._wakeup = asyncio.Event()

    async def get(self) -> TwinEvent:
        """Await the next frame: oldest pending asset, oldest frame within it."""
        while not self._pending:
            self._wakeup.clear()
            await self._wakeup.wait()
        asset_id = next(iter(self._pending))
        bucket = self._pending[asset_id]
        _key, event = bucket.popitem(last=False)
        if not bucket:
            del self._pending[asset_id]
        return event

    def qsize(self) -> int:
        """Total pending frames across all assets."""
        return sum(len(bucket) for bucket in self._pending.values())

    def _offer(self, event: TwinEvent) -> bool:
        """Buffer `event`, coalescing by (asset, kind, signal). Newest wins within a key.

        Returns True when an unrelated ASSET had to be evicted to stay within `max_queue`.
        An already-buffered asset never triggers eviction — only a NEW asset does, so the
        bound counts assets, not frames.
        """
        asset_id = event.asset_id
        evicted = False
        if asset_id in self._pending:
            self._pending.move_to_end(asset_id)  # least-recently-updated goes last
        elif len(self._pending) >= self._max:
            self._evict_one()
            evicted = True
        bucket = self._pending.setdefault(asset_id, OrderedDict())
        if (key := _frame_key(event)) in bucket:
            del bucket[key]  # re-insert so newest sorts last within the asset
        bucket[key] = event
        self._wakeup.set()
        return evicted

    def _evict_one(self) -> None:
        """Drop the least-recently-updated ASSET, preferring one that is entirely routine.

        Plain LRU would let a burst of `normal` chatter from other devices evict a pending
        `critical`, and with no resynchronisation protocol the twin would show that device as
        healthy indefinitely. An asset whose every buffered frame is `normal` is recoverable
        — its next reading replaces it — so those are surrendered first.
        """
        for asset_id, bucket in self._pending.items():
            if all(frame.status == "normal" for frame in bucket.values()):
                del self._pending[asset_id]
                return
        self._pending.popitem(last=False)  # everything pending is notable; drop the oldest


class TwinHub:
    """Fan-out to every connected twin client."""

    class TooManySubscribers(RuntimeError):
        """Admission refused: the hub is already at its connection cap."""

    def __init__(
        self,
        max_queue: int = DEFAULT_MAX_QUEUE,
        max_subscribers: int = DEFAULT_MAX_SUBSCRIBERS,
    ) -> None:
        # `asyncio.Queue(maxsize=0)` means UNLIMITED, which is the opposite of what a 0
        # here reads like — so reject it rather than silently removing the bound.
        if max_queue < 1:
            raise ValueError(f"max_queue must be >= 1, got {max_queue}")
        if max_subscribers < 1:
            raise ValueError(f"max_subscribers must be >= 1, got {max_subscribers}")
        self._max_queue = max_queue
        self._max_subscribers = max_subscribers
        self._subscribers: set[Subscriber] = set()
        self._dropped = 0

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    @property
    def dropped(self) -> int:
        """Frames evicted because a subscriber could not keep up. Surfaced in status."""
        return self._dropped

    def subscribe(self) -> Subscriber:
        if len(self._subscribers) >= self._max_subscribers:
            raise TwinHub.TooManySubscribers(
                f"twin hub is full ({self._max_subscribers} subscribers)"
            )
        sub = Subscriber(self._max_queue)
        self._subscribers.add(sub)
        return sub

    def unsubscribe(self, sub: Subscriber) -> None:
        self._subscribers.discard(sub)

    def close(self) -> None:
        self._subscribers.clear()

    def broadcast(self, event: TwinEvent) -> None:
        """Hand `event` to every subscriber. Synchronous, non-blocking, total.

        Iterates a snapshot so a socket task disconnecting mid-loop cannot mutate the set
        underneath us.
        """
        for sub in tuple(self._subscribers):
            if sub._offer(event):
                self._dropped += 1
