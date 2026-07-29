"""Window features and SEC.

`specific_energy_consumption` is the value the digital twin's pump tooltip shows (scored
item 2.3), and it lands here rather than in the twin slice because it is domain arithmetic,
not presentation: SEC = kWh per m³ pumped.
"""
from __future__ import annotations

import math

import pytest

from pwa_ml.features import FEATURE_NAMES, specific_energy_consumption, window_features
from pwa_ml.lifecycle import LifecycleRow, generate_lifecycle


def _rows(hours: int = 48, wear_rate: float = 0.25) -> list[LifecycleRow]:
    run = generate_lifecycle(
        lifecycle_id="lc-feat", seed=3, hours=hours,
        wear_rate=wear_rate, failure_threshold=30.0,
    )
    return list(run.rows)


# ── SEC ─────────────────────────────────────────────────────────────────────


def test_sec_is_power_over_flow() -> None:
    assert specific_energy_consumption(30.0, 120.0) == pytest.approx(0.25)


@pytest.mark.parametrize(
    ("power", "flow"),
    [
        (30.0, 0.0),                    # division by zero
        (30.0, -5.0),                   # a negative flow is not a flow
        (-1.0, 100.0),                  # negative power is a broken meter
        (float("nan"), 100.0),
        (float("inf"), 100.0),
        (30.0, float("nan")),
        (30.0, float("inf")),
    ],
)
def test_sec_is_none_for_undefined_input(power: float, flow: float) -> None:
    """A tooltip must show an em dash, never NaN or a nonsense negative."""
    assert specific_energy_consumption(power, flow) is None


def test_sec_never_returns_a_non_finite_number() -> None:
    for power in (0.0, 1.0, 1e6):
        for flow in (0.001, 1.0, 1e6):
            value = specific_energy_consumption(power, flow)
            assert value is not None
            assert math.isfinite(value)


# ── window features ─────────────────────────────────────────────────────────


def test_features_have_a_stable_ordered_schema() -> None:
    """The model is fitted on this exact order; a reshuffle silently corrupts inference."""
    features = window_features(_rows())

    assert list(features) == list(FEATURE_NAMES)
    assert len(set(FEATURE_NAMES)) == len(FEATURE_NAMES)


def test_features_are_finite_for_a_normal_window() -> None:
    for name, value in window_features(_rows()).items():
        assert math.isfinite(value), f"{name} was not finite"


def test_features_are_pure() -> None:
    rows = _rows()

    assert window_features(rows) == window_features(rows)


def test_an_empty_window_is_rejected_rather_than_scored_as_zero() -> None:
    """Zero-filling missing telemetry turns "no data" into a confident measurement."""
    with pytest.raises(ValueError, match="empty"):
        window_features([])


def test_a_degrading_window_moves_the_features_it_should() -> None:
    healthy = window_features(_rows(hours=40, wear_rate=0.02)[:24])
    degraded = window_features(_rows(hours=400, wear_rate=0.5)[-24:])

    assert degraded["vibration_mean"] > healthy["vibration_mean"]
    assert degraded["bearing_temp_c_mean"] > healthy["bearing_temp_c_mean"]
