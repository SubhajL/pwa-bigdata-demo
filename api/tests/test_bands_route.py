"""T4 — GET /api/twin/bands (DREP-PR7b R4).

The frontend must tell a pressure DROP (`value < low`) from a spike (`value > high`) without
hardcoding thresholds (CLAUDE.md forbids that). Exposing the bands read-only is how it gets
them. Authored by Claude; the implementer must not modify this file (DREP §10).
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def _client() -> TestClient:
    from app.main import app

    return TestClient(app)


def test_bands_route_returns_every_band_with_low_and_high() -> None:
    from app.bands import SIGNAL_BANDS

    with _client() as client:
        response = client.get("/api/twin/bands")
    assert response.status_code == 200
    body = response.json()
    bands = body["bands"]
    assert set(bands) == set(SIGNAL_BANDS)
    for signal, (low, high) in SIGNAL_BANDS.items():
        assert bands[signal]["low"] == low
        assert bands[signal]["high"] == high


def test_bands_route_needs_no_database() -> None:
    # Bands are static constants — the route must answer even with the DB unconfigured,
    # unlike the topology/impact routes which 503 without a pool.
    import os

    os.environ["MQTT_ENABLED"] = "0"
    with _client() as client:
        assert client.get("/api/twin/bands").status_code == 200
