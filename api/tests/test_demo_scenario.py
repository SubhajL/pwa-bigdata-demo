"""P0 — `POST /api/demo/scenario`: gated, conserving, idempotent, model-honest.

Integration against the real throwaway TimescaleDB (CLAUDE.md forbids mock-testing the
pipeline). The scored claims pinned here:

* the endpoint is unreachable unless `DEMO_CONTROLS=1` (it can never reach a
  production path);
* every injection preserves `ledger == telemetry + dead_letter` — the conservation
  invariant `/api/pipeline/status` publishes live;
* the injected window drives the SHIPPED model to the intended band through the same
  `query_range → build_window → score_window` path the scoring loop runs (item 3.3 is a
  claim about the model, so the oracle is the model);
* `normal` removes every demo pair and re-applying any mode is clean.
"""
from __future__ import annotations

import importlib
import pathlib
import sys
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from psycopg_pool import ConnectionPool
from pwa_ml.predict import CRITICAL_BELOW, WARNING_BELOW, load_bundle, score_window

from app.db import conservation_totals, query_range
from app.features import WINDOW_HOURS, build_window

PUMP = "P-2"
VALVE = "V-9"


def _fresh_app(dsn: str, monkeypatch: pytest.MonkeyPatch, *, demo_controls: str) -> Any:
    monkeypatch.setenv("DATABASE_URL", dsn)
    monkeypatch.setenv("MQTT_ENABLED", "0")
    monkeypatch.setenv("SCORING_ENABLED", "0")
    monkeypatch.setenv("DEMO_CONTROLS", demo_controls)
    for name in ("app.main", "app.config"):
        sys.modules.pop(name, None)
    return importlib.import_module("app.main")


def purge_demo(pool: ConnectionPool) -> None:
    """Remove demo rows so the SESSION-scoped database is left as this file found it.

    Dead letters first, keyed through their `DEMO_DLQ` ledger rows — deleting the ledger
    side alone would orphan the dead letter and break conservation for every later test.
    """
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM dead_letter WHERE message_id IN "
            "(SELECT message_id FROM ingress_ledger WHERE source = 'DEMO_DLQ')"
        )
        cur.execute("DELETE FROM ingress_ledger WHERE source = 'DEMO_DLQ'")
        cur.execute("DELETE FROM telemetry WHERE source = 'DEMO'")
        cur.execute("DELETE FROM ingress_ledger WHERE source = 'DEMO'")
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("ANALYZE telemetry")


@pytest.fixture
def client(
    timescale_dsn: str, pool: ConnectionPool, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    module = _fresh_app(timescale_dsn, monkeypatch, demo_controls="1")
    with TestClient(module.app) as c:
        yield c
    purge_demo(pool)


@pytest.fixture
def locked_client(
    timescale_dsn: str, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    module = _fresh_app(timescale_dsn, monkeypatch, demo_controls="")
    with TestClient(module.app) as c:
        yield c


def _conserves(totals: dict[str, int]) -> bool:
    return totals["ledger"] == totals["telemetry"] + totals["dead_letter"]


def _window_health(pool: ConnectionPool, artifact: pathlib.Path, asset: str) -> float:
    now = datetime.now(tz=UTC)
    readings = query_range(pool, asset, now - timedelta(hours=WINDOW_HOURS), now)
    window = build_window(readings, now=now, hours=WINDOW_HOURS)
    assert window.scoreable, f"window not scoreable after injection: {window.reason}"
    return score_window(load_bundle(artifact), window.rows).health


# ── the gate ───────────────────────────────────────────────────────────────────────────


def test_post_is_403_when_demo_controls_are_off(locked_client: TestClient) -> None:
    response = locked_client.post(
        "/api/demo/scenario", json={"mode": "pressure_drop", "target": PUMP}
    )
    assert response.status_code == 403


def test_get_reports_disabled_when_demo_controls_are_off(locked_client: TestClient) -> None:
    response = locked_client.get("/api/demo/scenario")
    assert response.status_code == 200
    assert response.json()["enabled"] is False


def test_unknown_target_is_404(client: TestClient) -> None:
    response = client.post(
        "/api/demo/scenario", json={"mode": "pressure_drop", "target": "NOPE-1"}
    )
    assert response.status_code == 404


def test_non_pump_target_is_422(client: TestClient) -> None:
    # Only pumps report all five signals, so only a pump's window is scoreable.
    response = client.post(
        "/api/demo/scenario", json={"mode": "pressure_drop", "target": VALVE}
    )
    assert response.status_code == 422


def test_the_route_is_documented_in_swagger(client: TestClient) -> None:
    spec = client.get("/openapi.json").json()
    assert "/api/demo/scenario" in spec["paths"]


# ── injection ──────────────────────────────────────────────────────────────────────────


def test_pressure_drop_conserves_and_reports_a_run_id(
    client: TestClient, pool: ConnectionPool
) -> None:
    before = conservation_totals(pool)
    assert _conserves(before)
    response = client.post(
        "/api/demo/scenario", json={"mode": "pressure_drop", "target": PUMP}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["run_id"].startswith("demo-pressure_drop-")
    assert body["injected_readings"] > 0
    assert body["simulated"] is True
    after = conservation_totals(pool)
    assert _conserves(after)
    assert after["telemetry"] - before["telemetry"] == body["injected_readings"]


def test_pressure_drop_broadcasts_an_instant_below_band_warning(
    client: TestClient,
) -> None:
    from app.bands import SIGNAL_BANDS
    from app.models import TwinEvent

    events: list[TwinEvent] = []

    class Hub:
        def broadcast(self, event: TwinEvent) -> None:
            events.append(event)

        def close(self) -> None:  # lifespan shutdown calls this on any non-None hub
            return None

    client.app.state.twin_hub = Hub()  # type: ignore[attr-defined]
    response = client.post(
        "/api/demo/scenario", json={"mode": "pressure_drop", "target": PUMP}
    )
    assert response.status_code == 200
    assert len(events) == 1
    frame = events[0]
    assert frame.kind == "status"
    assert frame.asset_id == PUMP
    assert frame.status == "warning"
    assert frame.signal == "pressure_bar"
    assert frame.value is not None and frame.value < SIGNAL_BANDS["pressure_bar"][0]


def test_injected_window_scores_critical_through_the_shipped_model(
    client: TestClient, pool: ConnectionPool, model_artifact: pathlib.Path
) -> None:
    response = client.post(
        "/api/demo/scenario", json={"mode": "pressure_drop", "target": PUMP}
    )
    assert response.status_code == 200
    health = _window_health(pool, model_artifact, PUMP)
    assert health < CRITICAL_BELOW, f"injected window scored {health:.1f}"


def test_normal_removes_demo_pairs_and_scores_healthy(
    client: TestClient, pool: ConnectionPool, model_artifact: pathlib.Path
) -> None:
    drop = client.post(
        "/api/demo/scenario", json={"mode": "pressure_drop", "target": PUMP}
    ).json()
    response = client.post("/api/demo/scenario", json={"mode": "normal", "target": PUMP})
    assert response.status_code == 200
    body = response.json()
    assert body["removed_rows"] == drop["injected_readings"]
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM telemetry WHERE run_id = %s", (drop["run_id"],))
        assert (cur.fetchone() or [0])[0] == 0
    assert _conserves(conservation_totals(pool))
    health = _window_health(pool, model_artifact, PUMP)
    assert health >= WARNING_BELOW, f"reset window scored {health:.1f}"


def test_reapplying_the_same_mode_REPLACES_rather_than_accumulates(
    client: TestClient, pool: ConnectionPool, model_artifact: pathlib.Path
) -> None:
    first = client.post(
        "/api/demo/scenario", json={"mode": "pressure_drop", "target": PUMP}
    ).json()
    second = client.post(
        "/api/demo/scenario", json={"mode": "pressure_drop", "target": PUMP}
    ).json()
    assert first["run_id"] != second["run_id"]
    # Each application atomically deletes the target's previous demo pairs first, so
    # rows never pile up across re-applies (Codex plan: replacement, not accumulation).
    assert second["removed_rows"] == first["injected_readings"]
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM telemetry WHERE source = 'DEMO'")
        assert (cur.fetchone() or [0])[0] == second["injected_readings"]
    assert _conserves(conservation_totals(pool))
    health = _window_health(pool, model_artifact, PUMP)
    assert health < CRITICAL_BELOW


def test_reset_preserves_every_other_source(client: TestClient, pool: ConnectionPool) -> None:
    # The provenance-keyed delete must never touch MQTT or BACKFILL rows — deleting real
    # evidence would be the mirror image of fabricating it.
    client.post("/api/demo/scenario", json={"mode": "pressure_drop", "target": PUMP})
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM telemetry WHERE source <> 'DEMO'")
        before = (cur.fetchone() or [0])[0]
    client.post("/api/demo/scenario", json={"mode": "normal", "target": PUMP})
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM telemetry WHERE source <> 'DEMO'")
        assert (cur.fetchone() or [0])[0] == before


def test_a_concurrent_apply_for_the_same_target_is_refused(
    client: TestClient, pool: ConnectionPool
) -> None:
    # Two operators (or the E2E and a human) racing the same pump would interleave the
    # delete/solve/insert and double-steer the means; the advisory lock fails the loser
    # fast with 409 instead.
    with pool.connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"demo-scenario:{PUMP}",))
        response = client.post(
            "/api/demo/scenario", json={"mode": "pressure_drop", "target": PUMP}
        )
    assert response.status_code == 409


def test_bad_asset_adds_one_dead_letter_pair_and_no_telemetry(
    client: TestClient, pool: ConnectionPool
) -> None:
    before = conservation_totals(pool)
    response = client.post("/api/demo/scenario", json={"mode": "bad_asset"})
    assert response.status_code == 200
    assert response.json()["dead_letters"] == 1
    after = conservation_totals(pool)
    assert after["dead_letter"] - before["dead_letter"] == 1
    assert after["telemetry"] == before["telemetry"]
    assert _conserves(after)


def test_a_forged_message_id_collision_fails_loudly_and_writes_nothing(
    pool: ConnectionPool,
) -> None:
    # `message_id` is a wire-forgeable namespace (`service._classify` copies it verbatim),
    # so a publisher could pre-claim an id a demo run would later use. The batch insert
    # must then RAISE and roll back the whole replacement — an ON CONFLICT skip on the
    # ledger side while telemetry still inserts would silently break conservation.
    from datetime import datetime as dt

    from app import demo

    forged = "forged-demo-collision-id"
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO ingress_ledger (message_id, run_id, outcome, raw) "
            "VALUES (%s, 'forger', 'TELEMETRY', '{}')",
            (forged,),
        )
    try:
        row = demo._InjectedReading(dt.now(tz=UTC), PUMP, "pressure_bar", 3.0, forged)
        with pytest.raises(Exception, match="(?i)duplicate|unique"):
            with pool.connection() as conn, conn.transaction():
                demo._insert_pairs(conn, [row], "demo-test-collision")
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM telemetry WHERE message_id = %s", (forged,))
            assert (cur.fetchone() or [0])[0] == 0, "telemetry row written despite ledger skip"
    finally:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM ingress_ledger WHERE message_id = %s", (forged,))


def test_get_reports_the_newest_demo_run_id(client: TestClient) -> None:
    posted = client.post(
        "/api/demo/scenario", json={"mode": "anomaly", "target": PUMP}
    ).json()
    status = client.get("/api/demo/scenario").json()
    assert status["enabled"] is True
    assert status["active_run_id"] == posted["run_id"]
