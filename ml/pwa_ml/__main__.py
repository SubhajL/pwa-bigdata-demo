"""Build the demo model artifact.

Scored item 3.1 asks for a trained model file that EXISTS ON DISK. Producing one only
inside a pytest temporary directory satisfies the tests and leaves the demo with nothing
to load, so this is the documented build command:

    cd ml && python -m pwa_ml

Writes `ml/artifacts/model.pkl` (git-ignored — it is a build output) and
`ml/artifacts/model_card.json` (committed — it is the record of what was trained).
"""
from __future__ import annotations

import pathlib
import sys

from .datasets import build_corpus
from .train import CARD_NAME, train

#: Fixed so the committed card and any rebuild describe the same corpus.
CORPUS_SEED = 20260729

ARTIFACT_DIR = pathlib.Path(__file__).resolve().parent.parent / "artifacts"


def main() -> int:
    corpus = build_corpus(seed=CORPUS_SEED)
    path = train(corpus, ARTIFACT_DIR)
    print(f"wrote {path}")
    print(f"wrote {ARTIFACT_DIR / CARD_NAME}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
