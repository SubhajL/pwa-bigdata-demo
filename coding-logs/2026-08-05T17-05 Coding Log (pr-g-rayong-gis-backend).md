# Coding Log: PR-G — Fail-Closed Rayong Pipe GIS Backend

Date: 2026-08-05 17:05 +0700
Mode: implementation (g-coding lifecycle; roadmap PR-G, Phase 3A, lands dark)
Repository: `/Users/subhajlimanond/dev/pwa-bigdata-demo`
Base: `main == origin/main == 1fecd52d3fbdb29734a8a9ba1886c4d86264c92f` (includes the
other team's PR-D/E/F tightening: #38 predictive evidence gaps, #39 fail-closed
acceptance evidence)
Plan inputs: `coding-logs/2026-08-04-20-14-04 Coding Log (overall-phases-and-pr-roadmap).md`
(PR-G definition) and `coding-logs/2026-08-04T19-10 Coding Log (rayong-pipe-gis-sec-plan).md`
(Phases 0–2).

## Scope

Land the audited offline GIS builder and the fail-closed `/api/twin/gis` contract,
default OFF (`PIPE_GIS_ENABLED=false`). No frontend change (PR-H), no docker-compose
change, no committed source-derived artifact (permission PENDING —
`docs/data/pipe-ry-provenance.md`).

Files:

- `scripts/build_pipe_gis.py` — new offline builder (pyshp + pyproj, build-time only)
- `scripts/requirements-gis.txt` — builder deps, deliberately NOT in api/requirements.txt
- `api/tests/test_build_pipe_gis.py` — 21 builder tests over a synthetic fixture shapefile
- `api/tests/test_twin_gis.py` — 13 fail-closed API contract tests (handcrafted bundle)
- `api/app/config.py` — `pipe_gis_enabled=False`, `pipe_gis_dir`, `pipe_gis_max_bytes`
- `api/app/models.py` — `GisManifest` + sub-models; provenance/energy fields are Literals
  so a bundle claiming more than the evidence boundary FAILS validation
- `api/app/gis.py` — verified single-load: manifest validation, path confinement,
  size cap, per-file SHA-256 drift check
- `api/app/routes/twin.py` — `GET /api/twin/gis/manifest`, `GET /api/twin/gis/network`
  (scope Literal `map-ta-phut|full`, strong ETag, 304, `application/geo+json`)
- `api/app/main.py` — lifespan loads the bundle once; failure leaves 503, logical twin
  unaffected
- `Makefile` — `gis-build`; `infra/env.sample` — dark-by-default GIS block
- `.gitignore` — `data/curated/pipe_ry/`; `docs/data/pipe-ry-provenance.md` — lineage,
  permission status (PENDING), transformations, official energy reference, non-claims

## Source audit (read-only, local)

- `PIPE RY.shp` set on the operator's OneDrive sync; POLYLINE; **9,273** features;
  `.prj` names `WGS_1984_UTM_Zone_47N` (EPSG:32647); DBF UTF-8 with fixed-width
  truncation artifacts (trailing partial codepoints -> U+FFFD on read).
- Map Ta Phut selection: `มาบตาพุด` matches **19** features, all via `projectNam` —
  reproduces the plan's audit exactly.

## TDD evidence

- RED: 20 builder tests failed on the typed stub (`NotImplementedError`; 4 fixture
  errors from the same defect) — `pytest tests/test_build_pipe_gis.py`: 16 failed,
  4 errors.
- GREEN: builder implemented; 20/20, then 21/21 after adding the builder<->API schema
  cross-check (`validate_manifest` accepts a built manifest, disk == memory).
- RED: 13 API contract tests failed (routes absent) — disabled/404-detail, 503 family,
  422, ETag family all red.
- GREEN: config + models + `app/gis.py` + routes + lifespan; 13/13.
- Real build: `make gis-build` -> `data/curated/pipe_ry/` (git-ignored, verified with
  `git check-ignore`): full=9,273, focus=19, full length 1,894,203.85 m, focus
  11,023.95 m (matches the audit to the cm), binding pipe 4926 (rule: longest focus
  pipe), bundle 6.6 MB.

## Gates

- Full API suite: **407 passed** (154 s), includes integration containers.
- Flakiness: `test_build_pipe_gis.py + test_twin_gis.py` 34/34 three consecutive runs.
- Ruff (api config) over `api/` + `scripts/build_pipe_gis.py`: clean.
- mypy strict over `api/` (60 files incl. `app/gis.py`) and `scripts/build_pipe_gis.py`: clean.
- `git diff --check`: clean.
- Live gate (uvicorn, real bundle): manifest schema/counts/binding/energy correct;
  focus network 19 features with `application/geo+json`, strong ETag, `max-age=3600`;
  If-None-Match -> 304; `scope=full` -> 9,273 features; unknown scope -> 422; disabled
  process -> 404. No OneDrive path is read at runtime — only the built bundle dir.

## Wiring verification

| New export | Non-test consumer | Location |
|---|---|---|
| `load_gis_bundle`, `GisUnavailable` | app lifespan | `api/app/main.py:28,129,131` |
| `GisBundle`, `build_cache_headers` | GIS routes | `api/app/routes/twin.py:17,304` |
| `GisManifest` (+sub-models) | route `response_model` + loader | `api/app/routes/twin.py:282`, `api/app/gis.py:24` |
| `pipe_gis_*` settings | loader/lifespan/routes | `api/app/{gis,main}.py`, `routes/twin.py` |
| `scripts/build_pipe_gis.py` CLI | `make gis-build` | `Makefile:45` |

Routes are on the already-registered twin router; OpenAPI picks both up.

## QCHECK (2026-08-05 17:35 +0700) — two independent tiers, working tree

### Tier 1 — workflow-backed adversarial multi-agent review

4 finder dimensions (correctness, security, contract, tests) + one adversarial
verifier per finding, each required to refute or produce executed file:line evidence.
15 raw findings -> **14 confirmed, 1 refuted**; 1 verifier errored on API overload
(topic: symlink-coverage — treated as UNVERIFIED, not cleared; the symlink negative
test was added regardless). Confirmed: 2 HIGH (malformed bundle / unreadable file
aborts API startup instead of degrading to 503), 3 MEDIUM (midpoint is a vertex pick;
circular allowlist oracle; missing 304/missing-file negatives), 7 LOW (fractional
PIPE_ID truncation, zero-part polyline, CLI tracebacks, OneDrive path committed in
Makefile, .env hermeticity, CLI failure path untested, weak-ETag forms).

### Tier 2 — Codex g-check (`codex exec -m gpt-5.6-sol`, reasoning high, read-only)

Verdict: request changes. 0 CRITICAL, **2 HIGH**: (1) post-startup bundle mutation /
symlink swap served under a stale strong ETag (FileResponse re-opened a mutable path
verified only at startup); (2) the official energy reference under-pinned (only
`scope`/`station_specific` were constrained — a probe accepted `99 MW`, year 2099, an
unknown operator). **4 MEDIUM**: digest-valid but non-GeoJSON bytes served 200;
OSError escaping the 503 path; single-exact-value `If-None-Match`; uncapped
manifest.json read. Full report retained verbatim in the session scratchpad log
(`codex-gcheck-pr-g.log`); the two tiers' finding sets were characteristically
disjoint, as the split predicts.

### Disposition — all findings fixed (none waived)

- **In-memory verified bundle** (fixes both tiers' biggest cluster): `load_gis_bundle`
  now reads, size-checks, SHA-checks, AND parses every dataset into memory once;
  routes serve those exact bytes via `Response`, never re-opening a path. A
  post-startup rewrite provably changes nothing served
  (`test_gis_serves_the_startup_snapshot_not_the_live_file`); symlinked dataset files
  are refused outright.
- **Energy reference pinned to one constant** (`OFFICIAL_ENERGY_REFERENCE` +
  model_validator + `extra="forbid"` on every GIS model): any deviation in value,
  unit, year, operator, or source URL -> 503 (parametrized negatives), as does a
  non-SIMULATED binding/placement claim.
- **Total error translation**: all filesystem/decoding failures inside the loader
  become `GisUnavailable`; `chmod 000` and missing-file cases prove GIS answers 503
  while `/healthz` stays 200.
- **GeoJSON structure validation** at load: FeatureCollection type, exact
  manifest-declared feature count, polyline-only geometries; hash-valid garbage -> 503.
- **Manifest byte cap** (1 MB) enforced before parsing.
- **RFC 9110 `If-None-Match`**: `*`, candidate lists, and weak `W/` forms -> 304;
  stale validator -> 200 (negative case added).
- **Builder**: true geometric midpoint (halfway by length, interpolated — 2-vertex and
  uneven-vertex regression tests); fractional PIPE_ID refused, never truncated;
  zero-part polylines hard-fail; pyshp low-level errors surface as one GisBuildError
  line + CLI exit 1 (tested); same-size single-byte corruption test now exercises the
  sha256 check specifically.
- **Test hermeticity**: GIS env vars + DATABASE_URL pinned per test, immune to a
  developer `.env`; allowlist oracle now compares against a literally-written expected
  set and asserts the private fields (`remark`, `_createdBy`, …) stay out.
- **Makefile**: the operator-private OneDrive path removed; `GIS_SOURCE` is now a
  required argument.

### Post-remediation gates

- Full API suite: **427 passed** (187 s). GIS suites: 54/54, three consecutive runs.
- Ruff + mypy strict (api + builder): clean. `git diff --check`: clean.
- Real bundle rebuilt (midpoint fix): full=9,273, focus=19, binding pipe 4926,
  midpoint now `[101.1972997, 12.715989]` (geometric); lengths unchanged
  (1,894,203.85 m / 11,023.95 m). Live uvicorn re-check: manifest OK, list-form and
  weak-form `If-None-Match` -> 304, full scope 9,273 features, disabled -> 404.
