"""The seeded lifecycle data — where PTTF's labels actually come from.

PTTF is only a real quantity if something in the data knows when failure happened. These
runs carry a latent health trajectory and therefore a **known** `failure_hour`, which is
what turns "predicted time to failure" into a supervised target rather than a number the
model invents.

The distinction that matters most here is **censoring**: a run whose observation window
ended before it failed has `failure_hour is None`. That is a *lower bound*, not "failed at
the horizon", and training on it as though it were an exact time biases every prediction
toward the horizon.
"""
from __future__ import annotations

import math

import pytest

from pwa_ml.lifecycle import SIGNAL_FIELDS, LifecycleRun, generate_lifecycle


def _run(
    *,
    lifecycle_id: str = "lc-test",
    seed: int = 7,
    hours: int = 400,
    wear_rate: float = 0.25,
    failure_threshold: float = 30.0,
) -> LifecycleRun:
    return generate_lifecycle(
        lifecycle_id=lifecycle_id,
        seed=seed,
        hours=hours,
        wear_rate=wear_rate,
        failure_threshold=failure_threshold,
    )


def test_generation_is_deterministic_for_a_seed() -> None:
    """A demo that cannot be replayed is not a demo."""
    a, b = _run(), _run()

    assert [r.latent_health for r in a.rows] == [r.latent_health for r in b.rows]
    assert a.failure_hour == b.failure_hour


def test_different_seeds_give_different_trajectories() -> None:
    a, b = _run(seed=1), _run(seed=2)

    assert [r.latent_health for r in a.rows] != [r.latent_health for r in b.rows]


def test_failure_hour_is_the_FIRST_crossing_not_any_crossing() -> None:
    run = _run()
    assert run.failure_hour is not None

    crossings = [r.hour for r in run.rows if r.latent_health <= run.failure_threshold]
    assert run.failure_hour == min(crossings)
    before = [r for r in run.rows if r.hour < run.failure_hour]
    assert all(r.latent_health > run.failure_threshold for r in before)


def test_a_run_that_never_fails_is_censored_not_failed_at_the_horizon() -> None:
    """The single most important distinction in this slice.

    Recording `failure_hour = hours` for a run that simply had not failed yet would train
    the model that "healthy" means "fails exactly at the horizon".
    """
    run = _run(wear_rate=0.0005, hours=100)

    assert run.failure_hour is None, "a run that never crossed must be censored"
    assert all(r.latent_health > run.failure_threshold for r in run.rows)


def test_health_declines_over_a_wearing_lifecycle() -> None:
    run = _run()
    first, last = run.rows[0].latent_health, run.rows[-1].latent_health

    assert first > last, "a wearing device must degrade"
    assert 0.0 <= last <= 100.0


def test_every_signal_is_present_and_finite() -> None:
    run = _run()

    for row in run.rows[:50]:
        for field in SIGNAL_FIELDS:
            value = getattr(row, field)
            assert isinstance(value, float)
            assert math.isfinite(value), f"{field} was not finite at hour {row.hour}"


def test_degradation_shows_up_in_the_observable_signals() -> None:
    """If wear never reaches the signals, no model could learn anything from them.

    This is what makes the task learnable rather than a lookup of the latent variable.
    """
    run = _run(hours=600)
    healthy = [r for r in run.rows if r.latent_health > 90][:40]
    degraded = [r for r in run.rows if r.latent_health < 45][:40]
    assert healthy and degraded, "fixture assumption broken: need both regimes"

    mean_vib_healthy = sum(r.vibration for r in healthy) / len(healthy)
    mean_vib_degraded = sum(r.vibration for r in degraded) / len(degraded)
    mean_temp_healthy = sum(r.bearing_temp_c for r in healthy) / len(healthy)
    mean_temp_degraded = sum(r.bearing_temp_c for r in degraded) / len(degraded)

    assert mean_vib_degraded > mean_vib_healthy, "vibration does not respond to wear"
    assert mean_temp_degraded > mean_temp_healthy, "bearing temperature does not respond to wear"


def test_wear_rate_orders_the_time_to_failure() -> None:
    fast = _run(seed=11, wear_rate=0.5, hours=800)
    slow = _run(seed=11, wear_rate=0.1, hours=800)

    assert fast.failure_hour is not None
    assert slow.failure_hour is None or fast.failure_hour < slow.failure_hour


def test_hours_are_contiguous_and_zero_based() -> None:
    run = _run(hours=120)

    assert [r.hour for r in run.rows] == list(range(120))


@pytest.mark.parametrize("bad", [0, -5])
def test_a_non_positive_horizon_is_rejected(bad: int) -> None:
    with pytest.raises(ValueError, match="hours"):
        _run(hours=bad)
