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

Exact file hashes are NOT recorded in this committed document — they identify a private
delivery. They are recorded in the generated `manifest.json` (`source.files`), which
stays local with the bundle.

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
7. Manifest: schema `pipe-ry-gis-1` with source hashes, per-file digests, counts,
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
