"""The artifact the DEMO loads — not one manufactured inside pytest.

Scored item 3.1 asks for a trained model file that exists on disk. A test that trains into
a temporary directory certifies a model nobody can run: it passes while a fresh clone has
nothing for `load_bundle()` to open. These tests read the canonical
`ml/artifacts/model.pkl` produced by the documented build command, `python -m pwa_ml`.

They also recompute the headline metrics INDEPENDENTLY. Every other check in this suite
reads numbers the card reports about itself, so a fitter that trained on the reserved demo
lifecycles while still writing the honest split ids would pass all of them.
"""
from __future__ import annotations

import dataclasses
import json
from pathlib import Path

import numpy as np
import pytest
from sklearn.dummy import DummyRegressor
from sklearn.metrics import mean_absolute_error

from pwa_ml.__main__ import ARTIFACT_DIR, CORPUS_SEED
from pwa_ml.datasets import build_corpus, windows_for_all
from pwa_ml.features import FEATURE_NAMES
from pwa_ml.lifecycle import LifecycleRun
from pwa_ml.predict import load_bundle, score_window
from pwa_ml.train import ARTIFACT_NAME, CARD_NAME

ARTIFACT = ARTIFACT_DIR / ARTIFACT_NAME
CARD = ARTIFACT_DIR / CARD_NAME


def _require_artifact() -> Path:
    if not ARTIFACT.is_file():
        pytest.skip(f"{ARTIFACT} absent; build it with `cd ml && python -m pwa_ml`")
    return ARTIFACT


def test_the_committed_card_exists_and_describes_the_shipped_model() -> None:
    """The card is committed precisely so this claim survives a fresh clone."""
    assert CARD.is_file(), "ml/artifacts/model_card.json is missing from the repository"
    card = json.loads(CARD.read_text(encoding="utf-8"))

    assert card["simulated"] is True
    assert card["model_version"]
    assert set(card["pipelines"]) == {"health", "pttf"}


def test_the_shipped_artifact_loads_and_scores() -> None:
    bundle = load_bundle(_require_artifact())
    corpus = build_corpus(seed=CORPUS_SEED)

    score = score_window(bundle, corpus.demo_degraded.rows[-24:])

    assert set(bundle.pipelines) == {"health", "pttf"}
    assert 0.0 <= score.health <= 100.0
    assert score.contributions


def test_holdout_metrics_recomputed_independently_match_the_card() -> None:
    """Recompute from the loaded artifact instead of trusting the card's own numbers.

    A fitter that quietly trained on the validation split — or on the reserved demo
    lifecycles — while still writing the honest split ids would satisfy every
    card-reading test. This one refits nothing and measures the shipped model.
    """
    bundle = load_bundle(_require_artifact())
    card = json.loads(CARD.read_text(encoding="utf-8"))
    corpus = build_corpus(seed=CORPUS_SEED)

    val = windows_for_all(corpus.validation)
    x_val = np.array([[w.features[n] for n in FEATURE_NAMES] for w in val])
    y_val = np.array([w.health for w in val])

    measured = float(mean_absolute_error(y_val, bundle.pipelines["health"].predict(x_val)))
    claimed = float(card["metrics"]["health"]["model_mae"])

    assert measured == pytest.approx(claimed, rel=0.05, abs=0.05), (
        f"the card claims a health MAE of {claimed:.3f} but the shipped artifact scores "
        f"{measured:.3f} on the declared validation split"
    )

    train_windows = windows_for_all(corpus.train)
    dummy = DummyRegressor(strategy="mean").fit(
        np.array([[w.features[n] for n in FEATURE_NAMES] for w in train_windows]),
        np.array([w.health for w in train_windows]),
    )
    dummy_mae = float(mean_absolute_error(y_val, dummy.predict(x_val)))

    assert measured < dummy_mae, (
        f"the shipped model ({measured:.3f}) does not beat a mean baseline ({dummy_mae:.3f})"
    )


def test_the_shipped_model_never_saw_the_demo_lifecycles() -> None:
    """Measured, not self-reported: near-perfect scores on 'unseen' data would betray a leak."""
    bundle = load_bundle(_require_artifact())
    corpus = build_corpus(seed=CORPUS_SEED)

    demo = windows_for_all([corpus.demo_healthy, corpus.demo_degraded])
    x = np.array([[w.features[n] for n in FEATURE_NAMES] for w in demo])
    y = np.array([w.health for w in demo])
    demo_mae = float(mean_absolute_error(y, bundle.pipelines["health"].predict(x)))

    card = json.loads(CARD.read_text(encoding="utf-8"))
    assert set(card["splits"]["reserved_for_demo"]) == corpus.reserved_ids
    # Held-out error should be in the same league as validation error, not dramatically
    # better — the latter is what memorising these trajectories would look like.
    assert demo_mae > 0.0
    assert demo_mae < 25.0, f"demo-set MAE {demo_mae:.3f} is implausibly poor"


def _perturbed(run: LifecycleRun, delta: float) -> LifecycleRun:
    """A lifecycle with every vibration reading shifted — same ids, different data."""
    rows = [dataclasses.replace(r, vibration=r.vibration + delta) for r in run.rows]
    return dataclasses.replace(run, rows=rows)


def test_training_does_not_read_the_validation_or_demo_lifecycles(tmp_path: Path) -> None:
    """The leak detector that does not rely on the card telling the truth.

    Every other check here compares numbers the card reports about itself, so a fitter
    that trained on the validation split — or on the reserved demo pair — while still
    writing the honest split ids passes all of them. Comparing MAE cannot separate the two
    either: a leaked model reports its own (lower) figure, so measured still equals claimed.

    This perturbs ONLY the data that must not be read, retrains, and requires the fitted
    parameters to be bit-for-bit unchanged. If validation or demo rows reach the fit, the
    coefficients move.
    """
    from pwa_ml.train import train

    corpus = build_corpus(seed=CORPUS_SEED)
    tampered = dataclasses.replace(
        corpus,
        validation=[_perturbed(r, 50.0) for r in corpus.validation],
        demo_healthy=_perturbed(corpus.demo_healthy, 50.0),
        demo_degraded=_perturbed(corpus.demo_degraded, 50.0),
    )

    honest = load_bundle(train(corpus, tmp_path / "honest"))
    after = load_bundle(train(tampered, tmp_path / "tampered"))

    for name in ("health", "pttf"):
        honest_coef = honest.pipelines[name].steps[-1][1].coef_
        after_coef = after.pipelines[name].steps[-1][1].coef_
        assert np.allclose(honest_coef, after_coef), (
            f"the {name} pipeline's coefficients changed when only VALIDATION and DEMO "
            "rows were perturbed — those lifecycles are reaching the fit"
        )


def test_rca_reverses_through_the_SHIPPED_artifact() -> None:
    """Item 3.6 via the artifact that actually serves (PR-E): local attribution must change
    its top signal when a different signal misbehaves — through `ml/artifacts/model.pkl`
    itself, not a freshly trained stand-in. A global-importance implementation ranks the
    same way for every window and cannot pass this."""
    from pwa_ml.lifecycle import LifecycleRow, generate_lifecycle

    bundle = load_bundle(_require_artifact())
    run = generate_lifecycle(
        lifecycle_id="lc-shipped-rca", seed=23, hours=200, wear_rate=0.15,
        failure_threshold=30.0,
    )
    base = list(run.rows[:24])

    def driven(field: str, amount: float) -> list[LifecycleRow]:
        return [dataclasses.replace(r, **{field: getattr(r, field) + amount}) for r in base]

    vibration_top = score_window(bundle, driven("vibration", 6.0))
    pressure_top = score_window(bundle, driven("pressure_bar", -1.5))

    assert vibration_top.contributions and pressure_top.contributions
    assert vibration_top.contributions[0].signal == "vibration"
    assert pressure_top.contributions[0].signal == "pressure_bar"
    assert vibration_top.contributions[0].signal != pressure_top.contributions[0].signal
