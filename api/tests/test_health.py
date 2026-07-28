"""S0 acceptance: the API skeleton starts and /healthz is reachable (T0.1, partial).

RED-proof: before app/main.py exists this fails at import (ModuleNotFoundError);
with a broken lifespan it fails at TestClient startup — not on a missing fixture.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_healthz_ok() -> None:
    with TestClient(app) as client:  # runs lifespan startup+shutdown
        resp = client.get("/healthz")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


def test_lifespan_binds_ingest_bridge() -> None:
    """The Codex-#11 bridge is created and bound during startup."""
    with TestClient(app):
        assert app.state.bridge is not None
        assert app.state.bridge._loop is not None
