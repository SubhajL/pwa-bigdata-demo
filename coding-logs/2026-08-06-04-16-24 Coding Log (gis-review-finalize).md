# Coding Log: GIS Review Finalization

Date: 2026-08-06 04:16:24 +0700
Mode: g-planning followed by g-coding lifecycle
Repository: `/Users/subhajlimanond/dev/pwa-bigdata-demo`
Implementation worktree: `/Users/subhajlimanond/dev/worktrees/pwa-gis-review-finalize.20260806`
Branch: `fix/gis-review-finalize`
Base: `main == origin/main == 8dfc4d8ac126accfc6778842c12f7d00bc55a02d`

## Exploration Basis

Auggie semantic search was unavailable because this environment cannot enforce its required
two-second deadline. Planning therefore used direct inspection and exact-string searches over
`CLAUDE.md`, the PR-G/H formal review, PR-R3 (#42), `api/app/{config,gis,models}.py`,
`scripts/build_pipe_gis.py`, `api/tests/test_{build_pipe_gis,twin_gis}.py`,
`web/src/features/twin/GisNetworkView{,.test}.tsx`,
`web/src/screens/OperationsTwinScreen{,.gis.test}.tsx`, `e2e/tests/topic2-gis.spec.ts`,
`web/vite.config.ts`, `web/package.json`, `Makefile`, `infra/docker-compose.yml`, and
`docs/data/pipe-ry-provenance.md`. Two independent read-only `terra_support` passes checked the
backend trust boundary and frontend test/runtime gaps.

Current truth: PRs #40 and #41 are merged, and PR #42 already closes six of the eight supplied
findings. The remaining material gaps are (1) no independent approved source fingerprint and
(2) no browser proof that linework is actually queryable after painting; post-load MapLibre
errors can retain a ready state. The primary checkout is dirty with user-owned Coding Logs and
is preserved untouched.

## Plan Draft A — External Digest Anchor + Render-Queryable Oracle (Selected Baseline)

### Overview

Add an operator-supplied SHA-256 fingerprint outside the GIS bundle and require it at build and
API activation, so a replaced/re-signed bundle cannot self-assert REAL provenance. Strengthen
MapLibre readiness to require distinct query-rendered pipe features and fail visibly on relevant
post-load errors, and pin the existing lazy-load behavior with a production-manifest gate.

### Files to Change

- `scripts/build_pipe_gis.py` — canonical snapshot fingerprint and mandatory approval match.
- `api/app/models.py` — manifest field for the approved source fingerprint.
- `api/app/config.py` — external activation fingerprint setting.
- `api/app/gis.py` — compare manifest fingerprint to the external setting, fail closed.
- `api/tests/test_build_pipe_gis.py` — source fingerprint and builder mismatch tests.
- `api/tests/test_twin_gis.py` — missing/mismatched external anchor and healthy match tests.
- `Makefile` — require/pass `GIS_APPROVED_SOURCE_FINGERPRINT` for real builds.
- `infra/docker-compose.yml` — pass `PIPE_GIS_APPROVED_SOURCE_FINGERPRINT` independently.
- `docs/data/pipe-ry-provenance.md` — approval workflow, migration, and trust boundary.
- `web/src/features/twin/GisNetworkView.tsx` — rendered-feature readiness and fatal map errors.
- `web/src/features/twin/GisNetworkView.test.tsx` — rendered count and post-load error regressions.
- `e2e/tests/topic2-gis.spec.ts` — assert rendered feature count equals audited focus count.
- `web/vite.config.ts` — emit a production manifest for dependency-wiring inspection.
- `web/scripts/verify-gis-chunk.mjs` — fail build if GIS/MapLibre becomes a static entry import.
- `web/package.json` — run the chunk-isolation verifier in the production build gate.

### Implementation Steps (TDD)

1. Add builder/API tests for absent, malformed, wrong, and matching fingerprints; run focused
   pytest and confirm RED for missing symbols/unguarded bundles.
2. Implement `source_snapshot_fingerprint()`, require `approved_source_fingerprint` in
   `build_bundle()`/CLI, record it in `GisSource`, and compare it with
   `Settings.pipe_gis_approved_source_fingerprint` inside `load_gis_bundle()`.
3. Refactor only shared SHA-256 validation/canonicalization; rerun focused pytest GREEN plus
   ruff/mypy.
4. Add frontend tests where `load`/source ingestion alone remains not-ready, a `render` event
   with expected query-rendered IDs becomes ready, and any post-load map error clears readiness
   and displays failure; run Vitest and confirm RED.
5. Implement `renderedPipeCount()` and one map-event state transition path; make readiness mean
   installed layers plus expected rendered features. Rerun focused Vitest GREEN, lint/typecheck.
6. Add the E2E rendered-count assertion and production manifest verifier. First run the new
   verifier against an intentionally absent/incorrect manifest path for RED, then wire Vite
   manifest emission and the build command for GREEN.
7. Run all final gates, three-run flake checks, wiring checks, independent QCHECK, formal
   `g-check`, then standard GitHub PR/merge/local-main/post-merge verification.

Functions:

- `source_snapshot_fingerprint(snapshot)` — hash a canonical ordered representation of every
  captured sidecar filename, byte length, and content digest.
- `normalize_source_fingerprint(value)` — accept exactly 64 lowercase/uppercase hex characters,
  return lowercase, and reject missing/malformed approval values.
- `verify_approved_source(snapshot, approved)` — compare computed and approved fingerprints
  before any output directory is created or REAL manifest is emitted.
- `_verify_external_source_fingerprint(settings, manifest)` — require the activation-time
  environment anchor and compare it with the loaded manifest before payload service.
- `renderedPipeCount(map)` — count distinct numeric `pipe_id` values returned by
  `queryRenderedFeatures` for the visible base pipe layer.
- `refreshRenderReadiness(map)` — publish the rendered count and mark ready only at the audited
  focus count; map errors transition the view to explicit failure.
- `verifyGisChunkIsolation(manifest)` — traverse Vite static/dynamic imports and reject a GIS or
  MapLibre path reachable through the main entry's static graph.

### Test Coverage

`api/tests/test_build_pipe_gis.py`:

- `test_source_snapshot_fingerprint_is_order_stable` — same captured sidecars produce identical fingerprint.
- `test_source_snapshot_fingerprint_changes_with_any_sidecar` — any captured byte drift changes identity.
- `test_build_refuses_unapproved_source_fingerprint` — wrong independent anchor emits no REAL bundle.
- `test_build_records_approved_source_fingerprint` — matching anchor is persisted exactly once.
- `test_cli_requires_approved_source_fingerprint` — direct builder path cannot bypass approval.
- `test_gis_build_target_requires_approved_source_fingerprint` — Make path cannot bypass approval.

`api/tests/test_twin_gis.py`:

- `test_enabled_gis_without_external_fingerprint_fails_closed` — activation lacks trust anchor returns 503.
- `test_enabled_gis_with_mismatched_external_fingerprint_fails_closed` — re-signed replacement is rejected.
- `test_enabled_gis_with_matching_external_fingerprint_serves` — independently anchored bundle remains healthy.
- `test_manifest_source_fingerprint_malformed_fails_closed` — invalid digest never enters runtime.

`web/src/features/twin/GisNetworkView.test.tsx`:

- `does not report ready from source ingestion alone` — parsed but unpainted geometry cannot pass.
- `reports ready after all distinct pipes are rendered` — queryable painted features meet manifest count.
- `fails explicitly on post-load map errors` — late renderer failures revoke readiness.
- `ignores render queries from unrelated layers` — only the base pipe layer counts.

`e2e/tests/topic2-gis.spec.ts`:

- `2.1 rendered focus equals audited count` — real browser queries all expected pipe lines.

Production build:

- `verify-gis-chunk.mjs` — main static graph excludes GIS and MapLibre.
- `verify-gis-chunk.mjs` — GIS remains dynamically reachable from main.

### Decision Completeness

- Goal: close the final provenance and blank-map false-pass gaps from the supplied review.
- Non-goals: permission approval, committing private hashes, distributing source data, changing
  simulated bindings, adding tiles/basemaps, or implementing PR-I customer topology.
- Success criteria: a wrong/re-signed bundle cannot start with GIS enabled unless its canonical
  source fingerprint matches an independent environment value; the map cannot report ready until
  the audited number of base-layer pipe IDs is query-rendered; post-load errors revoke readiness;
  dark landing does not statically load MapLibre; all gates are clean and stable.
- Public interfaces: new CLI flag `--approved-source-fingerprint`; new Make variable
  `GIS_APPROVED_SOURCE_FINGERPRINT`; new environment variable
  `PIPE_GIS_APPROVED_SOURCE_FINGERPRINT`; manifest `source.fingerprint_sha256`; DOM diagnostic
  `data-rendered-features`. No endpoint, DB, migration, topic, or URL change.
- Fail closed: missing/malformed/mismatched fingerprint => builder error or GIS 503; rendered
  count mismatch stays not-ready; MapLibre error => explicit failed panel. Disabled GIS remains 404.
- Rollout: keep `PIPE_GIS_ENABLED=0`; after permission, independently approve the source fingerprint,
  rebuild, configure the external fingerprint, provision the exact-SHA bundle, then enable locally.
  Backout is flag-off plus removal of the external value; old manifests intentionally 503 until rebuilt.
- Monitoring: startup logs identify absent/mismatched fingerprints; UI failure state and browser
  diagnostic attributes expose render failure; watch JS chunk graph/size during build.
- Acceptance: focused/full pytest, ruff, mypy; focused/full Vitest three times, lint, typecheck,
  build; E2E TypeScript; enabled real-browser gate only after permission and exact fingerprint.

### Dependencies

- No new runtime dependency. Uses Python stdlib hashing/JSON and existing MapLibre APIs.
- The actual approved fingerprint must come from the data-approval process and is unavailable while
  permission is PENDING; code/tests use synthetic fingerprints without exposing source bytes.

### Validation

- `PYTHONDONTWRITEBYTECODE=1 api/.venv/bin/python -m pytest -p no:cacheprovider api/tests/test_build_pipe_gis.py api/tests/test_twin_gis.py -q`
- `api/.venv/bin/ruff check api scripts`
- `api/.venv/bin/mypy api/app scripts/build_pipe_gis.py`
- `pnpm --dir web test -- src/features/twin/GisNetworkView.test.tsx`
- `pnpm --dir web lint && pnpm --dir web typecheck && pnpm --dir web build`
- `pnpm --dir e2e exec tsc --noEmit`
- Exact-SHA enabled Playwright remains authority-gated; dark gate remains mandatory.

### Wiring Verification

| Component | Entry Point | Registration Location | Schema/Table |
|---|---|---|---|
| Source fingerprint calculation | `build_bundle()` | CLI `main()` and Make `gis-build` | Manifest `source.fingerprint_sha256` |
| External runtime anchor | FastAPI lifespan `load_gis_bundle()` | Compose env passthrough / `Settings` | Same manifest field; no DB |
| Render-query oracle | MapLibre `render`/`idle` event | `GisNetworkView` mount effect | GeoJSON `properties.pipe_id` |
| Lazy chunk verifier | `pnpm build` | `web/package.json` after Vite build | Vite `.vite/manifest.json` |

Cross-language schema: Python builder and API share `source.fingerprint_sha256`; TypeScript does
not consume the private source fingerprint. GeoJSON `pipe_id` remains numeric in Python output,
the API binding, TypeScript types, MapLibre feature properties, and E2E diagnostics. No DB schema.

## Plan Draft B — Signed Bundle Envelope + Screenshot Oracle

### Overview

Sign the complete manifest with an asymmetric key and verify it in the API, then add a golden
screenshot/pixel-difference browser test for map painting. This gives stronger delegation and
visual-regression guarantees but introduces key lifecycle, cryptographic dependencies, brittle
render baselines, and source-independent signing that still needs an approval process.

### Files to Change

Draft A files plus a signing/verification module, public-key configuration, key rotation docs,
signature fixture generation, and committed Playwright screenshot baselines.

### Implementation Steps (TDD)

1. Add invalid/unknown-key/tampered signature tests; implement signed envelope verification.
2. Add deterministic screenshot baseline and induced blank-style mismatch test.
3. Add key rotation and rollback tooling; rerun all Draft A gates plus cross-platform screenshot runs.

Functions: `sign_manifest()`, `verify_manifest_signature()`, `assertMapScreenshot()`.

### Test Coverage

- `rejects tampered signed manifest` — changed bundle metadata breaks signature.
- `rejects unknown signing key` — unapproved signer cannot label REAL.
- `blank canvas differs from approved baseline` — invisible pipes fail visual oracle.

### Decision Completeness

- Goal/non-goals/success criteria match Draft A, but public interfaces add signing private-key and
  verification public-key configuration plus signature metadata.
- Fail closed on any signature/key mismatch; screenshot mismatch fails CI.
- Rollout requires key custody and baseline approval before activation.

### Dependencies

- A vetted signing library, key-generation/custody process, and stable browser/GPU baseline.

### Validation

- Draft A commands plus signature interoperability and screenshot update review.

### Wiring Verification

| Component | Entry Point | Registration Location | Schema/Table |
|---|---|---|---|
| Manifest signature | Builder finalization | CLI key configuration | Signed manifest envelope |
| Signature verifier | API GIS startup | Settings public key | Signed manifest envelope |
| Screenshot baseline | Playwright GIS suite | Test project config | PNG artifact |

Cross-language schema remains manifest-only; no DB change.

### Trade-offs

Draft B offers stronger signer identity and pixel-level regression but is disproportionate before
permission/key authority exists. Screenshot stability across software/hardware WebGL also risks
false failures. It does not eliminate the need for an externally approved source identity.

## Comparative Analysis and Synthesis

Draft A directly satisfies the reviewed threat: a source-derived canonical digest supplied outside
the bundle anchors REAL provenance, without pretending the dark POC has a mature PKI. Querying
rendered features tests semantic painting and is less brittle than screenshots. Draft B is the right
future choice if bundles are distributed across trust domains, but key custody and golden images are
not decision-ready while permission is pending. Both keep the feature dark and fail closed; Draft A
has fewer moving parts and better immediate test determinism.

## Unified Execution Plan

Use Draft A. Keep the exact external-anchor boundary explicit: the repository provides enforcement,
but does not invent or commit the private delivery's approved fingerprint. Require the operator/data
approval process to supply it independently at both build and activation. Make map readiness a
conjunction of successful setup and audited query-rendered feature count; any map error revokes it.
Add a production manifest graph check so the already-correct lazy split cannot regress silently.

Execute in four tests-first units:

1. External source fingerprint builder contract.
2. API activation-time fingerprint comparison.
3. Render-query readiness and post-load failure semantics.
4. Build-manifest lazy chunk regression gate and E2E assertion.

Files, functions, tests, public interfaces, failure modes, rollout, commands, dependencies, and the
wiring table are exactly those in Draft A. No implementation decision remains open.

### Unified Acceptance Gates

1. Focused backend RED/GREEN, then full API tests, ruff, mypy, three-run GIS slice.
2. Focused frontend RED/GREEN, then full Vitest, lint zero warnings, typecheck, production build,
   and three-run GIS slice.
3. E2E TypeScript and default-dark browser gate if an exact-SHA isolated stack is available.
4. Enabled real-bundle browser gate only with written permission, an independently approved actual
   fingerprint, and an exact-SHA provisioned bundle; otherwise report this separately as blocked.
5. Wiring grep/table, independent QCHECK, formal working-tree `g-check`, remediation, commit/PR,
   checks/reviews without override, merge, local-main landing, and post-merge focused verification.

### Decision-Complete Checklist

- [x] No open decisions remain for the implementer.
- [x] Every public interface is named consistently.
- [x] Every behavior change has a defect-sensitive test.
- [x] Validation commands are specific and scoped.
- [x] Wiring covers builder, API startup, map runtime, and build gate.
- [x] Dark rollout, migration, and backout are explicit.

## Implementation — 2026-08-06 05:13 +07

### Delivered behavior

- Builder captures every shapefile sidecar once, hashes and converts those exact in-memory bytes,
  computes a canonical sidecar-set fingerprint, and refuses to emit REAL provenance unless an
  independently approved 64-hex value matches.
- The audited 9,273 full / 19 focus counts are source-controlled and non-overridable through the
  CLI, Make target, or public `build_bundle()` API. Branch `5531021` and unique `globalId` remain
  mandatory. Synthetic tests temporarily replace module constants; product code exposes no
  alternate count-parameterized builder.
- API activation requires the same external fingerprint through
  `PIPE_GIS_APPROVED_SOURCE_FINGERPRINT` plus an independently approved digest of the exact
  completed manifest/payload bytes through `PIPE_GIS_APPROVED_BUNDLE_SHA256`. It validates both
  before serving and retains strict GeoJSON/property, fixed manifest narrative/file surfaces,
  serve-time 9,273/19 counts, and exact-once binding checks.
- Map readiness now requires every distinct audited pipe to be returned from MapLibre's visible
  base layer. Source ingestion alone cannot pass, and any post-load map error revokes readiness and
  displays the explicit fallback.
- Vite development excludes MapLibre from dependency pre-bundling because relocation broke its
  sibling module-worker URL. The exact browser trace showed the prior 404 at
  `/node_modules/.vite/deps/maplibre-gl-worker.mjs`; the fixed browser loads the packaged worker and
  returns all 19 rendered fixture pipes.
- Production build emits a Vite manifest and fails if GIS/MapLibre becomes statically reachable
  from the main entry or ceases to be dynamically reachable. Current main entry is 448.46 kB raw /
  139.00 kB gzip; GIS is a separate 947.97 kB raw / 248.18 kB gzip dynamic chunk.
- GIS JSDOM canvas errors and the hook-dependency lint warning are gone; GIS tab keyboard behavior,
  stale P-2 selection, and lazy import were already present in the PR-R3 base and remain covered.

### TDD evidence

- Backend RED: focused pytest could not import `source_snapshot_fingerprint`; subsequent tests also
  drove required external activation wiring and non-overridable count behavior.
- Browser RED: the new renderer test repeatedly observed `data-map-ready=false`, source/rendered
  counts 0, and a blank canvas. Trace inspection found the MapLibre worker request returned 404.
- Chunk-gate RED: Node could not import the verifier; the first production run then exposed Vite's
  `index.html` entry-key shape. Full Vitest later caught the Node test filename, which was separated
  from Vitest discovery without weakening either runner.
- GREEN: exact isolated-stack Playwright returned 19 distinct rendered pipes and preserved the dark
  logical-twin fallback; backend fingerprint/count/activation and binding/disclosure tests pass.

### Validation evidence on base candidate `8dfc4d8ac126accfc6778842c12f7d00bc55a02d`

- Focused backend: 111 passed in 111.69 s
  (`test_build_pipe_gis.py`, `test_twin_gis.py`, `test_evidence_docs.py`).
- Full API, three consecutive unchanged-candidate runs: 475 passed in 274.98 s; 475 passed in
  259.42 s; 475 passed in 268.12 s.
- Ruff: all checks passed. Mypy: success across 26 source files.
- Focused GIS frontend: 36 passed; output has no canvas exceptions. Full frontend, three
  consecutive runs: 597/597 each (70 files; 12.19 s, 10.72 s, 7.40 s).
- ESLint: exit 0 with zero warnings. TypeScript: web and E2E both pass.
- Node build contract: 3/3. Production build and dynamic-only artifact verifier pass.
- Exact isolated Playwright (`pwa-gis-finalize`, API 18080/web 15173): dark landing + renderer
  regression 2/2 passed. Containers and network were removed afterward without deleting volumes.
- `git diff --check`: pass.

Known evidence boundaries: the complete web suite still emits pre-existing non-GIS JSDOM/React
warnings (navigation, `act()`, duplicate keys, Node localStorage); the focused GIS suite is clean.
Playwright itself emits Node/colour deprecation warnings. No in-app browser session was available,
so repository Playwright is the browser authority. The real enabled Rayong bundle was not used:
permission and the actual independently approved source fingerprint remain PENDING. No hosted CI
checks or reviews were configured on PRs 40–42; local gates must not be described as hosted checks.

### Wiring verification

| Producer | Contract | Consumer | Defect-sensitive proof |
|---|---|---|---|
| `source_snapshot_fingerprint()` | canonical 64-hex sidecar digest | builder approval comparison + manifest | order stability, byte drift, mismatch refusal |
| `build_bundle()` | fixed 9,273/19 audited counts | CLI / `make gis-build` | signature has no count knobs; partial fixture refused |
| manifest `source.fingerprint_sha256` | same external identity | API `load_gis_bundle()` | missing/malformed/mismatched env returns unavailable |
| verified GeoJSON `pipe_id` | distinct numeric feature identity | MapLibre source/render queries | unit source/render lifecycle + 19-pipe browser oracle |
| Vite emitted manifest | static/dynamic artifact graph | post-build verifier | pass, eager-reject, unreachable-reject Node cases |

No database schema, migration, runtime dependency, private source byte, or actual fingerprint was
added. Backout is one code revert plus leaving `PIPE_GIS_ENABLED=0`; no data migration is required.

## Independent QCHECK + remediation — 2026-08-06 05:49 +07

Terra performed the AGENTS-authorized read-only independent review and made no edits. Findings and
primary-owner dispositions:

- **HIGH, accepted and fixed:** a replacer could copy the approved source-fingerprint literal,
  rewrite a smaller bundle, and self-declare matching positive counts. The API now pins the literal
  9,273/19 audit and requires `PIPE_GIS_APPROVED_BUNDLE_SHA256`, a domain-separated digest of the
  exact `manifest.json`, `network.geojson`, and `map_ta_phut.geojson` bytes held for serving.
  Missing/malformed/mismatched values fail 503. A copied-source-fingerprint/re-signed-bundle test
  reaches this exact check and fails closed.
- **MEDIUM, accepted and fixed:** manifest strings/filename keys could carry private notes even
  though GeoJSON properties were allowlisted. Dataset name, source filenames, scenario asset,
  binding-rule shape, distribution statement, dataset keys/files, generated timestamp type, and
  source/full count relationship are now fixed or tightly validated. Five disclosure regressions
  cover dataset, filename, source digest, binding rule, and distribution.
- **MEDIUM, accepted and fixed:** renderer queries do not literally prove visible pixels. The
  Playwright oracle now screenshots only the MapLibre canvas, decodes its PNG scanlines in the test
  with Node built-ins, and requires materially non-background pixels in addition to 19 distinct
  rendered pipe IDs. Direct WebGL back-buffer reads correctly failed because MapLibre does not
  preserve that buffer; screenshot decoding proves the composited browser output and passes.
- **Residual boundary, documented:** the exact bundle digest is trusted-operator approval, not
  signer attribution. Cross-domain delegated releases would still require a signed manifest/key
  lifecycle. Permission remains PENDING, so no actual source fingerprint, bundle digest, or enabled
  real Rayong runtime was invented or claimed.

Additional primary hardening: optional delivered `.qmd` metadata is included in the one-read source
snapshot and canonical source fingerprint; operator sample config and Compose wire both approval
values.

### Final unchanged-candidate gates after remediation

- Focused backend: 121/121 passed in 129.21 s.
- Full API, three consecutive runs: 485/485 in 274.68 s; 485/485 in 277.27 s; 485/485
  in 272.55 s.
- Full frontend remained unchanged after its three consecutive 597/597 runs. Final ESLint has zero
  warnings; web TypeScript, E2E TypeScript, Node build-contract 3/3, Ruff, Mypy (26 files), and
  `git diff --check` all pass.
- Final production build passes with main 448.46 kB raw / 139.00 kB gzip and GIS 947.97 kB raw /
  248.18 kB gzip, verified dynamic-only.
- Final isolated Playwright: dark landing + renderer/query/pixel proof 2/2 passed. The isolated
  containers/network were removed without `-v`; volumes were not deleted.

## Formal g-check — 2026-08-06 05:55 +07

Scope: the complete staged diff from `8dfc4d8ac126accfc6778842c12f7d00bc55a02d`,
including the independent-QCHECK remediations, was reviewed for correctness, disclosure surfaces,
activation safety, runtime wiring, and defect-sensitive coverage.

### Finding and disposition

- **MEDIUM, accepted and fixed before submission:** the fixed manifest structure still accepted
  arbitrary strings in source-file and dataset SHA-256 fields. Although the completed-bundle digest
  prevented a non-approved mutation from activating, a trusted-but-malformed bundle could use those
  fields as an unintended narrative surface. Both digest fields now require exactly 64 lowercase
  hexadecimal characters; source file sizes must also be positive. The disclosure regression matrix
  includes a non-digest source value and proves fail-closed behavior.

No HIGH, MEDIUM, or LOW findings remain open after that remediation.

### Post-review confirmation

- Focused digest-schema/disclosure regressions: 7/7 passed.
- Ruff: all checks passed. Mypy: success across 26 source files.
- Repository-wide API confirmation after the narrow schema tightening: 486/486 passed in 268.27 s.
- The prior three consecutive 485/485 full-API runs remain stability evidence for the otherwise
  identical candidate; the one additional parametrized disclosure case accounts for the new total.
