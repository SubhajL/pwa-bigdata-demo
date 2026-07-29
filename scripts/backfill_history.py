"""Lay down hourly telemetry history so the model has a window to score (slice S6).

The model reads a 24-hour window of hourly readings carrying all five signals. The
simulator cycles a 238-device roster at 5 Hz publishing ONE signal per message, so a device
is heard from about every 48 seconds: a live-only stack takes ~4 minutes to observe five
signals once and 16 hours to fill the window. Without this step the predictive demo shows
`nodata` for its entire duration.

So history is backfilled and only the newest bucket is live. Every value written here is
SIMULATED — it comes from the same seeded wear model the estimator was trained on
(`pwa_ml.lifecycle`), which is what keeps the scored window inside the distribution the
model actually saw.

**Conservation.** `/api/pipeline/status` publishes `ledger == telemetry + dead_letter` as a
live indicator, so telemetry rows may not be inserted alone: each backfilled reading gets a
matching `ingress_ledger` row in the same transaction. Re-running is idempotent — every
row this script has ever written carries `source = 'BACKFILL'` and is removed before new
history is laid down. That column, not any wire-supplied id, is what makes the cleanup
safe; see `infra/db/005_row_provenance.sql`.
"""
from __future__ import annotations

import importlib.util
import json
import logging
import os
import sys
import uuid
import zlib
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg

#: `pwa_ml` sits beside this script's parent in the image (`/srv/pwa_ml`) and one level
#: deeper in a developer checkout (`<repo>/ml/pwa_ml`). BOTH need `sys.path` help when the
#: script is run BY PATH, as compose does (`python /srv/scripts/backfill_history.py`):
#: Python puts the SCRIPT'S DIRECTORY on `sys.path`, never the working directory. An
#: earlier version tested `(_ROOT / "pwa_ml").exists()` and skipped the insert when it was
#: found — exactly backwards, because finding it there is precisely the case where `/srv`
#: still is not importable. `docker compose up` died at this line, and because `api`
#: depends on `backfill` completing successfully, the whole stack never started.
_ROOT = Path(__file__).resolve().parents[1]
if importlib.util.find_spec("pwa_ml") is None:
    for _candidate in (_ROOT, _ROOT / "ml"):
        if (_candidate / "pwa_ml").is_dir():
            sys.path.insert(0, str(_candidate))
            break

from pwa_ml.lifecycle import SIGNAL_FIELDS, generate_lifecycle  # noqa: E402

logger = logging.getLogger(__name__)

#: Hours of history per device. Comfortably above the model's 24-hour window so the newest
#: bucket can be replaced by live readings without the window falling under the minimum.
HISTORY_HOURS = 30

#: Pumps to backfill. Only pumps report all five signals (`KIND_SIGNALS` in the simulator),
#: so no other kind can ever satisfy the window contract. A dozen is enough for a worklist
#: that ranks visibly while keeping the scoring cycle well inside its interval.
DEFAULT_ASSETS = 12

#: Hours of simulated wear before the window starts. Long enough that devices at the top of
#: the wear range have genuinely degraded by the time the window opens.
_RUN_UP_HOURS = 200

#: Latent health lost per hour, lowest to highest. The spread is what makes the worklist an
#: ordering rather than a list — without it every device scores the same and item 3.5's
#: "ranked by risk" is unfalsifiable.
_WEAR_MIN, _WEAR_MAX = 0.02, 0.36

_PREFIX = "backfill-"

PUMP_QUERY = "SELECT asset_id FROM device WHERE kind = 'pump' ORDER BY asset_id LIMIT %s"
#: Written by this script and by nothing else. `infra/db/005_row_provenance.sql` defaults
#: the column to 'MQTT', so ingest rows can never claim it however they are named.
SOURCE = "BACKFILL"

LEDGER_INSERT = """
INSERT INTO ingress_ledger (message_id, run_id, outcome, raw, source)
VALUES (%s, %s, 'TELEMETRY', %s, 'BACKFILL') ON CONFLICT (message_id) DO NOTHING
"""
TELEMETRY_INSERT = """
INSERT INTO telemetry (ts, asset_id, signal, value, message_id, run_id, source)
VALUES (%s, %s, %s, %s, %s, %s, 'BACKFILL')
"""


def _wear_rate(index: int, total: int) -> float:
    """Spread wear rates evenly so the backfilled fleet spans healthy to failing."""
    if total <= 1:
        return _WEAR_MIN
    return _WEAR_MIN + (_WEAR_MAX - _WEAR_MIN) * (index / (total - 1))


def _rows_for(asset_id: str, index: int, total: int) -> list[tuple[int, str, float]]:
    """`(hours_before_now, signal, value)` for one device's history.

    The seed is derived from the asset id so a re-run reproduces the same history, and two
    devices never share a trajectory.
    """
    # crc32, NOT hash(): str hashing is salted per process (PYTHONHASHSEED), so `hash`
    # here would give a different trajectory on every run and the "reproducible" claim
    # above would be false.
    run = generate_lifecycle(
        lifecycle_id=f"backfill-{asset_id}",
        seed=zlib.crc32(asset_id.encode()),
        hours=_RUN_UP_HOURS,
        wear_rate=_wear_rate(index, total),
        failure_threshold=30.0,
    )
    tail = run.rows[-HISTORY_HOURS:]
    out: list[tuple[int, str, float]] = []
    for position, row in enumerate(tail):
        hours_before = len(tail) - 1 - position
        for signal in SIGNAL_FIELDS:
            out.append((hours_before, signal, float(getattr(row, signal))))
    return out


def backfill(
    conn: psycopg.Connection[object],
    *,
    now: datetime,
    assets: int = DEFAULT_ASSETS,
) -> int:
    """Replace all backfilled history with `HISTORY_HOURS` of fresh hourly readings.

    The newest reading is written at exactly `now`, and each earlier one exactly one hour
    before it. That places every reading in its own clock-hour bucket AND leaves the window
    fresh: anchoring to the top of the hour instead would make the newest reading up to 59
    minutes old, which `features.MAX_STALENESS_S` correctly rejects as stale.

    Args:
        conn: an open connection; the whole rewrite happens in one transaction.
        now: the instant history ends at; must be timezone-aware.
        assets: how many pumps to backfill.

    Returns:
        The number of telemetry rows written.

    Raises:
        ValueError: if `now` is naive.
    """
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")

    run_id = f"{_PREFIX}{uuid.uuid4().hex[:12]}"
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(PUMP_QUERY, (assets,))
        pumps = [row[0] for row in cur.fetchall()]
        if not pumps:
            logger.warning("no pumps on the roster; run scripts/seed_db.py first")
            return 0

        # Remove every previous backfill, ledger included, so conservation still holds and
        # a second run does not blend two trajectories into the same buckets.
        #
        # Keyed on PROVENANCE, not on `message_id`. The identifier is wire-supplied, so a
        # prefix predicate could match rows this script never wrote — orphaning a dead
        # letter's ledger row, or (worse, because the two DELETEs are separate statements
        # under READ COMMITTED) deleting the ledger row of an accepted message that
        # committed between them and leaving its telemetry row behind. `source` is set by
        # the writer and defaults to 'MQTT', so neither is reachable. See
        # `infra/db/005_row_provenance.sql`.
        cur.execute("DELETE FROM telemetry WHERE source = %s", (SOURCE,))
        cur.execute("DELETE FROM ingress_ledger WHERE source = %s", (SOURCE,))

        ledger: list[tuple[str, str, str]] = []
        readings: list[tuple[datetime, str, str, float, str, str]] = []
        for index, asset_id in enumerate(pumps):
            for hours_before, signal, value in _rows_for(asset_id, index, len(pumps)):
                message_id = f"{run_id}:{asset_id}:{hours_before}:{signal}"
                ts = now - timedelta(hours=hours_before)
                raw = json.dumps(
                    {"backfill": True, "simulated": True, "ts": ts.isoformat(),
                     "asset_id": asset_id, "signal": signal, "value": value}
                )
                ledger.append((message_id, run_id, raw))
                readings.append((ts, asset_id, signal, value, message_id, run_id))

        cur.executemany(LEDGER_INSERT, ledger)
        cur.executemany(TELEMETRY_INSERT, readings)

    # Refresh planner statistics after the bulk load. Scored item 1.3 is a 500 ms latency
    # budget that depends on `telemetry_asset_ts_idx` being chosen for the latest-reading
    # seek; after inserting a few thousand rows with stale statistics the planner switched
    # to a time-only chunk index and walked backwards through the hypertable instead.
    # Outside the transaction above, because ANALYZE's work would otherwise be rolled into
    # a lock held across the whole rewrite.
    with conn.cursor() as cur:
        cur.execute("ANALYZE telemetry")

    logger.info("backfilled %d readings across %d pumps as %s", len(readings), len(pumps), run_id)
    return len(readings)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    dsn = os.environ.get("DATABASE_URL", "postgresql://pwa:pwa@localhost:5432/pwa")
    count = int(os.environ.get("BACKFILL_ASSETS", DEFAULT_ASSETS))
    with psycopg.connect(dsn) as conn:
        written = backfill(conn, now=datetime.now(tz=UTC), assets=count)
    print(f"backfilled {written} telemetry rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
