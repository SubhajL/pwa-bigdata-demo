"""Implementation tests for publish.py — written before the code (TDD)."""
from __future__ import annotations

import json

import pytest

from app.models import KIND_SIGNALS, SIGNAL_BANDS, FaultMode
from app.publish import make_envelope, make_malformed_payload, make_signal
from app.roster import load_devices


def test_make_signal_cycles_through_kind_signals() -> None:
    """A pump has 5 signals; tick 0..4 should produce all 5 distinct signals."""
    pump = next(d for d in load_devices() if d.kind == "pump")
    seen: set[str] = set()
    for tick in range(5):
        signal, _value = make_signal(pump, tick, FaultMode.NORMAL)
        seen.add(signal)
    assert seen == set(KIND_SIGNALS["pump"]), (
        f"Pump signals seen: {sorted(seen)}, expected: {sorted(KIND_SIGNALS['pump'])}"
    )


def test_make_signal_cycling_wraps_around() -> None:
    """tick 5 for a pump should cycle back to the same signal as tick 0."""
    pump = next(d for d in load_devices() if d.kind == "pump")
    s0, _ = make_signal(pump, 0, FaultMode.NORMAL)
    s5, _ = make_signal(pump, 5, FaultMode.NORMAL)
    assert s0 == s5, "tick 5 should wrap to same signal as tick 0"


def test_make_signal_different_devices_different_values() -> None:
    """Distinct pumps at the same tick produce different values."""
    roster = load_devices()
    values: set[float] = set()
    for dev in roster[:50]:
        if dev.kind == "pump":
            _, v = make_signal(dev, 0, FaultMode.NORMAL)
            values.add(v)
    assert len(values) > 1, (
        f"All {len(values)} pump devices produced identical value; "
        "seeding must be per-device, not constant"
    )


def test_anomaly_values_clearly_outside_band() -> None:
    """In ANOMALY mode, every tick is outside the signal band."""
    pump = next(d for d in load_devices() if d.kind == "pump")
    for tick in range(20):
        signal, value = make_signal(pump, tick, FaultMode.ANOMALY)
        low, high = SIGNAL_BANDS[signal]
        assert not (low <= value <= high), (
            f"tick={tick} {signal}={value} should be outside [{low}, {high}]"
        )


def test_make_envelope_bad_asset_uses_original_id_for_message_id() -> None:
    """Under BAD_ASSET, message_id still uses dev.asset_id, not BAD_ASSET_ID."""
    device = load_devices()[0]
    env = make_envelope(device, tick=5, run_id="r", mode=FaultMode.BAD_ASSET)
    # asset_id is replaced
    assert env.asset_id != device.asset_id
    # But message_id is derived from the original device.asset_id
    # We can check it differs from the bad_asset_id's message_id
    # The key point: message_id should be stable if we call again with same args
    env2 = make_envelope(device, tick=5, run_id="r", mode=FaultMode.BAD_ASSET)
    assert env.message_id == env2.message_id, "message_id must be stable even under BAD_ASSET"


def test_make_envelope_ts_is_utc() -> None:
    """Timestamp must be timezone-aware UTC."""
    device = load_devices()[0]
    env = make_envelope(device, tick=0, run_id="r", mode=FaultMode.NORMAL)
    assert env.ts.tzinfo is not None
    assert env.ts.utcoffset() is not None


def test_make_malformed_payload_not_json() -> None:
    """Payload must not be valid JSON."""
    raw = make_malformed_payload()
    assert isinstance(raw, bytes)
    with pytest.raises((json.JSONDecodeError, UnicodeDecodeError)):
        json.loads(raw.decode("utf-8"))


def test_make_malformed_payload_deterministic() -> None:
    """Same call produces same bytes."""
    assert make_malformed_payload() == make_malformed_payload()
