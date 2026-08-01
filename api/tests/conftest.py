"""Integration fixtures for slice S2.

Real TimescaleDB and real Mosquitto — CLAUDE.md forbids mock-testing the pipeline, and
a mocked DB would assert our belief about hypertables rather than their behaviour.

Both fixtures skip only when Docker is ABSENT. If Docker is present and the container
fails to start, that is an infrastructure failure and must surface as an error: skipping
there would turn a broken gate green and silently retire the integration coverage.
"""
from __future__ import annotations

import os
import pathlib
import shutil
import socket
import subprocess
import sys
import time
from collections.abc import Iterator
from datetime import UTC, datetime

import psycopg
import pytest
from psycopg_pool import ConnectionPool

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
ML_ROOT = REPO_ROOT / "ml"
TIMESCALE_IMAGE = "timescale/timescaledb:2.17.2-pg16"
MOSQUITTO_IMAGE = "eclipse-mosquitto:2.0.20"


def pytest_sessionstart(session: pytest.Session) -> None:
    """Expose `scripts/` and `ml/`.

    `simulator/` is deliberately NOT added: it also contains a top-level package named
    `app`, so putting it on this process's path would shadow `api/app` (or be shadowed by
    it) depending on import order. The two services never share an interpreter in
    production either — they are separate containers. Anything needing the simulator's
    roster shells out instead (see `simulator_roster`).

    `ml/` IS added, because slice S6 makes the API import `pwa_ml` directly. The image
    copies that package to `/srv/pwa_ml`, next to `app/`; this reproduces that layout for
    the test interpreter. It carries no `app` package, so it cannot shadow anything.
    """
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    if str(ML_ROOT) not in sys.path:
        sys.path.insert(0, str(ML_ROOT))


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port: int = s.getsockname()[1]
    return port


def _require_docker() -> None:
    if shutil.which("docker") is None:
        pytest.skip("docker not available; this integration test needs real services")


def _wait_for_port(port: int, timeout: float = 90.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1.0):
                return
        except OSError:
            time.sleep(0.25)
    raise RuntimeError(f"port {port} never opened within {timeout}s")


@pytest.fixture(scope="session")
def timescale_dsn() -> Iterator[str]:
    """A throwaway TimescaleDB with 001+002 applied and the device roster seeded."""
    _require_docker()
    port = _free_port()
    cid = subprocess.run(
        [
            "docker", "run", "-d", "--rm",
            "-p", f"127.0.0.1:{port}:5432",
            "-e", "POSTGRES_USER=pwa", "-e", "POSTGRES_PASSWORD=pwa", "-e", "POSTGRES_DB=pwa",
            "-v", f"{REPO_ROOT / 'infra' / 'db' / '001_init.sql'}:"
                  "/docker-entrypoint-initdb.d/001_init.sql:ro",
            TIMESCALE_IMAGE,
        ],
        capture_output=True, text=True, check=True, timeout=300,
    ).stdout.strip()

    dsn = f"postgresql://pwa:pwa@127.0.0.1:{port}/pwa"
    try:
        _wait_for_port(port)
        _wait_for_schema(dsn)
        _apply_migrations_and_seed(dsn)
        yield dsn
    finally:
        subprocess.run(["docker", "kill", cid], capture_output=True, timeout=120)


def _wait_for_schema(dsn: str, timeout: float = 120.0) -> None:
    """initdb runs asynchronously after the port opens; wait for 001 to land."""
    deadline = time.monotonic() + timeout
    last: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with psycopg.connect(dsn, connect_timeout=3) as conn, conn.cursor() as cur:
                cur.execute("SELECT to_regclass('public.telemetry')")
                if (cur.fetchone() or [None])[0] is not None:
                    return
        except psycopg.Error as exc:  # not yet accepting connections
            last = exc
        time.sleep(0.5)
    raise RuntimeError(f"schema never appeared: {last}")


def _apply_migrations_and_seed(dsn: str) -> None:
    """Apply 001+002, then seed the roster.

    `scripts/migrate.py` is safe to import (it touches no `app` package). `seed_db.py`
    imports the SIMULATOR's `app`, so it is run as a subprocess to keep that package out
    of this interpreter.
    """
    from scripts import migrate

    with psycopg.connect(dsn) as conn:
        migrate.apply_pending(conn)
    env = {**os.environ, "DATABASE_URL": dsn}
    subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "seed_db.py")],
        env=env, capture_output=True, text=True, check=True, timeout=300,
    )


@pytest.fixture(scope="session")
def simulator_roster() -> frozenset[str]:
    """asset_ids the simulator will publish, obtained out-of-process (see above)."""
    result = subprocess.run(
        [
            sys.executable, "-c",
            "import sys; sys.path.insert(0, 'simulator');"
            "from app.roster import load_devices;"
            "print('\\n'.join(d.asset_id for d in load_devices()))",
        ],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True, timeout=120,
    )
    return frozenset(result.stdout.split())


@pytest.fixture
def pool(timescale_dsn: str) -> Iterator[ConnectionPool]:
    p = ConnectionPool(timescale_dsn, min_size=1, max_size=3, open=True)
    try:
        yield p
    finally:
        p.close()


@pytest.fixture(scope="session")
def mosquitto() -> Iterator[int]:
    """A throwaway anonymous broker with persistence on (durable sessions)."""
    _require_docker()
    port = _free_port()
    cid = subprocess.run(
        [
            "docker", "run", "-d", "--rm",
            "-p", f"127.0.0.1:{port}:1883",
            MOSQUITTO_IMAGE,
            "mosquitto", "-c", "/mosquitto-no-auth.conf",
        ],
        capture_output=True, text=True, check=True, timeout=300,
    ).stdout.strip()
    try:
        _wait_for_port(port)
        yield port
    finally:
        subprocess.run(["docker", "kill", cid], capture_output=True, timeout=120)


# ── slice S6: model serving and backfilled history ────────────────────────────────────


@pytest.fixture(scope="session")
def model_artifact() -> pathlib.Path:
    """The canonical `ml/artifacts/model.pkl`, built by the documented command if absent.

    Deliberately NOT a `tmp_path` model. Scored item 3.1 is about the artifact that ships,
    and slice S6's whole claim is that the API serves *that* file through
    `app.model.get_bundle`. Training into a temporary directory would test a model the
    demo never loads — the exact failure `ml/tests/test_shipped_artifact.py` was written
    to prevent. Building it here rather than skipping keeps the S6 acceptance tests
    meaningful on a fresh clone; it takes about two seconds.
    """
    artifact = ML_ROOT / "artifacts" / "model.pkl"
    if not artifact.is_file():
        subprocess.run(
            [sys.executable, "-m", "pwa_ml"],
            cwd=ML_ROOT, capture_output=True, text=True, check=True, timeout=600,
        )
    if not artifact.is_file():  # pragma: no cover - the build above either works or raises
        raise RuntimeError(f"{artifact} still absent after `python -m pwa_ml`")
    return artifact


def purge_backfill(pool: ConnectionPool) -> None:
    """Remove every backfilled row and refresh statistics.

    The database is SESSION-scoped while this fixture is function-scoped, so without this
    a single S6 test would permanently reshape the table for every test that ran after it.
    It did: `test_latency.py::test_latest_query_uses_the_index_and_does_not_scan` guards
    scored item 1.3 by asserting the latest-reading query is an index SEEK, and the extra
    1800 rows flipped the planner onto the hypertable's time-only index — intermittently at
    first, which is the worst possible way for it to fail.

    Same `message_id LIKE` predicate the script itself uses, so it can only ever match rows
    the backfill wrote.
    """
    with pool.connection() as conn, conn.cursor() as cur:
        # Must mirror `backfill_history` EXACTLY. An earlier version deleted ledger rows
        # by message-id prefix without matching the script's filter, and that asymmetry
        # broke conservation for the whole pytest session — surfacing three files away in
        # `test_pipeline_e2e`'s live status assertion rather than here.
        cur.execute("DELETE FROM telemetry WHERE source = 'BACKFILL'")
        cur.execute("DELETE FROM ingress_ledger WHERE source = 'BACKFILL'")
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("ANALYZE telemetry")


@pytest.fixture
def backfilled(pool: ConnectionPool) -> Iterator[list[str]]:
    """Hourly history for a handful of pumps, ending now.

    Uses the SAME script compose runs, so the window the tests score is the window the demo
    scores. Returns the backfilled asset ids sorted by the wear rate each was actually
    backfilled with — worst-health LAST — so `backfilled[-1]` is the most degraded device (the
    one a correct worklist ranks first) and `backfilled[0]` the healthiest. `backfill_history`
    spreads wear by roster position, but `DEMO_WEAR_OVERRIDE` pins a demo pump (P-2) to the top
    of the wear range even though it sorts early, so the ids are ordered by the wear map rather
    than by trusting alphabetical order to track wear.

    Cleans up after itself; see `purge_backfill`.
    """
    from scripts.backfill_history import DEFAULT_ASSETS, PUMP_QUERY, _wear_rate, backfill

    with pool.connection() as conn:
        backfill(conn, now=datetime.now(tz=UTC), assets=DEFAULT_ASSETS)
        with conn.cursor() as cur:
            cur.execute(PUMP_QUERY, (DEFAULT_ASSETS,))
            ordered = [row[0] for row in cur.fetchall()]
    # `backfill` gives each pump the rate `_wear_rate(asset_id, position, total)` in this exact
    # PUMP_QUERY order; health is monotonic in wear, so sorting by that rate yields worst last.
    wear = {asset_id: _wear_rate(asset_id, i, len(ordered)) for i, asset_id in enumerate(ordered)}
    assets = sorted(ordered, key=wear.__getitem__)
    try:
        yield assets
    finally:
        purge_backfill(pool)
