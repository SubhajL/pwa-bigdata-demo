# PR-R3 — GIS provenance/security remediation (eight findings) + loop-until-dry QCHECK

Branch: `fix/pr-r3-gis-provenance-remediation` (from `main` @ b596846, the PR-H merge).
Lands **before PR-I** so fault attribution on the twin/impact-zone work stays clean. GIS
stays dark (`PIPE_GIS_ENABLED=0`) — no exposure — but the twin screen and its provenance
contract are hardened at the SHA PR-I will build on. Gate A1 is NOT re-run (its acceptance
is bound to b596846); PR-R3 becomes part of what Gate A2 re-validates at the final SHA.

## Scope

Remediates the eight findings from the PR-G #40 / PR-H #41 post-merge review (see
`coding-logs/2026-08-05T18-17 Coding Log (pr-h-rayong-gis-ui).md` §Review):

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| 1 | HIGH | Serve-time serves fields outside the reviewed public surface | `_validate_geojson`/`_validate_feature_properties` (api/app/gis.py) reject any feature property key ∉ `GIS_PUBLIC_PROPERTY_KEYS` or any non-scalar value → 503; `GisDemoBinding` validates its snapshot against the same allowlist. One shared constant (`api/app/models.py`), cross-checked against the builder's `PROPERTY_ALLOWLIST.values()` by the fixture test. |
| 2 | HIGH | Builder can label the wrong shapefile REAL | `verify_source_identity` (scripts/build_pipe_gis.py) enforces every record on PWA branch `5531021` + unique/non-null `globalId`; `build_bundle` enforces `--expect-full 9273 --expect-focus 19`; the manifest records `source.audit`; `GisSourceAudit` (models.py) refuses a bundle whose audit is absent/false/wrong-branch. |
| 3 | MED | Binding not proven to exist in served data | `_verify_demo_binding` (gis.py) requires `demo_binding.pipe_id` to occur exactly once in BOTH scopes with properties equal to the bound feature. |
| 4 | MED | Hashes can describe different bytes than converted | `SourceSnapshot`/`load_source_snapshot` read each sidecar ONCE; pyshp is fed `BytesIO`, so the manifest hashes and the converted geometry come from the same bytes. |
| 5 | MED | GIS can show another pump's SEC beside the P-2 binding | `OperationsTwinScreen` re-selects the bound pump on EVERY GIS entry (fetch continuation for first load + `changeView` for re-entry), preserving the late-arrival no-snap contract. |
| 6 | MED | Browser oracle can certify a blank map ready | `GisNetworkView` exposes `data-source-features` = distinct `pipe_id`s from `querySourceFeatures`, gated on `sourcedata isSourceLoaded`; the E2E asserts it equals the manifest focus count. |
| 7 | MED | MapLibre loaded on every dark visit | `GisNetworkView` is `React.lazy` behind `Suspense`; main entry dropped 386.85 → 138.45 kB gzip, MapLibre now a separate 248 kB-gzip chunk fetched only on GIS-tab open. |
| 8 | LOW | tablist keyboard + jsdom canvas noise + markerEl dep | `TwinViewSwitcher` WAI-ARIA keyboard pattern (roving tabIndex, Arrow/Home/End, wrap); shared jsdom `getContext` stub in `web/src/test-setup.ts`; `markerEl` added to the mount-effect deps. |

Deferred (out of the eight; flagged, not fixed): the `public, max-age=3600` cache policy on
`/api/twin/gis/network` (review Rollout Note) — inert while the flag is off; a cache-policy
decision for the authorized-activation boundary, to be settled before enabling for a judged
run, not a code defect in a dark feature.

## TDD evidence

- **F1/F3/F2-serve** (api): RED first via new `test_twin_gis.py` negatives (disallowed key,
  non-scalar value, binding-in-snapshot, `source.audit` missing/false/wrong-branch, binding
  absent/duplicated/property-mismatch); each is load-bearing (e.g. `audit_missing` and
  `binding_absent` pass ONLY because the new guards exist). GREEN: 36/36 `test_twin_gis.py`.
- **F2/F4** (builder): RED proven by import error (new symbols absent) then GREEN 38/38
  `test_build_pipe_gis.py`; the hash-race test injects a mid-build disk mutation and asserts
  the manifest still describes the converted bytes (would raise/​mismatch pre-snapshot).
- **F8 tablist**: RED (3 failing) → GREEN 5/5 `TwinViewSwitcher.test.tsx`.
- **F6**: RED-shaped via new mock `sourcedata`/`querySourceFeatures`; GREEN — count published
  only after the source loads, ignored for other sources / unloaded source.
- **F5**: new screen test (select non-P-2 → GIS → SEC re-snaps to P-2) — fails pre-fix
  (selection snapped only on first fetch), GREEN post-fix.

## Gates

- api: `ruff check .` clean · `mypy app` clean (25 files) · `pytest` **447 passed** (full),
  GIS files 74/74 across 4 consecutive runs (deterministic).
- web: `tsc --noEmit` clean · `eslint src` clean · `vitest` **589 passed × 3** (no flake,
  jsdom canvas noise gone) · `vite build` OK (GIS chunk split out).
- e2e: `tsc --noEmit` clean.

## Wiring verification

| New export | Non-test import | File:line |
|-----------|-----------------|-----------|
| `GIS_PUBLIC_PROPERTY_KEYS` | YES | api/app/gis.py:27,191 |
| `AUDITED_BRANCH_CODE` (models) | YES | api/app/models.py:618 (`GisSourceAudit` validator) |
| `GisSourceAudit` | YES | api/app/models.py:636 (`GisSource.audit`) |
| `SourceSnapshot` / `load_source_snapshot` | YES | scripts/build_pipe_gis.py:187,255,680 |
| `verify_source_identity` | YES | scripts/build_pipe_gis.py:688 |
| `data-source-features` | YES | web/src/features/twin/GisNetworkView.tsx:209 |
| lazy `GisNetworkView` | YES | web/src/screens/OperationsTwinScreen.tsx:462 |

## Process change (this sitting)

Amended `~/.claude/skills/g-coding/SKILL.md` Phase 5/6 to **loop-until-dry**: after
remediating, re-run BOTH QCHECK tiers on the remediated tree with a VARIED framing per round
(contract-correctness → adversarial provenance/security → merged-artifact/build), landing
only when a full both-tiers round returns nothing above LOW. Rationale: the PR-G/H review
found eight defects a single pre-merge pass missed; framing demonstrably steers coverage.

## QCHECK (loop-until-dry)

Two tiers per round (Codex g-check `gpt-5.6-sol` high, read-only + independent Opus 4.8
reviewer), varied framing per round. Land only when a full round returns nothing above LOW.

### Round 1 — contract-correctness

- **Opus (tier B): nothing above LOW.** Verified all eight guard/test pairings are
  non-vacuous; cleared the named bypass vectors (binding int/float coercion is safe because
  `dict.__eq__` compares cross-type and pydantic preserves JSON types; snapshot reads once;
  SEC snaps on every entry incl. keyboard; `data-source-features` is fail-closed). 6 LOWs.
- **Codex (tier A): 2 HIGH + 2 MED (DISJOINT from Opus).** This is the loop's whole point.
  - HIGH-1 — audited counts were decorative: the Makefile `gis-build` passed neither
    `--expect-full` nor `--expect-focus`, and serve time never cross-checked `source.audit`
    counts against the payload → a re-signed 2-feature bundle could claim `expected_full=9273`
    and serve 200. **Fixed:** Makefile pins 9273/19; `gis._verify_source_audit_counts` 503s on
    drift. Tests: `test_gis_audit_count_disagrees_with_payload_fails_closed`,
    `test_gis_build_target_pins_audited_counts`.
  - HIGH-2 — boolean bypass: `isinstance(v, int)` accepts `bool`, and JSON `true` coerces to
    `1` in the manifest while staying `true` in the GeoJSON, so a `pipe_id: true` feature could
    defeat the binding identity check (confirmed empirically: `pipe_id=True → 1`,
    `Literal[True]` accepts `1`, `True == 1`). **Fixed:** `_validate_feature_properties` rejects
    booleans explicitly. Test: `test_gis_boolean_property_value_fails_closed`.
  - MED-1 — the "render proof" certified source PARSING, not painting (line-width 0 would keep
    it green). **Fixed:** relabelled source-INGESTION honestly across code/E2E/log + a
    `line-width>0` unit paint guard.
  - MED-2 — late-arrival no-snap relied on a passive-effect `viewRef` write. **Fixed:**
    `changeView` updates `viewRef` synchronously.
  - LOW (both tiers) — tab/panel ARIA incomplete. **Fixed:** `aria-orientation`, tab `id` +
    `aria-controls`, and `role="tabpanel"` wrappers; test added.
- Round-1 fixes re-gated: api ruff/mypy clean, GIS 77 passed; web tsc/eslint clean, 590
  passed; build OK (chunk split intact).

### Round 2 — adversarial provenance/security

Both tiers CONVERGED on the primary leak (independent confirmation):

- **HIGH (both tiers) — the round-1 property scrub only MOVED the leak.** `_validate_geojson`
  scrubbed `properties` only; a re-signed bundle could still smuggle private source columns
  in a Feature-level member (`id`, `remark`, `_createdBy`), inside `geometry`, or on the
  FeatureCollection — all served in the raw bytes. Proven by direct probes. **Fixed:**
  `_reject_foreign_members` enforces strict member allowlists at all three levels
  (FeatureCollection `{type,features}`, Feature `{type,properties,geometry}` + `type=="Feature"`,
  geometry `{type,coordinates}` + coordinates-is-list) → 503. Tests:
  `test_gis_{feature,geometry,collection}_level_foreign_member_fails_closed`.
- **HIGH (Codex) / MED (Opus) — a fully re-signed bundle can forge REAL; the docstrings
  overclaimed tamper-evidence.** The manifest is unsigned and lives in `PIPE_GIS_DIR`, so an
  adversary controlling that directory can re-assert `provenance=REAL`/`source.audit`. This
  is the deployment trust boundary, not a serve-time defect. **Fixed (honesty, in scope):**
  softened the `GisSourceAudit` + `GIS_PUBLIC_PROPERTY_KEYS` docstrings to state accurately
  that the guards reject malformed/wrong/over-scoped bundles but are NOT tamper-evidence, and
  added a "Serve-time validation boundary" section to `docs/data/pipe-ry-provenance.md`
  documenting the residual and naming the external-signature anchor as the deferred hardening
  (deliberately out of scope while the feature is dark + directory operator-owned).
- **LOW (Codex) — Makefile guard test searched the whole file.** **Fixed:** asserts the exact
  `GIS_EXPECT_FULL ?= 9273` / `GIS_EXPECT_FOCUS ?= 19` assignments.
- **Documented residuals (deferred, NOT gold-plated on a dark feature; recorded, not dropped):**
  sidecar-acquisition race (snapshot reads sidecars sequentially — window shrank from
  two-full-passes to between-sidecar-reads; manifest still honestly describes the mixed bytes);
  startup-confinement TOCTOU (symlink check vs read on separate ops — pre-existing; needs
  open-then-fstat); cross-scope geometry identity + strict binding types (binding proves
  properties, not geometry, across scopes); enabled-E2E external-anchor assertion (blocked on
  the anchor above).
- Round-2 fixes re-gated: api ruff/mypy clean, GIS 80 passed. Round 2 touched only backend.

### Round 3 — merged-artifact / build

- **HIGH (Codex) — the count fix only pinned the Makefile path.** The documented DIRECT CLI
  invocation defaulted `--expect-full/--expect-focus` to `None`, so a partial same-branch
  export could be built, labelled REAL, and served without enforcing 9,273/19. **Fixed:** the
  CLI now defaults both to the audited constants (`AUDITED_FULL_COUNT`/`AUDITED_FOCUS_COUNT`),
  so even the bare command hard-fails a wrong export; `build_bundle()` stays `None`-default for
  library/unit use. Tests: `test_cli_pins_audited_counts_by_default`,
  `test_cli_builds_bundle_with_configured_binding` (now passes explicit 5/2).
- **MED (Codex) — the code-split added a new failure mode.** `Suspense` catches a PENDING
  import, not a REJECTED chunk (stale deploy / missing hashed asset / network blip), which
  escaped to the router's error UI and would take the logical twin down. **Fixed:**
  `LazyChunkBoundary` confines the throw to the GIS panel and renders a fallback. Test:
  `LazyChunkBoundary.test.tsx`.
- **MED (Opus) — a pre-PR bundle now 503s until rebuilt** (the required `source.audit` +
  strict members). Opus classified this as INTENDED fail-closed behaviour + a runbook step,
  not a defect. **Handled (doc):** rebuild-on-deploy note added to the provenance doc.
- **LOW (both) — builder↔API cross-check covered only the manifest.** **Fixed:**
  `test_builder_geojson_passes_the_api_serve_validator` runs the built GeoJSON through the
  API's `_validate_geojson`, so a future builder foreign member is caught here.
- **LOW (both, ACCEPTED + documented) — dangling `aria-controls`.** The inactive tab
  references a conditionally-unmounted panel. Both tiers confirmed keyboard/focus/interaction
  are correct (the actual finding-8 scope); making the id resolve would mean always-rendering
  both panels, defeating the lazy split for marginal benefit on a dark feature. Accepted.
- Opus ran EVERY gate green at this SHA (api 453, web 590, build+chunk-split, e2e tsc). Codex
  confirmed all cross-file constants/`source.audit` shapes agree and MapLibre stays isolated.
- Round-3 fixes re-gated: api ruff clean, builder 41 passed; web tsc/eslint clean, 592 passed;
  build OK (main 138.89 kB gzip, MapLibre a separate 248 kB chunk).

### Round 4 — verification / completeness

- **Opus: DRY** — verified all round-3 fixes non-vacuous, every cross-fix interaction clean
  (builder identity ↔ serve validator, binding ↔ real build, SEC re-select ↔ late-arrival,
  tabpanel + lazy + `data-source-features`), all gates green.
- **Codex: 3 MED (disjoint refinements), all FIXED:**
  - Coordinates were only checked to be a list — object/string/boolean coords served 200,
    contradicting the fail-closed claim. **Fixed:** `_validate_line_geometry`/`_validate_position`
    recursively validate nesting, arity, finite numbers, and WGS84 bounds (≥2 positions/line).
    Test: `test_gis_invalid_coordinates_fail_closed` (parametrized: string/object/non-numeric/
    boolean/out-of-range/single-position).
  - `LazyChunkBoundary` caught EVERY error, masking a genuine `GisNetworkView` bug as "chunk
    failed". **Fixed:** it now CLASSIFIES — chunk-load errors render the fallback, non-chunk
    errors are RE-THROWN (pre-code-split behaviour). Tests: real rejected `React.lazy`,
    chunk-message throw, non-chunk rethrow via an outer boundary.
  - The CLI-default test proved only "≠ 5/2", not "= 9273/19". **Fixed:**
    `test_cli_defaults_pass_exactly_the_audited_counts` captures `build_bundle`'s args and
    asserts 9273/19; the Makefile test asserts the exact `--expect-full "$(GIS_EXPECT_FULL)"`
    wiring + the exact assignments.
- Round-4 fixes re-gated: api ruff/mypy clean, GIS 89 passed; web tsc/eslint clean, 594 passed.

### Round 5 — dry-confirmation

- **Opus: DRY** — all three round-4 fixes verified non-vacuous; real builder output confirmed
  to pass the coordinate validator; no new MEDIUM+ anywhere.
- **Codex: 3 MED (disjoint input-fuzzing), all FIXED:**
  - The optional 3rd ordinate was unvalidated and `math.isfinite` on a googol-sized int raised
    an UNCAUGHT `OverflowError` (could crash startup). **Fixed:** `_validate_position` requires
    exactly `[lon, lat]` and uses a range COMPARISON as the finiteness check (NaN/inf/huge-int
    all 503; comparison never overflows). Tests: 3-element / `NaN` / `10**400` params.
  - A non-finite property float (`NaN`/`Infinity`) was served raw under 200 — invalid JSON the
    browser rejects. **Fixed:** `_validate_feature_properties` rejects non-finite floats. Test:
    `test_gis_non_finite_property_value_fails_closed`.
  - The boundary classifier missed Vite 6's "Unable to preload CSS" — a MapLibre CSS-chunk
    failure would have crashed the route. **Fixed:** added to the classifier + a test.
- Round-5 fixes re-gated: api ruff/mypy clean, `test_twin_gis` 51 passed; web boundary 5,
  tsc/eslint clean.

### Round 6 — terminal dry-confirmation

**BOTH tiers DRY — nothing above LOW.** Opus verified every round-5 fix non-vacuous by
execution (NaN/±inf/±10**400 coords all 503, real 9,273/19 builder output passes, huge-int
property accepted without overflow, CSS-preload classified, non-chunk errors rethrown); 93
GIS + 35 web green. Codex independently confirmed the same. No new MEDIUM+ anywhere.

### QCHECK outcome

Loop-until-dry converged in **6 rounds** (12 independent reviews: Codex `gpt-5.6-sol` + Opus
4.8 each round, varied framing). Findings decayed HIGH→MED→dry; the two tiers were
consistently DISJOINT (the amendment's whole thesis). Every above-LOW finding — 4 HIGH, ~12
MED across the rounds — is fixed with a pinning test. Accepted/documented residuals (fail-closed
+ dark + bundle-dir-control-required, out of scope for this remediation): no external signature
anchor for a fully re-signed bundle, sidecar-acquisition race, startup-confinement TOCTOU,
dangling `aria-controls` on the inactive tab, rebuild-the-bundle-on-deploy migration step. All
recorded in `docs/data/pipe-ry-provenance.md` §Serve-time validation boundary and above.

### Final gates (at the landed tree)

- api: `ruff check .` + scripts clean · `mypy` (26 app+scripts / 60 full) clean · `pytest`
  **466 passed**.
- web: `tsc --noEmit` clean · `eslint src` clean · `vitest` **595 passed** (594 × 3 no-flake
  before the final boundary test) · `vite build` OK (main 139 kB gzip; MapLibre a separate
  248 kB chunk).
- e2e: `tsc --noEmit` clean · `git diff --check` clean.







