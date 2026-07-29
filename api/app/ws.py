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

#: Distinct assets buffered per subscriber before the least-recently-updated is dropped.
DEFAULT_MAX_QUEUE = 64

#: Concurrent twin clients. The demo has one browser; the cap exists so a leak or a
#: hostile client cannot turn fan-out into an ingest problem.
DEFAULT_MAX_SUBSCRIBERS = 64


class Subscriber:
    """One connected twin client: the latest frame per asset, oldest-update first."""

    __slots__ = ("_pending", "_max", "_wakeup")

    def __init__(self, max_queue: int) -> None:
        import asyncio

        self._pending: OrderedDict[str, TwinEvent] = OrderedDict()
        self._max = max_queue
        self._wakeup = asyncio.Event()

    async def get(self) -> TwinEvent:
        """Await the next frame, oldest pending asset first."""
        while not self._pending:
            self._wakeup.clear()
            await self._wakeup.wait()
        _asset, event = self._pending.popitem(last=False)
        return event

    def qsize(self) -> int:
        return len(self._pending)

    def _offer(self, event: TwinEvent) -> bool:
        """Queue `event`, replacing any pending frame for the same asset.

        Returns True when an unrelated asset had to be evicted to make room.
        """
        evicted = False
        if event.asset_id in self._pending:
            del self._pending[event.asset_id]       # replace, keeping arrival order fair
        elif len(self._pending) >= self._max:
            self._evict_one()
            evicted = True
        self._pending[event.asset_id] = event
        self._wakeup.set()
        return evicted

    def _evict_one(self) -> None:
        """Drop the least-recently-updated frame, preferring a routine one.

        Plain LRU would let a burst of `normal` chatter from other devices evict a
        pending `critical`, and with no resynchronisation protocol the twin would show
        that device as healthy indefinitely. Losing a routine update is recoverable —
        the next reading replaces it — so routine frames are surrendered first.
        """
        for asset_id, pending in self._pending.items():
            if pending.status == "normal":
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
