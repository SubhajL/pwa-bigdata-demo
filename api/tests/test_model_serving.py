"""Serving the model from the API process (slice S6).

Until this slice the API image could not see `ml/` at all — the compose build context was
`api/`, so the model was not merely uncopied but unreachable. Making the API import
`pwa_ml` introduced a failure mode that in-process tests cannot see: `conftest.py` puts
`ml/` on `sys.path` for the PYTEST interpreter, so every test here would pass while
`uvicorn app.main:app` refused to boot.

That is not hypothetical. It happened, and the only symptom was two unrelated-looking
tests reporting `port never opened within 60s`.
"""
from __future__ import annotations

import os
import pathlib
import shutil
import subprocess
import sys

import pytest

from app.model import CONTAINER_ARTIFACT, REPO_ARTIFACT, get_loaded, resolve_model_path

API_DIR = pathlib.Path(__file__).resolve().parents[1]
REPO_ROOT = API_DIR.parent


def _clean_env() -> dict[str, str]:
    """The environment a plain `uvicorn app.main:app` would inherit.

    PYTHONPATH is stripped deliberately: keeping it would let the harness that masked the
    original bug mask it again.
    """
    return {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}


def test_the_app_imports_with_no_help_from_the_test_harness() -> None:
    """`uvicorn app.main:app` from `api/` must boot on a plain developer checkout."""
    result = subprocess.run(
        [sys.executable, "-c", "import app.main; print(app.main.app.title)"],
        cwd=API_DIR, capture_output=True, text=True, timeout=180, env=_clean_env(),
    )

    assert result.returncode == 0, (
        f"`import app.main` failed from {API_DIR} without PYTHONPATH:\n{result.stderr}"
    )
    assert "PWA Big Data Demo API" in result.stdout


def test_pwa_ml_resolves_from_the_api_package_alone() -> None:
    """The model package must be importable through `app`'s own bootstrap."""
    result = subprocess.run(
        [sys.executable, "-c", "import app; import pwa_ml.predict as p; print(p.MIN_WINDOW_HOURS)"],
        cwd=API_DIR, capture_output=True, text=True, timeout=180, env=_clean_env(),
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "16"


def test_the_shipped_artifact_loads_through_the_production_path(model_artifact: object) -> None:
    """`get_loaded` is what the app calls; test it, not a hand-rolled joblib.load."""
    loaded = get_loaded("")

    assert loaded is not None, "the demo artifact must be loadable"
    bundle = loaded.bundle
    assert set(bundle.pipelines) == {"health", "pttf"}
    assert bundle.model_version
    assert len(bundle.feature_names) == 15


def test_an_explicitly_configured_path_is_never_silently_overridden() -> None:
    """A wrong MODEL_PATH must disable prediction, not fall back to a different model.

    Falling back would mean the operator believes they are serving the artifact they
    named while the demo serves another one.
    """
    assert resolve_model_path("/nonexistent/model.pkl") is None
    assert get_loaded("/nonexistent/model.pkl") is None


def test_scripts_import_pwa_ml_in_the_CONTAINER_layout(tmp_path: pathlib.Path) -> None:
    """`docker compose` runs the backfill BY PATH, and that is the case that broke.

    Python puts the SCRIPT'S directory on `sys.path` for a script invocation, never the
    working directory — so in the image (`/srv/pwa_ml` beside `/srv/scripts`) the module is
    NOT importable without help. An earlier bootstrap tested for `pwa_ml` next to the repo
    root and skipped the fix exactly when it was needed; `docker compose up` died there, and
    because `api` waits on `backfill` completing, the whole stack never started.

    This reproduces the image layout on disk rather than trusting a path constant.
    """
    (tmp_path / "scripts").mkdir()
    shutil.copy(REPO_ROOT / "scripts" / "backfill_history.py", tmp_path / "scripts")
    (tmp_path / "pwa_ml").symlink_to(REPO_ROOT / "ml" / "pwa_ml", target_is_directory=True)

    result = subprocess.run(
        [sys.executable, str(tmp_path / "scripts" / "backfill_history.py")],
        cwd=tmp_path, capture_output=True, text=True, timeout=180,
        env={**_clean_env(), "DATABASE_URL": "postgresql://nobody@127.0.0.1:1/nope"},
    )

    assert "ModuleNotFoundError" not in result.stderr, (
        f"the backfill script cannot import pwa_ml in the container layout:\n{result.stderr}"
    )


def test_the_container_artifact_location_matches_what_the_image_builds() -> None:
    """`pwa_ml.__main__` writes beside the package; `model.py` must look in that place."""
    assert CONTAINER_ARTIFACT.parent.name == "artifacts"
    assert CONTAINER_ARTIFACT.parent.parent == pathlib.Path("/srv")
    assert REPO_ARTIFACT.parts[-3:] == ("ml", "artifacts", "model.pkl")


@pytest.mark.integration
def test_backfill_reruns_preserve_the_conservation_invariant(pool: object) -> None:
    """`/api/pipeline/status` publishes `ledger == telemetry + dead_letter` to the judge.

    Backfill writes telemetry, so it must write ledger rows too — and its cleanup must not
    reach rows it did not create. Deleting by `run_id LIKE 'backfill-%'` did: an operator
    may set `RUN_ID=backfill-anything` on the simulator, and a dead letter from that run
    would keep its dead_letter row while losing its ledger row, breaking the indicator.
    """
    from datetime import UTC, datetime

    from scripts.backfill_history import _PREFIX, backfill

    from app.db import Accepted, Rejected, conservation_totals, disposition
    from app.models import Reading

    from .conftest import purge_backfill

    with pool.connection() as conn:  # type: ignore[attr-defined]
        disposition(
            conn,
            message_id=f"sim-{datetime.now(tz=UTC).timestamp()}",
            run_id="backfill-operator-chose-this",
            raw={"bad": True},
            outcome=Rejected("x", "backfill-operator-chose-this", "NOPE", "unknown asset"),
        )
        # The collision that the `message_id LIKE` predicate alone did NOT survive:
        # `message_id` is taken verbatim off the wire for REJECTED messages too, so a
        # publisher can put a dead letter squarely inside the backfill's namespace.
        colliding = f"{_PREFIX}forged-{datetime.now(tz=UTC).timestamp()}"
        disposition(
            conn,
            message_id=colliding,
            run_id="sim-run",
            raw={"forged": True},
            outcome=Rejected(colliding, "sim-run", "NOPE", "unknown asset"),
        )
        # ...and an ACCEPTED message in the same namespace. This is the harder case: the
        # two cleanup DELETEs are separate statements, so a prefix predicate could delete
        # its ledger row while its telemetry row survived.
        accepted_id = f"{_PREFIX}accepted-{datetime.now(tz=UTC).timestamp()}"
        disposition(
            conn,
            message_id=accepted_id,
            run_id="sim-run",
            raw={"ok": True},
            outcome=Accepted(
                Reading(
                    message_id=accepted_id, run_id="sim-run", ts=datetime.now(tz=UTC),
                    asset_id="P-1", signal="pressure_bar", value=3.3,
                )
            ),
        )
        backfill(conn, now=datetime.now(tz=UTC), assets=3)
        backfill(conn, now=datetime.now(tz=UTC), assets=3)

    try:
        totals = conservation_totals(pool)  # type: ignore[arg-type]  # noqa: F841
        assert totals["ledger"] == totals["telemetry"] + totals["dead_letter"], (
            f"conservation broken after a backfill re-run: {totals}"
        )
        # Both forged rows must survive, dead-lettered AND accepted. Identity is
        # wire-supplied, so neither may be treated as backfill-owned.
        with pool.connection() as conn, conn.cursor() as cur:  # type: ignore[attr-defined]
            for forged in (colliding, accepted_id):
                cur.execute(
                    "SELECT count(*) FROM ingress_ledger WHERE message_id = %s", (forged,)
                )
                assert (cur.fetchone() or [0])[0] == 1, (
                    f"the backfill deleted the ledger row of {forged!r}, which it did not write"
                )
            cur.execute("SELECT count(*) FROM telemetry WHERE message_id = %s", (accepted_id,))
            assert (cur.fetchone() or [0])[0] == 1, (
                "the backfill deleted an accepted reading that merely shared its name prefix"
            )
    finally:
        purge_backfill(pool)  # type: ignore[arg-type]

    # The purge helper must preserve the invariant too — an earlier version did not, and
    # the breakage surfaced in a completely different test file.
    totals = conservation_totals(pool)  # type: ignore[arg-type]
    assert totals["ledger"] == totals["telemetry"] + totals["dead_letter"], (
        f"conservation broken by the test purge helper: {totals}"
    )
