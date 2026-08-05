"""P0 demo-scenario — the pure injection math and its model oracle.

The scenario endpoint's central claim is that after injection the REAL model scores the
target into the intended band through the REAL feature window — not that a fabricated
health row was written. These tests pin that claim deterministically, without a database
or broker, exactly the way `test_backfill_demo_health.py` pins the cold-start baseline:
trajectory → `build_window` → `score_window` on the shipped artifact.

The solver is the piece that makes injection work on a WARM stack: injected readings
blend into each hourly bucket's per-signal MEAN alongside whatever the simulator and the
backfill already wrote, so the endpoint solves for (count, value) such that the blended
mean lands exactly on the trajectory value.
"""
from __future__ import annotations

import pathlib
import zlib
from datetime import UTC, datetime, timedelta

import pytest
from pwa_ml.lifecycle import generate_lifecycle
from pwa_ml.predict import CRITICAL_BELOW, WARNING_BELOW, load_bundle, score_window

from app import demo
from app.bands import SIGNAL_BANDS
from app.features import WINDOW_HOURS, build_window
from app.models import DemoMode, Reading

# ── solver ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("n", "mean", "target"),
    [
        (0, None, 1.8),     # empty bucket: inject the target value itself
        (1, 4.0, 1.7),      # cold stack: one backfill row per bucket-signal
        (15, 4.2, 1.75),    # warm stack: ~15 simulator readings in the bucket
        (7, 1.0, 5.0),      # recovery direction (normal mode over a degraded bucket)
        (75, 4.0, 1.7),     # warm stack plus a previous injection's rows
    ],
)
def test_solver_lands_the_blended_mean_exactly_on_target(
    n: int, mean: float | None, target: float
) -> None:
    k, x = demo.solve_injection(n, mean, target)
    blended = ((mean or 0.0) * n + k * x) / (n + k)
    assert blended == pytest.approx(target, abs=1e-9)


def test_solver_count_is_positive_and_bounded() -> None:
    for n in (0, 1, 20, 500, 10_000):
        k, _ = demo.solve_injection(n, 3.0, 1.0)
        assert 1 <= k <= demo.PER_BUCKET_CAP


def test_solver_keeps_injected_values_near_the_target() -> None:
    # k = 3·max(1, n) bounds the displacement to a third of the (mean − target) gap, so
    # injected rows stay physically plausible instead of compensating with wild values.
    k, x = demo.solve_injection(15, 4.0, 1.7)
    assert k == 45
    assert abs(x - 1.7) <= abs(4.0 - 1.7) / 3 + 1e-9


def test_solver_folds_a_reserved_reading_into_the_bucket_mean() -> None:
    # The instant out-of-band reading lands in the newest bucket too; solving without it
    # would leave that bucket's final mean off-trajectory by d/(n+k+1) (Codex Tier-2
    # finding). With the reserved value folded in, the blended mean is exact again.
    n, mean, target, reserved = 4, 3.8, 1.7, 1.0
    k, x = demo.solve_injection(n, mean, target, reserved=reserved)
    blended = (mean * n + reserved + k * x) / (n + k + 1)
    assert blended == pytest.approx(target, abs=1e-9)


@pytest.mark.parametrize("mode", ["normal", "pressure_drop", "anomaly", "bearing_anomaly"])
def test_solved_rows_leave_every_instant_buckets_mean_on_trajectory(mode: DemoMode) -> None:
    """EXACTLY the five instants `_replace_scenario` reserves, built by the production
    `_scenario_instants` — a hand-rolled three-entry fixture let a dropped vibration or
    bearing reservation drift the feature bucket unnoticed (g-check MEDIUM, round 2)."""
    now = datetime(2026, 8, 3, 12, 30, 0, tzinfo=UTC)
    wear = demo.HEALTHY_WEAR if mode in ("normal", "bearing_anomaly") else demo.WORN_WEAR
    targets = {(hb, s): v for hb, s, v in demo.scenario_trajectory(mode, "P-2", wear)}
    instants = demo._scenario_instants(mode, "P-2", wear)

    # Primary-first and complete: one instant per signal, band transition leading.
    assert list(instants)[0] == demo.instant_reading(mode)[0]
    assert set(instants) == {"pressure_bar", "vibration", "bearing_temp_c", "power_kw", "flow_m3h"}

    rows = demo._solved_rows(
        {}, mode=mode, target="P-2", wear=wear, now=now, run_id="r",
        instants=instants,
    )
    bucket = now.replace(minute=0, second=0, microsecond=0)
    for inst_signal, inst_value in instants.items():
        in_bucket = [r.value for r in rows if r.signal == inst_signal and r.ts >= bucket]
        final_mean = (sum(in_bucket) + inst_value) / (len(in_bucket) + 1)
        assert final_mean == pytest.approx(targets[(0, inst_signal)], abs=1e-3), inst_signal


def test_solved_rows_stay_inside_the_plausible_envelope_for_the_bearing_pin() -> None:
    """The hotter bearing pin (one band-width above high) must be reachable with plausible
    injected values on a realistically-full warm bucket (g-check MEDIUM: the reviewer's
    own realistic case, n=15 readings averaging 55 °C with the 85 °C instant reserved)."""
    now = datetime(2026, 8, 5, 12, 30, tzinfo=UTC)
    bucket = now.replace(minute=0, second=0, microsecond=0)
    stats: dict[tuple[datetime, str], tuple[int, float | None]] = {
        (bucket, "bearing_temp_c"): (15, 55.0)
    }

    rows = demo._solved_rows(
        stats, mode="bearing_anomaly", target="P-2", wear=demo.HEALTHY_WEAR, now=now,
        run_id="r", instants={"bearing_temp_c": 85.0},
    )

    low, high = SIGNAL_BANDS["bearing_temp_c"]
    margin = demo._PLAUSIBLE_BAND_WIDTHS * (high - low)
    hot_rows = [r.value for r in rows if r.signal == "bearing_temp_c" and r.ts >= bucket]
    assert hot_rows, "the pinned bucket must receive injected rows"
    assert all(low - margin <= v <= high + margin for v in hot_rows)


def test_solved_rows_fail_closed_rather_than_write_implausible_values() -> None:
    """A pathologically full bucket makes the capped solve compensate with huge values
    (2 600 °C bearings). The injection must REFUSE — aborting the whole replacement —
    never write them (g-check MEDIUM, fail-closed)."""
    now = datetime(2026, 8, 5, 12, 30, tzinfo=UTC)
    bucket = now.replace(minute=0, second=0, microsecond=0)
    stats: dict[tuple[datetime, str], tuple[int, float | None]] = {
        (bucket, "bearing_temp_c"): (10_000, 55.0)
    }

    with pytest.raises(demo.ScenarioImplausible):
        demo._solved_rows(
            stats, mode="bearing_anomaly", target="P-2", wear=demo.HEALTHY_WEAR, now=now,
            run_id="r", instants={"bearing_temp_c": 85.0},
        )


# ── trajectories through the shipped model (the item-3.3 oracle) ───────────────────────


def _score_trajectory(asset_id: str, wear: float, artifact: pathlib.Path) -> float:
    now = datetime(2026, 8, 3, 12, 0, 0, tzinfo=UTC)
    readings = [
        Reading(
            message_id=f"probe:{asset_id}:{hours_before}:{signal}",
            run_id="probe",
            ts=now - timedelta(hours=hours_before),
            asset_id=asset_id,
            signal=signal,
            value=value,
        )
        for hours_before, signal, value in demo.trajectory(asset_id, wear)
    ]
    window = build_window(readings, now=now, hours=WINDOW_HOURS)
    assert window.scoreable, f"trajectory window not scoreable: {window.reason}"
    return score_window(load_bundle(artifact), window.rows).health


@pytest.mark.parametrize("asset_id", ["P-1", "P-2"])
def test_worn_trajectory_scores_critical_through_the_shipped_bundle(
    asset_id: str, model_artifact: pathlib.Path
) -> None:
    health = _score_trajectory(asset_id, demo.WORN_WEAR, model_artifact)
    assert health < CRITICAL_BELOW, f"worn trajectory scored {health:.1f}"


@pytest.mark.parametrize("asset_id", ["P-1", "P-2"])
def test_healthy_trajectory_scores_normal_through_the_shipped_bundle(
    asset_id: str, model_artifact: pathlib.Path
) -> None:
    health = _score_trajectory(asset_id, demo.HEALTHY_WEAR, model_artifact)
    assert health >= WARNING_BELOW, f"healthy trajectory scored {health:.1f}"


@pytest.mark.parametrize("asset_id", ["P-1", "P-2"])
def test_worn_trajectory_stays_pre_failure(asset_id: str) -> None:
    # The model trains only on windows ending BEFORE the failure crossing; a post-failure
    # window would be scored out of domain (PTTF saturated to 0), which is not a
    # prediction. Same guard as the backfill's demo override.
    run = generate_lifecycle(
        lifecycle_id=f"demo-{asset_id}",
        seed=zlib.crc32(asset_id.encode()),
        hours=demo.RUN_UP_HOURS,
        wear_rate=demo.WORN_WEAR,
        failure_threshold=demo.FAILURE_THRESHOLD,
    )
    assert run.failure_hour is None


def test_trajectory_covers_every_window_bucket_for_all_signals() -> None:
    rows = demo.trajectory("P-2", demo.WORN_WEAR)
    hours = {hours_before for hours_before, _signal, _value in rows}
    assert hours == set(range(WINDOW_HOURS))
    by_hour_signals = {h: {s for hb, s, _v in rows if hb == h} for h in hours}
    assert all(len(signals) == 5 for signals in by_hour_signals.values())


# ── instant readings (the <1s band transition) ─────────────────────────────────────────


def test_pressure_drop_instant_reading_is_a_below_band_warning() -> None:
    from app.bands import SIGNAL_BANDS, classify_signal

    signal, value = demo.instant_reading("pressure_drop")
    assert signal == "pressure_bar"
    assert value < SIGNAL_BANDS["pressure_bar"][0]
    assert classify_signal(signal, value) == "warning"


def test_anomaly_instant_reading_is_an_above_band_warning() -> None:
    from app.bands import SIGNAL_BANDS, classify_signal

    signal, value = demo.instant_reading("anomaly")
    assert value > SIGNAL_BANDS[signal][1]
    assert classify_signal(signal, value) == "warning"


def test_normal_instant_reading_is_in_band() -> None:
    from app.bands import classify_signal

    signal, value = demo.instant_reading("normal")
    assert signal == "pressure_bar"
    assert classify_signal(signal, value) == "normal"


def test_analyze_failure_never_propagates() -> None:
    # ANALYZE is a planner optimization AFTER the replacement committed; a failure here
    # must not turn an already-successful mutation into a 500 with no broadcast.
    from typing import cast

    from psycopg_pool import ConnectionPool

    class BadPool:
        def connection(self) -> None:
            raise RuntimeError("pool exhausted")

    demo._analyze(cast(ConnectionPool, BadPool()))  # must not raise
