"""TS3.1 / TS3.2 — scored item 1.3: a read endpoint answering in under 500 ms average.

Measured over a REAL uvicorn on a real TCP socket, not through `TestClient`. That matters:
`TestClient` calls the ASGI app in-process, so it excludes connection setup, HTTP framing,
serialisation over the wire and any event-loop contention from the ingest consumer — i.e.
precisely the costs a judge's DevTools Network panel *does* include. A number produced by
`TestClient` would be a smaller, different quantity than the one being scored.

The statistic is the **arithmetic mean**, because that is what the checklist says
("Response time <= 500ms avg"). A median would hide exactly the tail this is meant to catch.
"""
from __future__ import annotations

import os
import statistics
import subprocess
import sys
import time
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from psycopg_pool import ConnectionPool

from app.db import Accepted, disposition
from app.models import Reading

from .conftest import REPO_ROOT, _free_port, _wait_for_port

pytestmark = pytest.mark.integration

SEEDED_ASSET = "P-2"
CALLS = 20
BUDGET_MS = 500.0


def _seed_readings(pool: ConnectionPool, run_id: str, n: int) -> None:
    """Enough rows that an unindexed scan would be visibly slower than an index seek."""
    base = datetime.now(tz=UTC) - timedelta(seconds=n)
    with pool.connection() as conn:
        for i in range(n):
            reading = Reading(
                message_id=f"{run_id}-{i}",
                run_id=run_id,
                ts=base + timedelta(seconds=i),
                asset_id=SEEDED_ASSET,
                signal="pressure_bar",
                value=3.0 + (i % 10) * 0.1,
            )
            disposition(
                conn, message_id=reading.message_id, run_id=run_id,
                raw={"i": i}, outcome=Accepted(reading),
            )


@pytest.fixture(scope="module")
def live_api(timescale_dsn: str) -> Iterator[str]:
    """A real uvicorn serving the app over TCP. Yields the base URL."""
    port = _free_port()
    env = {
        **os.environ,
        "DATABASE_URL": timescale_dsn,
        "MQTT_ENABLED": "0",          # this test is about retrieval, not ingest
        "API_RUN_ID": f"latency-{uuid.uuid4().hex[:8]}",
    }
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--workers", "1", "--log-level", "warning"],
        cwd=REPO_ROOT / "api", env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    try:
        _wait_for_port(port, timeout=60)
        base = f"http://127.0.0.1:{port}"
        for _ in range(60):
            try:
                if httpx.get(f"{base}/healthz", timeout=2.0).status_code == 200:
                    break
            except httpx.HTTPError:
                time.sleep(0.25)
        else:
            raise RuntimeError("uvicorn never became healthy")
        yield base
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            proc.kill()


def test_latest_endpoint_mean_latency_is_under_500ms(
    live_api: str, pool: ConnectionPool
) -> None:
    """Steady-state LOCAL PREFLIGHT for item 1.3, not the judge-facing evidence.

    Warmed, loopback, one persistent connection, ingest disabled. The number a judge reads
    comes from DevTools in the normal Compose topology under live traffic, and capturing
    that belongs to the demo-director slice. What this pins is that the server side is not
    the reason the budget would be missed.
    """
    run_id = f"lat-{uuid.uuid4().hex[:8]}"
    _seed_readings(pool, run_id, 2000)

    url = f"{live_api}/api/telemetry/{SEEDED_ASSET}/latest"
    with httpx.Client(timeout=10.0) as client:
        # Warm up separately: the FIRST call pays for the connection pool opening a
        # connection and PostgreSQL planning the statement, and folding that one-off cost
        # into the average would measure startup rather than steady-state response time.
        for _ in range(3):
            assert client.get(url).status_code == 200

        samples_ms: list[float] = []
        for _ in range(CALLS):
            started = time.perf_counter()
            resp = client.get(url)
            samples_ms.append((time.perf_counter() - started) * 1000.0)
            assert resp.status_code == 200
            body = resp.json()
            # Speed is not the only requirement: a fast endpoint returning the wrong asset
            # would otherwise sail through this test.
            assert body["asset_id"] == SEEDED_ASSET
            assert body["simulated"] is True
            assert isinstance(body["value"], float)

    mean_ms = statistics.fmean(samples_ms)
    worst_ms = max(samples_ms)

    assert mean_ms < BUDGET_MS, (
        f"mean {mean_ms:.1f}ms over {CALLS} real HTTP calls exceeds the {BUDGET_MS:.0f}ms "
        f"budget (worst {worst_ms:.1f}ms, samples {[round(s, 1) for s in samples_ms[:5]]})"
    )


def test_latest_endpoint_reports_server_timing(live_api: str, pool: ConnectionPool) -> None:
    """The judge reads DevTools, so the server-side portion must be visible there."""
    _seed_readings(pool, f"st-{uuid.uuid4().hex[:8]}", 5)

    with httpx.Client(timeout=10.0) as client:
        resp = client.get(f"{live_api}/api/telemetry/{SEEDED_ASSET}/latest")

    assert resp.status_code == 200
    timing = resp.headers.get("server-timing")
    assert timing, "no Server-Timing header; DevTools would show no server breakdown"
    assert "db" in timing, f"Server-Timing should attribute the DB portion; got {timing!r}"


def test_latest_returns_the_newest_row_not_merely_a_row(pool: ConnectionPool) -> None:
    """Ordering is the actual behaviour; a LIMIT 1 without ORDER BY would pass a weaker test."""
    from app.db import latest_reading

    run_id = f"newest-{uuid.uuid4().hex[:8]}"
    base = datetime.now(tz=UTC).replace(microsecond=0)
    stamps = [base + timedelta(seconds=s) for s in (0, 2, 1)]  # deliberately unordered

    with pool.connection() as conn:
        for i, ts in enumerate(stamps):
            reading = Reading(
                message_id=f"{run_id}-{i}", run_id=run_id, ts=ts,
                asset_id=SEEDED_ASSET, signal="pressure_bar", value=float(i),
            )
            disposition(
                conn, message_id=reading.message_id, run_id=run_id,
                raw={}, outcome=Accepted(reading),
            )

    newest = latest_reading(pool, SEEDED_ASSET)

    assert newest is not None
    assert newest.ts == max(stamps), "did not return the most recent reading"


def test_latest_is_none_for_an_asset_with_no_readings(pool: ConnectionPool) -> None:
    from app.db import latest_reading

    assert latest_reading(pool, "PWA-NO-SUCH-DEVICE") is None


def test_latency_probe_would_notice_a_slow_endpoint() -> None:
    """Guard the guard: the budget must be able to fail.

    A test that asserts `mean < 500` is only meaningful if 500 is not absurdly generous
    for the measurement being taken. This pins the comparison itself.
    """
    assert statistics.fmean([600.0, 700.0]) >= BUDGET_MS
    assert statistics.fmean([10.0, 12.0]) < BUDGET_MS


def _plan_nodes(plan: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten an EXPLAIN (FORMAT JSON) plan tree."""
    nodes = [plan]
    for child in plan.get("Plans", []):
        nodes.extend(_plan_nodes(child))
    return nodes


def test_latest_query_uses_the_index_and_does_not_scan(pool: ConnectionPool) -> None:
    """The budget is only defensible if the plan is a seek.

    A mean under 500 ms on a small fixture proves nothing — `query_range(asset, min, max)[-1]`
    would pass that too, and then fall over on a year of history. This asserts the PLAN
    rather than the wall clock, which is the part that stays true as the table grows.
    """
    from app.db import LATEST_QUERY

    _seed_readings(pool, f"plan-{uuid.uuid4().hex[:8]}", 500)

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(f"EXPLAIN (ANALYZE, FORMAT JSON) {LATEST_QUERY}", (SEEDED_ASSET,))
        row = cur.fetchone()
        assert row is not None
        explained: list[dict[str, Any]] = row[0]
        plan: dict[str, Any] = explained[0]["Plan"]

    nodes = _plan_nodes(plan)
    node_types = {n.get("Node Type", "") for n in nodes}

    assert not any("Seq Scan" in nt for nt in node_types), (
        f"the latest-reading query is scanning: {sorted(node_types)}"
    )
    # Substring-matching "Index" would also accept a bitmap scan followed by a sort, which
    # is not the ordered seek the latency budget depends on.
    assert any("Index Scan" in nt or "Index Only Scan" in nt for nt in node_types), (
        f"no ordered index scan in the plan: {sorted(node_types)}"
    )
    indexes = {n.get("Index Name", "") for n in nodes}
    assert any("asset_ts" in ix for ix in indexes), (
        f"the (asset_id, ts DESC) index was not used; got {sorted(indexes)}"
    )


def test_dlq_browse_query_is_indexed(pool: ConnectionPool) -> None:
    """Newest-first paging must not sort the whole dead_letter table each request."""
    from app.db import DLQ_QUERY

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(f"EXPLAIN (FORMAT JSON) {DLQ_QUERY}", (50, 0))
        row = cur.fetchone()
        assert row is not None
        explained: list[dict[str, Any]] = row[0]
        plan: dict[str, Any] = explained[0]["Plan"]

    node_types = {n.get("Node Type", "") for n in _plan_nodes(plan)}

    # "no Sort" alone would also pass a sequential scan with ORDER BY accidentally
    # removed, so require the index access positively.
    assert any("Index" in nt for nt in node_types), (
        f"dead_letter browse does not use an index: {sorted(node_types)}"
    )
