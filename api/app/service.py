"""The ingest service: paho thread → bounded queue → supervised asyncio consumer (S2).

This module owns the CLAUDE.md rule *"never block the ingest loop on a bad message —
DLQ and continue."* The guarantee lives in `consume_once`/`run_consumer`, not in the paho
callback: `on_message` merely enqueues, so wrapping *it* in try/except would protect a
boundary where nothing can go wrong, and would still leave the single asyncio consumer
free to die on the first unexpected exception and stall the whole pipeline silently.

Acknowledgement is manual and happens only AFTER the disposition transaction commits. If
the database is unreachable the message is deliberately left unacked, so the broker
redelivers it rather than the process dropping it while reporting success.
"""
from __future__ import annotations

import asyncio
import contextlib
import itertools
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Protocol

import paho.mqtt.client as mqtt
from psycopg_pool import ConnectionPool

from .db import Accepted, Rejected, disposition, known_asset_ids
from .ingest import (
    DecodeError,
    MessageRejected,
    PipelineState,
    PipelineStatus,
    RawMessage,
    build_client,
    decode,
    validate,
)
from .models import TwinEvent
from .ws import TwinHub

logger = logging.getLogger(__name__)

#: Monotonic per-process sequence for payloads that carry no identity of their own.
_UNDECODABLE_SEQ = itertools.count(1)

#: Re-exported so tests can substitute it; the consumer calls this module-level name.
__all__ = [
    "Acker", "IngestDeps", "consume_once", "disposition", "dispose_message",
    "Disposition", "load_roster", "run_consumer", "start_subscriber", "stop_subscriber",
]


class Acker(Protocol):
    """The only thing the consumer needs from the MQTT client.

    Narrowing to this protocol (rather than the concrete `mqtt.Client`) lets a test
    observe acknowledgement without a broker, and without a cast — CLAUDE.md forbids
    silencing the type checker to make a test compile.
    """

    # paho returns an MQTTErrorCode here; the return value is deliberately unconstrained
    # so both the real client and a test double satisfy the protocol.
    def ack(self, mid: int, qos: int) -> Any: ...


@dataclass
class IngestDeps:
    """Everything the consumer needs, injected so it is testable without a broker."""

    pool: ConnectionPool
    roster: frozenset[str]
    status: PipelineStatus
    #: This subscriber session's id. It scopes the synthetic identity given to
    #: undecodable payloads — see `_classify`.
    run_id: str = "unset"
    client: Acker | None = None
    #: Optional fan-out to connected twin clients. Never awaited from this path.
    twin_hub: TwinHub | None = None


def _classify(
    raw: RawMessage, roster: frozenset[str], subscriber_run_id: str
) -> tuple[str, str | None, Any, Any]:
    """Decide the disposition for one raw message. Never raises.

    Returns `(message_id, run_id, raw_for_storage, outcome)`.
    """
    try:
        payload = decode(raw.payload)
    except DecodeError as exc:
        # Undecodable bytes carry no application identity, so it comes from the transport:
        # subscriber session + topic + MQTT packet id. The session component is essential —
        # packet ids restart at 1 for every new session, so `topic:mid` alone collides
        # across API restarts and the ledger would silently swallow the later dead letters
        # as redeliveries. (Found by a test that passed alone and failed in the suite.)
        # Undecodable bytes carry no application identity. MQTT packet ids are reused
        # after PUBACK, so `topic:mid` would eventually collide and the ledger would
        # swallow a DISTINCT later delivery as a redelivery — silent loss of exactly the
        # evidence the DLQ exists to show. A per-process counter is unique instead; the
        # accepted cost is that a genuine redelivery yields a second DLQ row, which
        # over-reports rather than loses.
        message_id = f"undecodable:{subscriber_run_id}:{next(_UNDECODABLE_SEQ)}"
        return (
            message_id,
            subscriber_run_id,
            raw.payload,
            Rejected(message_id, subscriber_run_id, None, exc.reason),
        )

    message_id = str(payload.get("message_id") or f"unidentified:{raw.topic}:{raw.mid}")
    run_id = payload.get("run_id") if isinstance(payload.get("run_id"), str) else None

    try:
        reading = validate(payload, roster)
    except MessageRejected as exc:
        return message_id, run_id, payload, Rejected(message_id, run_id, exc.asset_id, exc.reason)
    return reading.message_id, reading.run_id, payload, Accepted(reading)


class Disposition(Enum):
    """What actually happened to one delivery.

    A boolean cannot express this. "Stored successfully" is true for a dead-lettered bad
    asset and for a QoS-1 redelivery just as much as for a new reading — so a boolean
    return made it impossible to decide whether the twin should be told anything, and the
    naive wiring announced rejects and replays as fresh news.
    """

    ACCEPTED = "accepted"     # new, valid reading -> tell the twin
    DUPLICATE = "duplicate"   # redelivery; already dispositioned -> ack, say nothing
    REJECTED = "rejected"     # dead-lettered -> ack, say nothing
    FAILED = "failed"         # could not store -> do NOT ack; retry

    @property
    def ackable(self) -> bool:
        return self is not Disposition.FAILED


def dispose_message(deps: IngestDeps, raw: RawMessage) -> Disposition:
    """Classify and persist one message, reporting which of the four outcomes occurred."""
    try:
        # Inside the try: classification itself must not be able to escape and leave the
        # message unacked forever (an OverflowError here used to do exactly that).
        message_id, run_id, stored, outcome = _classify(raw, deps.roster, deps.run_id)
        with deps.pool.connection() as conn:
            newly = disposition(
                conn, message_id=message_id, run_id=run_id, raw=stored, outcome=outcome
            )
    except Exception:
        # Broad by necessity: any database-side failure must leave the message unacked
        # rather than kill the consumer. It is logged, never swallowed silently.
        logger.exception("disposition failed for mid=%s; will retry", raw.mid)
        return Disposition.FAILED
    if not newly:
        return Disposition.DUPLICATE
    return Disposition.ACCEPTED if isinstance(outcome, Accepted) else Disposition.REJECTED


def _emit_twin_event(deps: IngestDeps, raw: RawMessage) -> None:
    """Publish a live status frame for an accepted reading.

    Deliberately fire-and-forget: `TwinHub.broadcast` is synchronous and total, so a
    backgrounded browser tab cannot apply back-pressure to ingest. Slice S6 replaces the
    flat "normal" with a health-derived status once the model is scoring.
    """
    if deps.twin_hub is None:
        return
    payload = _decoded_asset(raw)
    if payload is None:
        return
    deps.twin_hub.broadcast(
        TwinEvent(
            kind="status",
            asset_id=payload,
            status="normal",
            observed_at=None,
            published_at=datetime.now(tz=UTC),
        )
    )


def _decoded_asset(raw: RawMessage) -> str | None:
    """The asset id from an already-validated payload, or None if it is not readable."""
    try:
        payload = decode(raw.payload)
    except DecodeError:
        return None
    asset_id = payload.get("asset_id")
    return asset_id if isinstance(asset_id, str) else None


async def consume_once(
    deps: IngestDeps, queue: asyncio.Queue[RawMessage], *, attempts: int = 4
) -> None:
    """Drain exactly one message. Any failure is contained here, never propagated.

    A storage failure is RETRIED in-process with backoff rather than merely left unacked.
    MQTT only guarantees redelivery of an unacknowledged QoS-1 message on *reconnect* —
    while the connection stays healthy the broker owes us nothing, so a transient database
    blip would otherwise strand that delivery until something happened to reconnect, with
    the status endpoint still cheerfully reporting `connected`.
    """
    raw = await queue.get()
    try:
        for attempt in range(1, attempts + 1):
            result = await asyncio.to_thread(dispose_message, deps, raw)
            if result.ackable:
                if deps.client is not None:
                    deps.client.ack(raw.mid, raw.qos)
                # ONLY a newly-accepted reading is news for the twin. Acknowledgement is
                # deliberately independent of the broadcast: a WS problem must never turn
                # into a redelivery storm.
                if result is Disposition.ACCEPTED:
                    _emit_twin_event(deps, raw)
                return
            if attempt < attempts:
                deps.status.set_state(deps.status.state, error="storage failing; retrying")
                await asyncio.sleep(min(0.25 * 2 ** (attempt - 1), 2.0))
        # Still failing: leave it UNACKED so a later reconnect redelivers it, and say so.
        deps.status.record_unstored()
        logger.error("giving up on mid=%s after %d attempts; left unacked", raw.mid, attempts)
    except Exception:
        logger.exception("unexpected error handling message; pipeline continues")
    finally:
        queue.task_done()


async def run_consumer(deps: IngestDeps, queue: asyncio.Queue[RawMessage]) -> None:
    """Supervised drain loop — the one place the pipeline could stall, so it cannot."""
    while True:
        try:
            await consume_once(deps, queue)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("consumer iteration failed; restarting loop")
            await asyncio.sleep(0.1)


def start_subscriber(deps: IngestDeps, settings: Any, submit: Any) -> mqtt.Client:
    """Build, connect and start the paho client on its own thread."""
    client = build_client(
        client_id=settings.mqtt_client_id,
        on_raw=submit,
        topic=settings.mqtt_topic,
        status=deps.status,
        reconnect_max_delay_s=settings.mqtt_reconnect_max_delay_s,
    )
    deps.status.set_state(PipelineState.CONNECTING)
    client.connect_async(settings.mqtt_host, settings.mqtt_port, settings.mqtt_keepalive_s)
    client.loop_start()  # paho owns this thread; the event loop is never blocked
    return client


def load_roster(pool: ConnectionPool) -> frozenset[str]:
    with pool.connection() as conn:
        return known_asset_ids(conn)


async def stop_subscriber(client: mqtt.Client | None) -> None:
    if client is None:
        return
    with contextlib.suppress(Exception):
        client.disconnect()
    with contextlib.suppress(Exception):
        client.loop_stop()
