"""The live feature window — the join between the hypertable and the model (slice S6).

`build_window` is the one function in this slice that can fail *quietly*. Every other
failure mode is loud: a missing route 404s, an absent artifact disables the endpoints. But
a window assembled from too little telemetry still produces a confident number, and a
judge cannot tell the difference between a health score computed from 24 hours of readings
and one computed from three readings and 21 hours of zero-fill.

So these tests are mostly about what the function REFUSES to do.

Pure unit tests: no database, no broker. The window contract is arithmetic over readings.
"""
from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

import pytest
from pwa_ml.lifecycle import SIGNAL_FIELDS
from pwa_ml.predict import MIN_WINDOW_HOURS

from app.features import MAX_STALENESS_S, WINDOW_HOURS, build_window
from app.models import Reading

NOW = datetime(2026, 7, 29, 14, 37, 11, tzinfo=UTC)
ASSET = "P-1"

#: A plausible mid-life value per signal, so the assembled window is in-distribution.
BASE: dict[str, float] = {
    "pressure_bar": 3.6,
    "flow_m3h": 205.0,
    "power_kw": 41.0,
    "vibration": 2.9,
    "bearing_temp_c": 61.0,
}


def _reading(hours_before: float, signal: str, value: float, *, now: datetime = NOW) -> Reading:
    return Reading(
        message_id=f"m-{signal}-{hours_before}-{value}",
        run_id="test-run",
        ts=now - timedelta(hours=hours_before),
        asset_id=ASSET,
        signal=signal,  # type: ignore[arg-type]  # Signal literal, checked by pydantic
        value=value,
    )


def _history(hours: int, *, signals: tuple[str, ...] = SIGNAL_FIELDS) -> list[Reading]:
    """One reading per signal per hour, newest at `NOW`, oldest `hours - 1` hours back."""
    return [
        _reading(h, signal, BASE[signal])
        for h in range(hours)
        for signal in signals
    ]


def test_a_full_history_builds_one_contiguous_row_per_hour() -> None:
    window = build_window(_history(WINDOW_HOURS), now=NOW)

    assert window.scoreable
    assert window.reason is None
    assert len(window.rows) == WINDOW_HOURS
    # `pwa_ml.predict._is_contiguous` rejects any window whose hours are not 0,1,2,...
    assert [row.hour for row in window.rows] == list(range(WINDOW_HOURS))
    assert window.observed_at == NOW


def test_rows_run_oldest_first_so_slope_features_have_the_right_sign() -> None:
    """The model's slope features are fitted against ascending time.

    Reversing the window would flip every trend: a pump getting hotter would present as one
    cooling down, and the health score would move confidently in the wrong direction.
    """
    readings = [
        _reading(h, "bearing_temp_c", 40.0 + (WINDOW_HOURS - 1 - h))
        for h in range(WINDOW_HOURS)
    ] + [
        _reading(h, signal, BASE[signal])
        for h in range(WINDOW_HOURS)
        for signal in SIGNAL_FIELDS
        if signal != "bearing_temp_c"
    ]

    rows = build_window(readings, now=NOW).rows

    assert rows[0].bearing_temp_c < rows[-1].bearing_temp_c


def test_a_signal_missing_from_one_hour_is_carried_forward() -> None:
    """Telemetry is sampled, not continuous: a gap means no fresh reading, not no value."""
    readings = [
        r for r in _history(WINDOW_HOURS) if not (r.signal == "vibration" and _at(r, 5))
    ]

    window = build_window(readings, now=NOW)

    assert window.scoreable
    gap_row = window.rows[WINDOW_HOURS - 1 - 5]
    assert gap_row.vibration == pytest.approx(BASE["vibration"])


def test_a_signal_never_observed_makes_the_window_unscoreable() -> None:
    """Zero-filling here would turn absent telemetry into a confident measurement."""
    partial = tuple(s for s in SIGNAL_FIELDS if s != "bearing_temp_c")

    window = build_window(_history(WINDOW_HOURS, signals=partial), now=NOW)

    assert not window.scoreable
    assert window.rows == []
    assert window.reason is not None and "bearing_temp_c" in window.reason


def test_the_window_starts_only_once_every_signal_has_appeared() -> None:
    """LOCF carries forward, never backward, so earlier buckets are unfillable.

    Vibration is dropped from every bucket 20 or more hours back, so it first appears 19
    hours ago. That leaves 20 usable buckets — above the minimum, so the window is
    scoreable but SHORTER than the full history, and the hours are renumbered from 0.
    """
    readings = [
        r for r in _history(WINDOW_HOURS) if not (r.signal == "vibration" and _older(r, 20))
    ]

    window = build_window(readings, now=NOW)

    assert window.scoreable
    assert len(window.rows) == 20
    assert [row.hour for row in window.rows] == list(range(20))


def test_a_late_appearing_signal_below_the_minimum_is_refused() -> None:
    readings = [
        r for r in _history(WINDOW_HOURS) if not (r.signal == "vibration" and _older(r, 8))
    ]

    window = build_window(readings, now=NOW)

    assert not window.scoreable
    assert window.reason is not None and str(MIN_WINDOW_HOURS) in window.reason


def test_a_stale_window_is_refused_even_when_it_is_complete() -> None:
    """A stopped simulator must read as `nodata`, not as a device frozen in good health."""
    stale_now = NOW + timedelta(seconds=MAX_STALENESS_S + 60)

    window = build_window(_history(WINDOW_HOURS), now=stale_now)

    assert not window.scoreable
    assert window.reason is not None and "old" in window.reason
    assert window.observed_at == NOW


def test_too_few_hours_of_history_is_refused() -> None:
    window = build_window(_history(MIN_WINDOW_HOURS - 4), now=NOW)

    assert not window.scoreable
    assert window.reason is not None


def test_an_empty_history_is_refused_with_a_reason() -> None:
    window = build_window([], now=NOW)

    assert not window.scoreable
    assert window.reason is not None and "no telemetry" in window.reason


def test_a_bucket_holding_several_readings_uses_their_mean() -> None:
    readings = _history(WINDOW_HOURS)
    # A second pressure reading in the newest hour, 20 minutes earlier.
    readings.append(_reading(0.33, "pressure_bar", BASE["pressure_bar"] + 1.0))

    window = build_window(readings, now=NOW)

    assert window.rows[-1].pressure_bar == pytest.approx(BASE["pressure_bar"] + 0.5)


def test_non_finite_readings_are_discarded_rather_than_scored() -> None:
    """A NaN would propagate through the mean into every feature derived from it."""
    readings = _history(WINDOW_HOURS)
    readings.append(_reading(0.25, "power_kw", math.inf))

    window = build_window(readings, now=NOW)

    assert window.scoreable
    assert window.rows[-1].power_kw == pytest.approx(BASE["power_kw"])


def test_readings_older_than_the_window_are_ignored() -> None:
    readings = _history(WINDOW_HOURS)
    readings.append(_reading(WINDOW_HOURS + 5, "pressure_bar", 99.0))

    window = build_window(readings, now=NOW)

    assert len(window.rows) == WINDOW_HOURS
    assert all(row.pressure_bar < 50.0 for row in window.rows)
    # The value-based assertions above hold even with no window filter at all, because an
    # out-of-range bucket is simply never on the grid. `observed_at` is the one observable
    # the filter actually protects, so it is what pins it.
    assert window.observed_at == NOW


def test_a_naive_now_is_rejected_loudly() -> None:
    """Telemetry timestamps are TIMESTAMPTZ; comparing them to a naive clock raises."""
    with pytest.raises(ValueError, match="timezone-aware"):
        build_window(_history(WINDOW_HOURS), now=NOW.replace(tzinfo=None))


def test_asking_for_a_window_shorter_than_the_model_accepts_is_a_bug() -> None:
    with pytest.raises(ValueError, match="minimum"):
        build_window(_history(WINDOW_HOURS), now=NOW, hours=MIN_WINDOW_HOURS - 1)


def _at(reading: Reading, hours_before: int) -> bool:
    """Whether `reading` falls in the bucket exactly `hours_before` hours before NOW."""
    return _floor(reading.ts) == _floor(NOW - timedelta(hours=hours_before))


def _older(reading: Reading, hours_before: int) -> bool:
    """Whether `reading` is at or before the bucket `hours_before` hours back."""
    return _floor(reading.ts) <= _floor(NOW - timedelta(hours=hours_before))


def _floor(ts: datetime) -> datetime:
    return ts.replace(minute=0, second=0, microsecond=0)


def test_a_handful_of_readings_cannot_masquerade_as_a_full_window() -> None:
    """The exact repro both reviewers produced independently.

    Five readings 23 hours old plus ONE fresh pressure reading used to yield a scoreable
    24-row window: `observed_at` is the newest reading across ALL signals, so the window
    looked fresh, and LOCF filled the other 23 buckets. Six readings were then presented
    with exactly the same confidence as 24 hours of telemetry, which is the failure this
    module exists to prevent.
    """
    readings = [_reading(WINDOW_HOURS - 1, signal, BASE[signal]) for signal in SIGNAL_FIELDS]
    readings.append(_reading(0, "pressure_bar", BASE["pressure_bar"]))

    window = build_window(readings, now=NOW)

    assert not window.scoreable
    assert window.reason is not None and "carried forward" in window.reason


def test_a_signal_that_stopped_reporting_is_refused_even_when_the_others_are_fresh() -> None:
    """Per-signal staleness, not just per-asset.

    LOCF is for a sampling gap, not for a sensor that died yesterday. Without this, four
    live signals keep the window "fresh" while the fifth is carried forward from an
    arbitrarily old reading and still contributes a mean, a slope and a max.
    """
    readings = [
        r for r in _history(WINDOW_HOURS)
        if not (r.signal == "vibration" and not _older(r, 10))
    ]

    window = build_window(readings, now=NOW)

    assert not window.scoreable
    assert window.reason is not None and "vibration" in window.reason


def test_a_window_that_is_mostly_carried_forward_is_refused() -> None:
    """Isolates the DENSITY guard from the signal-age guard.

    Every signal is fresh here — eight solid recent hours — so the per-signal staleness
    rule is satisfied and only the bucket-coverage rule can reject this. Without that
    separation the coverage branch was untested: the six-reading case above is caught by
    signal age alone, so deleting the density check left it green.
    """
    readings = [_reading(WINDOW_HOURS - 1, signal, BASE[signal]) for signal in SIGNAL_FIELDS]
    readings += [
        _reading(hour, signal, BASE[signal])
        for hour in range(8)
        for signal in SIGNAL_FIELDS
    ]

    window = build_window(readings, now=NOW)

    assert not window.scoreable
    assert window.reason is not None and "carried forward" in window.reason
