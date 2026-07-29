"""Seeded full-lifecycle telemetry with a KNOWN failure time (slice S5).

PTTF is only a supervised quantity if the data knows when failure occurred. These runs
carry a latent health trajectory that decays with wear, and `failure_hour` is the first
hour it crosses the failure threshold. Every value is SIMULATED — including, unusually,
the training data itself, which is generated rather than observed.
"""
from __future__ import annotations

import random
from dataclasses import dataclass

#: The observable signals, in a fixed order. Mirrors the wire contract's Signal literal.
SIGNAL_FIELDS: tuple[str, ...] = (
    "pressure_bar",
    "flow_m3h",
    "power_kw",
    "vibration",
    "bearing_temp_c",
)


@dataclass(frozen=True)
class LifecycleRow:
    """One hour of a device's life. `latent_health` is the hidden state, not an input."""

    hour: int
    latent_health: float
    pressure_bar: float
    flow_m3h: float
    power_kw: float
    vibration: float
    bearing_temp_c: float


@dataclass(frozen=True)
class LifecycleRun:
    """A full observation window for one device."""

    lifecycle_id: str
    seed: int
    wear_rate: float
    failure_threshold: float
    horizon_hours: int
    #: First hour latent health crossed the threshold, or None when the run is CENSORED —
    #: i.e. observation ended before failure. None is a lower bound, NOT "failed at the
    #: horizon"; conflating the two biases every PTTF prediction toward the horizon.
    failure_hour: int | None
    rows: list[LifecycleRow]


def _row_for(hour: int, latent_health: float, rng: random.Random) -> LifecycleRow:
    """Build one LifecycleRow with observable signals derived from latent health.

    The rng is consumed for noise on each of the five signals. Call order must match the
    original inlining exactly — interleaving with _step_latent matters for determinism.
    """
    wear = (100.0 - latent_health) / 100.0
    return LifecycleRow(
        hour=hour,
        latent_health=latent_health,
        pressure_bar=4.5 - 2.0 * wear + rng.uniform(-0.04, 0.04),
        flow_m3h=260.0 - 120.0 * wear + rng.uniform(-2.4, 2.4),
        power_kw=30.0 + 25.0 * wear + rng.uniform(-0.5, 0.5),
        vibration=0.8 + 6.0 * wear + rng.uniform(-0.12, 0.12),
        bearing_temp_c=40.0 + 45.0 * wear + rng.uniform(-0.9, 0.9),
    )


def _step_latent(latent_health: float, wear_rate: float, rng: random.Random) -> float:
    """Decay latent health for one hour, with small seeded noise, clamped to [0, 100]."""
    return max(0.0, min(100.0, latent_health - wear_rate + rng.uniform(-0.001, 0.001)))


def _build_rows(
    rng: random.Random, hours: int, wear_rate: float, failure_threshold: float
) -> tuple[list[LifecycleRow], int | None]:
    """Run the hourly loop: build every row and detect first failure crossing."""
    rows: list[LifecycleRow] = []
    latent_health = 100.0
    failure_hour: int | None = None
    for hour in range(hours):
        if failure_hour is None and latent_health <= failure_threshold:
            failure_hour = hour
        rows.append(_row_for(hour, latent_health, rng))
        latent_health = _step_latent(latent_health, wear_rate, rng)
    return rows, failure_hour


def generate_lifecycle(
    *,
    lifecycle_id: str,
    seed: int,
    hours: int,
    wear_rate: float,
    failure_threshold: float,
) -> LifecycleRun:
    """Generate one deterministic lifecycle.

    Latent health starts at 100 and decays by roughly `wear_rate` per hour with seeded
    noise, floored at 0. The observable signals are derived from it so that wear is
    genuinely learnable from telemetry alone:

    * vibration and bearing temperature RISE as health falls;
    * power draw RISES (the pump works harder for less);
    * flow and pressure FALL.

    Args:
        lifecycle_id: stable identity, used as the split key.
        seed: makes the run reproducible.
        hours: observation horizon; must be positive.
        wear_rate: latent health lost per hour before noise.
        failure_threshold: latent health at or below which the device has failed.

    Returns:
        A run whose `failure_hour` is the FIRST crossing, or None when censored.

    Raises:
        ValueError: if `hours` is not positive.
    """
    if hours <= 0:
        raise ValueError(f"hours must be positive, got {hours}")

    rng = random.Random(seed)
    rows, failure_hour = _build_rows(rng, hours, wear_rate, failure_threshold)
    return LifecycleRun(
        lifecycle_id=lifecycle_id,
        seed=seed,
        wear_rate=wear_rate,
        failure_threshold=failure_threshold,
        horizon_hours=hours,
        failure_hour=failure_hour,
        rows=rows,
    )
