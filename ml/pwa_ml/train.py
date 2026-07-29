"""Fit the bundle and write a falsifiable model card (slice S5)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import numpy.typing as npt
from sklearn.dummy import DummyRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .datasets import HORIZON_HOURS, Corpus, Window, windows_for_all
from .features import FEATURE_NAMES

#: Bumped whenever the feature schema or the estimator choice changes.
MODEL_VERSION = "pwa-health-pttf-v1"

ARTIFACT_NAME = "model.pkl"
CARD_NAME = "model_card.json"

TRAIN_SEED = 42

#: Latent health above which a training window counts as a nominal healthy device,
#: used as the reference point for RCA counterfactuals.
HEALTHY_BASELINE_ABOVE = 90.0

FloatArray = npt.NDArray[np.float64]


def _feature_matrix(windows: list[Window]) -> FloatArray:
    """Build a 2-D feature array in the FEATURE_NAMES order."""
    return np.array([[w.features[name] for name in FEATURE_NAMES] for w in windows])


def _json_safe_params(params: dict[str, Any]) -> dict[str, Any]:
    """Keep only hyperparameter values that survive a JSON round-trip.

    Values that cannot be serialised are stringified so the card still records them.
    """
    safe: dict[str, Any] = {}
    for key, value in params.items():
        try:
            json.dumps(value)
            safe[key] = value
        except (TypeError, ValueError):
            safe[key] = str(value)
    return safe


def _fit_pipeline(X: FloatArray, y: FloatArray) -> Pipeline:
    """Fit a Ridge(alpha=1.0) behind a StandardScaler."""
    pipe: Pipeline = Pipeline(
        [("scaler", StandardScaler()), ("model", Ridge(alpha=1.0, random_state=TRAIN_SEED))]
    )
    pipe.fit(X, y)
    return pipe


def _compute_metrics(
    pipeline: Pipeline,
    X_train: FloatArray,
    y_train: FloatArray,
    X_val: FloatArray,
    y_val: FloatArray,
) -> dict[str, float]:
    """Model MAE and a DummyRegressor baseline on the same split."""
    pred = pipeline.predict(X_val)
    model_mae = float(mean_absolute_error(y_val, pred))
    dummy = DummyRegressor(strategy="mean")
    dummy.fit(X_train, y_train)
    baseline_mae = float(mean_absolute_error(y_val, dummy.predict(X_val)))
    return {"model_mae": model_mae, "baseline_mae": baseline_mae}


def _prepare_pttf_data(
    train_windows: list[Window], val_windows: list[Window]
) -> tuple[list[Window], FloatArray, FloatArray, FloatArray, FloatArray]:
    """Filter uncensored windows and build feature/label arrays for the PTTF target."""
    pttf_train = [w for w in train_windows if not w.censored]
    pttf_val = [w for w in val_windows if not w.censored]
    X_tr = _feature_matrix(pttf_train)
    X_va = _feature_matrix(pttf_val)
    y_tr = np.array([w.pttf_hours for w in pttf_train], dtype=np.float64)
    y_va = np.array([w.pttf_hours for w in pttf_val], dtype=np.float64)
    return pttf_train, X_tr, X_va, y_tr, y_va


def _healthy_baseline(train_windows: list[Window]) -> dict[str, float]:
    """Feature means of a NOMINAL HEALTHY device — the RCA counterfactual reference.

    Averaging over every wear state instead would make "reset this signal to baseline"
    mean "reset it to a moderately worn machine", so the attribution would be measured
    against a device that does not exist.
    """
    healthy = [w for w in train_windows if w.health >= HEALTHY_BASELINE_ABOVE] or train_windows
    return {name: float(np.mean([w.features[name] for w in healthy])) for name in FEATURE_NAMES}


def _dump_artifact(
    health_pipeline: Pipeline,
    pttf_pipeline: Pipeline,
    baseline: dict[str, float],
    out_dir: Path,
    pttf_train: list[Window],
) -> Path:
    """Serialise the bundle and return its path."""
    bundle = {
        "pipelines": {"health": health_pipeline, "pttf": pttf_pipeline},
        "feature_names": list(FEATURE_NAMES),
        "baseline": baseline,
        "model_version": MODEL_VERSION,
        "horizon_hours": float(HORIZON_HOURS),
        # The largest time-to-failure actually OBSERVED in training. Beyond it the model
        # is extrapolating past its evidence, which is what makes a PTTF prediction a
        # lower bound rather than an estimate.
        "max_observed_pttf": float(max((w.pttf_hours or 0.0) for w in pttf_train)),
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = out_dir / ARTIFACT_NAME
    joblib.dump(bundle, artifact_path)
    return artifact_path


def _card_pipelines(
    health_pipeline: Pipeline, pttf_pipeline: Pipeline
) -> dict[str, dict[str, Any]]:
    """Build the 'pipelines' section of the model card."""
    health_est = health_pipeline.steps[-1][1]
    pttf_est = pttf_pipeline.steps[-1][1]
    return {
        "health": {
            "estimator_class": type(health_est).__name__,
            "hyperparameters": _json_safe_params(health_est.get_params()),
            "target": "latent health at the end of the window",
            "units": "0-100",
            "preprocessing": ["StandardScaler"],
        },
        "pttf": {
            "estimator_class": type(pttf_est).__name__,
            "hyperparameters": _json_safe_params(pttf_est.get_params()),
            "target": (
                "hours from window end until latent health first crosses"
                " the failure threshold"
            ),
            "units": "hours",
            "preprocessing": ["StandardScaler"],
        },
    }


def _card_censoring(
    censored_count: int, total_train: int, pttf_train_count: int
) -> dict[str, Any]:
    """Build the 'censoring' section of the model card."""
    return {
        "policy": (
            "PTTF is fitted only on uncensored windows; a censored run's failure "
            "time is a lower bound, not an observation"
        ),
        "censored_fraction": censored_count / total_train if total_train > 0 else 0.0,
        "total_training_windows": total_train,
        "censored_training_windows": censored_count,
        "pttf_training_windows": pttf_train_count,
    }


def _write_card(
    corpus: Corpus,
    health_pipeline: Pipeline,
    pttf_pipeline: Pipeline,
    health_metrics: dict[str, float],
    pttf_metrics: dict[str, float],
    total_train: int,
    censored_count: int,
    pttf_train_count: int,
    out_dir: Path,
) -> None:
    """Assemble the model card and write it to disk."""
    card = {
        "model_version": MODEL_VERSION,
        "simulated": True,
        "feature_names": list(FEATURE_NAMES),
        "data_sha256": corpus.sha256(),
        "created_from": {
            "n_train_lifecycles": len(corpus.train),
            "n_validation_lifecycles": len(corpus.validation),
        },
        "pipelines": _card_pipelines(health_pipeline, pttf_pipeline),
        "censoring": _card_censoring(censored_count, total_train, pttf_train_count),
        "splits": {
            "train": [r.lifecycle_id for r in corpus.train],
            "validation": [r.lifecycle_id for r in corpus.validation],
            "reserved_for_demo": sorted(corpus.reserved_ids),
        },
        "metrics": {
            "health": health_metrics,
            "pttf": pttf_metrics,
        },
        "limitations": [
            (
                "Trained entirely on synthetic data generated from a linear wear model; "
                "real-world pump degradation patterns may differ materially in both rate "
                "and signal response shape."
            ),
        ],
    }
    card_path = out_dir / CARD_NAME
    card_path.write_text(json.dumps(card, indent=2), encoding="utf-8")


def train(corpus: Corpus, out_dir: Path) -> Path:
    """Fit health and PTTF pipelines and serialise them with their card.

    Returns the path to the written artifact.
    """
    train_windows = windows_for_all(corpus.train)
    val_windows = windows_for_all(corpus.validation)
    X_train = _feature_matrix(train_windows)
    X_val = _feature_matrix(val_windows)

    # Health pipeline: trained on ALL windows
    y_train_health = np.array([w.health for w in train_windows], dtype=np.float64)
    y_val_health = np.array([w.health for w in val_windows], dtype=np.float64)
    health_pipeline = _fit_pipeline(X_train, y_train_health)

    # PTTF pipeline: trained ONLY on uncensored windows
    pttf_train, X_tr_pttf, X_va_pttf, y_tr_pttf, y_va_pttf = _prepare_pttf_data(
        train_windows, val_windows
    )
    pttf_pipeline = _fit_pipeline(X_tr_pttf, y_tr_pttf)
    # Baseline feature means (load-bearing for RCA counterfactuals)
    baseline = _healthy_baseline(train_windows)

    artifact_path = _dump_artifact(
        health_pipeline, pttf_pipeline, baseline, out_dir, pttf_train
    )

    health_metrics = _compute_metrics(
        health_pipeline, X_train, y_train_health, X_val, y_val_health
    )
    pttf_metrics = _compute_metrics(
        pttf_pipeline, X_tr_pttf, y_tr_pttf, X_va_pttf, y_va_pttf
    )

    total_train = len(train_windows)
    censored_count = sum(1 for w in train_windows if w.censored)
    _write_card(
        corpus=corpus,
        health_pipeline=health_pipeline,
        pttf_pipeline=pttf_pipeline,
        health_metrics=health_metrics,
        pttf_metrics=pttf_metrics,
        total_train=total_train,
        censored_count=censored_count,
        pttf_train_count=len(pttf_train),
        out_dir=out_dir,
    )

    return artifact_path
