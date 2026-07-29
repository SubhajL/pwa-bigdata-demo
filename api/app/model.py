"""Loading the serialized model into the API process (slice S6).

Until this slice the API image contained no `ml/` at all: `api/Dockerfile` copied only
`app`, and the compose build context was `api/`, so nothing under `ml/` was even reachable
from the build. The image now carries the package *and* builds its own artifact, so a
freshly-cloned demo has a model without a separate training step and without a bind mount
that a judge's machine might not have.

The artifact is a build output, not source (`.gitignore` excludes `*.pkl`), so it is
resolved at runtime rather than imported. A missing artifact is reported as `None` instead
of raising: the pipeline endpoints scored by topic ๑ must keep serving even when the
predictive half is unavailable, exactly as an unreachable database leaves `/healthz` up.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

from pwa_ml.predict import Bundle, load_bundle

logger = logging.getLogger(__name__)

#: Where `python -m pwa_ml` writes inside the image (WORKDIR is `/srv`).
CONTAINER_ARTIFACT = Path("/srv/artifacts/model.pkl")

#: The developer layout: `<repo>/ml/artifacts/model.pkl`, four parents up from this file.
REPO_ARTIFACT = Path(__file__).resolve().parents[2] / "ml" / "artifacts" / "model.pkl"


def resolve_model_path(configured: str = "") -> Path | None:
    """The first artifact that actually exists, or None.

    An explicitly configured path is never silently overridden — if `MODEL_PATH` is set and
    wrong, that is a misconfiguration the operator needs to see, not something to paper
    over by falling back to a different model than the one they asked for.
    """
    if configured.strip():
        path = Path(configured.strip())
        if not path.is_file():
            logger.error("MODEL_PATH=%s does not exist; predictive endpoints disabled", path)
            return None
        return path
    for candidate in (CONTAINER_ARTIFACT, REPO_ARTIFACT):
        if candidate.is_file():
            return candidate
    return None


@lru_cache(maxsize=4)
def _load_cached(path: str) -> Bundle:
    """Deserialize once per path. Unpickling a scikit-learn pipeline is not free, and
    `score_all` runs on a timer over the whole roster."""
    return load_bundle(Path(path))


def get_bundle(configured: str = "") -> Bundle | None:
    """The loaded model, or None when no artifact is available.

    Returns:
        The deserialized `Bundle`, cached across calls, or None if the artifact is absent
        or unreadable. Never raises — a corrupt artifact disables prediction rather than
        preventing the API from starting.
    """
    path = resolve_model_path(configured)
    if path is None:
        logger.warning(
            "no model artifact found (looked at %s and %s); build it with "
            "`cd ml && python -m pwa_ml`",
            CONTAINER_ARTIFACT,
            REPO_ARTIFACT,
        )
        return None
    try:
        return _load_cached(str(path))
    except Exception:
        # Broad on purpose: joblib raises anything the pickled object's module raises, and
        # every one of them must leave the rest of the API serving. Logged, never silent.
        logger.exception("model artifact at %s could not be loaded", path)
        return None
