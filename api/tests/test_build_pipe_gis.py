"""PR-G — offline GIS builder (rayong-pipe-gis-sec-plan Phase 1).

Runs against a SYNTHETIC fixture shapefile written with pyshp. The real OneDrive source
is never read from tests: builder correctness must be provable on any machine, and no
test may depend on — or leak — the not-yet-released source data. The real dataset's
audited invariants (9,273 features, 19 Map Ta Phut matches on `projectNam`, EPSG:32647)
are enforced at real-build time by the manifest, not here.

Dependencies: `api/.venv/bin/pip install -r scripts/requirements-gis.txt` — build-time
only, deliberately absent from api/requirements.txt so the API image never carries GIS
libraries. A missing dependency must fail this file loudly, not skip it.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
from datetime import UTC, datetime
from typing import Any

import pytest
import shapefile
from scripts.build_pipe_gis import (
    ENERGY_REFERENCE,
    PROPERTY_ALLOWLIST,
    GisBuildError,
    SourceFeature,
    build_bundle,
    choose_demo_binding,
    feature_to_geojson,
    geometric_length_m,
    inspect_source,
    main,
    make_transformer,
    normalize_properties,
    read_source_features,
    reproject_paths,
    safe_join,
    select_map_ta_phut_features,
)

#: The delivered dataset's exact projection definition (ESRI WKT).
UTM47N_PRJ = (
    'PROJCS["WGS_1984_UTM_Zone_47N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",'
    'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],'
    'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],'
    'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],'
    'PARAMETER["Central_Meridian",99.0],PARAMETER["Scale_Factor",0.9996],'
    'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]'
)

#: UTM 47N coordinates in the Map Ta Phut area (≈ lon 101.2, lat 12.7).
_E, _N = 736_800.0, 1_401_600.0

#: DBF schema mirroring the delivered file's (10-char-truncated) column names.
_FIELDS: list[tuple[str, str]] = [
    ("PIPE_ID", "N"),
    ("globalId", "C"),
    ("projectNam", "C"),
    ("assetCode", "C"),
    ("typeId", "C"),
    ("gradeId", "C"),
    ("sizeId", "N"),
    ("class", "C"),
    ("functionId", "N"),
    ("layingId", "N"),
    ("productId", "N"),
    ("depth", "N"),
    ("length", "N"),
    ("yearInstal", "N"),
    ("locate", "C"),
    ("pwaCode", "C"),
    ("remark", "C"),
    ("_createdBy", "C"),
]


def _record(pipe_id: int, project: str, **overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "PIPE_ID": float(pipe_id),
        "globalId": f"G{pipe_id}",
        "projectNam": project,
        "assetCode": "",
        "typeId": "HDPE",
        "gradeId": "PE100",
        "sizeId": 160.0,
        "class": "PN6",
        "functionId": 2.0,
        "layingId": 1.0,
        "productId": 4.0,
        "depth": 0.6,
        "length": 100.0,
        "yearInstal": 2560.0,
        "locate": "ถนนเนินพยอม",
        "pwaCode": "5531021",
        "remark": "DMA07",
        "_createdBy": "65f2ad6c",
    }
    base.update(overrides)
    return base


#: (record, line parts in UTM metres). Pipe 102 is the longest (350 m, two parts) and
#: therefore the default demo binding; 101 matches Thai, 102 matches English.
FIXTURE_FEATURES: list[tuple[dict[str, Any], list[list[list[float]]]]] = [
    (
        _record(101, "งานวางท่อ นิคมอุตสาหกรรมมาบตาพุด ถนนสุขุมวิท"),
        [[[_E, _N], [_E, _N + 100.0]]],
    ),
    (
        _record(102, "Map Ta Phut expansion zone B", sizeId=315.0, length=350.0),
        [
            [[_E + 100.0, _N], [_E + 100.0, _N + 300.0]],
            [[_E + 100.0, _N + 300.0], [_E + 150.0, _N + 300.0]],
        ],
    ),
    (
        _record(103, "งานซ่อมท่อ อ.เมืองระยอง", length=200.0),
        [[[_E + 200.0, _N], [_E + 200.0, _N + 200.0]]],
    ),
    (
        _record(104, "", locate="", assetCode="", remark="", length=50.0),
        [[[_E + 300.0, _N], [_E + 300.0, _N + 50.0]]],
    ),
    (
        _record(105, "งานวางท่อ บ้านฉาง", length=80.0),
        [[[_E + 400.0, _N], [_E + 400.0, _N + 80.0]]],
    ),
]


def _write_fixture(
    dir_: pathlib.Path,
    prj: str | None = UTM47N_PRJ,
    features: list[tuple[dict[str, Any], list[list[list[float]]]]] | None = None,
) -> pathlib.Path:
    """Write a synthetic `PIPE RY` shapefile set and return the .shp path."""
    with shapefile.Writer(str(dir_ / "PIPE RY"), shapeType=shapefile.POLYLINE) as writer:
        for name, kind in _FIELDS:
            if kind == "N":
                writer.field(name, "N", 18, 3)
            else:
                writer.field(name, "C", 254)
        for record, parts in features if features is not None else FIXTURE_FEATURES:
            writer.line(parts)
            writer.record(*[record[name] for name, _ in _FIELDS])
    if prj is not None:
        (dir_ / "PIPE RY.prj").write_text(prj, encoding="ascii")
    (dir_ / "PIPE RY.cpg").write_text("UTF-8", encoding="ascii")
    return dir_ / "PIPE RY.shp"


@pytest.fixture(scope="module")
def fixture_shp(tmp_path_factory: pytest.TempPathFactory) -> pathlib.Path:
    return _write_fixture(tmp_path_factory.mktemp("pipe_ry_src"))


def _make_feature(
    pipe_id: int, parts: list[list[tuple[float, float]]], **raw_overrides: Any
) -> SourceFeature:
    raw = _record(pipe_id, f"fixture pipe {pipe_id}")
    raw.update(raw_overrides)
    return SourceFeature(
        raw=raw, paths_utm=tuple(tuple((x, y) for x, y in part) for part in parts)
    )


# ── source audit ───────────────────────────────────────────────────────────────────────


def test_inspect_source_audits_files_hashes_count_and_crs(fixture_shp: pathlib.Path) -> None:
    audit = inspect_source(fixture_shp)
    assert audit.feature_count == 5
    assert audit.shape_type == "POLYLINE"
    assert audit.crs == "EPSG:32647"
    assert "PIPE_ID" in audit.field_names
    for name in ("PIPE RY.shp", "PIPE RY.dbf", "PIPE RY.shx", "PIPE RY.prj"):
        entry = audit.files[name]
        path = fixture_shp.parent / name
        assert entry["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
        assert entry["bytes"] == path.stat().st_size


def test_inspect_source_rejects_missing_prj(tmp_path: pathlib.Path) -> None:
    shp = _write_fixture(tmp_path, prj=None)
    with pytest.raises(GisBuildError, match=r"\.prj"):
        inspect_source(shp)


def test_inspect_source_rejects_wrong_crs(tmp_path: pathlib.Path) -> None:
    wrong = UTM47N_PRJ.replace("WGS_1984_UTM_Zone_47N", "Indian_1975_UTM_Zone_47N")
    shp = _write_fixture(tmp_path, prj=wrong)
    with pytest.raises(GisBuildError, match="CRS"):
        inspect_source(shp)


# ── feature reading ────────────────────────────────────────────────────────────────────


def test_read_features_returns_raw_records_and_utm_parts(fixture_shp: pathlib.Path) -> None:
    features = read_source_features(fixture_shp)
    assert len(features) == 5
    first = features[0]
    assert first.raw["PIPE_ID"] == 101
    assert first.paths_utm[0][0] == (_E, _N)
    two_part = next(f for f in features if f.raw["PIPE_ID"] == 102)
    assert len(two_part.paths_utm) == 2


def test_read_features_rejects_duplicate_pipe_ids(tmp_path: pathlib.Path) -> None:
    dupes = [
        (_record(201, "งานมาบตาพุด"), [[[_E, _N], [_E, _N + 10.0]]]),
        (_record(201, "งานอื่น"), [[[_E + 10.0, _N], [_E + 10.0, _N + 10.0]]]),
    ]
    shp = _write_fixture(tmp_path, features=dupes)
    with pytest.raises(GisBuildError, match="duplicate"):
        read_source_features(shp)


def test_read_features_rejects_fractional_pipe_ids(tmp_path: pathlib.Path) -> None:
    # Truncating 12.3 to 12 would let the manifest's binding id match no GeoJSON
    # feature (properties keep the float), and would collide 12.3 with 12.9 as a
    # spurious "duplicate". Doubtful identity is a hard failure, not a coercion.
    fractional = [
        (_record(0, "งานมาบตาพุด", PIPE_ID=12.3), [[[_E, _N], [_E, _N + 10.0]]]),
    ]
    shp = _write_fixture(tmp_path, features=fractional)
    with pytest.raises(GisBuildError, match="12.3"):
        read_source_features(shp)


def test_read_features_rejects_unreadable_source(tmp_path: pathlib.Path) -> None:
    # A truncated/partially-synced .shp must surface as GisBuildError (one honest
    # line, exit 1 from the CLI), not a raw struct.error traceback.
    _write_fixture(tmp_path)
    shp = tmp_path / "PIPE RY.shp"
    shp.write_bytes(shp.read_bytes()[:60])
    with pytest.raises(GisBuildError, match="unreadable|corrupt"):
        read_source_features(shp)


# ── Map Ta Phut selection ──────────────────────────────────────────────────────────────


def test_select_map_ta_phut_matches_thai_and_english_ordered(
    fixture_shp: pathlib.Path,
) -> None:
    focus = select_map_ta_phut_features(read_source_features(fixture_shp))
    assert [f.raw["PIPE_ID"] for f in focus] == [101, 102]


def test_select_map_ta_phut_zero_matches_hard_fails(fixture_shp: pathlib.Path) -> None:
    others = [
        f for f in read_source_features(fixture_shp) if f.raw["PIPE_ID"] in (103, 104, 105)
    ]
    with pytest.raises(GisBuildError, match="Map Ta Phut"):
        select_map_ta_phut_features(others)


# ── property normalization ─────────────────────────────────────────────────────────────


#: Written out literally ON PURPOSE: an oracle derived from PROPERTY_ALLOWLIST itself
#: would auto-adjust if someone added `remark` or `_createdBy` to the allowlist
#: (QCHECK 2026-08-05: circular-oracle finding). This is the reviewed public surface.
EXPECTED_PUBLIC_PROPERTIES = {
    "pipe_id", "global_id", "project_name", "asset_code", "pipe_type", "grade",
    "size_mm", "pipe_class", "function_id", "laying_id", "product_id", "depth_m",
    "length_m", "year_installed", "location", "pwa_code",
}


def test_property_allowlist_is_exactly_the_reviewed_public_surface() -> None:
    assert set(PROPERTY_ALLOWLIST.values()) == EXPECTED_PUBLIC_PROPERTIES
    # The module docstring promises these never leave the builder.
    for private in ("remark", "_id", "_createdBy", "_createdAt", "_updatedBy",
                    "_updatedAt", "recordDate", "checkDate", "promiseDat"):
        assert private not in PROPERTY_ALLOWLIST


def test_normalize_properties_allowlist_null_and_mojibake() -> None:
    raw = _record(101, "งานย้ายแนวท่อ พร้อมทางลอด�", assetCode="", locate="   ")
    raw["recordDate"] = "2018-06-27T00:00:00Z"
    normalized = normalize_properties(raw)
    assert set(normalized) == EXPECTED_PUBLIC_PROPERTIES
    assert "_createdBy" not in normalized and "recordDate" not in normalized
    # Truncation artifacts (DBF cut a UTF-8 codepoint) end as U+FFFD — stripped, kept real.
    assert normalized["project_name"] == "งานย้ายแนวท่อ พร้อมทางลอด"
    assert normalized["asset_code"] is None
    assert normalized["location"] is None
    assert normalized["pipe_id"] == 101 and isinstance(normalized["pipe_id"], int)
    assert normalized["size_mm"] == 160 and isinstance(normalized["size_mm"], int)
    assert normalized["depth_m"] == pytest.approx(0.6)
    assert normalized["pipe_class"] == "PN6"


# ── reprojection ───────────────────────────────────────────────────────────────────────


def test_reproject_central_meridian_vector_lands_in_thailand() -> None:
    # On UTM 47N's central meridian (easting 500000) longitude is exactly 99°E, and
    # northing 1,400,000 m sits near latitude 12.66°N — an independent check that axis
    # order and zone parameters are right, not a pyproj round-trip.
    parts = reproject_paths([[(500_000.0, 1_400_000.0), (500_000.0, 1_401_000.0)]],
                            make_transformer())
    (lon0, lat0), (lon1, lat1) = parts[0]
    assert lon0 == pytest.approx(99.0, abs=1e-6)
    assert lon1 == pytest.approx(99.0, abs=1e-6)
    assert 12.5 < lat0 < 12.8 < 13.0
    assert lat1 > lat0


def test_reproject_rejects_degenerate_parts() -> None:
    transformer = make_transformer()
    with pytest.raises(GisBuildError, match="degenerate"):
        reproject_paths([[]], transformer)
    with pytest.raises(GisBuildError, match="degenerate"):
        reproject_paths([[(_E, _N)]], transformer)
    # A zero-part POLYLINE (numParts=0, an empty geometry some ESRI exports emit) must
    # hard-fail like every other degenerate geometry, not ship an empty MultiLineString.
    with pytest.raises(GisBuildError, match="degenerate"):
        reproject_paths([], transformer)


def test_feature_to_geojson_rejects_partless_feature() -> None:
    empty = SourceFeature(raw=_record(300, "งานมาบตาพุด"), paths_utm=())
    with pytest.raises(GisBuildError, match="degenerate"):
        feature_to_geojson(empty, make_transformer())


def test_reproject_rejects_output_outside_thailand() -> None:
    # Northing 9,000,000 m is ~81°N — a broken transform must fail, not ship a bundle.
    with pytest.raises(GisBuildError, match="Thailand"):
        reproject_paths([[(500_000.0, 9_000_000.0), (500_100.0, 9_000_000.0)]],
                        make_transformer())


def test_geometric_length_sums_planar_parts() -> None:
    parts = [
        [(_E, _N), (_E, _N + 300.0)],
        [(_E, _N + 300.0), (_E + 50.0, _N + 300.0)],
    ]
    assert geometric_length_m(parts) == pytest.approx(350.0)


# ── demo binding ───────────────────────────────────────────────────────────────────────


def test_choose_demo_binding_default_longest_then_lowest_pipe_id() -> None:
    transformer = make_transformer()
    features = [
        _make_feature(7, [[(_E, _N), (_E, _N + 100.0)]]),
        _make_feature(3, [[(_E, _N), (_E, _N + 350.0)]]),
        _make_feature(2, [[(_E + 10.0, _N), (_E + 10.0, _N + 350.0)]]),
    ]
    binding = choose_demo_binding(features, transformer)
    assert binding.pipe_id == 2  # ties on 350 m break to the lowest pipe id
    assert binding.scenario_asset_id == "P-2"
    assert "longest" in binding.rule
    lon, lat = binding.midpoint_wgs84
    assert 96.5 < lon < 106.5 and 5.0 < lat < 21.5
    assert set(binding.properties) == EXPECTED_PUBLIC_PROPERTIES


def test_binding_midpoint_is_the_geometric_midpoint_not_a_vertex_pick() -> None:
    # A 2-vertex 100 m pipe: the midpoint must sit 50 m along it — picking the middle
    # VERTEX would return the far terminus (QCHECK 2026-08-05: the manifest field is
    # named midpoint_wgs84 and PR-H renders the P-2 marker there).
    transformer = make_transformer()
    two_vertex = _make_feature(11, [[(_E, _N), (_E, _N + 100.0)]])
    lon, lat = choose_demo_binding([two_vertex], transformer).midpoint_wgs84
    expected_lon, expected_lat = transformer.transform(_E, _N + 50.0)
    assert lon == pytest.approx(expected_lon, abs=1e-6)
    assert lat == pytest.approx(expected_lat, abs=1e-6)
    # Unevenly spaced vertices: halfway by LENGTH (250 m), not by vertex index (2 m).
    uneven = _make_feature(12, [[(_E, _N), (_E, _N + 1.0), (_E, _N + 2.0), (_E, _N + 500.0)]])
    _, uneven_lat = choose_demo_binding([uneven], transformer).midpoint_wgs84
    _, halfway_lat = transformer.transform(_E, _N + 250.0)
    assert uneven_lat == pytest.approx(halfway_lat, abs=1e-6)


def test_choose_demo_binding_configured_id_wins_or_hard_fails() -> None:
    transformer = make_transformer()
    features = [
        _make_feature(7, [[(_E, _N), (_E, _N + 100.0)]]),
        _make_feature(3, [[(_E, _N), (_E, _N + 350.0)]]),
    ]
    configured = choose_demo_binding(features, transformer, configured_pipe_id=7)
    assert configured.pipe_id == 7
    assert "configured" in configured.rule
    with pytest.raises(GisBuildError, match="999"):
        choose_demo_binding(features, transformer, configured_pipe_id=999)


# ── output confinement ─────────────────────────────────────────────────────────────────


def test_safe_join_confines_to_output_dir(tmp_path: pathlib.Path) -> None:
    assert safe_join(tmp_path, "manifest.json") == tmp_path / "manifest.json"
    for evil in ("../evil.json", "a/b.json", "/etc/passwd", "..\\evil.json"):
        with pytest.raises(GisBuildError):
            safe_join(tmp_path, evil)


# ── end-to-end bundle ──────────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def built(
    fixture_shp: pathlib.Path, tmp_path_factory: pytest.TempPathFactory
) -> tuple[pathlib.Path, dict[str, Any]]:
    out = tmp_path_factory.mktemp("pipe_ry_out")
    manifest = build_bundle(
        fixture_shp, out, now=datetime(2026, 8, 5, 12, 0, 0, tzinfo=UTC)
    )
    return out, manifest


def test_bundle_manifest_schema_counts_hashes_and_provenance(
    built: tuple[pathlib.Path, dict[str, Any]],
) -> None:
    out, manifest = built
    assert manifest["schema_version"] == "pipe-ry-gis-1"
    assert manifest["generated_at"] == "2026-08-05T12:00:00Z"
    source = manifest["source"]
    assert source["crs"] == "EPSG:32647" and source["output_crs"] == "EPSG:4326"
    assert source["feature_count"] == 5
    assert source["files"]["PIPE RY.shp"]["sha256"]
    datasets = manifest["datasets"]
    assert set(datasets) == {"full", "map-ta-phut"}
    assert datasets["full"]["file"] == "network.geojson"
    assert datasets["full"]["feature_count"] == 5
    assert datasets["map-ta-phut"]["file"] == "map_ta_phut.geojson"
    assert datasets["map-ta-phut"]["feature_count"] == 2
    for entry in datasets.values():
        written = out / str(entry["file"])
        assert entry["sha256"] == hashlib.sha256(written.read_bytes()).hexdigest()
        assert entry["bytes"] == written.stat().st_size
        west, south, east, north = entry["bounds_wgs84"]
        assert 96.5 < west <= east < 106.5 and 5.0 < south <= north < 21.5
        assert entry["length_m"] > 0
    provenance = manifest["provenance"]
    assert provenance["geometry"] == "REAL"
    assert provenance["attributes"] == "REAL"
    assert provenance["binding"] == "SIMULATED"
    assert provenance["placement"] == "SIMULATED"
    assert "permission" in provenance["distribution"].lower()


def test_bundle_energy_reference_is_official_context_only(
    built: tuple[pathlib.Path, dict[str, Any]],
) -> None:
    _, manifest = built
    ref = manifest["energy_reference"]
    assert ref == ENERGY_REFERENCE
    assert ref["value_kwh_per_m3"] == 0.54
    assert ref["year"] == 2025
    assert ref["scope"] == "system-wide"
    assert ref["station_specific"] is False
    assert ref["source_url"].startswith("https://www.eastwater.com/")


def test_bundle_demo_binding_is_simulated_and_deterministic(
    built: tuple[pathlib.Path, dict[str, Any]],
) -> None:
    _, manifest = built
    binding = manifest["demo_binding"]
    assert binding["scenario_asset_id"] == "P-2"
    assert binding["pipe_id"] == 102  # longest focus feature in the fixture
    assert binding["placement"] == "SIMULATED"
    assert binding["properties"]["pipe_type"] == "HDPE"


def test_written_geojson_parses_with_normalized_properties(
    built: tuple[pathlib.Path, dict[str, Any]],
) -> None:
    out, _ = built
    network = json.loads((out / "network.geojson").read_text(encoding="utf-8"))
    assert network["type"] == "FeatureCollection"
    assert len(network["features"]) == 5
    by_id = {f["properties"]["pipe_id"]: f for f in network["features"]}
    assert by_id[101]["geometry"]["type"] == "LineString"
    assert by_id[102]["geometry"]["type"] == "MultiLineString"
    assert by_id[101]["properties"]["pipe_type"] == "HDPE"
    assert by_id[104]["properties"]["project_name"] is None
    assert "_createdBy" not in by_id[101]["properties"]
    lon, lat = by_id[101]["geometry"]["coordinates"][0]
    assert 96.5 < lon < 106.5 and 5.0 < lat < 21.5
    focus = json.loads((out / "map_ta_phut.geojson").read_text(encoding="utf-8"))
    assert [f["properties"]["pipe_id"] for f in focus["features"]] == [101, 102]


def test_builder_manifest_validates_against_api_schema(
    built: tuple[pathlib.Path, dict[str, Any]],
) -> None:
    # The builder and app.models.GisManifest must change together: a bundle the builder
    # writes has to be exactly what the API is willing to serve (plan A10 cross-check).
    from app.gis import validate_manifest

    out, manifest = built
    validated = validate_manifest(manifest)
    assert validated.schema_version == "pipe-ry-gis-1"
    on_disk = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert validate_manifest(on_disk).model_dump(mode="json") == validated.model_dump(
        mode="json"
    )


def test_cli_builds_bundle_with_configured_binding(
    fixture_shp: pathlib.Path, tmp_path: pathlib.Path
) -> None:
    out = tmp_path / "bundle"
    code = main(
        ["--source", str(fixture_shp), "--out", str(out), "--bind-pipe-id", "101"]
    )
    assert code == 0
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["demo_binding"]["pipe_id"] == 101
    assert (out / "network.geojson").exists() and (out / "map_ta_phut.geojson").exists()


def test_cli_reports_failure_with_exit_code_1(
    tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # `make gis-build` trusts this exit code; a swallowed GisBuildError returning 0
    # would let an operator enable PIPE_GIS on a failed rebuild.
    _write_fixture(tmp_path)
    shp = tmp_path / "PIPE RY.shp"
    shp.write_bytes(shp.read_bytes()[:60])
    code = main(["--source", str(shp), "--out", str(tmp_path / "bundle")])
    assert code == 1
    assert "gis build failed" in capsys.readouterr().err
    assert not (tmp_path / "bundle" / "manifest.json").exists()
