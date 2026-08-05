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
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from .config import Settings
from .models import GisManifest

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


def _validate_geojson(name: str, payload: bytes, expected_features: int) -> None:
    """Digest agreement is not enough: the bytes must BE the promised FeatureCollection.

    Raises:
        GisUnavailable: not JSON, not a FeatureCollection, wrong feature count, or a
            geometry type the builder cannot emit.
    """
    try:
        data = json.loads(payload)
    except ValueError as error:
        raise GisUnavailable(f"bundle file {name!r} is not valid JSON: {error}") from error
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection":
        raise GisUnavailable(f"bundle file {name!r} is not a GeoJSON FeatureCollection")
    features = data.get("features")
    if not isinstance(features, list) or len(features) != expected_features:
        count = len(features) if isinstance(features, list) else "no"
        raise GisUnavailable(
            f"bundle file {name!r} has {count} features but the manifest says "
            f"{expected_features}"
        )
    for feature in features:
        geometry = feature.get("geometry") if isinstance(feature, dict) else None
        if not isinstance(geometry, dict) or geometry.get("type") not in _GEOMETRY_TYPES:
            raise GisUnavailable(f"bundle file {name!r} contains a non-polyline geometry")


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
    for scope in SCOPES:
        entry = manifest.datasets[scope]
        payload = _verified_payload(
            directory, entry.file, entry.sha256, entry.bytes, settings.pipe_gis_max_bytes
        )
        _validate_geojson(entry.file, payload, entry.feature_count)
        payloads[scope] = payload
    return GisBundle(manifest=manifest, directory=directory, payloads=payloads)


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
