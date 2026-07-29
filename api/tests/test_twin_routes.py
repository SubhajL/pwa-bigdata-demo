"""T4 / T8 / T9 — the twin's read routes (DREP-PR7 R3, R8, R10).

SEC is the one with a real trap. Telemetry stores ONE SIGNAL PER ROW and the simulator
cycles signals, so the newest `power_kw` and the newest `flow_m3h` normally have DIFFERENT
timestamps. Computing kWh/m³ from two readings taken far apart produces a confident number
about nothing, and a judge cannot tell. These tests pin each signal's own timestamp, the
skew refusal, and — critically — that an em dash is expressed as `200 + null`, not `404`.

Authored by Claude; the implementer must not modify this file (DREP §10).
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from psycopg_pool import ConnectionPool

from app.db import latest_signal_pair

PUMP = "P-2"


@pytest.fixture
def client(timescale_dsn: str, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", timescale_dsn)
    monkeypatch.setenv("MQTT_ENABLED", "0")
    monkeypatch.setenv("SCORING_ENABLED", "0")
    import importlib
    import sys

    for name in ("app.main", "app.config"):
        sys.modules.pop(name, None)
    module = importlib.import_module("app.main")
    return TestClient(module.app)


def _insert(pool: ConnectionPool, asset: str, signal: str, value: float, ts: datetime) -> None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO telemetry (ts, asset_id, signal, value) VALUES (%s,%s,%s,%s)",
            (ts, asset, signal, value),
        )
        conn.commit()


def _purge(pool: ConnectionPool, asset: str) -> None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM telemetry WHERE asset_id = %s", (asset,))
        conn.commit()


# ── T4: SEC ───────────────────────────────────────────────────────────────────────────


def test_latest_signal_pair_takes_the_newest_of_EACH_signal(pool: ConnectionPool) -> None:
    """A decoy proves it is per-signal, not "newest row of any signal"."""
    now = datetime.now(tz=UTC)
    _purge(pool, PUMP)
    try:
        _insert(pool, PUMP, "power_kw", 10.0, now - timedelta(seconds=60))
        _insert(pool, PUMP, "flow_m3h", 100.0, now - timedelta(seconds=50))
        # Newer power. A "newest row overall" implementation returns this AND loses flow.
        _insert(pool, PUMP, "power_kw", 20.0, now - timedelta(seconds=10))

        pair = latest_signal_pair(pool, PUMP)
        assert pair.power_kw == 20.0
        assert pair.flow_m3h == 100.0
        # Each carries its OWN timestamp; a single `as_of` could not describe both.
        assert pair.power_observed_at is not None and pair.flow_observed_at is not None
        assert pair.power_observed_at > pair.flow_observed_at
        assert pair.skew_s == pytest.approx(40.0, abs=1.0)
    finally:
        _purge(pool, PUMP)


def test_sec_is_power_over_flow(client: TestClient, pool: ConnectionPool) -> None:
    now = datetime.now(tz=UTC)
    _purge(pool, PUMP)
    try:
        _insert(pool, PUMP, "power_kw", 30.0, now)
        _insert(pool, PUMP, "flow_m3h", 120.0, now)
        with client:
            body = client.get(f"/api/twin/sec/{PUMP}").json()
        assert body["sec_kwh_per_m3"] == pytest.approx(0.25)
        assert body["simulated"] is True
    finally:
        _purge(pool, PUMP)


def test_zero_flow_yields_null_not_zero_and_not_an_error(
    client: TestClient, pool: ConnectionPool
) -> None:
    """`pwa_ml.specific_energy_consumption` returns None for non-positive flow. The route
    must surface that as a successful 200 with null, so the UI can render an em dash."""
    now = datetime.now(tz=UTC)
    _purge(pool, PUMP)
    try:
        _insert(pool, PUMP, "power_kw", 30.0, now)
        _insert(pool, PUMP, "flow_m3h", 0.0, now)
        with client:
            response = client.get(f"/api/twin/sec/{PUMP}")
        assert response.status_code == 200
        assert response.json()["sec_kwh_per_m3"] is None
    finally:
        _purge(pool, PUMP)


def test_a_known_pump_with_no_readings_is_200_and_null_NOT_404(
    client: TestClient, pool: ConnectionPool
) -> None:
    """404 means "no such device". A pump that simply has not reported flow yet is a
    different thing, and reporting it as missing sends an operator hunting for hardware."""
    _purge(pool, PUMP)
    with client:
        response = client.get(f"/api/twin/sec/{PUMP}")
    assert response.status_code == 200
    body = response.json()
    assert body["sec_kwh_per_m3"] is None
    assert body["detail"], "a null SEC must say why"


def test_an_unknown_asset_is_404(client: TestClient) -> None:
    with client:
        assert client.get("/api/twin/sec/NOT-A-DEVICE").status_code == 404


def test_widely_separated_readings_refuse_to_produce_a_number(
    client: TestClient, pool: ConnectionPool
) -> None:
    """The trap this file exists for: power from now and flow from an hour ago would divide
    perfectly happily and mean nothing."""
    now = datetime.now(tz=UTC)
    _purge(pool, PUMP)
    try:
        _insert(pool, PUMP, "power_kw", 30.0, now)
        # 200s: ABOVE the 120s skew budget but INSIDE the 300s staleness window, so this
        # exercises the SKEW guard specifically. An hour-old reading would exit through
        # staleness first and the test would pass with the skew guard deleted.
        _insert(pool, PUMP, "flow_m3h", 120.0, now - timedelta(seconds=200))
        with client:
            response = client.get(f"/api/twin/sec/{PUMP}")
        assert response.status_code == 200
        body = response.json()
        assert body["sec_kwh_per_m3"] is None, "a number here would be authoritative nonsense"
        assert body["detail"]
        assert body["skew_s"] == pytest.approx(200.0, abs=5.0)
    finally:
        _purge(pool, PUMP)


# ── T8: topology route ────────────────────────────────────────────────────────────────


def test_topology_route_serves_geometry_from_the_database(client: TestClient) -> None:
    with client:
        response = client.get("/api/twin/topology")
    assert response.status_code == 200
    body = response.json()
    assert body["pipes"] and body["nodes"] and body["devices"]
    for pipe in body["pipes"]:
        assert all(pipe[k] is not None for k in ("x1", "y1", "x2", "y2"))
    node_ids = {n["node"] for n in body["nodes"]}
    for device in body["devices"]:
        assert device["node"] in node_ids
        assert device["x"] is not None and device["y"] is not None
    assert body["simulated"] is True


def test_impact_route_returns_the_hand_computed_set(client: TestClient) -> None:
    with client:
        response = client.get("/api/twin/impact/PIPE-N1-N2")
    assert response.status_code == 200
    body = response.json()
    assert {c["customer_id"] for c in body["customers"]} == {"72-1-00002", "72-1-00004"}
    assert body["count"] == 2
    with client:
        assert client.get("/api/twin/impact/PIPE-NOPE").status_code == 404


# ── T9: the new query shape must not scan history ─────────────────────────────────────


def test_latest_per_signal_query_uses_the_new_index(pool: ConnectionPool) -> None:
    """`test_latency.py` pins LATEST_QUERY only, and would stay green while THIS query
    sorted the whole hypertable — the same class of regression it caught once before."""
    from app.db import LATEST_PER_SIGNAL_QUERY

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("ANALYZE telemetry")
        cur.execute(
            f"EXPLAIN (FORMAT JSON) {LATEST_PER_SIGNAL_QUERY}",
            (PUMP, ["power_kw", "flow_m3h"]),
        )
        row = cur.fetchone()
        assert row is not None
        plan: dict[str, Any] = row[0][0]["Plan"]

    nodes: list[dict[str, Any]] = []

    def walk(node: dict[str, Any]) -> None:
        nodes.append(node)
        for child in node.get("Plans") or []:
            walk(child)

    walk(plan)
    node_types = {str(n.get("Node Type", "")) for n in nodes}
    assert any("Index" in t for t in node_types), f"no index scan in the plan: {sorted(node_types)}"
    indexes = {str(n.get("Index Name", "")) for n in nodes}
    assert any("asset_signal_ts" in ix for ix in indexes), (
        f"the (asset_id, signal, ts DESC) index was not used; got {sorted(indexes)}"
    )
