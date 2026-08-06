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


def _build_client(dsn: str, monkeypatch: pytest.MonkeyPatch, *, mtp: bool) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", dsn)
    monkeypatch.setenv("MQTT_ENABLED", "0")
    monkeypatch.setenv("SCORING_ENABLED", "0")
    monkeypatch.setenv("MTP_CUSTOMER_IMPACT_ENABLED", "1" if mtp else "0")
    import importlib
    import sys

    for name in ("app.main", "app.config"):
        sys.modules.pop(name, None)
    module = importlib.import_module("app.main")
    return TestClient(module.app)


@pytest.fixture
def client(timescale_dsn: str, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """The API with the Map Ta Phut customer feature OFF (the default)."""
    return _build_client(timescale_dsn, monkeypatch, mtp=False)


@pytest.fixture
def mtp_client(timescale_dsn: str, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """The API with `MTP_CUSTOMER_IMPACT_ENABLED=1` — enriched impact + detail/zone routes live."""
    return _build_client(timescale_dsn, monkeypatch, mtp=True)


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


def test_impact_route_is_basic_and_never_the_five_when_feature_off(client: TestClient) -> None:
    """Feature off (the default): the last leg's 80 accounts, basic shape, enriched fields null,
    and NEVER the retired five 72-1-* rows."""
    with client:
        response = client.get("/api/twin/impact/PIPE-N1-N2")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 80
    assert body["type_breakdown"] is None, "enriched breakdown must be null when the feature is off"
    assert body["zone"] is None
    assert all(not c["customer_id"].startswith("72-1-") for c in body["customers"])
    assert all(c["type_code"] is None for c in body["customers"]), "enriched fields null when off"
    with client:
        assert client.get("/api/twin/impact/PIPE-NOPE").status_code == 404


def test_impact_route_is_enriched_when_feature_on(mtp_client: TestClient) -> None:
    with mtp_client:
        response = mtp_client.get("/api/twin/impact/PIPE-TANK-V9")
    assert response.status_code == 200
    body = response.json()
    assert len(body["customers"]) == body["count"] == 200
    assert body["zone"] == "MTP-LPZ-01"
    assert body["type_breakdown"] == {"type_1": 140, "type_2": 35, "type_3": 25}
    # EVERY affected account carries ALL its enriched fields, not just type_code (Codex §3).
    assert all(
        c["type_code"] is not None and c["subtype_code"] is not None
        and c["account_no"] is not None and c["meter_no"] is not None
        and c["latest_usage_m3"] is not None
        for c in body["customers"]
    )


def test_customer_detail_returns_twelve_consistent_readings(mtp_client: TestClient) -> None:
    with mtp_client:
        response = mtp_client.get("/api/twin/customers/SIM-MTP-00001")
    assert response.status_code == 200
    body = response.json()
    assert body["customer_id"] == "SIM-MTP-00001"
    assert body["account_no"] == "SIM-MTP-ACC-00001"
    assert body["profile_version"] == "mtp-low-pressure-200-v1"
    periods = [r["period"] for r in body["readings"]]
    assert len(periods) == 12 and periods == sorted(periods) and len(set(periods)) == 12
    for r in body["readings"]:
        assert r["usage_m3"] == r["reading_m3"] - r["previous_reading_m3"]


def test_customer_detail_rejects_unknown_and_non_demo_ids(mtp_client: TestClient) -> None:
    with mtp_client:
        assert mtp_client.get("/api/twin/customers/NOPE").status_code == 404
        assert mtp_client.get("/api/twin/customers/72-1-00001").status_code == 404


def test_customer_detail_is_404_for_every_id_when_feature_off(client: TestClient) -> None:
    with client:
        assert client.get("/api/twin/customers/SIM-MTP-00001").status_code == 404


def test_customer_detail_maps_a_data_integrity_error_to_503(
    mtp_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A stored history that is not 12 continuous months raises ValueError in the topology layer;
    the route must surface a CONTROLLED 503, never a bare 500 traceback (g2-qcheck round 2)."""
    from app import topology

    def _raise(*_args: object, **_kwargs: object) -> object:
        raise ValueError("corrupt history")

    monkeypatch.setattr(topology, "get_demo_customer_detail", _raise)
    with mtp_client:
        response = mtp_client.get("/api/twin/customers/SIM-MTP-00001")
    assert response.status_code == 503


def test_impact_zone_is_simulated_geojson(mtp_client: TestClient) -> None:
    with mtp_client:
        response = mtp_client.get(
            "/api/twin/gis/impact-zones?scenario_id=mtp-low-pressure-200-v1"
        )
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert body["provenance"] == "SIMULATED_LOW_PRESSURE_FOOTPRINT"
    assert body["zone_id"] == "MTP-LPZ-01"
    assert len(body["features"]) == 1  # exactly the one simulated footprint polygon
    assert body["features"][0]["geometry"]["type"] == "Polygon"
    assert body["features"][0]["properties"]["simulated"] is True


def test_impact_zone_defaults_to_active_profile_and_rejects_unknown(
    mtp_client: TestClient,
) -> None:
    with mtp_client:
        assert mtp_client.get("/api/twin/gis/impact-zones").status_code == 200
        assert mtp_client.get("/api/twin/gis/impact-zones?scenario_id=nope").status_code == 404


def test_impact_zone_is_404_when_feature_off(client: TestClient) -> None:
    with client:
        assert client.get("/api/twin/gis/impact-zones").status_code == 404


def test_new_routes_and_enriched_schema_are_documented_in_openapi(client: TestClient) -> None:
    with client:
        spec = client.get("/openapi.json").json()
    paths = spec["paths"]
    assert "/api/twin/customers/{customer_id}" in paths
    assert "/api/twin/gis/impact-zones" in paths
    schemas = spec["components"]["schemas"]
    assert "type_breakdown" in schemas["ImpactResponse"]["properties"]
    assert "DemoCustomerDetail" in schemas
    assert "readings" in schemas["DemoCustomerDetail"]["properties"]
    assert "ImpactZoneCollection" in schemas


def test_web_contract_fixture_matches_openapi(client: TestClient) -> None:
    """The committed TS fixture PR-J builds against must be a strict subset of the live
    FastAPI schema — so the Python models and the TypeScript interfaces cannot drift apart
    (Codex 0.8). Combined with web mtpContract.test.ts this pins Python <-> fixture <-> TS."""
    import json
    import pathlib

    repo_root = pathlib.Path(__file__).resolve().parents[2]
    fixture = json.loads(
        (repo_root / "web/src/features/twin/__fixtures__/mtp-contract.json").read_text(
            encoding="utf-8"
        )
    )
    with client:
        schemas = client.get("/openapi.json").json()["components"]["schemas"]

    def keys_equal(obj: dict[str, object], schema_name: str) -> None:
        # EXACT set equality (not subset): catches a new OR missing OpenAPI field in either
        # direction, so the fixture PR-J builds against cannot silently drift (Codex §7).
        fixture_keys = set(obj)
        schema_keys = set(schemas[schema_name]["properties"])
        assert fixture_keys == schema_keys, (
            f"{schema_name}: fixture {sorted(fixture_keys)} != OpenAPI {sorted(schema_keys)}"
        )

    impact = fixture["impact"]
    keys_equal(impact, "ImpactResponse")
    keys_equal(impact["type_breakdown"], "TypeBreakdown")
    keys_equal(fixture["detail"], "DemoCustomerDetail")
    keys_equal(fixture["zone"], "ImpactZoneCollection")
    # Every array member, not just [0] — an extra key on customer 2 would evade a [0]-only check
    # (g2-qcheck round 4, Codex).
    for customer in impact["customers"]:
        keys_equal(customer, "AffectedCustomer")
    for reading in fixture["detail"]["readings"]:
        keys_equal(reading, "DemoMeterReading")
    for feature in fixture["zone"]["features"]:
        keys_equal(feature, "ImpactZoneFeature")

    assert impact["count"] == 200
    assert len(impact["customers"]) == impact["count"]  # the fixture is the FULL response
    breakdown = impact["type_breakdown"]
    assert breakdown["type_1"] + breakdown["type_2"] + breakdown["type_3"] == 200
    assert len(fixture["detail"]["readings"]) == 12


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
