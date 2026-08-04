"""Inference: health, PTTF and RCA from the serialized bundle (slice S5).

This is the path everything else must go through — tests included — so that "the model
predicts X" is a statement about the artifact that ships, not about a convenient
in-process object.

**RCA is local attribution, not global importance.** A linear model's `coef_` and a
tree's `feature_importances_` are properties of the *model*: they rank identically no
matter which window you score, which makes them an anomaly-rule lookup wearing a lab coat.
Here, each source signal is counterfactually reset to its training baseline, the window is
re-scored **through the loaded pipeline**, and the change in predicted health is the
attribution. Two different anomalies therefore produce two different rankings — which is
the property `test_rca_REVERSES_between_two_different_anomalies` pins.
"""
from __future__ import annotations

import io
import math
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import joblib

from .features import FEATURE_NAMES, window_features
from .lifecycle import SIGNAL_FIELDS, LifecycleRow

#: Minimum hours of telemetry before a window is scoreable at all. Training used 24-hour
#: windows throughout, so anything much shorter is out-of-distribution rather than merely
#: sparse; the floor is deliberately close to that.
MIN_WINDOW_HOURS = 16

Status = Literal["normal", "warning", "critical", "nodata"]

#: Latent-health bands the twin colours by. Status always travels with an icon and a Thai
#: label in the UI, never as colour alone (CLAUDE.md).
WARNING_BELOW = 65.0
CRITICAL_BELOW = 40.0

#: Fraction of the largest observed failure time above which a PTTF prediction is flagged
#: as out-of-range. Training saw only devices that failed inside the horizon, so near the
#: top of that range the estimate is really "further away than anything I was shown".
OUT_OF_RANGE_ABOVE_FRACTION = 0.9


@dataclass(frozen=True)
class Contribution:
    """How much one signal moved the predicted health, for THIS window."""

    signal: str
    contribution: float


@dataclass(frozen=True)
class Score:
    """A scored window. Every value is SIMULATED."""

    health: float
    pttf_hours: float
    #: True when the prediction sits at the top of the range the model was actually
    #: trained on, so it should be read as "at least this long" rather than an estimate.
    #:
    #: NOT survival-analysis censoring. Censoring is a property of an OBSERVATION (the
    #: study ended before the event), and nothing at inference time knows whether this
    #: device's eventual failure will be observed. Training does handle censoring properly
    #: — censored windows are excluded from the PTTF fit — but this flag is an
    #: extrapolation warning, and calling it censoring would overstate it.
    pttf_out_of_range: bool
    status: Status
    contributions: list[Contribution]
    model_version: str
    simulated: bool = True


@dataclass(frozen=True)
class Bundle:
    """The deserialized artifact: one fitted pipeline per target."""

    pipelines: dict[str, Any]
    feature_names: tuple[str, ...]
    baseline: dict[str, float]
    model_version: str
    horizon_hours: float
    #: Largest time-to-failure observed in training; predictions beyond it are extrapolation.
    max_observed_pttf: float


def load_bundle(path: Path) -> Bundle:
    """Load the artifact written by `train()`.

    Raises:
        FileNotFoundError: if the artifact is absent — the demo needs a trained model, and
            silently scoring with an untrained one would be worse than failing loudly.
    """
    if not path.exists():
        raise FileNotFoundError(f"no model artifact at {path}; run pwa_ml.train first")
    return load_bundle_bytes(path.read_bytes())


def load_bundle_bytes(data: bytes) -> Bundle:
    """Deserialize an artifact from its exact bytes.

    Split from `load_bundle` so a caller can hash and unpickle ONE byte snapshot: the API's
    provenance hash (PR-D, scored item 3.1) must describe the bytes actually deserialized,
    which a hash-the-path-later design cannot guarantee if the file is replaced in between.
    """
    raw: dict[str, Any] = joblib.load(io.BytesIO(data))
    return Bundle(
        pipelines=raw["pipelines"],
        feature_names=tuple(raw["feature_names"]),
        baseline=dict(raw["baseline"]),
        model_version=str(raw["model_version"]),
        horizon_hours=float(raw["horizon_hours"]),
        max_observed_pttf=float(raw["max_observed_pttf"]),
    )


def _vector(bundle: Bundle, features: dict[str, float]) -> list[list[float]]:
    return [[features[name] for name in bundle.feature_names]]


def _is_contiguous(rows: Sequence[LifecycleRow]) -> bool:
    """Reject reordered, duplicated or gapped windows.

    The slope features are computed against sample POSITION, so a window whose hours are
    out of order or have holes in it silently encodes a different trend from the one the
    model was fitted on — and would still receive a confident score.
    """
    hours = [r.hour for r in rows]
    return all(b - a == 1 for a, b in zip(hours, hours[1:], strict=False))


def _status_for(health: float) -> Status:
    if health < CRITICAL_BELOW:
        return "critical"
    if health < WARNING_BELOW:
        return "warning"
    return "normal"


def score_window(bundle: Bundle, rows: Sequence[LifecycleRow]) -> Score:
    """Health, PTTF and RCA for one window of telemetry.

    A window shorter than `MIN_WINDOW_HOURS` is reported as `nodata` rather than scored:
    padding it would turn absent telemetry into a confident measurement.
    """
    if len(rows) < MIN_WINDOW_HOURS or not _is_contiguous(rows):
        return Score(
            health=0.0,
            pttf_hours=0.0,
            pttf_out_of_range=True,
            status="nodata",
            contributions=[],
            model_version=bundle.model_version,
        )

    features = window_features(rows)
    raw_health = float(bundle.pipelines["health"].predict(_vector(bundle, features))[0])
    health = max(0.0, min(100.0, raw_health))
    pttf = float(bundle.pipelines["pttf"].predict(_vector(bundle, features))[0])
    pttf = max(0.0, pttf)

    out_of_range = pttf >= OUT_OF_RANGE_ABOVE_FRACTION * bundle.max_observed_pttf

    return Score(
        health=health,
        pttf_hours=min(pttf, bundle.horizon_hours),
        pttf_out_of_range=out_of_range,
        status=_status_for(health),
        # RAW, not clipped: the counterfactual predictions inside explain() are unclipped,
        # so passing the clipped value would compare unlike quantities. With raw 120 vs 110
        # both display as 100 while the attribution would still claim a +10 contribution.
        contributions=explain(bundle, rows, health=raw_health, features=features),
        model_version=bundle.model_version,
    )


def explain(
    bundle: Bundle,
    rows: Sequence[LifecycleRow],
    *,
    health: float | None = None,
    features: dict[str, float] | None = None,
) -> list[Contribution]:
    """Rank signals by how much each one moved THIS window's predicted health.

    For every source signal, the features derived from it are reset to the training
    baseline and the window is re-scored through the serialized pipeline. The difference
    is that signal's contribution: positive means the signal is pushing health DOWN
    relative to a nominal device.
    """
    if len(rows) < MIN_WINDOW_HOURS:
        return []
    if features is None:
        features = window_features(rows)
    if health is None:
        health = float(bundle.pipelines["health"].predict(_vector(bundle, features))[0])

    contributions: list[Contribution] = []
    for signal in SIGNAL_FIELDS:
        counterfactual = dict(features)
        for name in bundle.feature_names:
            if name.startswith(f"{signal}_"):
                counterfactual[name] = bundle.baseline.get(name, 0.0)
        nominal = float(bundle.pipelines["health"].predict(_vector(bundle, counterfactual))[0])
        delta = nominal - health          # how much this signal depressed health
        if math.isfinite(delta):
            contributions.append(Contribution(signal=signal, contribution=delta))

    contributions.sort(key=lambda c: abs(c.contribution), reverse=True)
    return contributions


def feature_names() -> tuple[str, ...]:
    """The schema inference expects; re-exported so callers need not import features."""
    return FEATURE_NAMES
