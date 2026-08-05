"""Demo-scenario injection engine (P0 — deterministic, targeted demo control).

The simulator round-robins the full 238-device roster at 5 Hz, so a targeted asset is
heard from about every 48 seconds and a scripted demonstration cannot make "the moment
the fault happens" happen on cue. This module injects telemetry for ONE asset directly,
through the same conservation contract the ingest path honours, so the scored
transitions (2.2 status flip, 2.4 impact, 3.3 model→twin) fire on command:

* **Instant band transition (<1s).** One out-of-band reading at `now` — below-band
  pressure for `pressure_drop`, above-band vibration for `anomaly`, above-band bearing
  temperature for `bearing_anomaly` — plus an instant for every OTHER signal at its hour-0
  trajectory value, so each replacement supersedes the twin's complete per-signal state.
  (Healthy-trajectory secondaries are in-band; a WORN trajectory's secondaries can sit
  out of band themselves — honestly, since that is the steered window — and are
  superseded the same way by the next replacement.) The caller broadcasts them all as
  `kind="status"` frames exactly as the ingest consumer would.
* **Real model transition (≤ one scoring cycle).** The target's 24-hour feature window
  is steered onto a `pwa_ml.lifecycle` trajectory — worn for `anomaly`/`pressure_drop`,
  healthy for `normal` AND for `bearing_anomaly` (whose pinned hot bearing is the
  window's one deviating signal, so the model's local attribution names it) — and the
  UNTOUCHED scoring loop then scores it through the shipped bundle and broadcasts
  `kind="health"` itself. No health row or health frame is fabricated here — item 3.3
  stays a claim about the model, not about this module.

**The solver.** Injected readings BLEND into each hourly bucket's per-signal MEAN
(`features._bucket_means`) with whatever the simulator and backfill already wrote, so a
fixed injected value would land somewhere stack-age-dependent. `solve_injection` reads
the bucket's existing (count, mean) and solves for (k, x) such that the blended mean
lands exactly on the trajectory value — deterministic on a cold stack, a warm one, and
on re-apply (previous demo rows are simply part of the observed count).

**Conservation.** `ledger == telemetry + dead_letter` is published live to a judge, so
every telemetry row is written with its ledger row in one transaction, both stamped
`source='DEMO'` (`infra/db/005_row_provenance.sql`) — which is also what makes `normal`'s
cleanup safe and exact, mirroring the backfill's provenance-keyed delete. A demo dead
letter's ledger row is stamped `source='DEMO_DLQ'` instead: dead_letter has no provenance
column, so that pair is never deleted — permanent evidence, like any real dead letter.

Every value injected here is SIMULATED, and every row says so in its stored raw payload.
"""
from __future__ import annotations

import logging
import zlib
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Final, NamedTuple

from psycopg import Connection
from psycopg_pool import ConnectionPool
from pwa_ml.lifecycle import generate_lifecycle

from .bands import SIGNAL_BANDS, classify_signal
from .db import encode_raw
from .features import WINDOW_HOURS
from .ingest import SIGNALS
from .models import DemoMode, Signal, TwinEvent

logger = logging.getLogger(__name__)

#: Provenance stamped on injected telemetry+ledger pairs; `normal` deletes exactly these.
DEMO_SOURCE: Final = "DEMO"
#: Provenance for a demo dead letter's ledger row. NEVER deleted — dead_letter has no
#: source column, so deleting the ledger side would orphan the pair and break conservation.
DEMO_DLQ_SOURCE: Final = "DEMO_DLQ"
#: The demonstrated pump (the only pump placed on the seeded schematic).
DEFAULT_TARGET: Final = "P-2"
#: Deliberately unknown asset id for the DLQ scenario. Distinct from the simulator's
#: BAD_ASSET_ID so demo-injected dead letters are tellable apart in the browser.
DEMO_BAD_ASSET_ID: Final = "PWA-DEMO-UNKNOWN-000"

#: Wear rates for the two trajectories. 0.34 matches the backfill's P-2 override: scores
#: ≈32 (critical, comfortably under the 40 gate) while staying PRE-failure over the
#: run-up, so the model reports a finite PTTF — "predicted to fail", not "already failed".
#: Both are pinned to the shipped artifact by `test_demo_solver.py`.
WORN_WEAR: Final = 0.34
HEALTHY_WEAR: Final = 0.02
RUN_UP_HOURS: Final = 200
#: Mirrors `pwa_ml.datasets.FAILURE_THRESHOLD` (drift-tested via the backfill's guard).
FAILURE_THRESHOLD: Final = 30.0

#: Ceiling on injected rows per (bucket, signal). Sized so the 3·n rule stays unclamped
#: for any realistic bucket (~15 simulator readings/signal/hour plus previous demo rows);
#: at the cap the solve is still exact, only the injected values drift from the target.
PER_BUCKET_CAP: Final = 240
#: How far outside its band the instant reading sits, as a fraction of the band width.
#: Well inside one band-width, so the instantaneous classification is `warning` — the
#: `critical` symbol must only ever arrive through the model path (item 3.3).
_BAND_EXCURSION: Final = 0.25
#: Injected values may sit at most this many band-widths outside a signal's band. The
#: bearing pin (one width above) plus realistic blend compensation stays inside; a capped
#: solve that would need more is refused — see `ScenarioImplausible`.
_PLAUSIBLE_BAND_WIDTHS: Final = 2.0

#: NO `ON CONFLICT` on the batch path, deliberately. `message_id` is a wire-forgeable
#: namespace, so a collision here means someone pre-claimed an id this run generated;
#: skipping the ledger row while telemetry still inserts would silently break the
#: conservation invariant. A raise aborts the whole replacement transaction instead.
_LEDGER_INSERT = """
INSERT INTO ingress_ledger (message_id, run_id, outcome, raw, source)
VALUES (%s, %s, %s, %s, %s)
"""
#: The dead-letter path checks the RETURNING row before writing its pair, so tolerating
#: a redelivered/duplicate id is safe there — same idiom as `db.disposition`.
_LEDGER_INSERT_DLQ = _LEDGER_INSERT + "ON CONFLICT (message_id) DO NOTHING RETURNING message_id"
_TELEMETRY_INSERT = """
INSERT INTO telemetry (ts, asset_id, signal, value, message_id, run_id, source)
VALUES (%s, %s, %s, %s, %s, %s, %s)
"""
_DLQ_INSERT = """
INSERT INTO dead_letter (message_id, run_id, asset_id, reason, raw)
VALUES (%s, %s, %s, %s, %s)
"""
#: Bucket in explicit UTC so the keys equal hours computed with `timedelta` below,
#: whatever timezone the session happens to run in.
_BUCKET_STATS_QUERY = """
SELECT date_trunc('hour', ts, 'UTC') AS bucket, signal, count(*), avg(value)
FROM telemetry
WHERE asset_id = %s AND ts >= %s AND ts <= %s
GROUP BY bucket, signal
"""
_ASSET_KIND_QUERY = "SELECT kind FROM device WHERE asset_id = %s"


def solve_injection(
    n: int, mean: float | None, target: float, *, reserved: float | None = None
) -> tuple[int, float]:
    """(count, value) such that a bucket with `n` readings averaging `mean` lands on `target`.

    `k = 3·max(1, n)` bounds the injected values' displacement to a third of the
    (mean − target) gap, so they stay physically plausible rather than compensating with
    wild numbers; the cap bounds the row count instead when a bucket is pathologically
    full. The solve is exact either way.

    `reserved` is one additional KNOWN value that will land in the same bucket outside
    this solve — the instant out-of-band reading. Folding it in keeps the bucket's FINAL
    mean on target instead of off by `reserved/(n+k+1)`.
    """
    k = min(3 * max(1, n), PER_BUCKET_CAP)
    existing = (mean or 0.0) * n
    if reserved is None:
        return k, (target * (n + k) - existing) / k
    return k, (target * (n + k + 1) - existing - reserved) / k


def trajectory(asset_id: str, wear: float) -> list[tuple[int, Signal, float]]:
    """`(hours_before_now, signal, value)` covering every window bucket, all five signals.

    The same seeded wear model the estimator was trained on (and the backfill uses), so
    the steered window stays inside the model's training distribution. Deterministic in
    `(asset_id, wear)` — crc32, not `hash()`, exactly as the backfill does.
    """
    run = generate_lifecycle(
        lifecycle_id=f"demo-{asset_id}",
        seed=zlib.crc32(asset_id.encode()),
        hours=RUN_UP_HOURS,
        wear_rate=wear,
        failure_threshold=FAILURE_THRESHOLD,
    )
    tail = run.rows[-WINDOW_HOURS:]
    out: list[tuple[int, Signal, float]] = []
    for position, row in enumerate(tail):
        hours_before = len(tail) - 1 - position
        for name, signal in SIGNALS.items():
            out.append((hours_before, signal, float(getattr(row, name))))
    return out


def instant_reading(mode: DemoMode) -> tuple[Signal, float]:
    """The single reading injected at `now` — the <1s band transition (or its recovery)."""
    if mode == "anomaly":
        low, high = SIGNAL_BANDS["vibration"]
        return "vibration", round(high + (high - low) * _BAND_EXCURSION, 4)
    if mode == "bearing_anomaly":
        low, high = SIGNAL_BANDS["bearing_temp_c"]
        return "bearing_temp_c", round(high + (high - low) * _BAND_EXCURSION, 4)
    low, high = SIGNAL_BANDS["pressure_bar"]
    if mode == "pressure_drop":
        return "pressure_bar", round(low - (high - low) * _BAND_EXCURSION, 4)
    return "pressure_bar", round((low + high) / 2, 4)


def scenario_trajectory(
    mode: DemoMode, target: str, wear: float
) -> list[tuple[int, Signal, float]]:
    """The bucket targets `mode` steers the window onto.

    Every mode rides the seeded wear trajectory; `bearing_anomaly` additionally pins EVERY
    `bearing_temp_c` bucket above band. Rationale (PR-E, item 3.6): the WORN trajectory's
    vibration dominates local attribution no matter which instant is injected, so the two
    original fault modes cannot show a judge two different top causes. A healthy-trajectory
    window whose one deviating signal is the bearing is the exact counterfactual shape
    `ml/tests` proves the model discriminates on — the top rendered cause becomes
    `bearing_temp_c`, distinct from `anomaly`'s `vibration`.
    """
    rows = trajectory(target, wear)
    if mode != "bearing_anomaly":
        return rows
    low, high = SIGNAL_BANDS["bearing_temp_c"]
    # A full band-width above the high band: the same magnitude the tuning notes establish
    # for reaching `critical` from a single signal (docs/demo-coverage.md §2.2/2.4) — hot
    # enough that health leaves `normal` even though every other signal stays healthy.
    hot = round(high + (high - low), 4)
    return [(h, s, hot if s == "bearing_temp_c" else v) for h, s, v in rows]


def _scenario_instants(mode: DemoMode, target: str, wear: float) -> dict[Signal, float]:
    """The readings inserted at `now` — the band transition FIRST, then one instant for
    EVERY remaining signal (its hour-0 trajectory value).

    All five signals on purpose (g-check HIGH, PR-E): the twin keeps independent
    per-signal states and renders their MAX severity, and a state persists until a NEWER
    frame for the SAME signal arrives. A replacement that superseded only its own primary
    signal would let a previous mode's out-of-band warning (a hot bearing, a vibration
    spike) survive `normal` forever on an open page. Every replacement is therefore a
    COMPLETE status transition.

    This also keeps the SEC pair fresh (item 2.3): the pump's newest live power/flow pair
    ages with the simulator's round-robin (~95 s / ~143 s skew on the demo roster), and
    /api/twin/sec refuses the >120 s phase — the hour-0 instants pin the pair skew to ~0.
    Each instant is reserved in its bucket's solve, so every blended mean still lands
    exactly on the trajectory. Dict order is the insertion contract: the first entry is
    the primary band reading.
    """
    signal, value = instant_reading(mode)
    instants: dict[Signal, float] = {signal: value}
    for hours_before, traj_signal, traj_value in scenario_trajectory(mode, target, wear):
        if hours_before == 0:
            instants.setdefault(traj_signal, round(traj_value, 4))
    return instants


class _InjectedReading(NamedTuple):
    ts: datetime
    asset_id: str
    signal: Signal
    value: float
    message_id: str


@dataclass(frozen=True)
class ScenarioResult:
    """What one scenario application did, and what the caller must broadcast."""

    run_id: str
    events: list[TwinEvent]
    injected: int
    dead_letters: int
    removed: int


def target_kind(pool: ConnectionPool, asset_id: str) -> str | None:
    """The roster kind of `asset_id`, or None when it is not on the roster."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(_ASSET_KIND_QUERY, (asset_id,))
        row = cur.fetchone()
    return None if row is None else str(row[0])


class ScenarioConflict(RuntimeError):
    """A scenario for this target is being applied concurrently; the caller lost."""


class ScenarioImplausible(RuntimeError):
    """The solve would write physically implausible telemetry; the injection is refused.

    The exact solve compensates with larger values when `PER_BUCKET_CAP` bounds the row
    count; on a pathologically full bucket that compensation grows without limit (a
    2600 °C bearing). Failing CLOSED aborts the whole replacement transaction — the
    previous scenario stays intact and conservation holds — rather than undermining the
    claim that injected telemetry stays inside a realistic envelope (g-check MEDIUM, PR-E).
    """


def apply_scenario(
    pool: ConnectionPool, *, mode: DemoMode, target: str, now: datetime, run_id: str
) -> ScenarioResult:
    """Apply one demo scenario. BLOCKING — call via `asyncio.to_thread`.

    Returns the `TwinEvent`s the CALLER must broadcast on the event loop (`TwinHub` is
    not thread-safe, same split as `scoring.run_scoring_loop`).

    Raises:
        ValueError: if `now` is naive.
        ScenarioConflict: when another application for the same target holds the lock.
    """
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    if mode == "bad_asset":
        return _inject_dead_letter(pool, now=now, run_id=run_id)
    # `bearing_anomaly` rides the HEALTHY trajectory on purpose: its whole point is that
    # the pinned bearing buckets are the window's ONE deviating feature family, so the
    # model's local attribution names the bearing — see `scenario_trajectory`.
    wear = HEALTHY_WEAR if mode in ("normal", "bearing_anomaly") else WORN_WEAR
    return _replace_scenario(pool, mode=mode, target=target, wear=wear, now=now, run_id=run_id)


def _replace_scenario(
    pool: ConnectionPool,
    *,
    mode: DemoMode,
    target: str,
    wear: float,
    now: datetime,
    run_id: str,
) -> ScenarioResult:
    """Atomically REPLACE the target's demo scenario: delete → re-read stats → solve → insert.

    One transaction, so re-applying never accumulates rows (the previous application's
    pairs are gone before the new solve reads the bucket stats), a mid-flight failure
    leaves the previous scenario fully intact, and the twin never observes a half-written
    window. `normal` is the same operation with the HEALTHY trajectory: deleting alone is
    not a reset, because the demonstrated pump's backfilled baseline is critical at cold
    start — recovery has to be steered through the same real model path as the faults.
    """
    instants = _scenario_instants(mode, target, wear)
    rows: list[_InjectedReading]
    with pool.connection() as conn, conn.transaction():
        _acquire_scenario_lock(conn, target)
        removed = _delete_target_demo(conn, target)
        stats = _bucket_stats(conn, target, now)
        rows = _solved_rows(
            stats, mode=mode, target=target, wear=wear, now=now, run_id=run_id,
            instants=instants,
        )
        hour_start = now.replace(minute=0, second=0, microsecond=0)
        for offset_ms, (inst_signal, inst_value) in enumerate(instants.items()):
            # The primary band-transition reading sits at exactly `now`; the others trail
            # by milliseconds so all five stay newest-per-signal in this bucket. Clamped
            # to the hour start: a request landing within 4 ms of the hour top must not
            # leak a trailing instant into the PREVIOUS bucket, whose solve never
            # reserved it (review-workflow LOW, round 2).
            ts = max(now - timedelta(milliseconds=offset_ms), hour_start)
            rows.append(
                _InjectedReading(
                    ts,
                    target,
                    inst_signal,
                    inst_value,
                    f"{run_id}:instant:{inst_signal}",
                )
            )
        _insert_pairs(conn, rows, run_id)
    _analyze(pool)
    logger.info(
        "demo %s replaced %d rows with %d for %s as %s", mode, removed, len(rows), target, run_id
    )
    return ScenarioResult(
        run_id=run_id,
        # One status event per inserted instant (primary first): the broadcast supersedes
        # EVERY per-signal state the twin may hold, never just the primary's — see
        # `_scenario_instants` for why a partial broadcast breaks recovery.
        events=[
            _status_event(target, inst_signal, inst_value, now)
            for inst_signal, inst_value in instants.items()
        ],
        injected=len(rows),
        dead_letters=0,
        removed=removed,
    )


def _acquire_scenario_lock(conn: Connection[Any], target: str) -> None:
    """Take the per-target advisory lock for this transaction, or refuse fast.

    Two concurrent applications would interleave delete/solve/insert and double-steer
    the bucket means; waiting instead would stack demo operators up silently. The lock
    releases itself at commit/rollback (`_xact_`), so no unlock path can be missed.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT pg_try_advisory_xact_lock(hashtext(%s))", (f"demo-scenario:{target}",)
        )
        row = cur.fetchone()
    if row is None or not bool(row[0]):
        raise ScenarioConflict(f"a scenario for {target!r} is already being applied")


def _delete_target_demo(conn: Connection[Any], target: str) -> int:
    """Remove the target's previous demo pairs. Ledger first, THROUGH the telemetry join —
    `ingress_ledger` carries no asset_id, and the pairs must go together or conservation
    breaks. Only `source='DEMO'` rows are reachable; MQTT/BACKFILL evidence never is.
    """
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM ingress_ledger WHERE source = %s AND message_id IN "
            "(SELECT message_id FROM telemetry WHERE source = %s AND asset_id = %s)",
            (DEMO_SOURCE, DEMO_SOURCE, target),
        )
        cur.execute(
            "DELETE FROM telemetry WHERE source = %s AND asset_id = %s",
            (DEMO_SOURCE, target),
        )
        return cur.rowcount


def _inject_dead_letter(
    pool: ConnectionPool, *, now: datetime, run_id: str
) -> ScenarioResult:
    """One unknown-asset message into the DLQ — ledger and dead_letter in one transaction."""
    message_id = f"{run_id}:bad-asset"
    payload = {
        "message_id": message_id,
        "run_id": run_id,
        "ts": now.isoformat(),
        "asset_id": DEMO_BAD_ASSET_ID,
        "signal": "pressure_bar",
        "value": 3.1,
        "demo": True,
        "simulated": True,
    }
    raw = encode_raw(payload)
    reason = f"unknown asset_id {DEMO_BAD_ASSET_ID!r}"
    with pool.connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute(_LEDGER_INSERT_DLQ, (message_id, run_id, "DLQ", raw, DEMO_DLQ_SOURCE))
        stored = cur.fetchone() is not None
        if stored:
            cur.execute(_DLQ_INSERT, (message_id, run_id, DEMO_BAD_ASSET_ID, reason, raw))
    return ScenarioResult(
        run_id=run_id, events=[], injected=0, dead_letters=1 if stored else 0, removed=0
    )


def _solved_rows(
    stats: dict[tuple[datetime, str], tuple[int, float | None]],
    *,
    mode: DemoMode,
    target: str,
    wear: float,
    now: datetime,
    run_id: str,
    instants: Mapping[Signal, float] | None = None,
) -> list[_InjectedReading]:
    """Solved injections steering every (bucket, signal) mean onto the mode's trajectory.
    Pure.

    `instants` are the out-of-band readings (at most one per signal) the caller will ALSO
    insert at `now`; each one's bucket solve reserves it so the final blended mean still
    lands on trajectory.
    """
    end_hour = now.replace(minute=0, second=0, microsecond=0)
    rows: list[_InjectedReading] = []
    for hours_before, signal, value in scenario_trajectory(mode, target, wear):
        bucket = end_hour - timedelta(hours=hours_before)
        n, mean = stats.get((bucket, signal), (0, None))
        reserved = instants.get(signal) if instants is not None and hours_before == 0 else None
        k, x = solve_injection(n, mean, value, reserved=reserved)
        low, high = SIGNAL_BANDS[signal]
        margin = _PLAUSIBLE_BAND_WIDTHS * (high - low)
        if not (low - margin <= x <= high + margin):
            raise ScenarioImplausible(
                f"steering {signal} at -{hours_before}h would need injected values of "
                f"{x:.2f} (plausible range {low - margin:.1f}–{high + margin:.1f}); "
                "refusing to write implausible telemetry"
            )
        for j in range(k):
            # Millisecond stagger keeps every row inside its clock-hour bucket while
            # keeping timestamps distinct enough to read in the telemetry browser.
            rows.append(
                _InjectedReading(
                    bucket + timedelta(milliseconds=j),
                    target,
                    signal,
                    round(x, 4),
                    f"{run_id}:{target}:{hours_before}:{signal}:{j}",
                )
            )
    return rows


def _bucket_stats(
    conn: Connection[Any], asset_id: str, now: datetime
) -> dict[tuple[datetime, str], tuple[int, float | None]]:
    """Existing (count, mean) per (clock-hour bucket, signal) over the feature window.

    Runs INSIDE the replacement transaction, after the delete, so the solve sees exactly
    the rows the injection will blend with.
    """
    since = now - timedelta(hours=WINDOW_HOURS)
    with conn.cursor() as cur:
        cur.execute(_BUCKET_STATS_QUERY, (asset_id, since, now))
        return {
            (row[0], str(row[1])): (int(row[2]), float(row[3]))
            for row in cur.fetchall()
        }


def _insert_pairs(
    conn: Connection[Any], rows: list[_InjectedReading], run_id: str
) -> None:
    """Ledger + telemetry for every row, inside the caller's transaction — conservation
    by construction."""
    ledger = [
        (
            r.message_id,
            run_id,
            "TELEMETRY",
            encode_raw(
                {
                    "demo": True,
                    "simulated": True,
                    "ts": r.ts.isoformat(),
                    "asset_id": r.asset_id,
                    "signal": r.signal,
                    "value": r.value,
                }
            ),
            DEMO_SOURCE,
        )
        for r in rows
    ]
    telemetry = [
        (r.ts, r.asset_id, r.signal, r.value, r.message_id, run_id, DEMO_SOURCE)
        for r in rows
    ]
    with conn.cursor() as cur:
        cur.executemany(_LEDGER_INSERT, ledger)
        cur.executemany(_TELEMETRY_INSERT, telemetry)


def _analyze(pool: ConnectionPool) -> None:
    """Refresh planner statistics after a bulk write, protecting the item-1.3 seek.

    Best-effort BY DESIGN: it runs after the replacement committed, so a failure here
    must degrade to "planner stats lag briefly" — never to a 500 that misreports an
    already-successful mutation and suppresses the instant broadcast.
    """
    try:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute("ANALYZE telemetry")
    except Exception:
        logger.exception("ANALYZE telemetry failed; planner statistics may lag briefly")


def _status_event(asset_id: str, signal: Signal, value: float, now: datetime) -> TwinEvent:
    """The instant frame, classified exactly as the ingest consumer would classify it."""
    return TwinEvent(
        kind="status",
        asset_id=asset_id,
        status=classify_signal(signal, value),
        signal=signal,
        value=value,
        observed_at=now,
        published_at=now,
    )
