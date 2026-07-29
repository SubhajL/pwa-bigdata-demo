"""TimescaleDB access for the ingest path (slice S2).

The load-bearing function is `disposition()`. Conservation —
`ledger == telemetry + dead_letter` — is not maintained by discipline at the call sites;
it is a property of one transaction that writes the ledger row first with
`ON CONFLICT DO NOTHING RETURNING`, and writes the destination row **only** when the
ledger actually accepted a new message_id. A QoS-1 redelivery therefore inserts nothing
the second time, and there is no window in which a destination row exists without its
ledger row.
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, NamedTuple

import psycopg
from psycopg_pool import ConnectionPool

from .models import DeadLetter, Reading

LEDGER_INSERT = """
INSERT INTO ingress_ledger (message_id, run_id, outcome, raw)
VALUES (%s, %s, %s, %s)
ON CONFLICT (message_id) DO NOTHING
RETURNING message_id
"""

TELEMETRY_INSERT = """
INSERT INTO telemetry (ts, asset_id, signal, value, message_id, run_id)
VALUES (%s, %s, %s, %s, %s, %s)
"""

DLQ_INSERT = """
INSERT INTO dead_letter (message_id, run_id, asset_id, reason, raw)
VALUES (%s, %s, %s, %s, %s)
"""

CONSERVATION_QUERY = """
SELECT (SELECT count(*) FROM ingress_ledger WHERE run_id = %s),
       (SELECT count(*) FROM telemetry      WHERE run_id = %s),
       (SELECT count(*) FROM dead_letter    WHERE run_id = %s)
"""

TOTALS_QUERY = """
SELECT (SELECT count(*) FROM ingress_ledger),
       (SELECT count(*) FROM telemetry),
       (SELECT count(*) FROM dead_letter)
"""

RANGE_QUERY = """
SELECT message_id, run_id, ts, asset_id, signal, value
FROM telemetry
WHERE asset_id = %s AND ts >= %s AND ts <= %s
ORDER BY ts ASC
"""


@dataclass(frozen=True)
class Accepted:
    """The message validated; it becomes a telemetry row."""

    reading: Reading


@dataclass(frozen=True)
class Rejected:
    """The message failed decode or validation; it becomes a dead_letter row."""

    message_id: str
    run_id: str | None
    asset_id: str | None
    reason: str


Outcome = Accepted | Rejected


def get_pool(dsn: str, *, min_size: int = 1, max_size: int = 4) -> ConnectionPool:
    """A connection pool. Opened eagerly so a bad DSN fails at startup, not per message."""
    return ConnectionPool(dsn, min_size=min_size, max_size=max_size, open=True)


def known_asset_ids(conn: psycopg.Connection[Any]) -> frozenset[str]:
    """The device roster, read once at subscriber start and injected into `validate()`."""
    with conn.cursor() as cur:
        cur.execute("SELECT asset_id FROM device")
        return frozenset(row[0] for row in cur.fetchall())


def _wrap(raw: bytes, marker: str) -> str:
    """Base64 fallback so nothing is ever lost just because JSONB will not take it."""
    return json.dumps({"_raw_b64": base64.b64encode(raw).decode("ascii"), marker: True})


def _is_storable(text: str) -> bool:
    """Would PostgreSQL accept this as JSONB?

    Python's json module is more permissive than PostgreSQL in two ways that matter here,
    and both are reachable from a hostile or buggy publisher:

    * NUL — `json.loads('{"s":"\\u0000"}')` succeeds, but `jsonb` stores strings as `text`,
      which cannot contain NUL ("unsupported Unicode escape sequence").
    * Infinity / NaN — `json.loads('{"v":1e10000}')` yields `inf`, and `json.dumps` then
      emits the bare token `Infinity`, which is not valid JSON at all.

    Either one makes the row unstorable. Since a message that cannot be stored is never
    acknowledged, the broker would redeliver it forever: a poison pill that occupies the
    pipeline permanently while every "the loop keeps running" test still passes.
    """
    return "\\u0000" not in text and "\x00" not in text


def encode_raw(payload: bytes | dict[str, Any]) -> str:
    """A JSONB-safe, lossless representation of whatever arrived on the wire.

    Guarantees the result can actually be inserted; anything PostgreSQL would reject is
    preserved verbatim as base64 instead of being dropped.
    """
    if isinstance(payload, dict):
        try:
            # allow_nan=False turns Infinity/NaN into an error instead of invalid JSON.
            text = json.dumps(payload, allow_nan=False)
        except (ValueError, TypeError):
            return _wrap(repr(payload).encode("utf-8", "replace"), "_unstorable")
        return text if _is_storable(text) else _wrap(text.encode("utf-8"), "_unstorable")

    try:
        text = payload.decode("utf-8")
        parsed = json.loads(text)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return _wrap(payload, "_undecodable")
    if not isinstance(parsed, dict):
        # A valid but non-object payload (`[1,2,3]`, `"x"`, `null`) would otherwise be
        # stored as a bare JSON array/scalar, and the reader would have to invent a shape
        # for it — making a real `{"value": ...}` payload indistinguishable from a wrapped
        # scalar. Decide the envelope here, once, where the ambiguity can still be avoided.
        return json.dumps({"_raw_json": parsed, "_non_object": True})
    return text if _is_storable(text) else _wrap(payload, "_unstorable")


def disposition(
    conn: psycopg.Connection[Any],
    *,
    message_id: str,
    run_id: str | None,
    raw: bytes | dict[str, Any],
    outcome: Outcome,
) -> bool:
    """Atomically record one delivery as TELEMETRY or DLQ.

    Returns:
        True if this message_id was newly dispositioned; False if it was a redelivery,
        in which case nothing at all was written.
    """
    if isinstance(outcome, Accepted) and (
        outcome.reading.message_id != message_id or outcome.reading.run_id != run_id
    ):
        # The ledger row and the telemetry row must describe the SAME delivery, or
        # run-scoped conservation silently stops meaning anything. Enforced rather than
        # left to caller discipline.
        raise ValueError(
            f"identity mismatch: ledger ({message_id!r}, {run_id!r}) != reading "
            f"({outcome.reading.message_id!r}, {outcome.reading.run_id!r})"
        )
    raw_json = encode_raw(raw)
    label = "TELEMETRY" if isinstance(outcome, Accepted) else "DLQ"

    with conn.transaction(), conn.cursor() as cur:
        cur.execute(LEDGER_INSERT, (message_id, run_id, label, raw_json))
        if cur.fetchone() is None:
            return False  # redelivery: the ledger already owns this message_id

        if isinstance(outcome, Accepted):
            r = outcome.reading
            cur.execute(
                TELEMETRY_INSERT,
                (r.ts, r.asset_id, r.signal, r.value, r.message_id, r.run_id),
            )
        else:
            cur.execute(
                DLQ_INSERT,
                (message_id, run_id, outcome.asset_id, outcome.reason, raw_json),
            )
    return True


def query_range(
    pool: ConnectionPool, asset_id: str, t0: datetime, t1: datetime
) -> list[Reading]:
    """Readings for ONE asset within [t0, t1], ordered by ts ascending.

    Returns an empty list — never None — when the window holds nothing.
    """
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(RANGE_QUERY, (asset_id, t0, t1))
        rows = cur.fetchall()
    return [
        Reading(
            message_id=row[0] or "",
            run_id=row[1] or "",
            ts=row[2],
            asset_id=row[3],
            signal=row[4],
            value=row[5],
        )
        for row in rows
    ]


LATEST_QUERY = """
SELECT message_id, run_id, ts, asset_id, signal, value
FROM telemetry
WHERE asset_id = %s
ORDER BY ts DESC, message_id DESC
LIMIT 1
"""

DLQ_QUERY = """
SELECT message_id, run_id, asset_id, reason, raw
FROM dead_letter
ORDER BY created_at DESC, id DESC
LIMIT %s OFFSET %s
"""

#: Hard ceiling on a DLQ page, so one careless request cannot scan the whole table.
MAX_DLQ_LIMIT = 500

#: Deep offsets are not free even with the index: PostgreSQL still walks every preceding
#: entry. Paging past this is a sign the caller wants a filter, not another page.
MAX_DLQ_OFFSET = 5_000


def latest_reading(pool: ConnectionPool, asset_id: str) -> Reading | None:
    """The most recent reading for ONE asset, or None when it has never reported.

    Must be served by the existing `(asset_id, ts DESC)` index — scored item 1.3 is a
    latency budget, and a sequential scan over a hypertable is precisely how it is lost.
    """
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(LATEST_QUERY, (asset_id,))
        row = cur.fetchone()
    if row is None:
        return None
    return Reading(
        message_id=row[0] or "",
        run_id=row[1] or "",
        ts=row[2],
        asset_id=row[3],
        signal=row[4],
        value=row[5],
    )


def recent_dead_letters(
    pool: ConnectionPool, *, limit: int = 50, offset: int = 0
) -> list[DeadLetter]:
    """Most recent dead letters first, for the pipeline monitor.

    `limit` is clamped to `MAX_DLQ_LIMIT`; `offset` pages through older rows.
    """
    limit = max(1, min(limit, MAX_DLQ_LIMIT))
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(DLQ_QUERY, (limit, offset))
        rows = cur.fetchall()
    result: list[DeadLetter] = []
    for row in rows:
        raw_val = row[4]
        if not isinstance(raw_val, dict):
            raw_val = {"value": raw_val}
        result.append(
            DeadLetter(
                message_id=row[0],
                run_id=row[1],
                asset_id=row[2],
                reason=row[3],
                raw=raw_val,
            )
        )
    return result


def conservation_totals(pool: ConnectionPool) -> dict[str, int]:
    """Conservation over every run present, in one snapshot.

    The status endpoint reports this rather than a run-scoped figure: the API and the
    simulator generate independent run ids, so scoping the live indicator to the API's own
    id would show zeroes while the database filled up.
    """
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(TOTALS_QUERY)
        row = cur.fetchone() or (0, 0, 0)
    return {"ledger": int(row[0]), "telemetry": int(row[1]), "dead_letter": int(row[2])}


def conservation_counts(pool: ConnectionPool, run_id: str) -> dict[str, int]:
    """Ledger / telemetry / DLQ counts for one run — the RS2.a invariant, queryable."""
    # One statement, one snapshot. Three separate SELECTs would be taken at three
    # different instants, so a concurrent write between them could report a conservation
    # violation that never actually existed.
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(CONSERVATION_QUERY, (run_id, run_id, run_id))
        row = cur.fetchone() or (0, 0, 0)
    return {"ledger": int(row[0]), "telemetry": int(row[1]), "dead_letter": int(row[2])}


#: SEC needs the newest `power_kw` AND the newest `flow_m3h` for one asset. Telemetry stores
#: ONE SIGNAL PER ROW and the simulator cycles signals, so these are different rows with
#: different timestamps — `LATEST_QUERY`'s `(asset_id, ts DESC)` index returns the newest row
#: of ANY signal and cannot serve this. `006_twin_topology.sql` adds
#: `(asset_id, signal, ts DESC) INCLUDE (value)` for exactly this shape, and
#: `test_twin_routes.py` pins it with its own EXPLAIN assertion — `test_latency.py` covers
#: only LATEST_QUERY and would stay green while this one sorted history.
LATEST_PER_SIGNAL_QUERY = """
    SELECT DISTINCT ON (signal) signal, value, ts
    FROM telemetry
    WHERE asset_id = %s AND signal = ANY(%s)
    ORDER BY signal, ts DESC
"""


class SignalPair(NamedTuple):
    """Newest reading of two signals for one asset, each with its OWN timestamp.

    A single `as_of` cannot describe both: the readings normally arrive seconds or minutes
    apart, and collapsing them would let SEC be computed from unrelated snapshots while
    looking authoritative.
    """

    power_kw: float | None
    power_observed_at: datetime | None
    flow_m3h: float | None
    flow_observed_at: datetime | None

    @property
    def skew_s(self) -> float | None:
        """Absolute gap between the two observations, or None if either is missing."""
        if self.power_observed_at is None or self.flow_observed_at is None:
            return None
        return abs((self.power_observed_at - self.flow_observed_at).total_seconds())


def latest_signal_pair(pool: ConnectionPool, asset_id: str) -> SignalPair:
    """Newest `power_kw` and `flow_m3h` for `asset_id`, each with its own timestamp.

    Either side may be None when that signal has never been recorded. Must run as an index
    scan over `telemetry_asset_signal_ts_idx`; see LATEST_PER_SIGNAL_QUERY.
    """
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(LATEST_PER_SIGNAL_QUERY, (asset_id, ["power_kw", "flow_m3h"]))
        rows = cur.fetchall()
    by_signal: dict[str, tuple[float, datetime]] = {}
    for row in rows:
        signal, value, ts = row
        if signal not in by_signal:
            by_signal[signal] = (float(value), ts)
    power_kw, power_observed_at = (
        by_signal["power_kw"] if "power_kw" in by_signal else (None, None)
    )
    flow_m3h, flow_observed_at = (
        by_signal["flow_m3h"] if "flow_m3h" in by_signal else (None, None)
    )
    return SignalPair(
        power_kw=power_kw,
        power_observed_at=power_observed_at,
        flow_m3h=flow_m3h,
        flow_observed_at=flow_observed_at,
    )
