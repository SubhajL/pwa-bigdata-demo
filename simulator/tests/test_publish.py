"""TS1.4 / TS1.5 — signal generation, fault injection, and real-broker publishing.

TS1.5 is deliberately written to kill the degenerate implementation the adversarial
review produced: a `run()` that publishes one device's envelope N times satisfies
"N schema-valid messages arrived" but leaves 238 devices silent, repeats a single
message_id, ignores the configured rate, and uses QoS 0. Each of those is asserted
against here.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

import paho.mqtt.client as mqtt
import pytest
from jsonschema import Draft202012Validator, FormatChecker
from paho.mqtt.enums import CallbackAPIVersion

from app.config import SimSettings
from app.models import SIGNAL_BANDS, FaultMode
from app.publish import make_envelope, make_signal, run
from app.roster import load_devices

TOPIC_WILDCARD = "pwa/telemetry/#"


# ── TS1.4 — fault modes are genuinely injectable ────────────────────────────


def test_normal_signals_sit_inside_their_physical_band() -> None:
    for device in load_devices()[:25]:
        for tick in range(8):
            signal, value = make_signal(device, tick, FaultMode.NORMAL)
            low, high = SIGNAL_BANDS[signal]
            assert low <= value <= high, (
                f"{device.asset_id} tick={tick} {signal}={value} outside "
                f"NORMAL band [{low}, {high}]"
            )


def test_anomaly_mode_drives_the_signal_outside_the_normal_band() -> None:
    """A mode-ignoring make_signal returns the NORMAL value and fails here."""
    pump = next(d for d in load_devices() if d.kind == "pump")
    escaped = 0

    for tick in range(8):
        signal, value = make_signal(pump, tick, FaultMode.ANOMALY)
        low, high = SIGNAL_BANDS[signal]
        if not (low <= value <= high):
            escaped += 1

    assert escaped > 0, "ANOMALY must push at least one signal outside its band"


def test_signal_generation_is_deterministic() -> None:
    """Reproducible demos: no bare RNG. Same inputs, same output."""
    device = load_devices()[3]
    assert make_signal(device, 5, FaultMode.NORMAL) == make_signal(device, 5, FaultMode.NORMAL)


def test_signal_generation_is_deterministic_ACROSS_PROCESSES() -> None:
    """The demo must replay identically tomorrow, in a new process.

    Within one process, `hash()` is stable — so a seed derived from the builtin
    `hash()` of a string passes the test above while still producing different
    numbers on every run. PYTHONHASHSEED randomises string hashing per process by
    design, so the seed must come from a stable digest (hashlib/zlib) instead.
    This test pins that by running the generator in two fresh interpreters with
    deliberately different hash seeds.
    """
    program = (
        "import sys; sys.path.insert(0, '.');"
        "from app.publish import make_signal;"
        "from app.models import FaultMode;"
        "from app.roster import load_devices;"
        "d = load_devices()[3];"
        "print(make_signal(d, 5, FaultMode.NORMAL))"
    )
    simulator_dir = Path(__file__).resolve().parents[1]

    outputs = []
    for seed in ("0", "1", "12345"):
        env = {**os.environ, "PYTHONHASHSEED": seed}
        result = subprocess.run(
            [sys.executable, "-c", program],
            cwd=simulator_dir, env=env, capture_output=True, text=True, timeout=120,
        )
        assert result.returncode == 0, f"subprocess failed: {result.stderr}"
        outputs.append(result.stdout.strip())

    assert len(set(outputs)) == 1, (
        "make_signal is not reproducible across processes — the demo cannot be "
        f"replayed. Got {outputs}. Seed from hashlib/zlib, not builtin hash()."
    )


def test_bad_asset_mode_emits_an_id_outside_the_roster() -> None:
    known = {d.asset_id for d in load_devices()}
    device = load_devices()[0]

    env = make_envelope(device, tick=1, run_id="run-a", mode=FaultMode.BAD_ASSET)

    assert env.asset_id not in known, "BAD_ASSET must not collide with a real device"


def test_malformed_mode_produces_bytes_that_are_not_json(envelope_schema: dict[str, Any]) -> None:
    """S2 must dead-letter undecodable payloads, so S1 must be able to emit them."""
    from app.publish import make_malformed_payload

    raw = make_malformed_payload()

    assert isinstance(raw, bytes)
    with pytest.raises((json.JSONDecodeError, UnicodeDecodeError)):
        json.loads(raw.decode("utf-8"))


# ── TS1.5 — a real broker sees the whole roster ─────────────────────────────


class _Collector:
    """Subscribes at QoS 1 and records what actually arrives."""

    def __init__(self) -> None:
        self.messages: list[tuple[str, dict[str, Any], int]] = []
        self.granted_qos: list[int] = []
        self.subscribed = threading.Event()
        self._lock = threading.Lock()

    def start(self, port: int) -> mqtt.Client:
        client = mqtt.Client(CallbackAPIVersion.VERSION2, client_id="ts15-collector")
        client.on_connect = self._on_connect
        client.on_subscribe = self._on_subscribe
        client.on_message = self._on_message
        client.connect("127.0.0.1", port, keepalive=10)
        client.loop_start()
        assert self.subscribed.wait(timeout=20), "collector never received SUBACK"
        return client

    def _on_connect(self, client: mqtt.Client, *_: Any) -> None:
        client.subscribe(TOPIC_WILDCARD, qos=1)

    def _on_subscribe(self, _c: Any, _u: Any, _mid: Any, reason_codes: Any, *_: Any) -> None:
        self.granted_qos = [int(rc.value) for rc in reason_codes]
        self.subscribed.set()

    def _on_message(self, _c: Any, _u: Any, msg: mqtt.MQTTMessage) -> None:
        with self._lock:
            self.messages.append((msg.topic, json.loads(msg.payload.decode()), msg.qos))


@pytest.mark.integration
def test_run_survives_an_unavailable_broker(mosquitto: int) -> None:
    """The producer must not die when the broker is gone.

    Scored item 1.2 is demonstrated by restarting Mosquitto and showing the
    subscriber recover within 30s. "Recover" is only observable if telemetry is
    still flowing afterwards — so a producer that raises on connection loss
    destroys the evidence for the item it is supposed to support. `docker-compose`
    sets no restart policy for this service, so the container would simply stay
    dead.

    Reproduced before this test existed: killing the broker mid-run raised
    ConnectionRefusedError straight out of `run()`.
    """
    # A port with nothing listening: the same observable condition as a broker
    # that has gone away, without racing a container teardown.
    dead_port = mosquitto + 1
    cfg = SimSettings(
        mqtt_host="127.0.0.1",
        mqtt_port=dead_port,
        rate_hz=50.0,
        run_id="dead-broker-run",
        fault_mode=FaultMode.NORMAL,
        connect_timeout_s=3.0,
    )

    started = time.monotonic()
    published = run(cfg, max_messages=5)
    elapsed = time.monotonic() - started

    assert published == 0, "nothing can be published to a broker that is not there"
    assert elapsed < 25.0, (
        f"run() took {elapsed:.1f}s to give up on a dead broker; it must honour "
        "connect_timeout_s rather than hang or retry forever"
    )


@pytest.mark.integration
def test_run_resumes_after_the_broker_comes_back(mosquitto: int) -> None:
    """Publishing works again once a broker is reachable — the resume half of R1.2."""
    cfg = SimSettings(
        mqtt_host="127.0.0.1",
        mqtt_port=mosquitto,
        rate_hz=100.0,
        run_id="resume-run",
        fault_mode=FaultMode.NORMAL,
        connect_timeout_s=10.0,
    )

    assert run(cfg, max_messages=3) == 3


@pytest.mark.integration
def test_publishes_full_roster_to_real_broker(
    mosquitto: int, envelope_schema: dict[str, Any]
) -> None:
    Draft202012Validator.check_schema(envelope_schema)
    validator = Draft202012Validator(envelope_schema, format_checker=FormatChecker())

    roster = load_devices()
    collector = _Collector()
    client = collector.start(mosquitto)

    # Readiness is asserted BEFORE the act, so "no broker" fails as a fixture
    # error while "published nothing" fails as an assertion. That separation is
    # what makes this test's RED signal trustworthy.
    assert collector.granted_qos, "no SUBACK recorded"
    assert collector.granted_qos[0] == 1, f"subscription downgraded: {collector.granted_qos}"

    rate_hz = 120.0
    cfg = SimSettings(
        mqtt_host="127.0.0.1",
        mqtt_port=mosquitto,
        rate_hz=rate_hz,
        run_id="ts15-run",
        fault_mode=FaultMode.NORMAL,
    )

    started = time.monotonic()
    published = run(cfg, max_messages=len(roster))
    elapsed = time.monotonic() - started

    deadline = time.monotonic() + 30.0
    while time.monotonic() < deadline:
        with collector._lock:
            if len(collector.messages) >= len(roster):
                break
        time.sleep(0.05)
    client.loop_stop()
    client.disconnect()

    assert published == len(roster)
    with collector._lock:
        received = list(collector.messages)

    assert len(received) >= len(roster), f"only {len(received)}/{len(roster)} arrived"

    # 1. the FULL roster cycled — this is what the one-device stub fails
    got_ids = {payload["asset_id"] for _t, payload, _q in received}
    expected_ids = {d.asset_id for d in roster}
    assert got_ids == expected_ids, (
        f"roster not fully cycled; missing={sorted(expected_ids - got_ids)[:10]} "
        f"unexpected={sorted(got_ids - expected_ids)[:10]}"
    )

    # 2. every delivery is a distinct logical event
    message_ids = [payload["message_id"] for _t, payload, _q in received[: len(roster)]]
    assert len(set(message_ids)) == len(message_ids), "duplicate message_id published"

    # 3. effective delivery QoS is 1 (min of publish and subscribe QoS)
    assert all(q == 1 for _t, _p, q in received), "messages were not delivered at QoS 1"

    # 4. topic and payload agree, and every payload honours the contract
    for topic, payload, _q in received:
        validator.validate(payload)
        assert topic == f"pwa/telemetry/{payload['asset_id']}"
        assert payload["run_id"] == "ts15-run"

    # 5. the configured rate was actually honoured, not ignored
    floor = (len(roster) - 1) / rate_hz
    assert elapsed >= floor * 0.8, (
        f"published {published} messages in {elapsed:.2f}s; rate_hz={rate_hz} "
        f"implies at least ~{floor:.2f}s. The rate is being ignored."
    )
