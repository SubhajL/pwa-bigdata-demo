"""PR-G — fail-closed GIS API contract (rayong-pipe-gis-sec-plan Phase 2).

The trust boundary under test: disabled -> 404 (the feature does not exist here);
enabled but missing/corrupt/oversize/hash-drifted/structurally-invalid bundle -> 503
(the dependency is broken, never silently substituted); unknown scope -> 422. The
bundle is verified INTO MEMORY at startup, so post-startup filesystem changes cannot
alter what is served or make a strong ETag lie (QCHECK 2026-08-05: post-startup
mutation/symlink swap, OSError escape, hash-valid corrupt GeoJSON, If-None-Match
matrix, manifest cap, energy-reference pinning).

The bundle here is handcrafted — these tests must run without the GIS build
dependencies; the builder<->API schema cross-check lives in test_build_pipe_gis.py.
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
from typing import Any

import pytest
from fastapi.testclient import TestClient

GIS_ENDPOINTS = ("/api/twin/gis/manifest", "/api/twin/gis/network")


def _client() -> TestClient:
    from app.main import app

    return TestClient(app)


def _geojson(pipe_id: int) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"pipe_id": pipe_id, "pipe_type": "HDPE"},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[101.19, 12.68], [101.2, 12.69]],
                },
            }
        ],
    }


def _write_valid_bundle(dir_: pathlib.Path) -> dict[str, Any]:
    """A minimal, internally consistent bundle; returns the manifest dict."""
    dir_.mkdir(parents=True, exist_ok=True)
    datasets: dict[str, dict[str, Any]] = {}
    for scope, name, pipe_id in (
        ("full", "network.geojson", 1),
        ("map-ta-phut", "map_ta_phut.geojson", 2),
    ):
        body = json.dumps(_geojson(pipe_id), ensure_ascii=False).encode("utf-8")
        (dir_ / name).write_bytes(body)
        datasets[scope] = {
            "file": name,
            "feature_count": 1,
            "bounds_wgs84": [101.19, 12.68, 101.2, 12.69],
            "length_m": 1234.5,
            "sha256": hashlib.sha256(body).hexdigest(),
            "bytes": len(body),
        }
    manifest: dict[str, Any] = {
        "schema_version": "pipe-ry-gis-1",
        "generated_at": "2026-08-05T12:00:00Z",
        "source": {
            "dataset": "PIPE RY (Rayong pipe GIS)",
            "crs": "EPSG:32647",
            "output_crs": "EPSG:4326",
            "feature_count": 2,
            "files": {"PIPE RY.shp": {"sha256": "ab" * 32, "bytes": 10}},
        },
        "datasets": datasets,
        "demo_binding": {
            "scenario_asset_id": "P-2",
            "pipe_id": 1,
            "rule": "longest Map Ta Phut focus pipe, ties broken by lowest pipe id",
            "midpoint_wgs84": [101.195, 12.685],
            "placement": "SIMULATED",
            "properties": {"pipe_id": 1, "pipe_type": "HDPE", "asset_code": None},
        },
        "provenance": {
            "geometry": "REAL",
            "attributes": "REAL",
            "binding": "SIMULATED",
            "placement": "SIMULATED",
            "distribution": (
                "Source-derived artifacts stay local and git-ignored until the data "
                "owner records redistribution permission."
            ),
        },
        "energy_reference": {
            "value_kwh_per_m3": 0.54,
            "unit": "kWh/m³",
            "year": 2025,
            "scope": "system-wide",
            "operator": "East Water",
            "source_url": (
                "https://www.eastwater.com/en/sustainability/sustainability-overview/"
                "environment-dimension/energy-management"
            ),
            "station_specific": False,
        },
    }
    _rewrite_manifest(dir_, manifest)
    return manifest


def _rewrite_manifest(dir_: pathlib.Path, manifest: dict[str, Any]) -> None:
    (dir_ / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _resign_dataset(dir_: pathlib.Path, scope: str, body: bytes) -> None:
    """Rewrite a dataset file AND its manifest digest, so only deeper checks can catch it."""
    manifest = json.loads((dir_ / "manifest.json").read_text(encoding="utf-8"))
    entry = manifest["datasets"][scope]
    (dir_ / str(entry["file"])).write_bytes(body)
    entry["sha256"] = hashlib.sha256(body).hexdigest()
    entry["bytes"] = len(body)
    _rewrite_manifest(dir_, manifest)


@pytest.fixture(autouse=True)
def hermetic_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin the environment: a dead DB port (the GIS contract must hold without a
    database) and explicit GIS vars, so a developer's local `.env`/TimescaleDB cannot
    influence these tests (pydantic-settings lets real env vars beat the env file)."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://pwa:pwa@127.0.0.1:9/pwa")
    monkeypatch.setenv("PIPE_GIS_ENABLED", "0")
    monkeypatch.setenv("PIPE_GIS_DIR", "")


@pytest.fixture()
def gis_enabled(monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path) -> pathlib.Path:
    bundle_dir = tmp_path / "pipe_ry"
    _write_valid_bundle(bundle_dir)
    monkeypatch.setenv("PIPE_GIS_ENABLED", "1")
    monkeypatch.setenv("PIPE_GIS_DIR", str(bundle_dir))
    return bundle_dir


# ── disabled: the feature does not exist here ──────────────────────────────────────────


def test_gis_disabled_returns_404_for_both_endpoints() -> None:
    with _client() as client:
        for endpoint in GIS_ENDPOINTS:
            response = client.get(endpoint)
            assert response.status_code == 404, endpoint
            assert "PIPE_GIS_ENABLED" in response.json()["detail"]


# ── enabled but broken: 503, never a silent substitute ─────────────────────────────────


def test_gis_enabled_but_dir_unset_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PIPE_GIS_ENABLED", "1")
    with _client() as client:
        for endpoint in GIS_ENDPOINTS:
            assert client.get(endpoint).status_code == 503, endpoint


def test_gis_enabled_but_missing_bundle_returns_503(
    monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path
) -> None:
    monkeypatch.setenv("PIPE_GIS_ENABLED", "1")
    monkeypatch.setenv("PIPE_GIS_DIR", str(tmp_path / "nowhere"))
    with _client() as client:
        for endpoint in GIS_ENDPOINTS:
            assert client.get(endpoint).status_code == 503, endpoint


def test_gis_corrupt_manifest_returns_503(gis_enabled: pathlib.Path) -> None:
    (gis_enabled / "manifest.json").write_text("{not json", encoding="utf-8")
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


def test_gis_size_drift_returns_503(gis_enabled: pathlib.Path) -> None:
    # File length no longer matches the manifest.
    target = gis_enabled / "network.geojson"
    target.write_bytes(target.read_bytes() + b" ")
    with _client() as client:
        assert client.get("/api/twin/gis/network?scope=full").status_code == 503


def test_gis_same_size_corruption_returns_503(gis_enabled: pathlib.Path) -> None:
    # SAME length, one flipped byte: only the sha256 comparison can catch this, so a
    # regression that drops hash verification "because size is already checked" fails
    # here (QCHECK: the earlier append-a-byte test never reached the hash check).
    target = gis_enabled / "network.geojson"
    original = target.read_bytes()
    flipped = bytes([original[0] ^ 0xFF]) + original[1:]
    assert len(flipped) == len(original) and flipped != original
    target.write_bytes(flipped)
    with _client() as client:
        assert client.get("/api/twin/gis/network?scope=full").status_code == 503


def test_gis_missing_dataset_file_returns_503_not_crash(
    gis_enabled: pathlib.Path,
) -> None:
    # Manifest valid, one file absent (partial copy/rsync) — must be 503, not startup death.
    (gis_enabled / "network.geojson").unlink()
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503
        assert client.get("/healthz").status_code == 200


@pytest.mark.skipif(os.geteuid() == 0, reason="chmod 000 does not bar root")
def test_gis_unreadable_file_returns_503_and_api_survives(
    gis_enabled: pathlib.Path,
) -> None:
    # A root-owned/mode-000 file in a bind-mounted bundle must degrade GIS to 503 while
    # /healthz stays alive — an uncaught OSError here previously killed startup.
    target = gis_enabled / "network.geojson"
    target.chmod(0o000)
    try:
        with _client() as client:
            assert client.get("/api/twin/gis/network").status_code == 503
            assert client.get("/healthz").status_code == 200
    finally:
        target.chmod(0o644)


def test_gis_oversize_file_returns_503(
    monkeypatch: pytest.MonkeyPatch, gis_enabled: pathlib.Path
) -> None:
    monkeypatch.setenv("PIPE_GIS_MAX_BYTES", "10")
    with _client() as client:
        assert client.get("/api/twin/gis/network").status_code == 503


def test_gis_oversize_manifest_returns_503(gis_enabled: pathlib.Path) -> None:
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    manifest["padding"] = "x" * 1_100_000  # over the 1 MB manifest cap
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


def test_gis_traversal_file_name_fails_closed(gis_enabled: pathlib.Path) -> None:
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    evil = gis_enabled.parent / "evil.geojson"
    evil.write_bytes(b'{"type":"FeatureCollection","features":[]}')
    manifest["datasets"]["full"]["file"] = "../evil.geojson"
    manifest["datasets"]["full"]["sha256"] = hashlib.sha256(evil.read_bytes()).hexdigest()
    manifest["datasets"]["full"]["bytes"] = evil.stat().st_size
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        for endpoint in GIS_ENDPOINTS:
            assert client.get(endpoint).status_code == 503, endpoint


def test_gis_symlink_dataset_fails_closed(gis_enabled: pathlib.Path) -> None:
    # A symlink inside the bundle pointing outside it must not be followed, even with a
    # matching digest: confinement is about where bytes COME FROM, not what they hash to.
    outside = gis_enabled.parent / "outside.geojson"
    body = json.dumps(_geojson(9)).encode("utf-8")
    outside.write_bytes(body)
    (gis_enabled / "network.geojson").unlink()
    (gis_enabled / "network.geojson").symlink_to(outside)
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    manifest["datasets"]["full"]["sha256"] = hashlib.sha256(body).hexdigest()
    manifest["datasets"]["full"]["bytes"] = len(body)
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        assert client.get("/api/twin/gis/network?scope=full").status_code == 503


def test_gis_hash_valid_but_not_geojson_fails_closed(gis_enabled: pathlib.Path) -> None:
    # Digest agreement is not enough: bytes that are not a FeatureCollection must 503.
    _resign_dataset(gis_enabled, "full", b"def main() -> int:\n    return 42\n")
    with _client() as client:
        assert client.get("/api/twin/gis/network?scope=full").status_code == 503


def test_gis_feature_count_mismatch_fails_closed(gis_enabled: pathlib.Path) -> None:
    two = _geojson(1)
    two["features"].append(_geojson(2)["features"][0])
    _resign_dataset(gis_enabled, "full", json.dumps(two).encode("utf-8"))  # manifest says 1
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("value_kwh_per_m3", 0.55),
        ("unit", "MW"),
        ("year", 2099),
        ("operator", "Unknown Water Co"),
        ("source_url", "https://example.com/not-east-water"),
        ("station_specific", True),
    ],
)
def test_gis_energy_reference_is_pinned_to_the_official_figure(
    gis_enabled: pathlib.Path, field: str, value: Any
) -> None:
    # The official reference is one exact, sourced figure. A bundle claiming any other
    # value/unit/year/operator/source is asserting evidence nobody has — refuse it.
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    manifest["energy_reference"][field] = value
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503, field


def test_gis_non_simulated_binding_claim_fails_closed(gis_enabled: pathlib.Path) -> None:
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    manifest["demo_binding"]["placement"] = "REAL"
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


def test_gis_manifest_missing_scope_fails_closed(gis_enabled: pathlib.Path) -> None:
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    del manifest["datasets"]["map-ta-phut"]
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


# ── the healthy path ───────────────────────────────────────────────────────────────────


def test_gis_manifest_serves_schema_provenance_and_energy_reference(
    gis_enabled: pathlib.Path,
) -> None:
    with _client() as client:
        response = client.get("/api/twin/gis/manifest")
    assert response.status_code == 200
    body = response.json()
    assert body["schema_version"] == "pipe-ry-gis-1"
    assert body["provenance"]["geometry"] == "REAL"
    assert body["provenance"]["binding"] == "SIMULATED"
    assert body["demo_binding"]["placement"] == "SIMULATED"
    reference = body["energy_reference"]
    assert reference["value_kwh_per_m3"] == 0.54
    assert reference["year"] == 2025
    assert reference["scope"] == "system-wide"
    assert reference["station_specific"] is False


def test_gis_network_serves_geojson_with_etag_and_cache_headers(
    gis_enabled: pathlib.Path,
) -> None:
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    with _client() as client:
        focus = client.get("/api/twin/gis/network")  # default scope: map-ta-phut
        full = client.get("/api/twin/gis/network?scope=full")
    assert focus.status_code == 200 and full.status_code == 200
    assert focus.headers["content-type"].startswith("application/geo+json")
    focus_sha = manifest["datasets"]["map-ta-phut"]["sha256"]
    full_sha = manifest["datasets"]["full"]["sha256"]
    assert focus.headers["etag"] == f'"{focus_sha}"'
    assert full.headers["etag"] == f'"{full_sha}"'
    assert "max-age" in focus.headers["cache-control"]
    assert focus.json()["features"][0]["properties"]["pipe_id"] == 2
    assert full.json()["features"][0]["properties"]["pipe_id"] == 1


def test_gis_serves_the_startup_snapshot_not_the_live_file(
    gis_enabled: pathlib.Path,
) -> None:
    # The bundle is verified into memory ONCE. A post-startup rewrite of the file must
    # change NOTHING served — otherwise the strong ETag would vouch for bytes that were
    # never hash-verified (QCHECK HIGH: post-startup mutation under a stale ETag).
    with _client() as client:
        before = client.get("/api/twin/gis/network?scope=full")
        (gis_enabled / "network.geojson").write_bytes(b'{"type":"FeatureCollection"}')
        after = client.get("/api/twin/gis/network?scope=full")
    assert after.status_code == 200
    assert after.content == before.content
    assert after.headers["etag"] == before.headers["etag"]


def test_gis_network_if_none_match_matrix(gis_enabled: pathlib.Path) -> None:
    with _client() as client:
        first = client.get("/api/twin/gis/network")
        assert first.status_code == 200
        etag = first.headers["etag"]
        for header in (etag, f'"other", {etag}', "*", f"W/{etag}"):
            revalidated = client.get(
                "/api/twin/gis/network", headers={"If-None-Match": header}
            )
            assert revalidated.status_code == 304, header
            assert revalidated.headers["etag"] == etag, header
        fresh = client.get(
            "/api/twin/gis/network", headers={"If-None-Match": '"not-the-etag"'}
        )
    assert fresh.status_code == 200  # a stale validator must yield the full body


def test_gis_network_unknown_scope_is_422(gis_enabled: pathlib.Path) -> None:
    with _client() as client:
        assert client.get("/api/twin/gis/network?scope=bangkok").status_code == 422
