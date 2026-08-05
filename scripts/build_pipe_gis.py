"""Offline Rayong pipe-GIS bundle builder (PR-G, criterion 2 realism).

Reads the supplied ESRI shapefile (LineStrings, EPSG:32647), selects the Map Ta Phut
focus features, normalizes attributes through an allowlist, reprojects to WGS84, and
writes a read-only bundle:

    <out>/network.geojson      all normalized features
    <out>/map_ta_phut.geojson  the Map Ta Phut focus selection
    <out>/manifest.json        source hashes, counts, bounds, binding, provenance

    python scripts/build_pipe_gis.py --source "<dir>/PIPE RY.shp" --out data/curated/pipe_ry

Source-derived outputs are permission-dependent and stay git-ignored until the data
owner records redistribution permission — see docs/data/pipe-ry-provenance.md.

Dependencies are build-time ONLY (scripts/requirements-gis.txt); the API image never
installs them — it serves the pre-built GeoJSON.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import shapefile
from pyproj import Transformer

SCHEMA_VERSION = "pipe-ry-gis-1"
SOURCE_CRS = "EPSG:32647"
OUTPUT_CRS = "EPSG:4326"
#: The exact PROJCS name the delivered .prj must carry; anything else is a hard failure.
SOURCE_PROJCS = "WGS_1984_UTM_Zone_47N"

FULL_SCOPE_FILE = "network.geojson"
FOCUS_SCOPE_FILE = "map_ta_phut.geojson"
MANIFEST_FILE = "manifest.json"

DEFAULT_SCENARIO_ASSET = "P-2"

#: The audited source carries the Thai form in `projectNam`; transliterations are
#: accepted so a future re-export in English cannot silently empty the focus.
MAP_TA_PHUT_NEEDLES = ("มาบตาพุด", "map ta phut", "maptaphut")
TEXT_MATCH_FIELDS = ("projectNo", "projectNam", "assetCode", "locate", "remark", "oldProject")

#: lon/lat sanity box — reprojected output outside Thailand means the transform is wrong.
THAILAND_BOUNDS = (96.5, 5.0, 106.5, 21.5)

#: Source DBF column -> stable public property name. Everything else (mongo ids, audit
#: timestamps, free-text remarks) never leaves the builder.
PROPERTY_ALLOWLIST: dict[str, str] = {
    "PIPE_ID": "pipe_id",
    "globalId": "global_id",
    "projectNam": "project_name",
    "assetCode": "asset_code",
    "typeId": "pipe_type",
    "gradeId": "grade",
    "sizeId": "size_mm",
    "class": "pipe_class",
    "functionId": "function_id",
    "layingId": "laying_id",
    "productId": "product_id",
    "depth": "depth_m",
    "length": "length_m",
    "yearInstal": "year_installed",
    "locate": "location",
    "pwaCode": "pwa_code",
}

#: Official context only: East Water's 2025 water-grid system figure. NEVER a station
#: value, target, baseline, or live measurement (rayong-pipe-gis-sec-plan decision 9).
ENERGY_REFERENCE: dict[str, Any] = {
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
}


class GisBuildError(RuntimeError):
    """Any condition that must stop the build rather than emit a doubtful bundle."""


@dataclass(frozen=True)
class SourceFeature:
    """One source polyline: raw DBF record + UTM parts (each a tuple of (x, y))."""

    raw: dict[str, Any]
    paths_utm: tuple[tuple[tuple[float, float], ...], ...]


@dataclass(frozen=True)
class SourceAudit:
    """Immutable record of what was read: files, hashes, CRS, and counts."""

    source_dir: str
    files: dict[str, dict[str, Any]]
    shape_type: str
    feature_count: int
    field_names: tuple[str, ...]
    crs: str


@dataclass(frozen=True)
class DemoBinding:
    """The explicit demo crosswalk: scenario asset -> one real source pipe."""

    scenario_asset_id: str
    pipe_id: int
    rule: str
    midpoint_wgs84: tuple[float, float]
    properties: dict[str, Any]


def sha256_file(path: Path) -> str:
    """Hex SHA-256 of a file's bytes."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_source(shp_path: Path) -> SourceAudit:
    """Audit the shapefile set: sidecars, hashes, geometry type, count, fields, CRS.

    Raises:
        GisBuildError: missing sidecar, unreadable set, or a CRS other than UTM 47N.
    """
    required = {".shp", ".dbf", ".shx", ".prj"}
    files: dict[str, dict[str, Any]] = {}
    for suffix in sorted(required | {".cpg"}):
        sidecar = shp_path.with_suffix(suffix)
        if not sidecar.exists():
            if suffix in required:
                raise GisBuildError(f"missing required sidecar {sidecar.name!r} ({suffix})")
            continue
        files[sidecar.name] = {
            "sha256": sha256_file(sidecar), "bytes": sidecar.stat().st_size,
        }
    prj_text = shp_path.with_suffix(".prj").read_text(encoding="utf-8", errors="replace")
    if SOURCE_PROJCS not in prj_text:
        raise GisBuildError(
            f"unexpected CRS: .prj does not name {SOURCE_PROJCS} ({SOURCE_CRS}); refusing"
        )
    with _open_source(shp_path) as rdr:
        return SourceAudit(
            source_dir=str(shp_path.parent),
            files=files,
            shape_type=str(rdr.shapeTypeName),
            feature_count=len(rdr),
            field_names=tuple(field[0] for field in rdr.fields[1:]),
            crs=SOURCE_CRS,
        )


def _open_source(shp_path: Path) -> Any:
    """A pyshp Reader over the source, with low-level failures made honest.

    A truncated or partially-synced file surfaces from pyshp as `struct.error` or a
    generic exception; the operator must see one GisBuildError line and exit code 1,
    not a traceback (QCHECK 2026-08-05).

    Raises:
        GisBuildError: the source is unreadable or corrupt.
    """
    try:
        return shapefile.Reader(str(shp_path), encoding="utf-8", encodingErrors="replace")
    except (OSError, ValueError, struct.error, shapefile.ShapefileException) as error:
        raise GisBuildError(f"unreadable source {shp_path.name!r}: {error}") from error


def _shape_parts(shape: Any) -> tuple[tuple[tuple[float, float], ...], ...]:
    """Split a pyshp shape's flat point list into its parts."""
    breaks = [*list(shape.parts), len(shape.points)]
    return tuple(
        tuple((float(x), float(y)) for x, y in shape.points[breaks[i]:breaks[i + 1]])
        for i in range(len(shape.parts))
    )


def read_source_features(shp_path: Path) -> list[SourceFeature]:
    """Read every feature; hard-fail on duplicate PIPE_ID or non-polyline shapes.

    Raises:
        GisBuildError: duplicate pipe id, missing pipe id, or a non-polyline shape.
    """
    features: list[SourceFeature] = []
    seen: dict[int, int] = {}
    with _open_source(shp_path) as rdr:
        names = [field[0] for field in rdr.fields[1:]]
        try:
            shape_records = list(rdr.iterShapeRecords())
        except (OSError, ValueError, struct.error, shapefile.ShapefileException) as error:
            raise GisBuildError(
                f"unreadable or corrupt source {shp_path.name!r}: {error}"
            ) from error
        for index, shape_record in enumerate(shape_records):
            if shape_record.shape.shapeTypeName != "POLYLINE":
                raise GisBuildError(
                    f"feature {index} is {shape_record.shape.shapeTypeName}, not POLYLINE"
                )
            raw = dict(zip(names, list(shape_record.record), strict=True))
            pipe_id = _pipe_id(raw, index)
            if pipe_id in seen:
                raise GisBuildError(
                    f"duplicate PIPE_ID {pipe_id} at features {seen[pipe_id]} and {index}"
                )
            seen[pipe_id] = index
            parts = _shape_parts(shape_record.shape)
            if not parts:
                raise GisBuildError(
                    f"feature {index} (PIPE_ID {pipe_id}) is a degenerate zero-part "
                    "polyline"
                )
            features.append(SourceFeature(raw=raw, paths_utm=parts))
    return features


def _pipe_id(raw: Mapping[str, Any], index: int) -> int:
    """The feature's integral PIPE_ID; a fractional id is refused, never truncated.

    Truncation would let a configured binding silently match the wrong pipe, collide
    distinct ids into a spurious "duplicate", and write a manifest binding id that
    matches no GeoJSON feature (properties keep the exact value).
    """
    value = raw.get("PIPE_ID")
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise GisBuildError(f"feature {index} has no numeric PIPE_ID: {value!r}")
    if isinstance(value, float) and not value.is_integer():
        raise GisBuildError(f"feature {index} has a non-integral PIPE_ID {value!r}")
    return int(value)


def select_map_ta_phut_features(features: Sequence[SourceFeature]) -> list[SourceFeature]:
    """The Map Ta Phut focus, ordered by pipe id; zero matches is a hard failure.

    Raises:
        GisBuildError: when no feature's text fields mention Map Ta Phut.
    """
    matched = [feature for feature in features if _mentions_map_ta_phut(feature.raw)]
    if not matched:
        raise GisBuildError(
            "no feature matches Map Ta Phut in any of "
            f"{TEXT_MATCH_FIELDS} — wrong source, or the export changed its wording"
        )
    return sorted(matched, key=lambda feature: _pipe_id(feature.raw, -1))


def _mentions_map_ta_phut(raw: Mapping[str, Any]) -> bool:
    for field in TEXT_MATCH_FIELDS:
        text = str(raw.get(field, "") or "").lower()
        if any(needle in text for needle in MAP_TA_PHUT_NEEDLES):
            return True
    return False


def normalize_properties(raw: Mapping[str, Any]) -> dict[str, Any]:
    """Allowlisted, snake_case properties; blank/mojibake-only text becomes None.

    DBF fields are fixed-width bytes, so the source truncates UTF-8 Thai mid-codepoint;
    the resulting trailing U+FFFD replacement characters are stripped, never shipped.
    Integral floats (DBF numerics all read as float) become ints.
    """
    normalized: dict[str, Any] = {}
    for source_name, public_name in PROPERTY_ALLOWLIST.items():
        value: Any = raw.get(source_name)
        if isinstance(value, str):
            value = value.strip().rstrip("�").strip() or None
        elif isinstance(value, float) and value.is_integer():
            value = int(value)
        normalized[public_name] = value
    return normalized


def make_transformer() -> Transformer:
    """EPSG:32647 -> EPSG:4326 transformer (always lon/lat axis order)."""
    return Transformer.from_crs(SOURCE_CRS, OUTPUT_CRS, always_xy=True)


def reproject_paths(
    paths_utm: Sequence[Sequence[tuple[float, float]]], transformer: Transformer
) -> list[list[list[float]]]:
    """WGS84 [lon, lat] parts; degenerate parts or out-of-Thailand output hard-fail.

    Raises:
        GisBuildError: a part with fewer than two vertices, a non-finite result, or a
            coordinate outside the Thailand sanity box.
    """
    if not paths_utm:
        raise GisBuildError("degenerate geometry: no parts at all")
    reprojected: list[list[list[float]]] = []
    for part_index, part in enumerate(paths_utm):
        if len(part) < 2:
            raise GisBuildError(f"degenerate part {part_index}: {len(part)} vertex/vertices")
        out_part: list[list[float]] = []
        for easting, northing in part:
            out_part.append(list(_transform_checked(easting, northing, transformer)))
        reprojected.append(out_part)
    return reprojected


def _transform_checked(
    easting: float, northing: float, transformer: Transformer
) -> tuple[float, float]:
    """One UTM point to WGS84, rounded, refusing non-finite or out-of-Thailand output.

    Raises:
        GisBuildError: a non-finite result or a coordinate outside the sanity box.
    """
    west, south, east, north = THAILAND_BOUNDS
    lon, lat = transformer.transform(easting, northing)
    if not (math.isfinite(lon) and math.isfinite(lat)):
        raise GisBuildError(f"non-finite reprojection for ({easting}, {northing})")
    if not (west < lon < east and south < lat < north):
        raise GisBuildError(
            f"({lon:.5f}, {lat:.5f}) falls outside the Thailand sanity box "
            f"{THAILAND_BOUNDS} — refusing a doubtful transform"
        )
    return (round(lon, 7), round(lat, 7))


def geometric_length_m(paths_utm: Sequence[Sequence[tuple[float, float]]]) -> float:
    """Planar UTM length in metres (the audit's own length definition)."""
    total = 0.0
    for part in paths_utm:
        for (x0, y0), (x1, y1) in zip(part, part[1:], strict=False):
            total += math.hypot(x1 - x0, y1 - y0)
    return total


def feature_to_geojson(feature: SourceFeature, transformer: Transformer) -> dict[str, Any]:
    """GeoJSON Feature with allowlisted properties; LineString or MultiLineString.

    Raises:
        GisBuildError: degenerate geometry (no parts, or any part under two vertices).
    """
    parts = reproject_paths(feature.paths_utm, transformer)
    geometry: dict[str, Any] = (
        {"type": "LineString", "coordinates": parts[0]}
        if len(parts) == 1
        else {"type": "MultiLineString", "coordinates": parts}
    )
    return {
        "type": "Feature",
        "properties": normalize_properties(feature.raw),
        "geometry": geometry,
    }


def features_to_collection(
    features: Sequence[SourceFeature], transformer: Transformer
) -> dict[str, Any]:
    """GeoJSON FeatureCollection over `feature_to_geojson`."""
    return {
        "type": "FeatureCollection",
        "features": [feature_to_geojson(feature, transformer) for feature in features],
    }


def choose_demo_binding(
    focus: Sequence[SourceFeature],
    transformer: Transformer,
    configured_pipe_id: int | None = None,
) -> DemoBinding:
    """Deterministic binding: configured id if given (must exist in the focus), else the
    geometrically longest focus pipe, ties broken by lowest pipe id.

    Raises:
        GisBuildError: an empty focus, or a configured id absent from the focus.
    """
    if not focus:
        raise GisBuildError("cannot bind the demo asset to an empty focus")
    if configured_pipe_id is not None:
        by_id = {_pipe_id(feature.raw, -1): feature for feature in focus}
        if configured_pipe_id not in by_id:
            raise GisBuildError(
                f"configured pipe id {configured_pipe_id} is not in the Map Ta Phut focus"
            )
        chosen, rule = by_id[configured_pipe_id], f"configured pipe id {configured_pipe_id}"
    else:
        chosen = min(
            focus,
            key=lambda f: (-geometric_length_m(f.paths_utm), _pipe_id(f.raw, -1)),
        )
        rule = "longest Map Ta Phut focus pipe, ties broken by lowest pipe id"
    return DemoBinding(
        scenario_asset_id=DEFAULT_SCENARIO_ASSET,
        pipe_id=_pipe_id(chosen.raw, -1),
        rule=rule,
        midpoint_wgs84=_midpoint_wgs84(chosen, transformer),
        properties=normalize_properties(chosen.raw),
    )


def _midpoint_wgs84(feature: SourceFeature, transformer: Transformer) -> tuple[float, float]:
    """The GEOMETRIC midpoint of the feature's longest part, in WGS84.

    Halfway by cumulative length, interpolated between the bracketing vertices — a
    middle-vertex pick would land on the far terminus of a plain 2-vertex segment
    (QCHECK 2026-08-05) while the manifest calls the field a midpoint.
    """
    longest = max(feature.paths_utm, key=lambda part: geometric_length_m([part]))
    if len(longest) < 2:
        raise GisBuildError("cannot take the midpoint of a degenerate part")
    target = geometric_length_m([longest]) / 2.0
    walked = 0.0
    for (x0, y0), (x1, y1) in zip(longest, longest[1:], strict=False):
        segment = math.hypot(x1 - x0, y1 - y0)
        if walked + segment >= target and segment > 0.0:
            fraction = (target - walked) / segment
            easting = x0 + fraction * (x1 - x0)
            northing = y0 + fraction * (y1 - y0)
            return _transform_checked(easting, northing, transformer)
        walked += segment
    # Zero-length geometry (all vertices coincide): the first vertex IS the midpoint.
    return _transform_checked(longest[0][0], longest[0][1], transformer)


def _bounds_wgs84(collection: Mapping[str, Any]) -> list[float]:
    """[west, south, east, north] over every coordinate in the collection."""
    lons: list[float] = []
    lats: list[float] = []
    for feature in collection["features"]:
        geometry = feature["geometry"]
        parts: Iterable[Any] = (
            [geometry["coordinates"]]
            if geometry["type"] == "LineString"
            else geometry["coordinates"]
        )
        for part in parts:
            for lon, lat in part:
                lons.append(lon)
                lats.append(lat)
    return [min(lons), min(lats), max(lons), max(lats)]


def _dataset_summary(
    file_name: str,
    features: Sequence[SourceFeature],
    collection: Mapping[str, Any],
) -> dict[str, Any]:
    """One manifest dataset entry; sha256/bytes are filled in by `write_bundle`."""
    return {
        "file": file_name,
        "feature_count": len(collection["features"]),
        "bounds_wgs84": _bounds_wgs84(collection),
        "length_m": round(
            sum(geometric_length_m(feature.paths_utm) for feature in features), 2
        ),
        "sha256": None,
        "bytes": None,
    }


def build_manifest(
    audit: SourceAudit,
    datasets: dict[str, dict[str, Any]],
    binding: DemoBinding,
    generated_at: datetime,
) -> dict[str, Any]:
    """The bundle manifest: schema, source identity, dataset summaries, binding,
    provenance boundary, and the official energy reference."""
    stamp = generated_at.astimezone(UTC).isoformat().replace("+00:00", "Z")
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "source": {
            "dataset": "PIPE RY (Rayong pipe GIS)",
            "crs": audit.crs,
            "output_crs": OUTPUT_CRS,
            "feature_count": audit.feature_count,
            "files": audit.files,
        },
        "datasets": datasets,
        "demo_binding": {
            "scenario_asset_id": binding.scenario_asset_id,
            "pipe_id": binding.pipe_id,
            "rule": binding.rule,
            "midpoint_wgs84": list(binding.midpoint_wgs84),
            "placement": "SIMULATED",
            "properties": binding.properties,
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
        "energy_reference": dict(ENERGY_REFERENCE),
    }


def safe_join(out_dir: Path, name: str) -> Path:
    """`out_dir / name`, refusing separators, traversal, or escape from `out_dir`.

    Raises:
        GisBuildError: a name containing a path separator or `..`, or one whose
            resolved location leaves `out_dir`.
    """
    if "/" in name or "\\" in name or ".." in name or name.startswith("."):
        raise GisBuildError(f"unsafe bundle file name {name!r}")
    joined = out_dir / name
    if joined.resolve().parent != out_dir.resolve():
        raise GisBuildError(f"{name!r} escapes the output directory {out_dir}")
    return joined


def _write_json(path: Path, payload: Mapping[str, Any], compact: bool) -> None:
    body = (
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        if compact
        else json.dumps(payload, ensure_ascii=False, indent=2)
    )
    path.write_text(body + "\n", encoding="utf-8")


def write_bundle(
    out_dir: Path,
    full: dict[str, Any],
    focus: dict[str, Any],
    manifest: dict[str, Any],
) -> dict[str, Any]:
    """Write both GeoJSON files, embed their byte counts + SHA-256 into the manifest's
    dataset entries, write the manifest last, and return the final manifest."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for scope, collection in (("full", full), ("map-ta-phut", focus)):
        entry = manifest["datasets"][scope]
        target = safe_join(out_dir, str(entry["file"]))
        _write_json(target, collection, compact=True)
        entry["sha256"] = sha256_file(target)
        entry["bytes"] = target.stat().st_size
    _write_json(safe_join(out_dir, MANIFEST_FILE), manifest, compact=False)
    return manifest


def build_bundle(
    shp_path: Path,
    out_dir: Path,
    configured_pipe_id: int | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """End-to-end build; returns the written manifest."""
    audit = inspect_source(shp_path)
    features = read_source_features(shp_path)
    if len(features) != audit.feature_count:
        raise GisBuildError(
            f"read {len(features)} features but the source header says "
            f"{audit.feature_count}"
        )
    focus = select_map_ta_phut_features(features)
    transformer = make_transformer()
    full_fc = features_to_collection(features, transformer)
    focus_fc = features_to_collection(focus, transformer)
    binding = choose_demo_binding(focus, transformer, configured_pipe_id)
    datasets = {
        "full": _dataset_summary(FULL_SCOPE_FILE, features, full_fc),
        "map-ta-phut": _dataset_summary(FOCUS_SCOPE_FILE, focus, focus_fc),
    }
    manifest = build_manifest(audit, datasets, binding, now or datetime.now(tz=UTC))
    return write_bundle(out_dir, full_fc, focus_fc, manifest)


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="path to the source .shp")
    parser.add_argument("--out", required=True, help="output bundle directory")
    parser.add_argument(
        "--bind-pipe-id", type=int, default=None,
        help="bind the demo asset to this source PIPE_ID (default: longest focus pipe)",
    )
    args = parser.parse_args(argv)
    try:
        manifest = build_bundle(Path(args.source), Path(args.out), args.bind_pipe_id)
    except GisBuildError as error:
        print(f"gis build failed: {error}", file=sys.stderr)
        return 1
    datasets = manifest["datasets"]
    print(
        f"wrote {args.out}: full={datasets['full']['feature_count']} "
        f"focus={datasets['map-ta-phut']['feature_count']} "
        f"binding_pipe_id={manifest['demo_binding']['pipe_id']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
