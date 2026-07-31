"""Regenerate the committed item-3.2 demonstration datasets.

These two lifecycles are RESERVED: `build_corpus` removes them before splitting, so the
model never trains or tunes on them. Committing them as CSV rather than parquet is
deliberate — they are reviewable in a diff, and it keeps a heavy columnar dependency out
of an image that only needs to run inference.

    python scripts/build_demo_datasets.py
"""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml"))

from pwa_ml.datasets import CORPUS_SEED, build_corpus, manifest, to_csv  # noqa: E402

OUT = ROOT / "demo" / "datasets"


def main() -> int:
    corpus = build_corpus(seed=CORPUS_SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "holdout_healthy.csv").write_text(to_csv(corpus.demo_healthy), encoding="utf-8")
    (OUT / "holdout_degraded.csv").write_text(to_csv(corpus.demo_degraded), encoding="utf-8")
    (OUT / "manifest.json").write_text(manifest(corpus), encoding="utf-8")
    print(
        f"wrote holdout_healthy={corpus.demo_healthy.lifecycle_id} "
        f"holdout_degraded={corpus.demo_degraded.lifecycle_id} "
        f"(reserved from {len(corpus.train)} train / {len(corpus.validation)} validation)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
