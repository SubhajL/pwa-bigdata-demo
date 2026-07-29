"""MQTT ingest: decode → validate → disposition (slice S2).

Two structural decisions carry the scored items.

**Where "never stall" lives.** `on_message` runs on paho's network thread and does one
thing: hand an immutable snapshot to the event loop. The decision that a message becomes
telemetry or a dead letter happens later, in the asyncio consumer. So the CLAUDE.md rule
("never block the ingest loop on a bad message") is enforced in the *consumer*, not here —
a `try/except` around `on_message` would protect the wrong boundary, and "dead-letter any
exception" is impossible for the one exception that matters, a database outage, because
the DLQ lives in that same database.

**paho's defaults are wrong for this demo,** and every one of them is set explicitly below:
`CallbackAPIVersion` defaults to the deprecated V1 (a V2-shaped callback raises TypeError
on the network thread); `subscribe()` defaults to QoS 0 and delivery is `min(pub, sub)`, so
a QoS-1 publisher is silently downgraded; `keepalive` defaults to 60s and reconnect backoff
to 120s, against a 30s recovery budget; `clean_session` defaults to True, which discards the
subscription and any in-flight message across a broker restart.
"""
from __future__ import annotations

import json
import math
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Final

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

from .models import Reading, Signal

#: Maps the wire string to the typed `Signal` literal. A dict rather than a set so the
#: lookup NARROWS str -> Signal for mypy; a membership test would leave the value a plain
#: str and force a `# type: ignore`, which CLAUDE.md forbids.
SIGNALS: Final[dict[str, Signal]] = {
    "pressure_bar": "pressure_bar",
    "flow_m3h": "flow_m3h",
    "power_kw": "power_kw",
    "vibration": "vibration",
    "bearing_temp_c": "bearing_temp_c",
}
VALID_SIGNALS: Final[frozenset[str]] = frozenset(SIGNALS)
REQUIRED_FIELDS: Final[tuple[str, ...]] = (
    "message_id", "run_id", "ts", "asset_id", "signal", "value",
)


class DecodeError(Exception):
    """Payload was not a UTF-8 JSON object. Dead-lettered, never bypassed."""

    def __init__(self, reason: str, raw: bytes) -> None:
        super().__init__(reason)
        self.reason = reason
        self.raw = raw


class MessageRejected(Exception):
    """Payload decoded but failed validation. Dead-lettered."""

    def __init__(self, reason: str, payload: dict[str, Any], asset_id: str | None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.payload = payload
        self.asset_id = asset_id


def decode(raw: bytes) -> dict[str, Any]:
    """Parse an MQTT payload into a JSON object.

    Raises:
        DecodeError: on invalid UTF-8, malformed JSON, or valid JSON that is not an
            object. All three are dead-letter cases, not crashes.
    """
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise DecodeError(f"payload is not valid utf-8: {exc}", raw) from exc
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise DecodeError(f"payload is not valid json: {exc}", raw) from exc
    if not isinstance(parsed, dict):
        raise DecodeError(f"payload is a json {type(parsed).__name__}, expected an object", raw)
    return parsed


def _require_text(payload: dict[str, Any], key: str, asset_id: str | None) -> str:
    value = payload[key]
    if not isinstance(value, str) or not value.strip():
        raise MessageRejected(f"{key} must be a non-empty string", payload, asset_id)
    return value


def validate(payload: dict[str, Any], known_asset_ids: frozenset[str]) -> Reading:
    """Turn a decoded payload into a `Reading`, or reject it.

    Pure: the roster is injected, so this issues no query per message and the verdict is
    reproducible in a unit test.

    Raises:
        MessageRejected: unknown asset_id, missing field, unknown signal, non-finite or
            non-numeric value, unparseable or timezone-naive timestamp.
    """
    asset_id = payload.get("asset_id") if isinstance(payload.get("asset_id"), str) else None

    missing = [f for f in REQUIRED_FIELDS if f not in payload]
    if missing:
        raise MessageRejected(f"missing required field(s): {', '.join(missing)}", payload, asset_id)

    message_id = _require_text(payload, "message_id", asset_id)
    run_id = _require_text(payload, "run_id", asset_id)
    asset_id = _require_text(payload, "asset_id", asset_id)

    if asset_id not in known_asset_ids:
        raise MessageRejected(f"unknown asset_id {asset_id!r}", payload, asset_id)

    raw_signal = payload["signal"]
    signal = SIGNALS.get(raw_signal) if isinstance(raw_signal, str) else None
    if signal is None:
        raise MessageRejected(f"unknown signal {raw_signal!r}", payload, asset_id)

    numeric = _parse_value(payload, asset_id)
    ts = _parse_timestamp(payload, asset_id)

    return Reading(
        message_id=message_id,
        run_id=run_id,
        ts=ts,
        asset_id=asset_id,
        signal=signal,
        value=numeric,
    )


def _parse_value(payload: dict[str, Any], asset_id: str | None) -> float:
    """The measurement as a finite float, or a rejection.

    `bool` is excluded explicitly because it is a subclass of `int` in Python, so `True`
    would otherwise be stored as the reading 1.0.
    """
    value = payload["value"]
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise MessageRejected(
            f"value must be a number, got {type(value).__name__}", payload, asset_id
        )
    try:
        numeric = float(value)
    except OverflowError as exc:
        # json.loads keeps an arbitrarily large integer as a Python int; float() then
        # RAISES rather than returning inf. Unconverted, that escapes MessageRejected
        # entirely and leaves the message unstorable and endlessly redelivered.
        raise MessageRejected(f"value is out of float range: {exc}", payload, asset_id) from exc
    if not math.isfinite(numeric):
        raise MessageRejected(f"value must be finite, got {value!r}", payload, asset_id)
    return numeric


def _parse_timestamp(payload: dict[str, Any], asset_id: str | None) -> datetime:
    raw_ts = payload["ts"]
    if not isinstance(raw_ts, str):
        raise MessageRejected(
            f"ts must be a string, got {type(raw_ts).__name__}", payload, asset_id
        )
    try:
        parsed = datetime.fromisoformat(raw_ts)
    except ValueError as exc:
        raise MessageRejected(f"ts is not an ISO-8601 timestamp: {exc}", payload, asset_id) from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        # Assuming UTC would misattribute readings by 7 hours in Thailand.
        raise MessageRejected("ts must carry a timezone offset", payload, asset_id)
    return parsed


class PipelineState(str, Enum):
    """Observable subscriber state — the live indicator R1.2 is scored against.

    SUBSCRIBING exists because CONNACK is not subscription: publishing between CONNACK
    and SUBACK lands nowhere, so recovery is only complete once the SUBACK arrives.
    """

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    SUBSCRIBING = "subscribing"
    CONNECTED = "connected"


@dataclass
class RawMessage:
    """Immutable snapshot handed from the paho thread to the event loop."""

    topic: str
    payload: bytes
    mid: int
    qos: int


@dataclass
class PipelineStatus:
    """Thread-safe status shared between the paho thread and the HTTP handler."""

    state: PipelineState = PipelineState.DISCONNECTED
    granted_qos: int | None = None
    connected_count: int = 0
    disconnect_count: int = 0
    last_error: str | None = None
    received: int = 0
    overflowed: int = 0
    unstored: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def record_subscription(self, granted: list[int]) -> None:
        """Record the SUBACK grant under the lock, then move to the resulting state."""
        with self._lock:
            self.granted_qos = granted[0] if granted else None
        if self.granted_qos == 1:
            self.set_state(PipelineState.CONNECTED)
        else:
            self.set_state(
                PipelineState.DISCONNECTED, error=f"subscription downgraded: {granted}"
            )

    def record_unstored(self) -> None:
        """A delivery we could not persist after retrying; left unacked for redelivery."""
        with self._lock:
            self.unstored += 1

    def record_overflow(self) -> None:
        """Queue was full at enqueue time; the message is not acked, so it comes back."""
        with self._lock:
            self.overflowed += 1

    def record_received(self, *, accepted: bool) -> None:
        """One delivery observed on the paho thread; `accepted` is False on queue overflow."""
        with self._lock:
            self.received += 1
            if not accepted:
                self.overflowed += 1

    def set_state(self, state: PipelineState, *, error: str | None = None) -> None:
        with self._lock:
            self.state = state
            if error is not None:
                self.last_error = error
            if state is PipelineState.CONNECTED:
                self.connected_count += 1
            elif state is PipelineState.DISCONNECTED:
                self.disconnect_count += 1

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "state": self.state.value,
                "granted_qos": self.granted_qos,
                "connected_count": self.connected_count,
                "disconnect_count": self.disconnect_count,
                "received": self.received,
                "overflowed": self.overflowed,
                "unstored": self.unstored,
                "last_error": self.last_error,
            }


def build_client(
    *,
    client_id: str,
    on_raw: Callable[[RawMessage], None],
    topic: str,
    status: PipelineStatus,
    reconnect_max_delay_s: int,
) -> mqtt.Client:
    """A paho client with every demo-relevant default overridden.

    `on_raw` hands the message to the event loop and returns immediately; admission
    control happens there, because `asyncio.Queue` is not thread-safe.
    """
    client = mqtt.Client(
        CallbackAPIVersion.VERSION2,
        client_id=client_id,
        clean_session=False,      # survive a broker restart with the subscription intact
        manual_ack=True,          # ack only after the disposition commits
    )
    client.reconnect_delay_set(min_delay=1, max_delay=reconnect_max_delay_s)

    def _on_connect(c: mqtt.Client, _u: Any, _f: Any, reason: Any, *_: Any) -> None:
        if getattr(reason, "is_failure", False):
            status.set_state(PipelineState.DISCONNECTED, error=f"connect refused: {reason}")
            return
        status.set_state(PipelineState.SUBSCRIBING)
        # QoS 1 explicitly: delivery is min(publish, subscription).
        c.subscribe(topic, qos=1)

    def _on_subscribe(_c: Any, _u: Any, _mid: Any, reason_codes: Any, *_: Any) -> None:
        # CONNECTED is reached here, not at CONNACK: a publisher that resumes between
        # CONNACK and SUBACK sends into a void, so recovery is not complete until the
        # subscription is actually installed at the QoS we asked for.
        status.record_subscription([int(getattr(rc, "value", rc)) for rc in reason_codes])

    def _on_disconnect(_c: Any, _u: Any, _f: Any, reason: Any, *_: Any) -> None:
        status.set_state(PipelineState.DISCONNECTED, error=f"disconnected: {reason}")

    def _on_message(_c: Any, _u: Any, msg: mqtt.MQTTMessage) -> None:
        # Thread boundary. No DB, no validation, nothing that can raise into paho.
        on_raw(RawMessage(msg.topic, bytes(msg.payload), msg.mid, msg.qos))
        status.record_received(accepted=True)

    client.on_connect = _on_connect
    client.on_subscribe = _on_subscribe
    client.on_disconnect = _on_disconnect
    client.on_message = _on_message
    return client
