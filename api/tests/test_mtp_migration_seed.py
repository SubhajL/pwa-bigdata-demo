"""PR-I S1/S3 — migration 007 + the Map Ta Phut seed (DREP R1–R3, R6, R7, R9, R11).

Real TimescaleDB throughout — CLAUDE.md forbids mock-testing the pipeline, and a mocked DB
would assert our belief about the constraints rather than the constraints.

The load-bearing case Codex flagged is `test_upgrade_from_006_*`: the shared session fixture
builds a FRESH container and applies every migration, so it can only ever prove reapplication is
a no-op. This file additionally constructs a real 006 volume with the five legacy rows, then
applies 007 and runs the seed — the actual upgrade path an existing demo volume takes.

Authored by Claude; the implementer must not modify this file (DREP §10).
"""
from __future__ import annotations

import os
import pathlib
import socket
import subprocess
import sys
import time
from collections.abc import Iterator

import psycopg
import pytest
from psycopg_pool import ConnectionPool
from scripts import migrate
from scripts.map_ta_phut_customer_profile import (
    MTP_PROFILE_VERSION,
    SUBTYPE_ALLOCATION,
    find_pii,
)

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
DB_DIR = REPO_ROOT / "infra" / "db"
TIMESCALE_IMAGE = "timescale/timescaledb:2.17.2-pg16"


# ── local container helpers (kept independent of conftest's session fixture) ──────────────


def _require_docker() -> None:
    import shutil

    if shutil.which("docker") is None:
        pytest.skip("docker not available; this integration test needs a real database")


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _wait_for_port(port: int, timeout: float = 90.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1.0):
                return
        except OSError:
            time.sleep(0.25)
    raise RuntimeError(f"port {port} never opened within {timeout}s")


def _wait_for_table(dsn: str, table: str, timeout: float = 120.0) -> None:
    deadline = time.monotonic() + timeout
    last: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with psycopg.connect(dsn, connect_timeout=3) as conn, conn.cursor() as cur:
                cur.execute("SELECT to_regclass(%s)", (f"public.{table}",))
                if (cur.fetchone() or [None])[0] is not None:
                    return
        except psycopg.Error as exc:
            last = exc
        time.sleep(0.5)
    raise RuntimeError(f"table {table} never appeared: {last}")


def _wait_for_schema(dsn: str, timeout: float = 120.0) -> None:
    _wait_for_table(dsn, "customer_service_point", timeout)


@pytest.fixture
def legacy_006_dsn() -> Iterator[str]:
    """A throwaway volume at the 006 schema carrying the five legacy 72-1-* rows AND a
    non-owned bystander — i.e. exactly the state an existing demo volume is in before PR-I."""
    _require_docker()
    port = _free_port()
    cid = subprocess.run(
        [
            "docker", "run", "-d", "--rm", "-p", f"127.0.0.1:{port}:5432",
            "-e", "POSTGRES_USER=pwa", "-e", "POSTGRES_PASSWORD=pwa", "-e", "POSTGRES_DB=pwa",
            "-v", f"{DB_DIR / '001_init.sql'}:/docker-entrypoint-initdb.d/001_init.sql:ro",
            TIMESCALE_IMAGE,
        ],
        capture_output=True, text=True, check=True, timeout=300,
    ).stdout.strip()
    dsn = f"postgresql://pwa:pwa@127.0.0.1:{port}/pwa"
    try:
        _wait_for_port(port)
        _wait_for_schema(dsn)
        with psycopg.connect(dsn) as conn, conn.cursor() as cur:
            # Reach the 006 baseline WITHOUT 007 (direct-apply the pre-007 migrations)...
            for path in sorted(DB_DIR.glob("00[2-6]_*.sql")):
                cur.execute(path.read_text(encoding="utf-8"))
            # ...and record 001-006 in the ledger, so this is a genuine ledger-at-006 volume and
            # the upgrade applies ONLY 007 (not a replay of 001-006) — Codex round 1.
            cur.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations "
                "(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
            )
            for path in sorted(DB_DIR.glob("00[1-6]_*.sql")):
                cur.execute(
                    "INSERT INTO schema_migrations (filename) VALUES (%s) ON CONFLICT DO NOTHING",
                    (path.name,),
                )
            # The five legacy Samut Sakhon rows this seed once wrote...
            cur.executemany(
                "INSERT INTO customer_service_point (customer_id, node, area, branch) "
                "VALUES (%s, 'n1', 'ต.ท่าจีน', 'สมุทรสาคร')",
                [(f"72-1-{n:05d}",) for n in range(1, 6)],
            )
            # ...plus a bystander the seed does not own and must not delete. Placed on an
            # OFF-LINE node (not n1/n2) so it is not even on the impact corridor.
            cur.execute(
                "INSERT INTO customer_service_point (customer_id, node, area, branch) "
                "VALUES ('KEEP-9', 'kept-node', 'ต.อื่น', 'สาขาอื่น')"
            )
            conn.commit()
        yield dsn
    finally:
        subprocess.run(["docker", "kill", cid], capture_output=True, timeout=120)


# ── R1: the migration applied and is recorded ─────────────────────────────────────────────


def test_007_tables_indexes_and_constraints_exist(pool: ConnectionPool) -> None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_name IN ('demo_customer_profile', 'demo_customer_meter_reading')"
        )
        assert {r[0] for r in cur.fetchall()} == {
            "demo_customer_profile", "demo_customer_meter_reading"
        }
        cur.execute(
            "SELECT conname FROM pg_constraint WHERE conname LIKE 'demo_customer_%'"
        )
        names = {r[0] for r in cur.fetchall()}
        for expected in (
            "demo_customer_profile_account_no_synthetic",
            "demo_customer_profile_address_simulated",
            "demo_customer_profile_is_simulated",
            "demo_customer_meter_reading_arithmetic",
        ):
            assert expected in names, f"missing constraint {expected}"
        cur.execute(
            "SELECT indexname FROM pg_indexes WHERE indexname = 'demo_customer_profile_version_idx'"
        )
        assert cur.fetchone() is not None


def test_007_is_recorded_and_reapplying_is_a_noop(pool: ConnectionPool) -> None:
    with pool.connection() as conn:
        assert "007_map_ta_phut_demo_customers.sql" in migrate.applied(conn)
        assert migrate.apply_pending(conn) == []


# ── R1/R11: the true upgrade path (own container) ─────────────────────────────────────────


@pytest.mark.timeout(300)
def test_upgrade_from_006_lands_200_drops_five_keeps_bystander(legacy_006_dsn: str) -> None:
    """006 volume + five legacy rows -> apply 007 -> run the seed -> exactly 200/2,400, zero
    legacy rows, and the non-owned bystander survives (Codex 0.1/0.3, DREP R11)."""
    # UPGRADE: the ledger is at 006, so migrate applies EXACTLY 007 — the real upgrade step.
    with psycopg.connect(legacy_006_dsn) as conn:
        applied = migrate.apply_pending(conn)
    assert applied == ["007_map_ta_phut_demo_customers.sql"], (
        f"upgrade should apply only 007, applied: {applied}"
    )

    env = {**os.environ, "DATABASE_URL": legacy_006_dsn}
    subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "seed_db.py")],
        env=env, capture_output=True, text=True, check=True, timeout=300,
    )

    with psycopg.connect(legacy_006_dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM customer_service_point WHERE customer_id LIKE '72-1-%'")
        assert (cur.fetchone() or [None])[0] == 0, "a legacy 72-1-* row survived the upgrade"
        cur.execute("SELECT count(*) FROM customer_service_point WHERE customer_id = 'KEEP-9'")
        assert (cur.fetchone() or [None])[0] == 1, "the seed deleted a row it does not own"
        cur.execute(
            "SELECT count(*) FROM demo_customer_profile WHERE profile_version = %s",
            (MTP_PROFILE_VERSION,),
        )
        assert (cur.fetchone() or [None])[0] == 200
        cur.execute("SELECT count(*) FROM demo_customer_meter_reading")
        assert (cur.fetchone() or [None])[0] == 2400


@pytest.mark.timeout(300)
def test_fresh_initdb_bundle_lands_200_2400() -> None:
    """Production FRESH startup mounts the WHOLE infra/db dir into initdb, which runs 001..007 in
    order — a different code path from `migrate.apply_pending`. Prove that path also lands exactly
    200/2,400 with no legacy rows (roadmap PR-I Done: 'fresh AND upgraded stacks'; g2-qcheck round
    4, Codex)."""
    _require_docker()
    port = _free_port()
    cid = subprocess.run(
        [
            "docker", "run", "-d", "--rm", "-p", f"127.0.0.1:{port}:5432",
            "-e", "POSTGRES_USER=pwa", "-e", "POSTGRES_PASSWORD=pwa", "-e", "POSTGRES_DB=pwa",
            "-v", f"{DB_DIR}:/docker-entrypoint-initdb.d/:ro",  # the WHOLE bundle, initdb runs all
            TIMESCALE_IMAGE,
        ],
        capture_output=True, text=True, check=True, timeout=300,
    ).stdout.strip()
    dsn = f"postgresql://pwa:pwa@127.0.0.1:{port}/pwa"
    try:
        _wait_for_port(port)
        _wait_for_table(dsn, "demo_customer_profile")  # 007 is last — its table means all ran
        subprocess.run(
            [sys.executable, str(REPO_ROOT / "scripts" / "seed_db.py")],
            env={**os.environ, "DATABASE_URL": dsn}, capture_output=True, text=True,
            check=True, timeout=300,
        )
        with psycopg.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM demo_customer_profile WHERE profile_version = %s",
                (MTP_PROFILE_VERSION,),
            )
            assert (cur.fetchone() or [None])[0] == 200
            cur.execute("SELECT count(*) FROM demo_customer_meter_reading")
            assert (cur.fetchone() or [None])[0] == 2400
            cur.execute(
                "SELECT count(*) FROM customer_service_point WHERE customer_id LIKE '72-1-%'"
            )
            assert (cur.fetchone() or [None])[0] == 0
    finally:
        subprocess.run(["docker", "kill", cid], capture_output=True, timeout=120)


def test_foreign_keys_are_enforced(pool: ConnectionPool) -> None:
    """R4: a profile for a non-existent service point, and a reading for a non-existent profile,
    are both refused — reverting either FK would leave this green otherwise (g2-qcheck round 4)."""
    with pool.connection() as conn:
        with conn.cursor() as cur, pytest.raises(psycopg.errors.ForeignKeyViolation):
            _insert_profile(
                cur, customer_id="SIM-MTP-99999",
                account_no="SIM-MTP-ACC-99999", meter_no="SIM-MTP-MTR-99999",
            )  # no matching customer_service_point row
        conn.rollback()
        with conn.cursor() as cur, pytest.raises(psycopg.errors.ForeignKeyViolation):
            cur.execute(
                "INSERT INTO demo_customer_meter_reading "
                "(customer_id, period, previous_reading_m3, reading_m3, usage_m3) "
                "VALUES ('SIM-MTP-99998', '2025-01', 0, 10, 10)"  # no matching profile
            )
        conn.rollback()


def test_meter_reading_is_a_plain_table_not_a_hypertable(pool: ConnectionPool) -> None:
    """R5: the deliberate plain-table decision — a future conversion of the readings to a
    hypertable must fail here. `telemetry` is the control that IS one (g2-qcheck round 4)."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM timescaledb_information.hypertables "
            "WHERE hypertable_name = 'demo_customer_meter_reading'"
        )
        assert (cur.fetchone() or [None])[0] == 0
        cur.execute(
            "SELECT count(*) FROM timescaledb_information.hypertables "
            "WHERE hypertable_name = 'telemetry'"
        )
        assert (cur.fetchone() or [None])[0] == 1


# ── R2/R3: named constraints refuse bad rows (valid parent, so it's the CHECK that fires) ──


_VALID_PROFILE = {
    "customer_id": "SIM-MTP-TST01", "account_no": "SIM-MTP-ACC-TST01",
    "meter_no": "SIM-MTP-MTR-TST01", "type_code": 1, "subtype_code": 11,
    "meter_size": "15 มม.", "pressure_zone_id": "MTP-LPZ-01",
    "address_label": "ที่อยู่จำลอง: ทดสอบ", "profile_version": "test-only", "simulated": True,
}
_PROFILE_COLS = tuple(_VALID_PROFILE)
_PROFILE_SQL = (
    f"INSERT INTO demo_customer_profile ({', '.join(_PROFILE_COLS)}) "
    f"VALUES ({', '.join(['%s'] * len(_PROFILE_COLS))})"
)


def _insert_profile(cur: psycopg.Cursor, **overrides: object) -> None:
    row = {**_VALID_PROFILE, **overrides}
    cur.execute(_PROFILE_SQL, tuple(row[c] for c in _PROFILE_COLS))


@pytest.fixture
def unprofiled_parent(pool: ConnectionPool) -> Iterator[None]:
    """A valid SIM-MTP service point with no profile, plus a non-SIM parent for the id check.
    Cleaned up unconditionally so the session DB stays at exactly 200 MTP profiles."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO customer_service_point (customer_id, node, area, branch) VALUES "
            "('SIM-MTP-TST01', 'n1', 'ต.ทดสอบ', 'จำลอง'), "
            "('BADID-TST01', 'n1', 'ต.ทดสอบ', 'จำลอง') ON CONFLICT DO NOTHING"
        )
        conn.commit()
    try:
        yield
    finally:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                "DELETE FROM demo_customer_meter_reading WHERE customer_id IN "
                "('SIM-MTP-TST01', 'BADID-TST01')"
            )
            cur.execute(
                "DELETE FROM demo_customer_profile WHERE customer_id IN "
                "('SIM-MTP-TST01', 'BADID-TST01')"
            )
            cur.execute(
                "DELETE FROM customer_service_point WHERE customer_id IN "
                "('SIM-MTP-TST01', 'BADID-TST01')"
            )
            conn.commit()


@pytest.mark.usefixtures("unprofiled_parent")
@pytest.mark.parametrize(
    ("overrides", "constraint"),
    [
        ({"account_no": "REAL-000001"}, "demo_customer_profile_account_no_synthetic"),
        ({"meter_no": "REAL-000001"}, "demo_customer_profile_meter_no_synthetic"),
        ({"address_label": "no marker here"}, "demo_customer_profile_address_simulated"),
        ({"simulated": False}, "demo_customer_profile_is_simulated"),
        ({"type_code": 9}, "demo_customer_profile_type_code_valid"),
        (
            {"customer_id": "BADID-TST01", "account_no": "SIM-MTP-ACC-TST02",
             "meter_no": "SIM-MTP-MTR-TST02"},
            "demo_customer_profile_customer_id_synthetic",
        ),
    ],
)
def test_profile_named_constraints_reject_bad_rows(
    pool: ConnectionPool, overrides: dict[str, object], constraint: str
) -> None:
    with pool.connection() as conn:
        with conn.cursor() as cur, pytest.raises(psycopg.errors.CheckViolation) as exc:
            _insert_profile(cur, **overrides)
        assert exc.value.diag.constraint_name == constraint
        conn.rollback()


@pytest.mark.usefixtures("unprofiled_parent")
@pytest.mark.parametrize(
    ("previous", "reading", "usage"),
    [
        (100, 130, 999),  # usage != reading - previous — the arithmetic conjunct
        (100, 90, -10),   # reading < previous — the monotonicity conjunct (usage matches diff)
    ],
)
def test_reading_arithmetic_named_constraint_rejects_bad_rows(
    pool: ConnectionPool, previous: int, reading: int, usage: int
) -> None:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            _insert_profile(cur)  # valid parent for the reading FK
        with conn.cursor() as cur, pytest.raises(psycopg.errors.CheckViolation) as exc:
            cur.execute(
                "INSERT INTO demo_customer_meter_reading "
                "(customer_id, period, previous_reading_m3, reading_m3, usage_m3) "
                "VALUES ('SIM-MTP-TST01', '2026-01', %s, %s, %s)",
                (previous, reading, usage),
            )
        assert exc.value.diag.constraint_name == "demo_customer_meter_reading_arithmetic"
        conn.rollback()


@pytest.mark.usefixtures("unprofiled_parent")
def test_reading_period_format_rejects_an_invalid_calendar_month(pool: ConnectionPool) -> None:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            _insert_profile(cur)
        with conn.cursor() as cur, pytest.raises(psycopg.errors.CheckViolation) as exc:
            cur.execute(
                "INSERT INTO demo_customer_meter_reading "
                "(customer_id, period, previous_reading_m3, reading_m3, usage_m3) "
                "VALUES ('SIM-MTP-TST01', '2026-13', 100, 125, 25)"  # month 13 is not a month
            )
        assert exc.value.diag.constraint_name == "demo_customer_meter_reading_period_format"
        conn.rollback()


@pytest.mark.usefixtures("unprofiled_parent")
def test_customer_detail_fails_closed_when_readings_are_not_twelve(pool: ConnectionPool) -> None:
    """`get_demo_customer_detail` refuses an account whose stored history is not exactly 12
    months — the fail-closed branch (DREP R15/FN6) that no seeded-data test can reach."""
    from app.topology import get_demo_customer_detail

    with pool.connection() as conn, conn.cursor() as cur:
        _insert_profile(cur)  # SIM-MTP-TST01, profile_version="test-only"
        for month in range(1, 12):  # only ELEVEN readings, not twelve
            cur.execute(
                "INSERT INTO demo_customer_meter_reading "
                "(customer_id, period, previous_reading_m3, reading_m3, usage_m3) "
                "VALUES ('SIM-MTP-TST01', %s, %s, %s, 10)",
                (f"2025-{month:02d}", month * 10, month * 10 + 10),
            )
        conn.commit()
    with pytest.raises(ValueError):
        get_demo_customer_detail(pool, "SIM-MTP-TST01", profile_version="test-only")


@pytest.mark.usefixtures("unprofiled_parent")
def test_customer_detail_fails_closed_on_discontinuous_readings(pool: ConnectionPool) -> None:
    """Twelve individually-valid rows that do NOT chain (period 6's previous != period 5's
    reading) must be refused — the per-row DB CHECK cannot catch cross-row discontinuity, so
    removing the continuity guard would otherwise serve a corrupt history (g2-qcheck round 3)."""
    from app.topology import get_demo_customer_detail

    with pool.connection() as conn, conn.cursor() as cur:
        _insert_profile(cur)
        for month in range(1, 13):
            previous = 999 if month == 6 else month * 10  # row 6 breaks the chain with row 5
            cur.execute(
                "INSERT INTO demo_customer_meter_reading "
                "(customer_id, period, previous_reading_m3, reading_m3, usage_m3) "
                "VALUES ('SIM-MTP-TST01', %s, %s, %s, 10)",
                (f"2025-{month:02d}", previous, previous + 10),
            )
        conn.commit()
    with pytest.raises(ValueError):
        get_demo_customer_detail(pool, "SIM-MTP-TST01", profile_version="test-only")


# ── R6/R7 persisted, R11: the seeded session DB ───────────────────────────────────────────


def test_persisted_joint_type_subtype_distribution(pool: ConnectionPool) -> None:
    """The seeded rows carry the exact (type, subtype) pairing — independent counters would
    pass even with subtype 21 wrongly under type 1 (Codex 0.4)."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT type_code, subtype_code, count(*) FROM demo_customer_profile "
            "WHERE profile_version = %s GROUP BY type_code, subtype_code",
            (MTP_PROFILE_VERSION,),
        )
        persisted = {(int(r[0]), int(r[1])): r[2] for r in cur.fetchall()}
    assert persisted == dict(SUBTYPE_ALLOCATION)


def test_persisted_rows_carry_no_pii(pool: ConnectionPool) -> None:
    # Uses the SAME shared `find_pii` the generator's validator uses, over EVERY served text field
    # — profile columns AND service-point node/area/branch (g2-qcheck rounds 2-3).
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT p.customer_id, p.account_no, p.meter_no, p.meter_size, p.pressure_zone_id, "
            "p.address_label, p.profile_version, c.node, c.area, c.branch "
            "FROM demo_customer_profile p "
            "JOIN customer_service_point c ON c.customer_id = p.customer_id "
            "WHERE p.profile_version = %s",
            (MTP_PROFILE_VERSION,),
        )
        rows = cur.fetchall()
    assert len(rows) == 200
    for row in rows:
        for value in row:
            label = find_pii(str(value))
            assert label is None, f"{label}-like value persisted: {value!r}"
        assert row[0].startswith("SIM-MTP-")  # customer_id
        assert row[1].startswith("SIM-MTP-")  # account_no
        assert row[2].startswith("SIM-MTP-")  # meter_no
        assert "จำลอง" in row[5]  # address_label


def test_seed_replaced_the_five_and_landed_200_2400(pool: ConnectionPool) -> None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM customer_service_point WHERE customer_id LIKE '72-1-%'")
        assert (cur.fetchone() or [None])[0] == 0, "legacy five-row fallback still present"
        cur.execute(
            "SELECT count(*) FROM demo_customer_profile WHERE profile_version = %s",
            (MTP_PROFILE_VERSION,),
        )
        assert (cur.fetchone() or [None])[0] == 200
        cur.execute("SELECT count(*) FROM demo_customer_meter_reading")
        assert (cur.fetchone() or [None])[0] == 2400


@pytest.mark.timeout(120)
def test_reseeding_is_idempotent_with_no_churn(timescale_dsn: str) -> None:
    """Re-running the seed leaves the counts AND the exact reading bytes unchanged — proving
    ON CONFLICT DO NOTHING, not delete-and-reinsert (Codex §3)."""
    def _snapshot() -> tuple[int, int, str, str, str]:
        with psycopg.connect(timescale_dsn) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM demo_customer_profile WHERE profile_version = %s",
                (MTP_PROFILE_VERSION,),
            )
            profiles = (cur.fetchone() or [0])[0]
            cur.execute("SELECT count(*) FROM demo_customer_meter_reading")
            readings = (cur.fetchone() or [0])[0]
            # Digest EVERY served field of every reading, profile, and service point — so any
            # value CHANGE across a re-seed is caught, not just a count drift. (A content digest
            # proves value-stability; it cannot by itself distinguish an in-place keep from a
            # delete-and-identical-reinsert, which `ON CONFLICT DO NOTHING` + `check=True` on the
            # subprocess already rule out.) (g2-qcheck round 2, Codex.)
            cur.execute(
                "SELECT md5(string_agg("
                "customer_id||'|'||period||'|'||previous_reading_m3||'|'||reading_m3||'|'"
                "||usage_m3, ',' ORDER BY customer_id, period)) "
                "FROM demo_customer_meter_reading"
            )
            readings_digest = (cur.fetchone() or [""])[0]
            cur.execute(
                "SELECT md5(string_agg("
                "customer_id||'|'||account_no||'|'||meter_no||'|'||type_code||'|'"
                "||subtype_code||'|'||meter_size||'|'||pressure_zone_id||'|'||address_label||'|'"
                "||profile_version||'|'||simulated, ',' ORDER BY customer_id)) "
                "FROM demo_customer_profile WHERE profile_version = %s",
                (MTP_PROFILE_VERSION,),
            )
            profiles_digest = (cur.fetchone() or [""])[0]
            cur.execute(
                "SELECT md5(string_agg(customer_id||'|'||node||'|'||area||'|'||branch, ',' "
                "ORDER BY customer_id)) FROM customer_service_point "
                "WHERE customer_id LIKE 'SIM-MTP-%'"
            )
            service_points_digest = (cur.fetchone() or [""])[0]
        return profiles, readings, readings_digest, profiles_digest, service_points_digest

    before = _snapshot()
    subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "seed_db.py")],
        env={**os.environ, "DATABASE_URL": timescale_dsn},
        capture_output=True, text=True, check=True, timeout=120,
    )
    after = _snapshot()
    assert before == after
    assert before[0] == 200 and before[1] == 2400
