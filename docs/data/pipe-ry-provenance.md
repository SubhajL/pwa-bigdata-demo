# Rayong Pipe GIS — Data Lineage, Permission, and Non-Claims

Status of this document: normative for PR-G/PR-H. The UI and API may not claim more
than what is recorded here.

## Source

| Item | Value |
|---|---|
| Dataset | `PIPE RY.shp` + sidecars (`.dbf`, `.shx`, `.prj`, `.cpg`, `.qmd`) |
| Delivered via | Owner's OneDrive share (local sync; path is operator-specific) |
| Geometry | ESRI POLYLINE, 9,273 valid non-empty features |
| CRS | `EPSG:32647` (`WGS_1984_UTM_Zone_47N`, per the delivered `.prj`) |
| Identity | `PIPE_ID` and `globalId` are unique across all 9,273 features |
| Branch | Every record carries PWA code `5531021` (Rayong branch) |
| Encoding | UTF-8 DBF; fixed-width truncation leaves partial trailing codepoints |

Exact file hashes and the canonical sidecar-set fingerprint are NOT recorded in this
committed document — they identify a private delivery. Per-file hashes are recorded in
the local generated manifest. The canonical fingerprint is recorded in the manifest AND
must be supplied independently through the build/activation environment, so the bundle
cannot approve its own replacement.

## Permission status

**PENDING.** The dataset owner has not yet recorded written permission to transform,
redistribute, or display this data to evaluators.

Consequences, enforced in code:

- `data/curated/pipe_ry/` (the generated bundle) is **git-ignored**; the builder writes
  only there by default. Nothing source-derived is committed or hosted.
- `PIPE_GIS_ENABLED` defaults to **off** everywhere. The API answers 404 while off and
  503 for a missing/drifted bundle while on — it never substitutes synthetic geometry.
- When permission is granted, record the grantor, date, and scope here in place of this
  paragraph before enabling the flag for any judged run.
- **Rebuild on deploy (PR-R3):** a bundle built before PR-R3 lacks the `source.audit`
  record and the strict GeoJSON-member checks, so the API now fails it CLOSED (503). Before
  enabling `PIPE_GIS_ENABLED` on any stack, re-run `make gis-build GIS_SOURCE=…
  GIS_APPROVED_SOURCE_FINGERPRINT=…` so the bundle carries `source.audit`, pins the
  audited 9,273/19 counts, and matches the independently approved source identity.

### Source-fingerprint approval and activation

1. The data owner/reviewer computes and records the canonical fingerprint outside the
   source directory and outside `data/curated/pipe_ry/`. Do not derive approval from a
   manifest produced by the same unreviewed build.
2. Build with `GIS_APPROVED_SOURCE_FINGERPRINT=<approved 64-hex SHA-256>`. The builder
   hashes the exact in-memory sidecar snapshot used for conversion and emits nothing when
   it differs.
3. The trusted build prints `bundle_sha256=<64-hex>`, covering the exact completed
   `manifest.json`, `network.geojson`, and `map_ta_phut.geojson` bytes. Review and store
   that value outside `PIPE_GIS_DIR`; do not copy it from a mutable bundle-side file.
4. Provision the source value as
   `PIPE_GIS_APPROVED_SOURCE_FINGERPRINT` when enabling the API. Startup compares it with
   `manifest.source.fingerprint_sha256`. Also provision the exact completed-bundle value
   as `PIPE_GIS_APPROVED_BUNDLE_SHA256`. Missing/malformed/mismatched values leave GIS 503.
5. Rotate either approved value only through a new source/bundle review. Rebuild and exact-SHA
   acceptance are mandatory after rotation.

## Transformations (scripts/build_pipe_gis.py)

1. Audit: sidecar presence, SHA-256 per file, POLYLINE type, feature count, CRS check
   (`.prj` must name `WGS_1984_UTM_Zone_47N`; anything else aborts).
2. Selection: features whose text fields mention Map Ta Phut (`มาบตาพุด`, or an English
   transliteration) form the 19-feature focus; zero matches aborts.
3. Property allowlist: only `PIPE_ID, globalId, projectNam, assetCode, typeId, gradeId,
   sizeId, class, functionId, layingId, productId, depth, length, yearInstal, locate,
   pwaCode` are exported, renamed to stable snake_case. Mongo-style ids, audit
   timestamps, and free-text remarks never leave the builder.
4. Text repair: DBF fixed-width truncation cuts UTF-8 Thai mid-codepoint; trailing
   U+FFFD replacement characters are stripped, blank values become `null`.
5. Reprojection: `EPSG:32647 → EPSG:4326` via pyproj; every output coordinate must fall
   inside a Thailand sanity box or the build aborts.
6. Demo binding: scenario asset `P-2` is bound to ONE real `PIPE_ID` by a documented
   deterministic rule (longest focus pipe, ties to lowest id, CLI-overridable). The
   binding and marker placement are **SIMULATED** — they are demo decisions, not
   surveyed truth.
7. Manifest: schema `pipe-ry-gis-1` with the externally approved source fingerprint,
   source hashes, per-file digests, counts,
   bounds, lengths, binding, the provenance boundary, and the official energy
   reference. The API refuses any bundle whose files drift from the manifest.

Audited invariants the real build reproduces: 9,273 full / 19 focus features; full
planar length 1,894,203.85 m; focus 11,023.95 m; full WGS84 extent ≈ 101.175–101.417 E,
12.592–12.844 N.

## Official energy reference

`0.54 kWh/m³` — East Water, 2025, energy per unit of water supplied for its water-grid
**system**. Source: <https://www.eastwater.com/en/sustainability/sustainability-overview/environment-dimension/energy-management>

It is context ONLY. It is never presented as — and `EnergyReference` validation refuses
a manifest claiming — a station-specific value, a live measurement, a target, a
baseline, or an alarm threshold.

## Explicit non-claims

- No hydraulic network: ~90 % of exact-coordinate endpoints have degree one; no
  snapping, flow direction, or connectivity is derived or implied.
- No verified Map Ta Phut station coordinate, pump count, capacity, live power, live
  flow, or station SEC.
- No customer↔pipe crosswalk; affected-customer figures remain deterministic
  simulation, labelled `SIMULATED`.
- No SCADA/DMAMA integration; live telemetry in the twin remains `SIMULATED`.
- Real geometry/attributes in the GIS view do NOT imply an integrated operational GIS.

## Serve-time validation boundary (what the API guards, and what it does not)

The API's load-time checks (`api/app/gis.py`) FAIL CLOSED on a bundle that is missing,
oversize, hash/size-drifted, structurally invalid, carries a property or GeoJSON member
outside the reviewed public surface, has a demo binding that does not resolve to exactly
one served pipe, or whose `source.audit` claims a different branch / a count that
disagrees with the served payload. These reject a **malformed, wrong, or accidentally
over-scoped** bundle — including an honest builder's bug or a partial sync.

The manifest is not signed, so it is not signer-attributed cryptographic evidence. The
**build** is bound to an external source-identity anchor before it can emit REAL, and API
activation is separately bound to an externally approved digest of the exact completed
manifest and served payload bytes. Copying the public source-fingerprint literal while
rewriting the bundle therefore fails closed. Strict fixed manifest strings/filenames and
GeoJSON/property validators also block reviewed disclosure channels. Cross-domain signer
attribution or delegated release would still require a signed manifest and key custody;
the exact-bundle approval is a trusted-operator deployment boundary, not a PKI.
