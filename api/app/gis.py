"""Read-only access to the pre-built Rayong pipe-GIS bundle (PR-G).

Fail-closed by construction: disabled means the /api/twin/gis routes answer 404;
enabled with a missing, corrupt, oversize, traversal-crafted, hash-drifted, or
structurally invalid bundle means the load fails here at startup and the routes answer
503. There is no path on which synthetic geometry is substituted for the real bundle —
an unavailable GIS view is reported as unavailable (rayong-pipe-gis-sec-plan Phase 2).

The bundle is verified INTO MEMORY once per process (QCHECK 2026-08-05): every served
byte was read, size-checked, hash-checked, and parsed as a GeoJSON FeatureCollection at
startup, so a post-startup file rewrite or symlink swap cannot change what is served or
make the strong ETag vouch for bytes that were never verified. Any filesystem or
decoding failure — not just the ones we anticipated — is translated to `GisUnavailable`
so a broken bundle can never abort API startup.
"""
from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from .config import Settings
from .models import GIS_PUBLIC_PROPERTY_KEYS, GisDemoBinding, GisManifest

#: Scope name (the public query value) -> manifest dataset key. Identical on purpose —
#: the manifest uses the public vocabulary.
SCOPES: tuple[str, ...] = ("map-ta-phut", "full")

MANIFEST_FILE = "manifest.json"

#: The manifest is metadata — a handful of KB. Anything near this cap is not our
#: manifest, and it is refused BEFORE json.loads can swallow it.
MANIFEST_MAX_BYTES = 1_000_000

#: Geometry types the builder can emit; anything else in a served file is corruption.
_GEOMETRY_TYPES = frozenset({"LineString", "MultiLineString"})


class GisUnavailable(RuntimeError):
    """The bundle cannot be served; the reason is in the message, the answer is 503."""


@dataclass(frozen=True)
class GisBundle:
    """A verified bundle: validated manifest + hash-checked, parsed GeoJSON payloads.

    `payloads` holds the exact bytes that were verified — the routes serve these, never
    the (mutable) files they came from.
    """

    manifest: GisManifest
    directory: Path
    payloads: dict[str, bytes]


def validate_manifest(data: Any) -> GisManifest:
    """Parse + validate manifest content, requiring both served scopes.

    Raises:
        GisUnavailable: schema violation or a missing scope.
    """
    try:
        manifest = GisManifest.model_validate(data)
    except ValidationError as error:
        raise GisUnavailable(f"manifest failed validation: {error}") from error
    missing = [scope for scope in SCOPES if scope not in manifest.datasets]
    if missing:
        raise GisUnavailable(f"manifest lacks required scope(s): {missing}")
    return manifest


def etag_matches(header: str | None, etag: str) -> bool:
    """RFC 9110 `If-None-Match` evaluation against our strong ETag.

    Handles the absent header, `*`, comma-separated candidate lists, and weak (`W/`)
    candidates — weak comparison is correct for a GET revalidation. Our ETags are hex
    digests in quotes, so candidates never contain internal commas or quotes.
    """
    if header is None:
        return False
    if header.strip() == "*":
        return True
    for raw_candidate in header.split(","):
        candidate = raw_candidate.strip()
        candidate = candidate.removeprefix("W/")
        if candidate == etag:
            return True
    return False


def _confined_file(directory: Path, name: str) -> Path:
    """`directory / name`, refusing separators, traversal, symlinks, or escape.

    Raises:
        GisUnavailable: the manifest names a file outside its own directory, or the
            entry is a symlink (bytes must COME FROM the bundle, wherever they hash to).
    """
    if "/" in name or "\\" in name or ".." in name or name.startswith("."):
        raise GisUnavailable(f"manifest names an unsafe file {name!r}")
    candidate = directory / name
    if candidate.is_symlink():
        raise GisUnavailable(f"bundle file {name!r} is a symlink; refusing to follow it")
    if candidate.resolve().parent != directory.resolve():
        raise GisUnavailable(f"manifest file {name!r} escapes the bundle directory")
    return candidate


def _verified_payload(
    directory: Path, name: str, sha256: str, size: int, max_bytes: int
) -> bytes:
    """The file's bytes, existence-, size-, and hash-checked against the manifest.

    The returned bytes are what was checked — later file changes are irrelevant.

    Raises:
        GisUnavailable: missing file, size/hash drift, or over the configured cap.
    """
    path = _confined_file(directory, name)
    if not path.is_file():
        raise GisUnavailable(f"bundle file {name!r} is missing")
    if size > max_bytes:
        raise GisUnavailable(
            f"manifest declares {name!r} at {size} bytes, over the PIPE_GIS_MAX_BYTES "
            f"cap of {max_bytes}"
        )
    payload = path.read_bytes()
    if len(payload) > max_bytes:
        raise GisUnavailable(
            f"bundle file {name!r} is {len(payload)} bytes, over the cap of {max_bytes}"
        )
    if len(payload) != size:
        raise GisUnavailable(
            f"bundle file {name!r} is {len(payload)} bytes but the manifest says "
            f"{size} — drifted bundle"
        )
    if hashlib.sha256(payload).hexdigest() != sha256:
        raise GisUnavailable(f"bundle file {name!r} hash drifted from its manifest")
    return payload


def _validate_geojson(
    name: str, payload: bytes, expected_features: int
) -> list[dict[str, Any]]:
    """Digest agreement is not enough: the bytes must BE the promised FeatureCollection,
    and every feature must stay inside the reviewed public-property surface.

    Returns the parsed feature list so the caller can cross-check the demo binding
    against the geometry actually served (PR-R3 finding 3).

    Raises:
        GisUnavailable: not JSON, not a FeatureCollection, wrong feature count, a
            geometry type the builder cannot emit, or a feature carrying a property key
            outside `GIS_PUBLIC_PROPERTY_KEYS` or a non-scalar property value (PR-R3
            finding 1 — the re-signed-bundle data-disclosure leak).
    """
    try:
        data = json.loads(payload)
    except ValueError as error:
        raise GisUnavailable(f"bundle file {name!r} is not valid JSON: {error}") from error
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection":
        raise GisUnavailable(f"bundle file {name!r} is not a GeoJSON FeatureCollection")
    # The served bytes are the RAW file, so scrubbing only `properties` is not enough: a
    # re-signed bundle could smuggle private source columns in a Feature-level member
    # (`id`, `remark`, `_createdBy`), inside `geometry`, or on the collection itself, and
    # they would be served verbatim. Reject any member outside the exact GeoJSON shape the
    # builder emits, at every level (PR-R3 QCHECK round 2 — the disclosure leak had only
    # moved one JSON level out).
    _reject_foreign_members(name, data, {"type", "features"}, "FeatureCollection")
    features = data.get("features")
    if not isinstance(features, list) or len(features) != expected_features:
        count = len(features) if isinstance(features, list) else "no"
        raise GisUnavailable(
            f"bundle file {name!r} has {count} features but the manifest says "
            f"{expected_features}"
        )
    for feature in features:
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise GisUnavailable(f"bundle file {name!r} contains a non-Feature member")
        _reject_foreign_members(name, feature, {"type", "properties", "geometry"}, "feature")
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict) or geometry.get("type") not in _GEOMETRY_TYPES:
            raise GisUnavailable(f"bundle file {name!r} contains a non-polyline geometry")
        _reject_foreign_members(name, geometry, {"type", "coordinates"}, "geometry")
        _validate_line_geometry(name, geometry["type"], geometry.get("coordinates"))
        _validate_feature_properties(name, feature.get("properties"))
    return features


#: WGS84 coordinate ranges — a served position outside these is not a valid lon/lat.
_LON_RANGE = (-180.0, 180.0)
_LAT_RANGE = (-90.0, 90.0)


def _validate_line_geometry(name: str, geometry_type: str, coordinates: Any) -> None:
    """A (Multi)LineString's coordinates must be well-formed WGS84 positions, not merely a
    list. Object-, string-, boolean-, non-finite-, or out-of-range coordinates would
    otherwise be served 200 and render a blank/broken map, contradicting the fail-closed
    contract (PR-R3 QCHECK round 4).

    Raises:
        GisUnavailable: coordinates that are not a nested list of valid [lon, lat] positions.
    """
    if not isinstance(coordinates, list):
        raise GisUnavailable(f"bundle file {name!r} geometry has no coordinates array")
    lines = [coordinates] if geometry_type == "LineString" else coordinates
    if geometry_type == "MultiLineString" and not lines:
        raise GisUnavailable(f"bundle file {name!r} MultiLineString has no line strings")
    for line in lines:
        if not isinstance(line, list) or len(line) < 2:
            raise GisUnavailable(
                f"bundle file {name!r} has a line string with fewer than two positions"
            )
        for position in line:
            _validate_position(name, position)


def _validate_position(name: str, position: Any) -> None:
    """One `[lon, lat]`: EXACTLY a two-element list of numbers inside WGS84 bounds. The
    builder emits exactly `[round(lon, 7), round(lat, 7)]`, so a third ordinate is a
    re-sign anomaly and is refused (which also removes any unvalidated elevation channel).

    The range check doubles as the finiteness check: `NaN`/`inf`/a googol-sized int all
    compare `False` against the bounds, so they 503 — and a COMPARISON never raises
    `OverflowError`, unlike `math.isfinite()` on an arbitrary-precision int (PR-R3 QCHECK
    round 5).

    Raises:
        GisUnavailable: a malformed, non-numeric, non-finite, or out-of-range position.
    """
    if not isinstance(position, list) or len(position) != 2:
        raise GisUnavailable(f"bundle file {name!r} has a malformed coordinate position")
    lon, lat = position
    for value in (lon, lat):
        if isinstance(value, bool) or not isinstance(value, int | float):
            raise GisUnavailable(f"bundle file {name!r} has a non-numeric coordinate")
    if not (_LON_RANGE[0] <= lon <= _LON_RANGE[1] and _LAT_RANGE[0] <= lat <= _LAT_RANGE[1]):
        raise GisUnavailable(
            f"bundle file {name!r} has a non-finite or out-of-WGS84 coordinate"
        )


def _reject_foreign_members(
    name: str, obj: dict[str, Any], allowed: set[str], level: str
) -> None:
    """No served JSON object may carry a member outside the reviewed GeoJSON shape.

    Raises:
        GisUnavailable: `obj` has a key not in `allowed` — a channel for private bytes the
            digest cannot see (the manifest hash only proves the bytes are unchanged).
    """
    extra = set(obj) - allowed
    if extra:
        raise GisUnavailable(
            f"bundle file {name!r} {level} carries non-GeoJSON member(s) {sorted(extra)}"
        )


def _validate_feature_properties(name: str, properties: Any) -> None:
    """Every served property key must be in the reviewed allowlist and every value a
    scalar — no `remark`/`_createdBy`/audit id, no nested object smuggled past the digest.

    Raises:
        GisUnavailable: missing properties object, a non-allowlisted key, or a value that
            is not str/int/float/None.
    """
    if not isinstance(properties, dict):
        raise GisUnavailable(f"bundle file {name!r} has a feature with no properties object")
    extra = set(properties) - GIS_PUBLIC_PROPERTY_KEYS
    if extra:
        raise GisUnavailable(
            f"bundle file {name!r} exposes non-allowlisted feature properties "
            f"{sorted(extra)}"
        )
    for key, value in properties.items():
        # `bool` is a subclass of `int`, so it would slip through a plain int check — and
        # a boolean `pipe_id` (JSON `true`) coerces to 1 in the manifest while staying
        # `true` in the GeoJSON, defeating the binding identity check. No public property
        # is a boolean; reject it explicitly (PR-R3 QCHECK round 1).
        is_scalar = value is None or isinstance(value, str | int | float)
        if isinstance(value, bool) or not is_scalar:
            raise GisUnavailable(
                f"bundle file {name!r} property {key!r} is not a scalar value"
            )
        # `NaN`/`Infinity` are valid Python floats but NOT valid JSON — Python serves them
        # raw under a 200, then the browser's `JSON.parse` rejects the body (QCHECK round 5).
        if isinstance(value, float) and not math.isfinite(value):
            raise GisUnavailable(
                f"bundle file {name!r} property {key!r} is a non-finite number"
            )


def _verify_demo_binding(
    binding: GisDemoBinding, features_by_scope: dict[str, list[dict[str, Any]]]
) -> None:
    """The SIMULATED binding must point at a real served pipe: its `pipe_id` occurs
    exactly once in EVERY scope, and the bound feature's properties equal the binding
    snapshot. Otherwise PR-H would place P-2 on a nonexistent or mismatched pipe while
    the manifest still validated (PR-R3 finding 3).

    Raises:
        GisUnavailable: the bound pipe is absent, duplicated, or its properties differ
            from the manifest's binding snapshot in any served scope.
    """
    expected = dict(binding.properties)
    for scope, features in features_by_scope.items():
        matches = [
            feature
            for feature in features
            if isinstance(feature.get("properties"), dict)
            and feature["properties"].get("pipe_id") == binding.pipe_id
        ]
        if len(matches) != 1:
            raise GisUnavailable(
                f"demo binding pipe_id {binding.pipe_id} occurs {len(matches)} time(s) "
                f"in scope {scope!r}, expected exactly once"
            )
        if matches[0]["properties"] != expected:
            raise GisUnavailable(
                f"demo binding properties do not match the bound pipe in scope {scope!r}"
            )


def _load_verified(settings: Settings) -> GisBundle:
    if not settings.pipe_gis_dir:
        raise GisUnavailable("PIPE_GIS_ENABLED is set but PIPE_GIS_DIR is not")
    directory = Path(settings.pipe_gis_dir)
    manifest_path = directory / MANIFEST_FILE
    if not manifest_path.is_file():
        raise GisUnavailable(f"{manifest_path} does not exist")
    if manifest_path.stat().st_size > MANIFEST_MAX_BYTES:
        raise GisUnavailable(
            f"{manifest_path} exceeds the {MANIFEST_MAX_BYTES}-byte manifest cap"
        )
    manifest = validate_manifest(json.loads(manifest_path.read_text(encoding="utf-8")))
    payloads: dict[str, bytes] = {}
    features_by_scope: dict[str, list[dict[str, Any]]] = {}
    for scope in SCOPES:
        entry = manifest.datasets[scope]
        payload = _verified_payload(
            directory, entry.file, entry.sha256, entry.bytes, settings.pipe_gis_max_bytes
        )
        features_by_scope[scope] = _validate_geojson(
            entry.file, payload, entry.feature_count
        )
        payloads[scope] = payload
    _verify_source_audit_counts(manifest)
    _verify_demo_binding(manifest.demo_binding, features_by_scope)
    return GisBundle(manifest=manifest, directory=directory, payloads=payloads)


def _verify_source_audit_counts(manifest: GisManifest) -> None:
    """When the build pinned audited counts (`--expect-full/--expect-focus`), they must
    equal the SERVED dataset counts, so a re-signed smaller bundle cannot keep a stale
    `expected_full=9273`/`expected_focus=19` claim while serving fewer features (PR-R3
    QCHECK round 1). `_validate_geojson` already ties each dataset count to its GeoJSON,
    so this ties the pinned contract through to the payload actually served.

    Raises:
        GisUnavailable: a pinned audit count disagrees with its served dataset.
    """
    audit = manifest.source.audit
    for field, expected, scope in (
        ("expected_full", audit.expected_full, "full"),
        ("expected_focus", audit.expected_focus, "map-ta-phut"),
    ):
        if expected is None:
            continue
        actual = manifest.datasets[scope].feature_count
        if expected != actual:
            raise GisUnavailable(
                f"source.audit.{field} is {expected} but the {scope!r} dataset serves "
                f"{actual} features — count contract drift"
            )


def load_gis_bundle(settings: Settings) -> GisBundle | None:
    """The verified in-memory bundle, or None when the feature is disabled.

    Raises:
        GisUnavailable: enabled but unset/missing/corrupt/oversize/drifted/invalid —
            including ANY filesystem or decoding failure, so startup can rely on this
            being the only exception type.
    """
    if not settings.pipe_gis_enabled:
        return None
    try:
        return _load_verified(settings)
    except GisUnavailable:
        raise
    except (OSError, ValueError) as error:
        # ValueError covers json decoding, NUL-byte paths, and unicode errors.
        raise GisUnavailable(f"bundle unreadable: {error}") from error


def build_cache_headers(bundle: GisBundle, scope: str) -> dict[str, str]:
    """Strong ETag from the verified payload's content hash + a modest revalidation
    window. Honest by construction: the ETag names bytes held in memory, not a file."""
    return {
        "ETag": f'"{bundle.manifest.datasets[scope].sha256}"',
        "Cache-Control": "public, max-age=3600",
    }
