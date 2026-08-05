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


def _window_top_signal(pool: ConnectionPool, artifact: pathlib.Path, asset: str) -> str:
    """The top RCA contribution for the asset's CURRENT window — what /api/rca serves."""
    now = datetime.now(tz=UTC)
    readings = query_range(pool, asset, now - timedelta(hours=WINDOW_HOURS), now)
    window = build_window(readings, now=now, hours=WINDOW_HOURS)
    assert window.scoreable, f"window not scoreable after injection: {window.reason}"
    score = score_window(load_bundle(artifact), window.rows)
    assert score.contributions, "no contributions for a scoreable window"
    return score.contributions[0].signal


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


def test_an_implausible_solve_maps_to_422_not_500(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The fail-closed `ScenarioImplausible` guard must surface as a 422 the operator can
    read — a refactor collapsing the except clauses would turn it into a 500 mid-demo,
    and no test executed the mapping (review-workflow MEDIUM, coverage-proven)."""
    from app import demo as demo_module
    from app.routes import demo as demo_route

    def refuse(*args: object, **kwargs: object) -> object:
        raise demo_module.ScenarioImplausible("bucket too full; refusing implausible values")

    monkeypatch.setattr(demo_route, "apply_scenario", refuse)
    response = client.post(
        "/api/demo/scenario", json={"mode": "bearing_anomaly", "target": PUMP}
    )
    assert response.status_code == 422
    assert "implausible" in response.json()["detail"]


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


def test_scenario_freshens_the_sec_pair_for_item_2_3(
    client: TestClient, pool: ConnectionPool
) -> None:
    """The induced anomaly must make the SEC derivation computable ON CUE (item 2.3).

    The live simulator publishes one signal per device visit, so the pump's newest
    power/flow pair ages with the round-robin: on the 238-device roster its skew
    alternates ~95 s / ~143 s, and /api/twin/sec refuses the ~143 s phase (budget 120 s)
    — an induced anomaly would show an em dash for ~40% of wall-clock time. Every
    telemetry scenario therefore injects the hour-0 trajectory values for BOTH SEC
    inputs at `now`, pinning the pair skew to ~0 the moment the button is pressed.
    """
    response = client.post("/api/demo/scenario", json={"mode": "anomaly", "target": PUMP})
    assert response.status_code == 200
    run_id = response.json()["run_id"]
    with pool.connection() as conn, conn.cursor() as cur:
        # Keyed by the run's own instant message_ids — no wall-clock window, so a slow
        # insert/ANALYZE can never turn this into a timing failure.
        cur.execute(
            "SELECT DISTINCT signal FROM telemetry"
            " WHERE asset_id = %s AND source = 'DEMO' AND message_id LIKE %s",
            (PUMP, f"{run_id}:instant:%"),
        )
        fresh = {row[0] for row in cur.fetchall()}
    assert {"vibration", "power_kw", "flow_m3h"} <= fresh, (
        f"scenario must lay a fresh SEC pair at now; got only {sorted(fresh)}"
    )
    sec = client.get(f"/api/twin/sec/{PUMP}").json()
    assert sec["sec_kwh_per_m3"] is not None
    assert sec["power_kw"] is not None and sec["flow_m3h"] is not None
    assert sec["skew_s"] is not None and sec["skew_s"] <= 5.0

    # Recovery keeps the derivation computable too: `normal` REPLACES with the healthy
    # trajectory and its own fresh pair.
    assert client.post(
        "/api/demo/scenario", json={"mode": "normal", "target": PUMP}
    ).status_code == 200
    sec = client.get(f"/api/twin/sec/{PUMP}").json()
    assert sec["sec_kwh_per_m3"] is not None
    assert sec["skew_s"] is not None and sec["skew_s"] <= 5.0


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
    # A replacement supersedes the twin's COMPLETE per-signal state — one frame per
    # signal, the primary band transition FIRST (g-check HIGH: a partial broadcast let a
    # prior mode's warning survive recovery on an open page).
    assert len(events) == 5
    frame = events[0]
    assert frame.kind == "status"
    assert frame.asset_id == PUMP
    assert frame.status == "warning"
    assert frame.signal == "pressure_bar"
    assert {e.signal for e in events} == {
        "pressure_bar", "vibration", "bearing_temp_c", "power_kw", "flow_m3h",
    }
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


def test_bearing_anomaly_gives_a_DIFFERENT_top_cause_than_anomaly(
    client: TestClient, pool: ConnectionPool, model_artifact: pathlib.Path
) -> None:
    """Item 3.6's browser proof needs two allow-listed scenarios whose TOP rendered causes
    differ. `anomaly` and `pressure_drop` both ride the WORN trajectory, whose vibration
    dominates attribution no matter which instant is injected — so `bearing_anomaly` rides
    the HEALTHY trajectory with every `bearing_temp_c` bucket pinned above band: the
    deviating signal IS the cause, the exact counterfactual shape
    `ml/tests/test_model.py::test_rca_REVERSES_between_two_different_anomalies` proves the
    model discriminates on."""
    vib = client.post("/api/demo/scenario", json={"mode": "anomaly", "target": PUMP})
    assert vib.status_code == 200
    assert _window_top_signal(pool, model_artifact, PUMP) == "vibration"

    bearing = client.post(
        "/api/demo/scenario", json={"mode": "bearing_anomaly", "target": PUMP}
    )
    assert bearing.status_code == 200
    assert bearing.json()["injected_readings"] > 0
    assert _window_top_signal(pool, model_artifact, PUMP) == "bearing_temp_c"
    # The cause a judge reads must come WITH a visible symptom: pin the health degrade in
    # the SAME test that names discrimination, so relaxing the sibling health test can
    # never silently orphan the trajectory pin (review-workflow MEDIUM, mutation-proven).
    assert _window_health(pool, model_artifact, PUMP) < WARNING_BELOW


def test_bearing_anomaly_still_degrades_health_out_of_normal(
    client: TestClient, pool: ConnectionPool, model_artifact: pathlib.Path
) -> None:
    """A cause a judge can SEE needs a symptom a judge can see: the healthy-trajectory
    bearing anomaly must still pull health below the normal band, or the worklist/twin
    would show a 'normal' device whose RCA claims a fault."""
    response = client.post(
        "/api/demo/scenario", json={"mode": "bearing_anomaly", "target": PUMP}
    )
    assert response.status_code == 200
    health = _window_health(pool, model_artifact, PUMP)
    assert health < WARNING_BELOW, f"bearing-anomaly window scored {health:.1f} — still normal"


def test_every_replacement_supersedes_all_five_per_signal_states(
    client: TestClient, pool: ConnectionPool, model_artifact: pathlib.Path
) -> None:
    """The twin keeps independent per-signal states and renders their MAX severity, and a
    state persists until a NEWER frame for the SAME signal (g-check HIGH): after
    `bearing_anomaly`, a `normal` application must broadcast an IN-BAND bearing frame —
    and one frame per signal — or the stale bearing warning survives recovery forever on
    an open page."""
    from app.demo import apply_scenario
    from app.ingest import SIGNALS

    bearing = client.post(
        "/api/demo/scenario", json={"mode": "bearing_anomaly", "target": PUMP}
    )
    assert bearing.status_code == 200

    result = apply_scenario(
        pool, mode="normal", target=PUMP, now=datetime.now(tz=UTC), run_id="test-recovery"
    )
    by_signal = {e.signal: e for e in result.events if e.signal is not None}
    assert set(by_signal) == set(SIGNALS.values()), (
        f"normal must supersede EVERY signal state; got only {sorted(map(str, by_signal))}"
    )
    # ALL five recovery frames classify in-band — pinning only the bearing would let a
    # different signal's stale warning survive the same way (review-workflow LOW).
    off_band = {s: e.status for s, e in by_signal.items() if e.status != "normal"}
    assert not off_band, f"normal recovery frames classified out of band: {off_band}"


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
