"""T5/T5b — the pressure_drop fault mode (DREP-PR7b R5).

Item 2.4 is "pressure DROP → highlight pipe + affected customers". The existing `anomaly`
mode drives signals ABOVE their band and cannot express a drop, so a dedicated mode is
needed. It must drive `pressure_bar` BELOW its band on devices that report it, leave every
other signal in band, and work THROUGH the settings/env path a demo operator uses — not only
via a direct enum call.

Authored by Claude; the implementer must not modify this file (DREP §10).
"""
from __future__ import annotations

import json
import math

import pytest

from app.models import KIND_SIGNALS, SIGNAL_BANDS, Device, FaultMode
from app.publish import make_signal


def _pump() -> Device:
    return Device(
        asset_id="PWA-TEST-P1", kind="pump", branch="สมุทรสาคร", province="สมุทรสาคร", region=3
    )


def _motor() -> Device:
    return Device(
        asset_id="PWA-TEST-M1", kind="motor", branch="สมุทรสาคร", province="สมุทรสาคร", region=3
    )


def test_pressure_drop_drives_pressure_below_band_on_a_pump() -> None:
    pump = _pump()
    low, _high = SIGNAL_BANDS["pressure_bar"]
    saw_pressure = False
    for tick in range(len(KIND_SIGNALS["pump"])):
        signal, value = make_signal(pump, tick, FaultMode.PRESSURE_DROP)
        if signal == "pressure_bar":
            saw_pressure = True
            assert value < low, f"pressure {value} not below band low {low}"
    assert saw_pressure, "the pump never reported pressure_bar across a full cycle"


def test_pressure_drop_leaves_other_signals_BYTE_IDENTICAL_to_normal() -> None:
    # "Unaffected" means EXACTLY equal to NORMAL, not merely in-band — pressure_drop is a
    # TARGETED fault. `mode.value` used to enter the RNG seed unconditionally, so a motor's
    # power reading differed between the two modes even though both were in band.
    pump = _pump()
    for tick in range(len(KIND_SIGNALS["pump"])):
        signal, dropped = make_signal(pump, tick, FaultMode.PRESSURE_DROP)
        if signal != "pressure_bar":
            assert (signal, dropped) == make_signal(pump, tick, FaultMode.NORMAL), (
                f"{signal} changed under pressure_drop; it must be identical to NORMAL"
            )


def test_a_device_without_pressure_is_byte_identical_to_normal_under_pressure_drop() -> None:
    # A motor does not report pressure_bar (KIND_SIGNALS['motor']); pressure_drop must leave
    # it entirely unchanged.
    motor = _motor()
    assert "pressure_bar" not in KIND_SIGNALS["motor"]
    for tick in range(len(KIND_SIGNALS["motor"])):
        assert make_signal(motor, tick, FaultMode.PRESSURE_DROP) == make_signal(
            motor, tick, FaultMode.NORMAL
        )


def test_pressure_drop_values_are_finite_and_rounded() -> None:
    pump = _pump()
    for tick in range(len(KIND_SIGNALS["pump"])):
        _signal, value = make_signal(pump, tick, FaultMode.PRESSURE_DROP)
        assert math.isfinite(value), "a non-finite value would be dead-lettered downstream"
        assert value == round(value, 4)


def test_fault_mode_pressure_drop_parses_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The demo operator sets FAULT_MODE=pressure_drop; it must reach the settings as the
    # enum member, not fail parsing.
    from app.config import SimSettings

    monkeypatch.setenv("FAULT_MODE", "pressure_drop")
    assert SimSettings().fault_mode is FaultMode.PRESSURE_DROP


def test_pressure_drop_reaches_the_wire_through_the_publisher(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """T5b — the full path: SimSettings(FAULT_MODE=pressure_drop) -> _next_message ->
    a below-band pressure envelope on the wire. A publisher ignoring `cfg.fault_mode`
    would pass every direct-enum test but fail here."""
    from app.config import SimSettings
    from app.publish import _next_message

    monkeypatch.setenv("FAULT_MODE", "pressure_drop")
    cfg = SimSettings()
    pump = _pump()
    low, _high = SIGNAL_BANDS["pressure_bar"]

    saw_below_band_pressure = False
    for tick in range(len(KIND_SIGNALS["pump"])):
        _topic, payload = _next_message(cfg, pump, tick)
        body = json.loads(payload)
        if body["signal"] == "pressure_bar":
            saw_below_band_pressure = True
            assert body["value"] < low, f"wire pressure {body['value']} not below band {low}"
    assert saw_below_band_pressure, "no pressure_bar reached the wire across a cycle"
