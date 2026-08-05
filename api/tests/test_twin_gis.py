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
APPROVED_SOURCE_FINGERPRINT = "ab" * 32


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


def _feature(pipe_id: int, **props: Any) -> dict[str, Any]:
    """One GeoJSON feature with ONLY allowlisted properties (PR-R3 finding 1)."""
    return {
        "type": "Feature",
        "properties": {"pipe_id": pipe_id, "pipe_type": "HDPE", **props},
        "geometry": {"type": "LineString", "coordinates": [[101.19, 12.68], [101.2, 12.69]]},
    }


def _collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}


#: The bound pipe (id 2) appears in BOTH scopes with IDENTICAL properties; the full scope
#: also carries an unbound pipe (id 1). The binding therefore resolves to exactly one
#: feature per scope — the consistency PR-R3 finding 3 enforces at load.
_BOUND_PROPERTIES: dict[str, Any] = {"pipe_id": 2, "pipe_type": "HDPE", "asset_code": "AC-2"}


def _write_valid_bundle(dir_: pathlib.Path) -> dict[str, Any]:
    """A minimal, internally consistent bundle; returns the manifest dict."""
    dir_.mkdir(parents=True, exist_ok=True)
    bound = _feature(2, asset_code="AC-2")
    collections = {
        "full": _collection([_feature(1, asset_code=None), bound]),
        "map-ta-phut": _collection([bound]),
    }
    datasets: dict[str, dict[str, Any]] = {}
    for scope, name in (("full", "network.geojson"), ("map-ta-phut", "map_ta_phut.geojson")):
        body = json.dumps(collections[scope], ensure_ascii=False).encode("utf-8")
        (dir_ / name).write_bytes(body)
        datasets[scope] = {
            "file": name,
            "feature_count": len(collections[scope]["features"]),
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
            "fingerprint_sha256": APPROVED_SOURCE_FINGERPRINT,
            "files": {
                name: {"sha256": "ab" * 32, "bytes": 10}
                for name in ("PIPE RY.shp", "PIPE RY.dbf", "PIPE RY.shx", "PIPE RY.prj")
            },
            "audit": {
                "branch_code": "5531021",
                "global_id_unique": True,
                "expected_full": 2,
                "expected_focus": 1,
            },
        },
        "datasets": datasets,
        "demo_binding": {
            "scenario_asset_id": "P-2",
            "pipe_id": 2,
            "rule": "longest Map Ta Phut focus pipe, ties broken by lowest pipe id",
            "midpoint_wgs84": [101.195, 12.685],
            "placement": "SIMULATED",
            "properties": dict(_BOUND_PROPERTIES),
        },
        "provenance": {
            "geometry": "REAL",
            "attributes": "REAL",
            "binding": "SIMULATED",
            "placement": "SIMULATED",
            "distribution": (
                "Source-derived artifacts stay local and git-ignored until the data "
                "owner records redistribution permission "
                "(docs/data/pipe-ry-provenance.md)."
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


def _bundle_sha256(dir_: pathlib.Path) -> str:
    digest = hashlib.sha256(b"pipe-ry-bundle-v1\0")
    for name in ("manifest.json", "network.geojson", "map_ta_phut.geojson"):
        payload = (dir_ / name).read_bytes()
        name_bytes = name.encode("utf-8")
        digest.update(len(name_bytes).to_bytes(4, "big"))
        digest.update(name_bytes)
        digest.update(len(payload).to_bytes(8, "big"))
        digest.update(payload)
    return digest.hexdigest()


@pytest.fixture(autouse=True)
def hermetic_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin the environment: a dead DB port (the GIS contract must hold without a
    database) and explicit GIS vars, so a developer's local `.env`/TimescaleDB cannot
    influence these tests (pydantic-settings lets real env vars beat the env file)."""
    import app.models as gis_models

    # The served fixture is intentionally tiny; production constants remain 9,273/19.
    monkeypatch.setattr(gis_models, "AUDITED_FULL_COUNT", 2)
    monkeypatch.setattr(gis_models, "AUDITED_FOCUS_COUNT", 1)
    monkeypatch.setenv("DATABASE_URL", "postgresql://pwa:pwa@127.0.0.1:9/pwa")
    monkeypatch.setenv("PIPE_GIS_ENABLED", "0")
    monkeypatch.setenv("PIPE_GIS_DIR", "")
    monkeypatch.setenv("PIPE_GIS_APPROVED_SOURCE_FINGERPRINT", "")
    monkeypatch.setenv("PIPE_GIS_APPROVED_BUNDLE_SHA256", "")


@pytest.fixture()
def gis_enabled(monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path) -> pathlib.Path:
    bundle_dir = tmp_path / "pipe_ry"
    _write_valid_bundle(bundle_dir)
    monkeypatch.setenv("PIPE_GIS_ENABLED", "1")
    monkeypatch.setenv("PIPE_GIS_DIR", str(bundle_dir))
    monkeypatch.setenv(
        "PIPE_GIS_APPROVED_SOURCE_FINGERPRINT", APPROVED_SOURCE_FINGERPRINT
    )
    monkeypatch.setenv("PIPE_GIS_APPROVED_BUNDLE_SHA256", _bundle_sha256(bundle_dir))
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


def test_enabled_gis_without_external_fingerprint_fails_closed(
    monkeypatch: pytest.MonkeyPatch, gis_enabled: pathlib.Path
) -> None:
    monkeypatch.delenv("PIPE_GIS_APPROVED_SOURCE_FINGERPRINT")
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


def test_enabled_gis_with_mismatched_external_fingerprint_fails_closed(
    monkeypatch: pytest.MonkeyPatch, gis_enabled: pathlib.Path
) -> None:
    monkeypatch.setenv("PIPE_GIS_APPROVED_SOURCE_FINGERPRINT", "cd" * 32)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


def test_enabled_gis_with_matching_external_fingerprint_serves(
    monkeypatch: pytest.MonkeyPatch, gis_enabled: pathlib.Path
) -> None:
    monkeypatch.setenv(
        "PIPE_GIS_APPROVED_SOURCE_FINGERPRINT", APPROVED_SOURCE_FINGERPRINT.upper()
    )
    with _client() as client:
        response = client.get("/api/twin/gis/manifest")
    assert response.status_code == 200
    assert response.json()["source"]["fingerprint_sha256"] == APPROVED_SOURCE_FINGERPRINT


def test_enabled_gis_without_external_bundle_digest_fails_closed(
    monkeypatch: pytest.MonkeyPatch, gis_enabled: pathlib.Path
) -> None:
    monkeypatch.delenv("PIPE_GIS_APPROVED_BUNDLE_SHA256")
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


def test_enabled_gis_with_mismatched_bundle_digest_fails_closed(
    monkeypatch: pytest.MonkeyPatch, gis_enabled: pathlib.Path
) -> None:
    monkeypatch.setenv("PIPE_GIS_APPROVED_BUNDLE_SHA256", "cd" * 32)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


def test_resigned_bundle_with_copied_source_fingerprint_fails_closed(
    gis_enabled: pathlib.Path,
) -> None:
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    # Still schema-valid: only the exact external bundle digest can catch this rewrite.
    manifest["generated_at"] = "2026-08-06T00:00:00Z"
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


@pytest.mark.parametrize(
    "surface",
    ("dataset", "filename", "source_digest", "binding_rule", "distribution"),
)
def test_manifest_narrative_surfaces_cannot_leak_private_source_values(
    gis_enabled: pathlib.Path, surface: str
) -> None:
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    if surface == "dataset":
        manifest["source"]["dataset"] = "private audit remark"
    elif surface == "filename":
        manifest["source"]["files"]["private-audit-id.txt"] = {
            "sha256": "ab" * 32,
            "bytes": 1,
        }
    elif surface == "source_digest":
        manifest["source"]["files"]["PIPE RY.shp"]["sha256"] = "private audit id"
    elif surface == "binding_rule":
        manifest["demo_binding"]["rule"] = "private operator note"
    else:
        manifest["provenance"]["distribution"] = "private redistribution note"
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


def test_manifest_source_fingerprint_malformed_fails_closed(
    gis_enabled: pathlib.Path,
) -> None:
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    manifest["source"]["fingerprint_sha256"] = "not-a-sha256"
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


def test_manifest_counts_must_equal_the_production_audit(
    monkeypatch: pytest.MonkeyPatch, gis_enabled: pathlib.Path
) -> None:
    import app.models as gis_models

    monkeypatch.setattr(gis_models, "AUDITED_FULL_COUNT", 9273)
    monkeypatch.setattr(gis_models, "AUDITED_FOCUS_COUNT", 19)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


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
    full = json.loads((gis_enabled / "network.geojson").read_text(encoding="utf-8"))
    full["features"].append(_feature(99))  # now 3 features; manifest still says 2
    _resign_dataset(gis_enabled, "full", json.dumps(full).encode("utf-8"))
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


# ── PR-R3 finding 1: serve-time property allowlist (data-disclosure boundary) ──────────


def test_gis_feature_with_disallowed_property_key_fails_closed(
    gis_enabled: pathlib.Path,
) -> None:
    # A re-signed bundle smuggling a private field (`remark`, an audit id, a customer
    # column) past the digest must 503 — the manifest hash proves bytes are unchanged,
    # not that they stayed inside the reviewed public surface.
    full = json.loads((gis_enabled / "network.geojson").read_text(encoding="utf-8"))
    full["features"][0]["properties"]["remark"] = "internal DMA note"
    _resign_dataset(gis_enabled, "full", json.dumps(full).encode("utf-8"))
    with _client() as client:
        assert client.get("/api/twin/gis/network?scope=full").status_code == 503


def test_gis_feature_with_nonscalar_property_value_fails_closed(
    gis_enabled: pathlib.Path,
) -> None:
    full = json.loads((gis_enabled / "network.geojson").read_text(encoding="utf-8"))
    full["features"][0]["properties"]["pipe_type"] = {"smuggled": "object"}
    _resign_dataset(gis_enabled, "full", json.dumps(full).encode("utf-8"))
    with _client() as client:
        assert client.get("/api/twin/gis/network?scope=full").status_code == 503


def test_gis_feature_level_foreign_member_fails_closed(gis_enabled: pathlib.Path) -> None:
    # The leak the property allowlist closed must not simply relocate one JSON level out:
    # a Feature-level `id`/`remark`/`_createdBy` (a source system's internal id) would be
    # served in the raw bytes (QCHECK round 2).
    full = json.loads((gis_enabled / "network.geojson").read_text(encoding="utf-8"))
    full["features"][0]["id"] = {"customer": "Alice"}
    full["features"][0]["_createdBy"] = "admin@pwa"
    _resign_dataset(gis_enabled, "full", json.dumps(full).encode("utf-8"))
    with _client() as client:
        assert client.get("/api/twin/gis/network?scope=full").status_code == 503


def test_gis_geometry_level_foreign_member_fails_closed(gis_enabled: pathlib.Path) -> None:
    full = json.loads((gis_enabled / "network.geojson").read_text(encoding="utf-8"))
    full["features"][0]["geometry"]["remark"] = "private geometry metadata"
    _resign_dataset(gis_enabled, "full", json.dumps(full).encode("utf-8"))
    with _client() as client:
        assert client.get("/api/twin/gis/network?scope=full").status_code == 503


def test_gis_collection_level_foreign_member_fails_closed(gis_enabled: pathlib.Path) -> None:
    full = json.loads((gis_enabled / "network.geojson").read_text(encoding="utf-8"))
    full["internal_audit"] = {"leaked": "operator note"}
    _resign_dataset(gis_enabled, "full", json.dumps(full).encode("utf-8"))
    with _client() as client:
        assert client.get("/api/twin/gis/network?scope=full").status_code == 503


@pytest.mark.parametrize(
    "coordinates",
    [
        "a-leaked-string",  # coordinates is not even a list
        [{"leak": 1}, {"leak": 2}],  # positions are objects, not [lon, lat]
        [[101.19, 12.68], [101.2, "bad"]],  # non-numeric coordinate
        [[101.19, 12.68], [True, 12.69]],  # boolean coordinate (bool is a subclass of int)
        [[101.19, 12.68], [200.0, 12.69]],  # longitude outside WGS84 bounds
        [[101.19, 12.68]],  # a LineString with only one position
        [[101.19, 12.68, 5.0], [101.2, 12.69]],  # a third ordinate the builder never emits
        [[float("nan"), 12.68], [101.2, 12.69]],  # NaN — must 503 via the range comparison
        [[10**400, 12.68], [101.2, 12.69]],  # googol int — must 503, NOT raise OverflowError
    ],
)
def test_gis_invalid_coordinates_fail_closed(
    gis_enabled: pathlib.Path, coordinates: Any
) -> None:
    # A digest-valid but structurally-invalid geometry must 503, not serve a blank map
    # (QCHECK round 4: coordinates were only checked to be a list).
    full = json.loads((gis_enabled / "network.geojson").read_text(encoding="utf-8"))
    full["features"][0]["geometry"]["coordinates"] = coordinates
    _resign_dataset(gis_enabled, "full", json.dumps(full).encode("utf-8"))
    with _client() as client:
        assert client.get("/api/twin/gis/network?scope=full").status_code == 503, coordinates


def test_gis_non_finite_property_value_fails_closed(gis_enabled: pathlib.Path) -> None:
    # `NaN`/`Infinity` are valid Python floats but invalid JSON: served raw under a 200,
    # the browser's JSON.parse rejects the body. The API must 503 instead (QCHECK round 5).
    full = json.loads((gis_enabled / "network.geojson").read_text(encoding="utf-8"))
    full["features"][0]["properties"]["length_m"] = float("nan")
    _resign_dataset(gis_enabled, "full", json.dumps(full).encode("utf-8"))
    with _client() as client:
        assert client.get("/api/twin/gis/network?scope=full").status_code == 503


def test_gis_binding_snapshot_with_disallowed_property_fails_closed(
    gis_enabled: pathlib.Path,
) -> None:
    # The binding property snapshot is the same public surface — a non-allowlisted key
    # there is refused at manifest validation.
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    manifest["demo_binding"]["properties"]["remark"] = "internal"
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


# ── PR-R3 finding 2 (serve half): the source-identity contract must be recorded ────────


@pytest.mark.parametrize(
    ("mutation"),
    [
        {"global_id_unique": False},
        {"branch_code": "9999999"},
    ],
)
def test_gis_source_audit_false_identity_fails_closed(
    gis_enabled: pathlib.Path, mutation: dict[str, Any]
) -> None:
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    manifest["source"]["audit"].update(mutation)
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503, mutation


def test_gis_source_audit_missing_fails_closed(gis_enabled: pathlib.Path) -> None:
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    del manifest["source"]["audit"]
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


def test_gis_audit_count_disagrees_with_payload_fails_closed(
    gis_enabled: pathlib.Path,
) -> None:
    # A pinned count that no longer matches the served payload — a re-signed smaller
    # bundle keeping a stale `expected_full=9273` — must 503, not serve 200 (QCHECK
    # round 1: audited counts were decorative at serve time).
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    manifest["source"]["audit"]["expected_full"] = 9273  # the payload serves 2
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


def test_gis_boolean_property_value_fails_closed(gis_enabled: pathlib.Path) -> None:
    # A JSON boolean coerces to 1 in the manifest but stays `true` in the GeoJSON, which
    # would let a `pipe_id: true` feature defeat the binding identity check (QCHECK
    # round 1). Booleans are not a public scalar and must 503.
    full = json.loads((gis_enabled / "network.geojson").read_text(encoding="utf-8"))
    full["features"][0]["properties"]["pipe_id"] = True
    _resign_dataset(gis_enabled, "full", json.dumps(full).encode("utf-8"))
    with _client() as client:
        assert client.get("/api/twin/gis/network?scope=full").status_code == 503


# ── PR-R3 finding 3: the SIMULATED binding must point at a real served pipe ─────────────


def test_gis_binding_pipe_absent_from_focus_fails_closed(gis_enabled: pathlib.Path) -> None:
    # pipe_id 1 exists in the full scope but not the Map Ta Phut focus — placing P-2 on
    # it would put the marker on a pipe the focus map never draws.
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    manifest["demo_binding"]["pipe_id"] = 1
    manifest["demo_binding"]["properties"] = {"pipe_id": 1, "pipe_type": "HDPE", "asset_code": None}
    _rewrite_manifest(gis_enabled, manifest)
    with _client() as client:
        assert client.get("/api/twin/gis/manifest").status_code == 503


def test_gis_binding_pipe_duplicated_fails_closed(gis_enabled: pathlib.Path) -> None:
    focus = _collection([_feature(2, asset_code="AC-2"), _feature(2, asset_code="AC-2")])
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    manifest["datasets"]["map-ta-phut"]["feature_count"] = 2
    _rewrite_manifest(gis_enabled, manifest)
    _resign_dataset(gis_enabled, "map-ta-phut", json.dumps(focus).encode("utf-8"))
    with _client() as client:
        assert client.get("/api/twin/gis/network").status_code == 503


def test_gis_binding_property_mismatch_fails_closed(gis_enabled: pathlib.Path) -> None:
    manifest = json.loads((gis_enabled / "manifest.json").read_text(encoding="utf-8"))
    manifest["demo_binding"]["properties"]["asset_code"] = "WRONG"
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
