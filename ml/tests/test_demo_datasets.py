"""The committed item-3.2 datasets must still be what the generator produces.

`demo/datasets/*.csv` are checked in so a judge can inspect the exact inputs behind the
scored claim. That only means anything if they still match the generator — otherwise the
demonstration runs on one dataset while the repo shows another.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from pwa_ml.datasets import Corpus, build_corpus, manifest, to_csv

CORPUS_SEED = 20260729
DEMO_DIR = Path(__file__).resolve().parents[2] / "demo" / "datasets"


@pytest.fixture(scope="module")
def corpus() -> Corpus:
    return build_corpus(seed=CORPUS_SEED)


def test_the_committed_csvs_match_the_generator(corpus: Corpus) -> None:
    expected = {
        "holdout_healthy.csv": to_csv(corpus.demo_healthy),
        "holdout_degraded.csv": to_csv(corpus.demo_degraded),
    }

    for name, content in expected.items():
        path = DEMO_DIR / name
        assert path.is_file(), f"{name} is missing; run scripts/build_demo_datasets.py"
        # Compare digests, not the strings themselves: a mismatch on 45KB of CSV makes
        # pytest render a diff that takes minutes and tells you nothing useful.
        committed = hashlib.sha256(path.read_bytes()).hexdigest()
        regenerated = hashlib.sha256(content.encode("utf-8")).hexdigest()
        assert committed == regenerated, (
            f"{name} has drifted from the generator ({committed[:12]} != "
            f"{regenerated[:12]}) — run scripts/build_demo_datasets.py, or the demo runs "
            "on different data from what the repository shows"
        )


def test_the_manifest_records_the_reserved_pair(corpus: Corpus) -> None:
    recorded = json.loads((DEMO_DIR / "manifest.json").read_text(encoding="utf-8"))

    assert recorded == json.loads(manifest(corpus))
    assert recorded["simulated"] is True
    assert recorded["demo_healthy"] not in recorded["train"]
    assert recorded["demo_degraded"] not in recorded["train"]
    assert recorded["demo_healthy"] not in recorded["validation"]
    assert recorded["demo_degraded"] not in recorded["validation"]
