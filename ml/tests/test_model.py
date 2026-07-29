"""The tests that decide whether this slice is a model or a costume.

An adversarial review of the plan named four ways this could ship as "AI theatre", and
each one is closed by a test here that the degenerate implementation fails:

1. **A constant-ish scorer passes a `>` comparison.** `health = 100 - eps*vibration` makes
   health(A) > health(B) for any positive eps. So the model must additionally beat a
   `DummyRegressor` on a held-out split, and separate the two demo datasets *materially*.
2. **PTTF can be a relabelled constant.** Its target comes from a known `failure_hour`, it
   is fitted only on uncensored windows, and a censored prediction is reported as a lower
   bound rather than an exact time.
3. **"RCA" can be global importance.** Coefficients and `feature_importances_` describe the
   *model*, not this anomaly, and would rank identically for every window — anomaly-rule
   lookup in a lab coat. So RCA must REVERSE its top signal between two different
   counterfactual anomalies.
4. **Training on the demo data.** The two datasets used to demonstrate item 3.2 are
   reserved from training and tuning entirely, and the card must prove it.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import pytest

from pwa_ml.datasets import build_corpus
from pwa_ml.lifecycle import LifecycleRow, generate_lifecycle
from pwa_ml.predict import load_bundle, score_window
from pwa_ml.train import train

pytestmark = pytest.mark.slow

CORPUS_SEED = 20260729


@pytest.fixture(scope="module")
def artifacts(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, dict[str, Any]]:
    """Train once for the module: this is the production artifact path, not a stub."""
    out = tmp_path_factory.mktemp("artifacts")
    corpus = build_corpus(seed=CORPUS_SEED)
    model_path = train(corpus, out)
    card = json.loads((out / "model_card.json").read_text(encoding="utf-8"))
    return model_path, card


# ── item 3.1: a real artifact whose card describes it ───────────────────────


def test_the_artifact_loads_through_the_production_loader(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    model_path, _card = artifacts
    bundle = load_bundle(model_path)

    assert bundle.model_version
    assert set(bundle.pipelines) == {"health", "pttf"}


def test_the_card_describes_BOTH_pipelines_not_just_one(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    """The bundle fits two estimators; a card naming one 'algorithm' cannot describe it."""
    model_path, card = artifacts
    bundle = load_bundle(model_path)

    for name, pipeline in bundle.pipelines.items():
        described = card["pipelines"][name]
        estimator = pipeline.steps[-1][1]
        assert described["estimator_class"] == type(estimator).__name__
        assert described["hyperparameters"], f"{name} has no recorded hyperparameters"
        for key, value in described["hyperparameters"].items():
            assert estimator.get_params()[key] == value, f"{name}.{key} drifted from the card"
        assert described["target"], f"{name} has no stated target definition"
        assert described["units"], f"{name} has no stated units"


def test_the_card_is_falsifiable_and_declares_synthetic_data(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    _model_path, card = artifacts

    assert card["simulated"] is True, "repo policy: synthetic data must be declared"
    assert card["feature_names"], "no feature schema recorded"
    assert card["data_sha256"], "no training-data hash recorded"
    assert card["censoring"]["policy"], "no censoring policy stated"
    assert 0.0 <= card["censoring"]["censored_fraction"] <= 1.0
    assert card["splits"]["train"] and card["splits"]["validation"]
    assert card["metrics"]["health"]["model_mae"] >= 0.0
    assert card["metrics"]["health"]["baseline_mae"] >= 0.0


# ── item 3.2: health and PTTF differ, materially, on UNSEEN data ────────────


def test_health_and_pttf_separate_materially_on_the_holdout_datasets(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    model_path, _card = artifacts
    bundle = load_bundle(model_path)
    corpus = build_corpus(seed=CORPUS_SEED)
    healthy_run, degraded_run = corpus.demo_healthy, corpus.demo_degraded

    healthy = score_window(bundle, healthy_run.rows[:24])
    degraded = score_window(bundle, degraded_run.rows[-24:])

    assert healthy.health > degraded.health
    assert healthy.health - degraded.health >= 15.0, (
        f"health barely moved between a healthy and a failing device "
        f"({healthy.health:.1f} vs {degraded.health:.1f}) — an epsilon difference would "
        "satisfy a bare `>` comparison while telling an operator nothing"
    )
    assert healthy.pttf_hours > degraded.pttf_hours


def test_the_model_beats_a_dummy_baseline(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    """The check a degenerate scorer cannot pass.

    `health = 100 - eps*vibration` satisfies every ordering assertion above and still
    loses to predicting the training mean.
    """
    _model_path, card = artifacts

    for name in ("health", "pttf"):
        model_mae = card["metrics"][name]["model_mae"]
        baseline_mae = card["metrics"][name]["baseline_mae"]
        assert model_mae < baseline_mae, (
            f"{name}: model MAE {model_mae:.3f} is no better than DummyRegressor "
            f"{baseline_mae:.3f} — it has learned nothing"
        )


def test_the_demo_datasets_were_never_trained_on(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    """Item 3.2 is demonstrated on data the model has never seen."""
    _model_path, card = artifacts
    corpus = build_corpus(seed=CORPUS_SEED)

    trained_on = set(card["splits"]["train"]) | set(card["splits"]["validation"])
    for run in (corpus.demo_healthy, corpus.demo_degraded):
        assert run.lifecycle_id not in trained_on, (
            f"{run.lifecycle_id} is used for the item-3.2 demonstration AND for training"
        )


def test_splits_do_not_share_a_lifecycle(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    """Windows from one trajectory overlap almost entirely and share a failure time."""
    _model_path, card = artifacts

    train_ids = set(card["splits"]["train"])
    validation_ids = set(card["splits"]["validation"])

    assert train_ids and validation_ids
    assert train_ids.isdisjoint(validation_ids)


# ── PTTF censoring ──────────────────────────────────────────────────────────


def test_pttf_reports_a_lower_bound_when_censored(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    model_path, _card = artifacts
    bundle = load_bundle(model_path)
    healthy = generate_lifecycle(
        lifecycle_id="lc-censored", seed=99, hours=72, wear_rate=0.0005,
        failure_threshold=30.0,
    )

    score = score_window(bundle, healthy.rows[-24:])

    assert score.pttf_hours >= 0.0
    assert math.isfinite(score.pttf_hours)
    assert score.pttf_out_of_range is True, (
        "a device nowhere near failure must report its PTTF as a lower bound, not as an "
        "exact predicted time"
    )


def test_a_short_window_is_nodata_rather_than_a_confident_score(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    """Zero-filling an incomplete window turns missing telemetry into a measurement."""
    model_path, _card = artifacts
    bundle = load_bundle(model_path)
    run = generate_lifecycle(
        lifecycle_id="lc-short", seed=5, hours=48, wear_rate=0.2, failure_threshold=30.0
    )

    score = score_window(bundle, run.rows[:2])

    assert score.status == "nodata"


# ── item 3.6: RCA as LOCAL attribution ──────────────────────────────────────


def _anomalous_window(
    bundle_rows: list[LifecycleRow], field: str, amount: float
) -> list[LifecycleRow]:
    """Copy a window with exactly one signal driven away from its normal value."""
    import dataclasses

    return [dataclasses.replace(r, **{field: getattr(r, field) + amount}) for r in bundle_rows]


def test_rca_names_the_signal_that_was_actually_driven(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    model_path, _card = artifacts
    bundle = load_bundle(model_path)
    run = generate_lifecycle(
        lifecycle_id="lc-rca", seed=21, hours=200, wear_rate=0.15, failure_threshold=30.0
    )
    base = list(run.rows[:24])

    score = score_window(bundle, _anomalous_window(base, "vibration", 6.0))

    assert score.contributions, "RCA returned nothing for an obvious anomaly"
    assert score.contributions[0].signal == "vibration"
    magnitudes = [abs(c.contribution) for c in score.contributions]
    assert magnitudes == sorted(magnitudes, reverse=True), "contributions are not ranked"


def test_rca_REVERSES_between_two_different_anomalies(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    """The test a global-importance implementation cannot pass.

    Coefficients and feature importances are properties of the model, so they rank the
    same way no matter which window is scored. Only a local attribution changes its answer
    when a different signal is the one misbehaving.
    """
    model_path, _card = artifacts
    bundle = load_bundle(model_path)
    run = generate_lifecycle(
        lifecycle_id="lc-rca2", seed=22, hours=200, wear_rate=0.15, failure_threshold=30.0
    )
    base = list(run.rows[:24])

    vibration_top = score_window(bundle, _anomalous_window(base, "vibration", 6.0))
    temperature_top = score_window(bundle, _anomalous_window(base, "bearing_temp_c", 35.0))

    assert vibration_top.contributions[0].signal == "vibration"
    assert temperature_top.contributions[0].signal == "bearing_temp_c"
    assert vibration_top.contributions[0].signal != temperature_top.contributions[0].signal, (
        "RCA ranked the same signal first for two different anomalies — that is global "
        "importance, not root-cause analysis"
    )


def test_rca_follows_the_serialized_model(
    artifacts: tuple[Path, dict[str, Any]], tmp_path: Path,
) -> None:
    """Attribution must come from the loaded pipeline, not a parallel heuristic."""
    model_path, _card = artifacts
    bundle = load_bundle(model_path)

    other_corpus = build_corpus(seed=CORPUS_SEED + 1)
    other_path = train(other_corpus, tmp_path)
    other = load_bundle(other_path)

    run = generate_lifecycle(
        lifecycle_id="lc-rca3", seed=23, hours=200, wear_rate=0.15, failure_threshold=30.0
    )
    window = _anomalous_window(list(run.rows[:24]), "vibration", 6.0)

    a = {c.signal: c.contribution for c in score_window(bundle, window).contributions}
    b = {c.signal: c.contribution for c in score_window(other, window).contributions}

    assert a != b, (
        "two independently trained models produced identical attributions for the same "
        "window — RCA is not reading the serialized model at all"
    )


def test_every_prediction_is_finite(artifacts: tuple[Path, dict[str, Any]]) -> None:
    """Assert numerical sanity positively.

    numpy on Apple's Accelerate BLAS emits divide-by-zero/overflow RuntimeWarnings from
    every matmul, including on random data, so those warnings carry no signal here and are
    filtered. This asserts the thing they would otherwise have hinted at: that nothing the
    model returns is NaN or infinite.
    """
    model_path, _card = artifacts
    bundle = load_bundle(model_path)
    corpus = build_corpus(seed=CORPUS_SEED)

    for run in (corpus.demo_healthy, corpus.demo_degraded, *corpus.validation[:3]):
        score = score_window(bundle, run.rows[-24:])
        assert math.isfinite(score.health), f"{run.lifecycle_id}: health is not finite"
        assert math.isfinite(score.pttf_hours), f"{run.lifecycle_id}: pttf is not finite"
        assert 0.0 <= score.health <= 100.0
        assert score.pttf_hours >= 0.0
        for contribution in score.contributions:
            assert math.isfinite(contribution.contribution)


def test_pttf_was_fitted_ONLY_on_uncensored_windows(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    """The censoring policy, made checkable.

    Found by mutation: training PTTF on censored windows with the horizon substituted as
    an exact target passed every other test in this file, because the `pttf_out_of_range` flag
    is computed at inference time and says nothing about how the model was fitted. These
    counts are what make the card's stated policy falsifiable.
    """
    _model_path, card = artifacts
    censoring = card["censoring"]

    total = censoring["total_training_windows"]
    censored = censoring["censored_training_windows"]
    used_for_pttf = censoring["pttf_training_windows"]

    assert censored > 0, "the corpus contains no censored windows, so the policy is untested"
    assert used_for_pttf == total - censored, (
        f"PTTF was fitted on {used_for_pttf} windows but only {total - censored} are "
        "uncensored — censored lower bounds are being trained as exact failure times, "
        "which biases every prediction toward the horizon"
    )
    assert used_for_pttf < total


def test_pttf_is_NOT_flagged_out_of_range_for_an_imminent_failure(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    """The other half of the flag.

    Asserting only that a healthy device returns True would pass an implementation that
    returned True unconditionally, which would tell an operator nothing.
    """
    model_path, _card = artifacts
    bundle = load_bundle(model_path)
    corpus = build_corpus(seed=CORPUS_SEED)

    score = score_window(bundle, corpus.demo_degraded.rows[-24:])

    assert score.pttf_out_of_range is False, (
        "a device at the point of failure must get a real estimate, not a lower bound"
    )


def test_a_reordered_or_gapped_window_is_nodata(
    artifacts: tuple[Path, dict[str, Any]],
) -> None:
    """Slope features are computed by sample position, so ordering is part of the input."""
    model_path, _card = artifacts
    bundle = load_bundle(model_path)
    run = generate_lifecycle(
        lifecycle_id="lc-order", seed=31, hours=200, wear_rate=0.2, failure_threshold=30.0
    )
    window = list(run.rows[:24])

    assert score_window(bundle, window).status != "nodata"
    assert score_window(bundle, list(reversed(window))).status == "nodata"
    assert score_window(bundle, window[::2]).status == "nodata"
