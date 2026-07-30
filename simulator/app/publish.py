"""Telemetry publisher (slice S1).

Publishes one reading per tick to `pwa/telemetry/{asset_id}` at **QoS 1**, cycling
the full roster. QoS 1 matters: MQTT delivers at the minimum of the publish and
subscription QoS, so publishing at 0 would silently cap the consumer at at-most-once
however the subscriber is configured.

Every value produced here is SIMULATED. Only the device geography is real.
"""
from __future__ import annotations

import logging
import random
import threading
import time
import uuid
import zlib
from datetime import UTC, datetime

import paho.mqtt.client as _mqtt_client
from paho.mqtt.enums import CallbackAPIVersion

from .config import SimSettings, get_settings
from .models import BAD_ASSET_ID, KIND_SIGNALS, SIGNAL_BANDS, Device, Envelope, FaultMode, Signal

#: Fixed namespace for uuid5 so message_ids are reproducible given the same inputs.
NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")

logger = logging.getLogger(__name__)


def make_signal(dev: Device, tick: int, mode: FaultMode) -> tuple[Signal, float]:
    """Produce the next (signal, value) for `dev`.

    Deterministic in `(dev.asset_id, tick, mode)` — any randomness must be seeded
    from those, never from the wall clock or an unseeded RNG, so a demo run can be
    reproduced exactly.

    Post:
        - the value is finite;
        - for `FaultMode.NORMAL` it lies inside `SIGNAL_BANDS[signal]`;
        - for `FaultMode.ANOMALY` at least one signal per cycle lies outside it;
        - for `FaultMode.PRESSURE_DROP` `pressure_bar` lies BELOW its band and EVERY other
          signal is byte-identical to what NORMAL would produce (a targeted fault, so a
          motor and a pump's non-pressure signals are genuinely unaffected);
        - the signal is drawn from `KIND_SIGNALS[dev.kind]`.
    """
    repertoire = KIND_SIGNALS[dev.kind]
    signal = repertoire[tick % len(repertoire)]
    low, high = SIGNAL_BANDS[signal]
    band_range = high - low
    margin = max(band_range * 0.02, 0.01)

    targeted_drop = mode is FaultMode.PRESSURE_DROP and signal == "pressure_bar"
    # A non-pressure signal under PRESSURE_DROP must be IDENTICAL to NORMAL — so it seeds
    # from NORMAL, not from PRESSURE_DROP. Only the targeted pressure reading uses the
    # drop mode's own stream. This is what makes pressure_drop a genuinely targeted fault.
    seed_mode = mode if (mode is not FaultMode.PRESSURE_DROP or targeted_drop) else FaultMode.NORMAL
    seed = zlib.crc32(f"{dev.asset_id}|{tick}|{seed_mode.value}".encode())
    rng = random.Random(seed)

    if targeted_drop:
        value = rng.uniform(low - band_range * 0.5, low - margin)
    elif mode is FaultMode.ANOMALY:
        value = rng.uniform(high + margin, high + band_range * 0.5)
    else:
        value = rng.uniform(low + margin, high - margin)

    return signal, round(value, 4)


def make_envelope(dev: Device, tick: int, run_id: str, mode: FaultMode) -> Envelope:
    """Build one wire envelope.

    `message_id` is the LOGICAL EVENT identity: `uuid5` over `run_id|asset_id|tick`.
    Stable within a run, so a QoS-1 redelivery is idempotent; distinct across runs,
    because `run_id` is fresh per process. It is not the MQTT delivery id.

    `ts` must be timezone-aware UTC — the consumer dead-letters naive timestamps.
    Under `FaultMode.BAD_ASSET` the envelope carries `BAD_ASSET_ID` instead of
    `dev.asset_id`, which is the deliberate R1.5 dead-letter case.
    """
    message_id = str(uuid.uuid5(NAMESPACE, f"{run_id}|{dev.asset_id}|{tick}"))
    signal, value = make_signal(dev, tick, mode)
    asset_id = BAD_ASSET_ID if mode is FaultMode.BAD_ASSET else dev.asset_id

    return Envelope(
        message_id=message_id,
        run_id=run_id,
        ts=datetime.now(tz=UTC),
        asset_id=asset_id,
        signal=signal,
        value=value,
    )


def make_malformed_payload() -> bytes:
    """Bytes that are NOT decodable JSON — the S2 decode-failure dead-letter case.

    Must fail `json.loads(raw.decode("utf-8"))`.
    """
    return b"{not json at all"


def _connect_with_retry(cfg: SimSettings) -> _mqtt_client.Client | None:
    """Return a client whose CONNACK has arrived, or None after `cfg.connect_timeout_s`.

    `Client.connect()` only completes the TCP handshake and sends CONNECT — it does
    not wait for CONNACK. Publishing immediately after it can therefore fail with
    MQTT_ERR_NO_CONN purely as a startup race. Waiting for the `on_connect` callback
    removes that race instead of relying on the retry path to paper over it.
    """
    connected = threading.Event()

    def _on_connect(_c: object, _u: object, _f: object, reason: object, *_: object) -> None:
        if getattr(reason, "is_failure", False):
            logger.warning("broker refused connection: %s", reason)
            return
        connected.set()

    deadline = time.monotonic() + cfg.connect_timeout_s
    while time.monotonic() < deadline:
        client = _mqtt_client.Client(CallbackAPIVersion.VERSION2)
        client.reconnect_delay_set(min_delay=1, max_delay=cfg.reconnect_max_delay_s)
        client.on_connect = _on_connect
        try:
            client.connect(cfg.mqtt_host, cfg.mqtt_port, keepalive=10)
        except OSError as exc:
            logger.warning("connect attempt failed: %s", exc)
            time.sleep(0.5)
            continue
        client.loop_start()
        if connected.wait(timeout=min(5.0, max(0.1, deadline - time.monotonic()))):
            return client
        logger.warning("no CONNACK from %s:%s", cfg.mqtt_host, cfg.mqtt_port)
        client.loop_stop()
        client.disconnect()
    return None


#: Bound on a single QoS-1 publish. Unbounded waits hang forever if the broker
#: accepts a PUBLISH and then disappears before the PUBACK.
_PUBLISH_TIMEOUT_S = 3.0


def _next_message(cfg: SimSettings, dev: Device, tick: int) -> tuple[str, bytes]:
    """Topic and payload for one tick.

    The topic always follows the PAYLOAD's asset_id so the two can never disagree —
    under BAD_ASSET that is deliberately the unknown id. MALFORMED has no envelope
    to read an id from, so it keeps the real device's topic.
    """
    if cfg.fault_mode is FaultMode.MALFORMED:
        return f"{cfg.topic_prefix}/{dev.asset_id}", make_malformed_payload()
    envelope = make_envelope(dev, tick, cfg.run_id, cfg.fault_mode)
    return f"{cfg.topic_prefix}/{envelope.asset_id}", envelope.model_dump_json().encode()


def run(cfg: SimSettings, *, max_messages: int | None = None) -> int:
    """Connect to the broker and publish telemetry until `max_messages` is reached.

    Cycles the FULL roster in order at `cfg.rate_hz`, publishing at QoS 1. Survives
    broker unavailability: retries connect for up to `cfg.connect_timeout_s` and
    continues past per-message failures.

    Args:
        cfg: runtime settings.
        max_messages: stop after this many publishes; `None` runs forever.

    Returns:
        the number of messages published.
    """
    if cfg.rate_hz <= 0:
        raise ValueError(f"rate_hz must be positive; got {cfg.rate_hz}")

    from .roster import load_devices

    roster = load_devices(cfg.curated_path)
    client = _connect_with_retry(cfg)
    if client is None:
        return 0

    sleep_s = 1.0 / cfg.rate_hz
    published = 0

    try:
        tick = 0
        while max_messages is None or published < max_messages:
            dev = roster[tick % len(roster)]
            topic, payload = _next_message(cfg, dev, tick)
            try:
                info = client.publish(topic, payload, qos=1)
                info.wait_for_publish(timeout=_PUBLISH_TIMEOUT_S)
            except (OSError, RuntimeError, ValueError) as exc:
                logger.warning("publish failed for %s tick %d: %s", dev.asset_id, tick, exc)
            else:
                published += 1

            tick += 1

            if sleep_s > 0 and (max_messages is None or published < max_messages):
                time.sleep(sleep_s)
    finally:
        client.loop_stop()
        client.disconnect()

    return published


def main() -> None:
    """Container entrypoint — `python -m app.publish`, wired in docker-compose."""
    cfg = get_settings()
    run(cfg)


if __name__ == "__main__":
    main()
