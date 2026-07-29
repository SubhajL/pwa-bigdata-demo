"""Live telemetry → the model's feature window (slice S6).

This module is the join between two representations that do not naturally meet, and it is
the load-bearing decision of this slice.

* `pwa_ml` was fitted on `LifecycleRow`s: one row per hour, **all five signals present**,
  `hour` a contiguous integer sequence.
* The hypertable holds the opposite shape: one row per *reading*, each carrying exactly
  **one** signal, arriving whenever the broker delivered it.

The simulator cycles a 238-device roster at 5 Hz, so a given device is heard from roughly
every 48 s and each message carries a single signal. A device therefore needs ~4 minutes
to report all five signals once, and a window of 16 genuinely contiguous *hours* would
take 16 hours to accumulate. Scoring straight off the live stream cannot produce a number
during a demo — which is why history is backfilled (`scripts/backfill_history.py`) and only
the newest bucket is live.

The contract implemented here:

1. Bucket readings by **real clock hour**. No compressed or synthetic time unit: an hour
   is an hour, so `pttf_hours` means what the model card says it means.
2. Within a bucket, a signal's value is the **mean** of its readings in that hour.
3. A signal missing from a bucket is **carried forward** from the most recent earlier
   bucket that had one (LOCF). Telemetry is sampled, not continuous, so a gap means "no
   fresh measurement", not "the value went away".
4. LOCF can only carry *forward*. The window therefore starts at the latest bucket in
   which the last of the five signals first appeared — earlier buckets are unfillable and
   are dropped rather than zero-filled, because a zero here is a confident measurement the
   pipeline never made.
5. The result is scoreable only if it is **fresh** (a reading within `max_staleness_s`) and
   at least `MIN_WINDOW_HOURS` buckets long. Otherwise it reports *why* it is not, and the
   caller renders `nodata`.

Every rejection path returns a reason instead of a fabricated row. That asymmetry is the
point: the failure mode this module exists to prevent is a device with almost no telemetry
receiving a confident health score.
"""
from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from pwa_ml.lifecycle import SIGNAL_FIELDS, LifecycleRow
from pwa_ml.predict import MIN_WINDOW_HOURS

from .models import Reading

#: Hours of history the model was trained to look at. Matches `pwa_ml.datasets.WINDOW_HOURS`.
WINDOW_HOURS = 24

#: How old the newest reading may be before the window is considered stale. Sized well
#: above the ~48 s roster cycle so a device is not declared dark between two of its own
#: readings, and well below an hour so a stopped simulator is noticed within one bucket.
MAX_STALENESS_S = 300.0

#: Fraction of the window's buckets that must contain at least one REAL reading.
#:
#: Freshness alone is not enough, and the first version of this module wrongly implied it
#: was. `observed_at` is the newest reading across ALL signals, so five readings 23 hours
#: old plus one fresh pressure reading produced a fully-populated, "fresh", 24-row window —
#: six readings presented with exactly the same confidence as 24 hours of telemetry. That
#: is the precise failure this module's docstring claims to prevent.
MIN_OBSERVED_FRACTION = 0.5

#: How stale ONE signal may be before the window is refused, regardless of the others.
#: LOCF is for a sampling gap, not for a sensor that stopped reporting yesterday.
MAX_SIGNAL_AGE_HOURS = 6

#: `LifecycleRow.latent_health` is the generator's HIDDEN state, never an input: training
#: reads it as a label and `window_features` never touches it. Live telemetry has no such
#: quantity, and inventing one (0.0, or a copy of the prediction) would silently become a
#: feature the day someone adds it to `SIGNAL_FIELDS`. NaN is used so that mistake surfaces
#: as an obviously broken number rather than a plausible one.
_NO_LATENT_HEALTH = math.nan


@dataclass(frozen=True)
class Window:
    """A window of live telemetry, scoreable or explicitly not.

    Returning a reason rather than `None` is deliberate: `GET /api/health/{id}` has to tell
    a judge *why* a device shows `nodata`, and a bare None forces the caller to invent one.
    """

    rows: list[LifecycleRow] = field(default_factory=list)
    #: Timestamp of the newest reading that went into the window.
    observed_at: datetime | None = None
    #: None exactly when the window is scoreable.
    reason: str | None = None

    @property
    def scoreable(self) -> bool:
        return bool(self.rows)


def _floor_hour(ts: datetime) -> datetime:
    return ts.replace(minute=0, second=0, microsecond=0)


def _usable(readings: Iterable[Reading], oldest: datetime, newest: datetime) -> list[Reading]:
    """Readings inside the window that carry a finite value.

    A non-finite value would propagate through the mean into every feature derived from
    that signal, so it is discarded here rather than allowed to reach the estimator.
    """
    return [
        r
        for r in readings
        if math.isfinite(r.value) and oldest <= _floor_hour(r.ts) <= newest
    ]


def _bucket_means(
    readings: Sequence[Reading],
) -> dict[datetime, dict[str, float]]:
    """Mean value per signal per clock hour."""
    totals: dict[datetime, dict[str, list[float]]] = {}
    for r in readings:
        totals.setdefault(_floor_hour(r.ts), {}).setdefault(r.signal, []).append(r.value)
    return {
        hour: {signal: sum(values) / len(values) for signal, values in by_signal.items()}
        for hour, by_signal in totals.items()
    }


def _first_seen(
    means: dict[datetime, dict[str, float]], hours: list[datetime]
) -> dict[str, datetime] | None:
    """The earliest bucket holding each signal, or None if some signal never appears."""
    seen: dict[str, datetime] = {}
    for hour in hours:
        for signal in means.get(hour, {}):
            seen.setdefault(signal, hour)
    if len(seen) < len(SIGNAL_FIELDS):
        return None
    return seen


def _rows_from(
    means: dict[datetime, dict[str, float]], hours: Sequence[datetime]
) -> list[LifecycleRow]:
    """Build contiguous `LifecycleRow`s over `hours`, carrying values forward into gaps."""
    carried: dict[str, float] = {}
    rows: list[LifecycleRow] = []
    for index, hour in enumerate(hours):
        carried.update(means.get(hour, {}))
        rows.append(
            LifecycleRow(
                hour=index,
                latent_health=_NO_LATENT_HEALTH,
                **{signal: carried[signal] for signal in SIGNAL_FIELDS},
            )
        )
    return rows


def build_window(
    readings: Sequence[Reading],
    *,
    now: datetime,
    hours: int = WINDOW_HOURS,
    max_staleness_s: float = MAX_STALENESS_S,
) -> Window:
    """Assemble the model's input window from raw telemetry rows.

    Args:
        readings: telemetry for ONE asset, any order. Readings outside the window are
            ignored, so the caller may over-fetch.
        now: the instant the window ends at; must be timezone-aware.
        hours: how many clock-hour buckets to consider.
        max_staleness_s: how old the newest reading may be.

    Returns:
        A `Window`. `scoreable` is True only when `rows` is a contiguous run of at least
        `MIN_WINDOW_HOURS` fully-populated hours ending at `now`.

    Raises:
        ValueError: if `now` is naive, or `hours` is below `MIN_WINDOW_HOURS` — a caller
            asking for a window the model cannot score is a bug, not a `nodata` device.
    """
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware; telemetry timestamps are TIMESTAMPTZ")
    if hours < MIN_WINDOW_HOURS:
        raise ValueError(f"hours={hours} is below the model's minimum of {MIN_WINDOW_HOURS}")

    end_hour = _floor_hour(now)
    grid = [end_hour - timedelta(hours=h) for h in reversed(range(hours))]
    usable = _usable(readings, grid[0], end_hour)
    if not usable:
        return Window(reason=f"no telemetry in the last {hours}h")

    observed_at = max(r.ts for r in usable)
    age_s = (now - observed_at).total_seconds()
    if age_s > max_staleness_s:
        return Window(
            observed_at=observed_at,
            reason=f"newest reading is {age_s:.0f}s old (limit {max_staleness_s:.0f}s)",
        )

    means = _bucket_means(usable)
    seen = _first_seen(means, grid)
    if seen is None:
        missing = sorted(set(SIGNAL_FIELDS) - {s for b in means.values() for s in b})
        return Window(
            observed_at=observed_at,
            reason=f"signals never observed in the window: {', '.join(missing)}",
        )

    # LOCF only carries forward, so the window can only begin once EVERY signal has been
    # seen at least once. Buckets before that are unfillable and are dropped.
    start = max(seen.values())
    covered = [hour for hour in grid if hour >= start]
    if len(covered) < MIN_WINDOW_HOURS:
        return Window(
            observed_at=observed_at,
            reason=(
                f"only {len(covered)} of {MIN_WINDOW_HOURS} required hourly buckets have "
                "all five signals available"
            ),
        )

    thin = _too_thin(means, covered, end_hour)
    if thin is not None:
        return Window(observed_at=observed_at, reason=thin)

    return Window(rows=_rows_from(means, covered), observed_at=observed_at)


def _too_thin(
    means: dict[datetime, dict[str, float]], covered: Sequence[datetime], end_hour: datetime
) -> str | None:
    """Why this window is too sparse to score, or None if it is dense enough.

    Two independent guards, because a window can be thin in two different ways:

    * too few buckets hold any real measurement at all (the rest being pure LOCF), and
    * one signal stopped reporting long ago while the others kept the window looking fresh.

    Without these, `build_window` accepted six readings as a confident 24-hour history.
    """
    observed = sum(1 for hour in covered if means.get(hour))
    required = max(MIN_WINDOW_HOURS, int(len(covered) * MIN_OBSERVED_FRACTION))
    if observed < required:
        return (
            f"only {observed} of {len(covered)} hourly buckets contain a real reading "
            f"(need {required}); the rest would be carried forward"
        )

    for signal in SIGNAL_FIELDS:
        latest = max((h for h in covered if signal in means.get(h, {})), default=None)
        if latest is None:
            return f"signal never observed inside the scored window: {signal}"
        age_hours = int((end_hour - latest).total_seconds() // 3600)
        if age_hours > MAX_SIGNAL_AGE_HOURS:
            return (
                f"{signal} was last measured {age_hours}h ago "
                f"(limit {MAX_SIGNAL_AGE_HOURS}h); it would be carried forward"
            )
    return None
