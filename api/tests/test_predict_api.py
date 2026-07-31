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

import json
import pathlib
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg_pool import ConnectionPool

from app.model import get_bundle, read_model_card, resolve_model_path
from app.routes import predict as predict_routes
from app.scoring import ScoringDeps, score_all

FEEDBACK_PATH = "/api/feedback"
WORKLIST_PATH = "/api/worklist"
MODEL_PATH = "/api/model"


def _probe(pool: ConnectionPool | None) -> FastAPI:
    probe = FastAPI()
    probe.include_router(predict_routes.router)
    probe.state.pool = pool
    probe.state.bundle = get_bundle("")
    # /api/model reads the card from the sibling of the RESOLVED artifact, exactly as the
    # real lifespan stashes it — wiring it here keeps card↔model parity in the test too.
    probe.state.model_path = resolve_model_path("")
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


# ── items 3.1 / 3.2: the trained-model card and the two-dataset comparison (S9-A) ──────
#
# `GET /api/model` is the on-screen source for item 3.1 (algorithm + params) and item 3.2
# (Health/PTTF differ across two datasets). It reads the card that shipped WITH the loaded
# artifact and scores the two RESERVED demo lifecycles through that same artifact — the
# exact windows the canonical `ml/tests/test_model.py::test_health_and_pttf_separate_...`
# uses, so what a judge reads here is the model's blessed A/B, not a second implementation.

#: The reserved demo lifecycle ids (committed in `demo/datasets/manifest.json`). Asserting
#: them proves the endpoint scored the reserved pair, not two arbitrary devices.
RESERVED_HEALTHY = "lc-20260729-000"
RESERVED_DEGRADED = "lc-20260729-009"


def test_model_endpoint_is_registered_and_documented() -> None:
    """Registration is the wiring failure this project keeps guarding against (item 3.1)."""
    from app.main import app

    with TestClient(app) as client:
        spec = client.get("/openapi.json").json()

    assert MODEL_PATH in spec["paths"], "GET /api/model is not registered"
    operation = spec["paths"][MODEL_PATH]["get"]
    assert operation["summary"], "the endpoint needs a summary; /docs shows it in the list"
    body_ref = operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    assert body_ref.rsplit("/", 1)[-1] == "ModelCardResponse"


def test_model_endpoint_serves_the_card_and_two_separating_datasets(
    model_artifact: object,
) -> None:
    """Item 3.1 card + item 3.2 A/B, scored through the SHIPPED artifact.

    The separation floor mirrors `test_model.py`: a bare `>` would pass for an epsilon
    scorer that tells an operator nothing. No database — `/api/model` scores in memory.
    """
    with TestClient(_probe(None)) as client:
        resp = client.get(MODEL_PATH)

    assert resp.status_code == 200, resp.text
    body = resp.json()

    # item 3.1 — the trained model, its algorithm and parameters — BOTH estimators, not just one
    assert body["model_version"] == "pwa-health-pttf-v1"
    for target in ("health", "pttf"):
        assert body["pipelines"][target]["estimator_class"] == "Ridge"
        assert body["pipelines"][target]["preprocessing"] == ["StandardScaler"]
        assert body["metrics"][target]["model_mae"] < body["metrics"][target]["baseline_mae"], (
            f"the {target} model does not beat its baseline — the card's evidence is empty"
        )
    assert body["pipelines"]["health"]["hyperparameters"]["alpha"] == 1.0
    assert body["data_sha256"], "the card must record the training-data hash"
    assert body["simulated"] is True

    # item 3.2 — Health and PTTF differ materially between a healthy and a degraded dataset
    datasets = {d["name"]: d for d in body["datasets"]}
    assert set(datasets) == {"healthy", "degraded"}
    healthy, degraded = datasets["healthy"], datasets["degraded"]
    assert healthy["lifecycle_id"] == RESERVED_HEALTHY
    assert degraded["lifecycle_id"] == RESERVED_DEGRADED
    # The healthy device reads healthy; the degraded device reads degraded — not merely a
    # numeric gap, but the right SIDE of the bands (a device about to fail is warning/critical).
    assert healthy["status"] == "normal"
    assert degraded["status"] in ("warning", "critical")
    # HONESTY: the degraded device is scored at an IN-DOMAIN pre-failure window (a device about
    # to fail, retaining some health), NOT a post-failure window the model never trained on
    # (which saturates to exactly 0). A degraded score of 0.0 here means the window is wrong.
    assert degraded["health_score"] > 0.0, (
        "degraded health saturated to 0 — scored a post-failure, out-of-training-domain window "
        "instead of the honest last-window-before-failure"
    )
    assert healthy["health_score"] - degraded["health_score"] >= 15.0, (
        f"health barely moved between healthy and degraded "
        f"({healthy['health_score']:.1f} vs {degraded['health_score']:.1f}) — an epsilon "
        "difference satisfies a bare `>` while telling an operator nothing"
    )
    # STRICT: identical PTTF on two different-health devices would be a broken PTTF head.
    assert healthy["pttf_hours"] > degraded["pttf_hours"]
    # The extrapolation flag is SURFACED, not dropped: a censored healthy run's PTTF is
    # "at least this long", and hiding that would present an out-of-range value as exact.
    assert healthy["pttf_out_of_range"] is True
    assert degraded["pttf_out_of_range"] is False


def test_model_endpoint_503_when_the_card_does_not_match_the_loaded_model(
    model_artifact: object, tmp_path: pathlib.Path
) -> None:
    """Card↔model parity: a card whose `model_version` differs from the loaded bundle must
    NOT be served as if it described that model (Codex H1).

    The card is the REAL, otherwise-complete card with ONLY its version changed, so the parity
    check is the sole reason for the 503 — remove that check and this 200s (non-vacuous).
    """
    artifact = resolve_model_path("")
    assert artifact is not None, "the model_artifact fixture guarantees a resolvable artifact"
    card = read_model_card(artifact.parent)
    card["model_version"] = "SOME-OTHER-MODEL"
    (tmp_path / "model_card.json").write_text(json.dumps(card), encoding="utf-8")
    probe = _probe(None)
    probe.state.model_path = tmp_path / "model.pkl"  # sibling card is the mismatched one

    with TestClient(probe) as client:
        assert client.get(MODEL_PATH).status_code == 503


@pytest.mark.parametrize(
    "bad_card",
    [
        pytest.param("not-a-json-object", id="json-scalar"),
        pytest.param(
            {
                "model_version": "pwa-health-pttf-v1",
                "pipelines": {},
                "metrics": {},
                "data_sha256": "",
            },
            id="empty-estimators",
        ),
        pytest.param(
            # `set(7)` in the completeness guard raises TypeError — must 503, not 500.
            {
                "model_version": "pwa-health-pttf-v1",
                "pipelines": 7,
                "metrics": {},
                "data_sha256": "",
            },
            id="pipelines-not-a-mapping",
        ),
    ],
)
def test_model_endpoint_503_on_a_structurally_broken_card(
    model_artifact: object, tmp_path: pathlib.Path, bad_card: object
) -> None:
    """Structural corruption degrades to 503, never 500 or an empty 200: a non-object card
    (would AttributeError on `.get`), and a right-version card with no estimators (would serve
    an empty 200) both fail closed (Codex MEDIUM 503-isolation)."""
    (tmp_path / "model_card.json").write_text(json.dumps(bad_card), encoding="utf-8")
    probe = _probe(None)
    probe.state.model_path = tmp_path / "model.pkl"

    with TestClient(probe) as client:
        assert client.get(MODEL_PATH).status_code == 503


def test_model_endpoint_503_on_a_structurally_malformed_card(
    model_artifact: object, tmp_path: pathlib.Path
) -> None:
    """A card that reaches the pydantic build with a malformed sub-object degrades to 503.

    It matches the bundle version (passes parity) AND names both estimators + metrics (passes
    the completeness guard), so control reaches `EstimatorCard(**{"target": "x"})`, which is
    missing `estimator_class` and raises a pydantic `ValidationError`. The handler must catch
    it and report 503 — not surface a 500. (Distinct from the guard-short-circuit cases above.)
    """
    (tmp_path / "model_card.json").write_text(
        json.dumps(
            {
                "model_version": "pwa-health-pttf-v1",  # matches the bundle → passes parity
                # both estimators present (passes completeness) but each missing estimator_class
                "pipelines": {"health": {"target": "x"}, "pttf": {"target": "y"}},
                "metrics": {
                    "health": {"model_mae": 0.1, "baseline_mae": 1.0},
                    "pttf": {"model_mae": 0.2, "baseline_mae": 1.0},
                },
                "data_sha256": "abc123",
            }
        ),
        encoding="utf-8",
    )
    probe = _probe(None)
    probe.state.model_path = tmp_path / "model.pkl"

    with TestClient(probe) as client:
        assert client.get(MODEL_PATH).status_code == 503


def test_model_endpoint_says_so_when_there_is_no_model() -> None:
    """No artifact loaded → 503, never a crash and never a fabricated card (item 3.1)."""
    probe = FastAPI()
    probe.include_router(predict_routes.router)
    probe.state.pool = None
    probe.state.bundle = None
    probe.state.model_path = None

    with TestClient(probe) as client:
        assert client.get(MODEL_PATH).status_code == 503
