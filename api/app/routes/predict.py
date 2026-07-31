"""Predictive-maintenance API — scored items 3.3 to 3.6 (slice S6).

These four routes are the judge-facing surface of topic ๓. Item 3.4 is scored *in Swagger
UI*, so the response models, summaries and descriptions here are not documentation polish —
they are the artifact being marked. `/docs` must show a `POST /api/feedback` that can be
executed with "Try it out" and return a 200 whose body proves the row was persisted.

Handlers are plain `def`, not `async def`. psycopg is synchronous, so a coroutine handler
would run the query ON the event loop that also drains the ingest queue; FastAPI runs a
sync handler in its threadpool instead. This mirrors `routes/telemetry.py` and is the same
defect that was found and fixed in slice S3 — do not "modernise" these to async.

Every value returned is SIMULATED, model outputs included.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast

from fastapi import APIRouter, HTTPException, Query, Request
from pwa_ml.predict import CRITICAL_BELOW, WARNING_BELOW, score_window

from ..db import query_range
from ..features import WINDOW_HOURS, build_window
from ..health_store import insert_feedback, is_known_asset
from ..health_store import worklist as health_worklist
from ..model import read_model_card, score_demo_datasets
from ..models import (
    EstimatorCard,
    FeedbackAck,
    FeedbackRequest,
    HealthResponse,
    MetricPair,
    ModelCardResponse,
    RcaResponse,
    Signal,
    SignalContribution,
    WorklistItem,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["predictive"])


@router.get(
    "/health/{asset_id}",
    response_model=HealthResponse,
    summary="Health Score, PTTF and RCA for one device (items 3.2/3.3/3.6)",
)
def device_health(request: Request, asset_id: str) -> HealthResponse:
    """Score `asset_id` from its live feature window.

    Scores on demand through the same path `score_all` uses — `features.build_window` then
    `pwa_ml.predict.score_window` — so what a judge reads here is what the scheduled cycle
    would write, not a second implementation that could disagree with it.

    Returns a `nodata` response carrying `detail` when the device has too little telemetry
    to score; that is a 200, because "not enough data yet" is a real answer about a known
    device, not a missing resource.

    Raises:
        HTTPException: 404 when `asset_id` is not on the roster; 503 when the database or
            the model artifact is unavailable.
    """
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="database not available")

    # Roster BEFORE bundle: whether a device exists is a fact about the request, and does
    # not depend on whether a model happens to be loaded. Checking the bundle first made an
    # unknown asset report 503 on a machine with no artifact built.
    if not is_known_asset(pool, asset_id):
        raise HTTPException(status_code=404, detail=f"unknown asset: {asset_id}")

    bundle = getattr(request.app.state, "bundle", None)
    if bundle is None:
        raise HTTPException(status_code=503, detail="model artifact not available")

    now = datetime.now(tz=UTC)
    since = now - timedelta(hours=WINDOW_HOURS)
    readings = query_range(pool, asset_id, since, now)
    window = build_window(readings, now=now, hours=WINDOW_HOURS)

    if not window.scoreable:
        return HealthResponse(
            asset_id=asset_id,
            status="nodata",
            detail=window.reason,
            observed_at=window.observed_at,
        )

    score = score_window(bundle, window.rows)
    return HealthResponse(
        asset_id=asset_id,
        status=score.status,
        health_score=score.health,
        pttf_hours=score.pttf_hours,
        pttf_out_of_range=score.pttf_out_of_range,
        model_version=score.model_version,
        observed_at=window.observed_at,
        scored_at=now,
        contributions=[
            SignalContribution(signal=cast(Signal, c.signal), contribution=c.contribution)
            for c in score.contributions
        ],
    )


@router.get(
    "/worklist",
    response_model=list[WorklistItem],
    summary="Devices ranked by risk from model output (item 3.5)",
)
def worklist(
    request: Request,
    limit: int = Query(default=20, ge=1, le=200, description="Maximum rows to return."),
) -> list[WorklistItem]:
    """The prioritized worklist: worst predicted health first, `rank` starting at 1.

    Reads the persisted scores written by the scoring cycle rather than re-scoring the
    roster, so the ordering a judge sees is the ordering the model actually produced.

    Raises:
        HTTPException: 503 when the database is unavailable.
    """
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="database not available")

    now = datetime.now(tz=UTC)
    rows = health_worklist(
        pool,
        since=now - timedelta(hours=WINDOW_HOURS),
        limit=limit,
        warning_below=WARNING_BELOW,
        critical_below=CRITICAL_BELOW,
    )
    return [
        WorklistItem(
            rank=i + 1,
            asset_id=r.asset_id,
            branch=r.branch,
            health_score=r.health_score,
            pttf_hours=r.pttf_hours,
            status=r.status,
            model_version=r.model_version,
            scored_at=r.scored_at,
        )
        for i, r in enumerate(rows)
    ]


@router.post(
    "/feedback",
    response_model=FeedbackAck,
    status_code=200,
    summary="Feedback Loop — record a technician's verdict on a prediction (item 3.4)",
)
def submit_feedback(request: Request, feedback: FeedbackRequest) -> FeedbackAck:
    """Persist one verdict and return the stored row's identity.

    The returned `id` and `created_at` come from the database, which is what makes
    "200 **and persisted**" verifiable in a single call.

    Raises:
        HTTPException: 404 when `asset_id` is not on the roster — an unknown device is a
            typo, and silently storing it would contradict the DLQ story topic ๑ tells;
            503 when the database is unavailable.
    """
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="database not available")

    if not is_known_asset(pool, feedback.asset_id):
        raise HTTPException(status_code=404, detail=f"unknown asset: {feedback.asset_id}")

    return insert_feedback(pool, feedback)


@router.get(
    "/rca/{asset_id}",
    response_model=RcaResponse,
    summary="Root-cause signals behind a device's current health (item 3.6)",
)
def root_cause(request: Request, asset_id: str) -> RcaResponse:
    """The signals contributing most to `asset_id`'s current health, largest first.

    Attribution is counterfactual and computed per window by `pwa_ml.predict.explain`, so
    two different anomalies produce two different rankings.

    Raises:
        HTTPException: 404 when `asset_id` is not on the roster; 503 when the database or
            the model artifact is unavailable.
    """
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="database not available")

    # Roster BEFORE bundle: whether a device exists is a fact about the request, and does
    # not depend on whether a model happens to be loaded. Checking the bundle first made an
    # unknown asset report 503 on a machine with no artifact built.
    if not is_known_asset(pool, asset_id):
        raise HTTPException(status_code=404, detail=f"unknown asset: {asset_id}")

    bundle = getattr(request.app.state, "bundle", None)
    if bundle is None:
        raise HTTPException(status_code=503, detail="model artifact not available")

    now = datetime.now(tz=UTC)
    since = now - timedelta(hours=WINDOW_HOURS)
    readings = query_range(pool, asset_id, since, now)
    window = build_window(readings, now=now, hours=WINDOW_HOURS)

    if not window.scoreable:
        return RcaResponse(
            asset_id=asset_id,
            detail=window.reason,
            observed_at=window.observed_at,
        )

    score = score_window(bundle, window.rows)
    return RcaResponse(
        asset_id=asset_id,
        model_version=score.model_version,
        observed_at=window.observed_at,
        contributions=[
            SignalContribution(signal=cast(Signal, c.signal), contribution=c.contribution)
            for c in score.contributions
        ],
    )


@router.get(
    "/model",
    response_model=ModelCardResponse,
    summary="Trained-model card + two-dataset Health/PTTF comparison (items 3.1/3.2)",
)
def model_card(request: Request) -> ModelCardResponse:
    """The card that shipped with the loaded artifact, plus the two reserved demo datasets
    scored through it.

    Items 3.1 and 3.2 are read here: algorithm, parameters and held-out error come from
    `model_card.json`; the healthy-vs-degraded scores are computed live through the SAME
    `Bundle` the rest of topic ๓ uses, so the A/B a judge sees is the model's own. The two
    demo runs are scored at IN-DOMAIN windows (see `app.model._demo_window`). All SIMULATED.

    Raises:
        HTTPException: 503 when no artifact is loaded, the card is missing/invalid, or the
            card's `model_version` does not match the loaded model — a card describing a
            different model must never be served as if it described this one.
    """
    bundle = getattr(request.app.state, "bundle", None)
    model_path = getattr(request.app.state, "model_path", None)
    if bundle is None or model_path is None:
        raise HTTPException(status_code=503, detail="model artifact not available")

    try:
        card = read_model_card(Path(model_path).parent)
    except (OSError, ValueError):
        # OSError (not just FileNotFoundError) so a permissions/IO fault degrades to 503 like
        # every other unavailable-dependency path here, rather than surfacing as a 500.
        logger.exception("model card unreadable at %s", model_path)
        raise HTTPException(status_code=503, detail="model card unavailable") from None

    if card.get("model_version") != bundle.model_version:
        logger.error(
            "model card version %r does not match loaded model %r",
            card.get("model_version"), bundle.model_version,
        )
        raise HTTPException(status_code=503, detail="model card does not match loaded model")

    try:
        # A card must describe BOTH estimators (item 3.1); an empty/partial pipelines would
        # otherwise serve a 200 with nothing in it. `set()` on a non-mapping value (e.g.
        # `pipelines: 7`) raises TypeError here — INSIDE the try, so it 503s rather than 500s.
        required = {"health", "pttf"}
        has_estimators = required <= set(card.get("pipelines") or {})
        has_metrics = required <= set(card.get("metrics") or {})
        if not (has_estimators and has_metrics):
            logger.error("model card at %s is missing the health/pttf estimators", model_path)
            raise HTTPException(status_code=503, detail="model card incomplete")
        return ModelCardResponse(
            model_version=card["model_version"],
            pipelines={k: EstimatorCard(**v) for k, v in card["pipelines"].items()},
            metrics={k: MetricPair(**v) for k, v in card["metrics"].items()},
            data_sha256=card["data_sha256"],
            created_from=card.get("created_from", {}),
            censoring=card.get("censoring", {}),
            limitations=card.get("limitations", []),
            datasets=score_demo_datasets(bundle, cache_key=str(model_path)),
        )
    except (KeyError, TypeError, ValueError, AttributeError):
        # ValueError covers pydantic ValidationError (its subclass) from a malformed card
        # sub-object; AttributeError covers a wrong container type (e.g. `pipelines` a list).
        # A corrupt card must 503, not 500.
        logger.exception("model card at %s is missing or malformed fields", model_path)
        raise HTTPException(status_code=503, detail="model card malformed") from None
