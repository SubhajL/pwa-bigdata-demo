"""The predictive HTTP surface — scored items 3.3 to 3.6 (slice S6).

Item 3.4 is scored *in Swagger UI*: a judge opens `/docs`, expands `POST /api/feedback`,
presses "Try it out", and must get a 200 whose body shows the row was stored. So the
OpenAPI document is asserted here as an artifact in its own right, not just the handlers
behind it.

The probe-app pattern matches `test_dlq.py`: the SAME router the real application
registers, mounted on a bare FastAPI with the state a request needs. That keeps these
tests about the response a judge sees rather than about a lifespan.
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg_pool import ConnectionPool

from app.model import get_bundle
from app.routes import predict as predict_routes
from app.scoring import ScoringDeps, score_all

FEEDBACK_PATH = "/api/feedback"
WORKLIST_PATH = "/api/worklist"


def _probe(pool: ConnectionPool | None) -> FastAPI:
    probe = FastAPI()
    probe.include_router(predict_routes.router)
    probe.state.pool = pool
    probe.state.bundle = get_bundle("")
    return probe


def _score(pool: ConnectionPool) -> None:
    bundle = get_bundle("")
    assert bundle is not None
    score_all(ScoringDeps(pool=pool, bundle=bundle), now=datetime.now(tz=UTC))


# ── registration and Swagger (no database required) ───────────────────────────────────


def test_all_four_predictive_routes_are_registered() -> None:
    """Registration is the wiring failure this project keeps guarding against."""
    from app.main import app

    with TestClient(app) as client:
        paths = client.get("/openapi.json").json()["paths"]

    assert "/api/health/{asset_id}" in paths
    assert WORKLIST_PATH in paths
    assert FEEDBACK_PATH in paths
    assert "/api/rca/{asset_id}" in paths


def test_the_feedback_endpoint_is_documented_for_swagger() -> None:
    """Item 3.4 is marked in `/docs`, so the schema a judge reads is part of the deliverable."""
    from app.main import app

    with TestClient(app) as client:
        spec = client.get("/openapi.json").json()

    operation = spec["paths"][FEEDBACK_PATH]["post"]
    assert operation["summary"], "the endpoint needs a summary; /docs shows it in the list"

    body_ref = operation["requestBody"]["content"]["application/json"]["schema"]["$ref"]
    schema = spec["components"]["schemas"][body_ref.rsplit("/", 1)[-1]]
    assert set(schema["required"]) == {"asset_id", "verdict"}
    # The four verdicts must be an enum, or Swagger renders a free-text box and the judge
    # has to guess what the field accepts.
    verdict = schema["properties"]["verdict"]
    assert set(verdict.get("enum", [])) == {"confirmed", "false_alarm", "repaired", "deferred"}


# ── item 3.4: the feedback loop ───────────────────────────────────────────────────────


@pytest.mark.integration
def test_feedback_returns_200_and_is_actually_persisted(pool: ConnectionPool) -> None:
    """"200 and persisted" — the second half is what a route that drops the body would fail."""
    payload = {
        "asset_id": "P-1",
        "verdict": "confirmed",
        "note": "ตรวจสอบแล้ว พบการสั่นสะเทือนผิดปกติ",
        "submitted_by": "tech-07",
        "predicted_health": 38.2,
        "model_version": "pwa-health-pttf-v1",
    }

    with TestClient(_probe(pool)) as client:
        resp = client.post(FEEDBACK_PATH, json=payload)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stored"] is True
    assert body["asset_id"] == "P-1" and body["verdict"] == "confirmed"

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT asset_id, verdict, note, submitted_by, predicted_health "
            "FROM feedback WHERE id = %s",
            (body["id"],),
        )
        row = cur.fetchone()

    assert row is not None, "the response reported an id that is not in the database"
    assert row[0] == "P-1" and row[1] == "confirmed"
    assert row[2] == payload["note"], "Thai text must round-trip intact"
    assert row[3] == "tech-07"
    assert row[4] == pytest.approx(38.2)


@pytest.mark.integration
def test_feedback_accepts_the_minimal_body_a_judge_types_in_swagger(
    pool: ConnectionPool,
) -> None:
    with TestClient(_probe(pool)) as client:
        resp = client.post(FEEDBACK_PATH, json={"asset_id": "P-2", "verdict": "false_alarm"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] > 0


@pytest.mark.integration
def test_feedback_about_an_unknown_device_is_refused(pool: ConnectionPool) -> None:
    """The DLQ story topic ๑ tells is that unknown asset ids are caught, not stored."""
    with TestClient(_probe(pool)) as client:
        resp = client.post(
            FEEDBACK_PATH, json={"asset_id": "PWA-UNKNOWN-DEVICE-000", "verdict": "confirmed"}
        )

    assert resp.status_code == 404
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM feedback WHERE asset_id = 'PWA-UNKNOWN-DEVICE-000'")
        assert (cur.fetchone() or [1])[0] == 0


def test_an_invalid_verdict_is_rejected_before_it_reaches_the_database() -> None:
    with TestClient(_probe(None)) as client:
        resp = client.post(FEEDBACK_PATH, json={"asset_id": "P-1", "verdict": "looks-fine"})

    assert resp.status_code == 422


# ── item 3.5: the prioritized worklist ────────────────────────────────────────────────


@pytest.mark.integration
def test_the_worklist_ranks_the_most_degraded_device_first(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object
) -> None:
    _score(pool)

    with TestClient(_probe(pool)) as client:
        items = client.get(WORKLIST_PATH).json()

    assert items, "the worklist is empty after a scoring pass"
    assert items[0]["asset_id"] == backfilled[-1], (
        "the pump with the highest wear rate must head the worklist"
    )
    assert items[0]["rank"] == 1
    assert [i["rank"] for i in items] == list(range(1, len(items) + 1))
    scores = [i["health_score"] for i in items]
    assert scores == sorted(scores), "the worklist is not ordered by risk"
    assert all(i["simulated"] is True for i in items)


@pytest.mark.integration
def test_the_worklist_honours_its_limit(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object
) -> None:
    _score(pool)

    with TestClient(_probe(pool)) as client:
        items = client.get(f"{WORKLIST_PATH}?limit=3").json()
        rejected = client.get(f"{WORKLIST_PATH}?limit=0")

    assert len(items) == 3
    assert rejected.status_code == 422


# ── items 3.2/3.3/3.6: per-device health and root cause ───────────────────────────────


@pytest.mark.integration
def test_health_scores_a_backfilled_device_through_the_shipped_artifact(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object
) -> None:
    with TestClient(_probe(pool)) as client:
        body = client.get(f"/api/health/{backfilled[-1]}").json()

    assert body["status"] in ("normal", "warning", "critical")
    assert 0.0 <= body["health_score"] <= 100.0
    assert body["pttf_hours"] >= 0.0
    assert body["model_version"]
    assert body["observed_at"] is not None
    assert body["simulated"] is True
    assert body["contributions"], "a scored device must carry its RCA contributions"


@pytest.mark.integration
def test_health_reports_nodata_with_a_reason_rather_than_inventing_a_score(
    pool: ConnectionPool, model_artifact: object
) -> None:
    """A device with no history is `nodata` and 200 — a known device, not a missing one."""
    with TestClient(_probe(pool)) as client:
        resp = client.get("/api/health/M-3")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "nodata"
    assert body["health_score"] is None
    assert body["detail"], "an unscoreable device must say why"


@pytest.mark.integration
def test_health_404s_for_a_device_that_is_not_on_the_roster(pool: ConnectionPool) -> None:
    with TestClient(_probe(pool)) as client:
        assert client.get("/api/health/PWA-UNKNOWN-DEVICE-000").status_code == 404


@pytest.mark.integration
def test_rca_names_the_top_contributing_signals(
    pool: ConnectionPool, backfilled: list[str], model_artifact: object
) -> None:
    """Item 3.6: the output must name signals, ranked, not return a bare number."""
    from pwa_ml.lifecycle import SIGNAL_FIELDS

    with TestClient(_probe(pool)) as client:
        body = client.get(f"/api/rca/{backfilled[-1]}").json()

    contributions = body["contributions"]
    assert contributions, "a degraded device must have at least one contributing signal"
    assert all(c["signal"] in SIGNAL_FIELDS for c in contributions)
    magnitudes = [abs(c["contribution"]) for c in contributions]
    assert magnitudes == sorted(magnitudes, reverse=True), "contributions must be ranked"
    assert body["simulated"] is True


@pytest.mark.integration
def test_rca_404s_for_a_device_that_is_not_on_the_roster(pool: ConnectionPool) -> None:
    with TestClient(_probe(pool)) as client:
        assert client.get("/api/rca/PWA-UNKNOWN-DEVICE-000").status_code == 404


# ── degradation: the predictive half must fail soft ───────────────────────────────────


def test_the_predictive_routes_say_so_when_there_is_no_database() -> None:
    with TestClient(_probe(None)) as client:
        assert client.get("/api/health/P-1").status_code == 503
        assert client.get(WORKLIST_PATH).status_code == 503
        feedback = client.post(FEEDBACK_PATH, json={"asset_id": "P-1", "verdict": "confirmed"})
    assert feedback.status_code == 503


@pytest.mark.integration
def test_the_verdict_check_constraint_matches_the_pydantic_literal(
    pool: ConnectionPool,
) -> None:
    """The enum lives in two places; nothing but this stops them drifting.

    Add a verdict to `Verdict` alone and `POST /api/feedback` starts returning 500 from a
    CheckViolation — on the endpoint item 3.4 is scored on. The OpenAPI test above compares
    against a hardcoded set, so it cannot see the database side.
    """
    from typing import get_args

    from app.models import Verdict

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE conrelid = 'feedback'::regclass AND contype = 'c'"
        )
        definition = " ".join(row[0] for row in cur.fetchall())

    for verdict in get_args(Verdict):
        assert f"'{verdict}'" in definition, (
            f"{verdict!r} is accepted by the API but not by the feedback CHECK constraint"
        )
