# Coding Log: PR-H — Provenance-Safe Map Ta Phut GIS Twin View

Date: 2026-08-05 18:17 +0700
Mode: implementation (g-coding lifecycle; roadmap PR-H, Phase 3A, lands dark)
Repository: `/Users/subhajlimanond/dev/pwa-bigdata-demo`
Base: `main == origin/main == c438920` (PR-G merged as #40)
Plan inputs: roadmap PR-H definition + `rayong-pipe-gis-sec-plan` Phase 3–5.

## Scope

The synchronized MapLibre GIS view over PR-G's verified bundle, dark by default. New
`/operations` tab `แผนที่ GIS มาบตาพุด`; the logical schematic remains the default and
is never relabelled. No backend schema change beyond consuming PR-G's contract.

Files:

- `web/package.json` + lockfile — `maplibre-gl` pinned exact `6.1.0`
- `web/src/features/twin/types.ts` — GIS manifest/binding/provenance/energy types,
  field-for-field with `api/app/models.py`
- `web/src/features/twin/twinClient.ts` — `fetchGisManifest`, `fetchGisNetwork(scope)`
- `web/src/features/twin/gis.config.ts` — source/layer ids, fit padding, widths, and
  the DESIGN-TOKEN names paint resolves from (no colour literals — tokens.test.ts T2)
- `web/src/features/twin/gisAdapter.ts` — pure: `focusBounds`, `highlightedPipeIds`,
  `highlightFilter`, `energyDelta` (arithmetic only), `availabilityFromError`
  (404→disabled, else unavailable), `selectedPipeFeature`, `resolveCssColor`
  (probe-element token resolution; null in non-CSS envs → paint omitted, never invented)
- `web/src/features/twin/GisNetworkView.tsx` — one Map per mount, BLANK offline style
  (no tile server/external URL), GeoJSON source + base/highlight line layers, focus
  fitBounds, in-place filter updates, marker via React-rendered element, theme repaint
  through a `data-theme` MutationObserver, full cleanup
- `GisDeviceMarker` (SIMULATED placement, status icon+Thai text — never colour alone),
  `GisPipeDetails` (REAL source attributes; bound pipe declares การจับคู่จำลอง),
  `TwinProvenanceLegend` (REAL / OFFICIAL / SIMULATED, field-level),
  `EnergyContextCard` (simulated live SEC vs the official 0.54 kWh/m³ 2025 system-wide
  reference — separated, attributed, delta as plain arithmetic, no target language),
  `TwinViewSwitcher` (accessible tablist)
- `web/src/screens/OperationsTwinScreen.tsx` — view state, one-shot lazy GIS fetch
  (ref-latched; setState only in async continuation), shared scenario state into both
  views, entering GIS selects the bound pump so SEC (2.3) rides the same state;
  `GisViewSection` renders loading/disabled/unavailable/ready explicitly
- `e2e/tests/topic2-gis.spec.ts` — 6 specs: no-private-path/no-external-host guard and
  dark-landing UX always; four real-geometry proofs (2.1 canvas + 19-feature focus,
  2.3 official-reference separation, 2.2/2.4 same-document drop highlight + recovery,
  2.5 marker→REAL attributes) self-skip while the stack reports 404 — a 503 FAILS
- `infra/docker-compose.yml` — `PIPE_GIS_ENABLED` passthrough (default `0`) +
  `PIPE_GIS_DIR` on the existing curated bind-mount; nothing changes for a default stack
- `docs/demo-runbook.md` (GIS subsection: dark, permission-gated, fail-closed),
  `docs/demo-coverage.md` (spec count 27→33 with the gating stated),
  `e2e/README.md` (suite note)

## TDD evidence

- RED: 30 tests across `gisAdapter.test.ts`, `gisPanels.test.tsx`,
  `GisNetworkView.test.tsx` (mocked maplibre-gl — the contract with the library),
  `OperationsTwinScreen.gis.test.tsx` (fetch/WS stubs) — 4 files failing on missing
  modules/tablist.
- GREEN: 30/30 after implementation; full web suite **570/570**.
- Repo guard catches worth recording (fixed, not waived): tokens.test T2 rejected an
  `rgb()` fallback literal in `resolveCssColor` → became `null`-and-omit; markers.test
  T6 rejected `text-simulated` on GIS labels (violet is reserved for `SimulatedBadge`)
  → labels now use `SimulatedBadge` itself; tokens.test T12 required a motion token on
  the switcher's transition; `react-hooks/refs` + `set-state-in-effect` drove the
  ref-latched one-shot fetch and effect-written callback ref.
- A first-cut screen effect had a real self-cancellation bug (its own
  idle→loading transition re-ran the effect, whose cleanup orphaned the in-flight
  fetch) — caught by the RED screen test, fixed with the ref latch.

## Gates

- Web: 570/570 tests (68 files); lint, typecheck, production build clean.
- New suites 30/30 × 3 consecutive runs.
- E2E TypeScript compile clean; evidence-docs guard 9/9 (spec count updated honestly;
  conditional skips written so the case counter counts cases).
- Live warm gate, dark default stack: `TSDB_PORT=15433 make demo-e2e` → **29 passed,
  4 skipped** (the four gated GIS proofs) in 1.8 min — dark-landing UX and the
  no-private-path/no-external-host guard ran live.
- Live enabled gate: api restarted with `PIPE_GIS_ENABLED=1` (bundle via the existing
  bind-mount) → `topic2-gis.spec.ts` **5 passed, 1 skipped** (dark-landing test) in
  19.4 s: canvas rendering with the audited 19-feature focus and bound pipe 4926,
  official-reference separation, same-document drop highlight + recovery, marker →
  REAL attributes with การจับคู่จำลอง declared. Stack then restored to dark
  (manifest → 404) and `demo-scenario.sh normal`.

## Wiring verification

| New export | Non-test consumer |
|---|---|
| `TwinViewSwitcher`, `GisNetworkView`, `GisPipeDetails`, `TwinProvenanceLegend`, `EnergyContextCard` | `OperationsTwinScreen.tsx` |
| `GisDeviceMarker` | `GisNetworkView.tsx` |
| `fetchGisManifest`, `fetchGisNetwork` | `OperationsTwinScreen.tsx` |
| `GIS_CONFIG`, `resolveCssColor`, `focusBounds`, `highlightFilter` | `GisNetworkView.tsx` |
| `availabilityFromError`, `highlightedPipeIds`, `selectedPipeFeature` | `OperationsTwinScreen.tsx` |
| `energyDelta` | `EnergyContextCard.tsx` |

Route unchanged (`/operations`); the new components enter through the already-routed
screen. `maplibre-gl` import is confined to `GisNetworkView.tsx`.

## QCHECK (2026-08-05 19:05 +0700) — two independent tiers, working tree

### Tier 1 — workflow-backed adversarial multi-agent review (22 agents, 0 errors)

18 raw findings -> **16 confirmed, 2 refuted**. Standouts: 2 HIGH duplicates of the
suite-state break (the GIS recovery proof ended P-2 healthy, violating the warm-state
ordering topic2-twin 2.3 depends on), 2 HIGH mock-oracle gaps (addLayer asserted by
call count only; marker lng/lat never asserted — a [lat, lon] swap would crash real
maplibre yet pass), MEDIUMs on the fetch latch stranding availability after a
transient failure, a WebGL2-init failure leaving a silent blank box whose cleanup
`map.remove()` throw would hand the WHOLE screen to the router's error page, the
card-header SIMULATED badge scoping the OFFICIAL 0.54 figure as simulated, the
external-host oracle racing async style requests, zero theme-repaint coverage, and a
hard-coded localhost allowlist; LOWs on OS-scheme repaint, late-arrival selection
snapping, the disabled notice overclaiming intent, and the docs' "always runs" claim.

### Tier 2 — Codex g-check (`codex exec -m gpt-5.6-sol`, reasoning high, read-only)

Verdict: request changes. 0 CRITICAL / 0 HIGH / **4 MEDIUM** (the same fetch-latch and
readiness clusters, independently; "dark landing always runs" false on an enabled
stack; the enabled full gate never actually run end-to-end) / 1 LOW (mock fidelity:
no-op `addTo`, missing `getLayer`). Full report in the session scratchpad
(`codex-gcheck-pr-h.log`).

### Disposition — all findings fixed (none waived)

- **Fetch lifecycle**: failure releases the latch; re-entering the tab retries
  ("unavailable" resets to idle in `changeView`), plus an explicit retry button; the
  success continuation applies the P-2 selection only while the GIS view is still
  active (`viewRef`). Four new screen regressions incl. deferred-arrival and
  fail-then-retry.
- **Readiness + failure states**: `data-map-ready` turns true only after `load`
  completed source/layer installation (deliberately not `idle`, which software-GL
  headless runs starve — observed); a pre-load map `error` renders an explicit Thai
  failed state (never a blank box) and is logged, and cleanup survives a throwing
  `map.remove()` so a broken map cannot take down the logical twin.
- **The mock that earned its keep**: raising mock fidelity (re-parenting `addTo`)
  exposed a REAL crash — React positioned the failed-overlay sibling relative to the
  maplibre-re-parented marker node (`insertBefore` -> NotFoundError in a real browser
  too). The marker now renders through a portal into a non-JSX element.
- **The honest oracle earned its keep too**: the new `data-map-ready` wait exposed
  that the map had NEVER validly painted in the live gate — computed design tokens
  serialize in OKLCH notation, which MapLibre's style validator rejects (fired as the
  swallowed `error`). Colours now rasterize through a 1×1 canvas into pixel-byte hex,
  so the canvas uses the exact browser-converted token colours in both themes. The
  earlier "passing" canvas-visible assertions had been hollow — precisely the blank-
  canvas scenario both reviewers predicted.
- **Suite-state contract**: the recovery proof restores `pressure_drop` in a
  `finally` and waits for the degraded observable; **the complete enabled gate now
  runs: 33/33 passed** (`PIPE_GIS_ENABLED=1 make demo-e2e`, 2.1 min), and the default
  dark gate stays 29 passed + 4 gated skips.
- **Dark landing truly always runs**: on an enabled stack the test route-stubs the GIS
  endpoints to 404; no self-skip. README wording updated to match exactly.
- **Provenance scoping**: the SIMULATED badge moved inside the live-SEC block; the
  OFFICIAL block now provably carries no SIMULATED marker (jsdom + live assertions).
- **Oracles hardened**: layer specs validated key-by-key (source id, paint-key
  allowlist, initial empty highlight filter), exact marker `[lng, lat]` asserted,
  theme + OS-scheme repaint covered, marker click-after-reparent covered,
  pipe-details composition covered; e2e allowlist derives from WEB_BASE/API_BASE and
  the containment assertion waits for map readiness before judging.
- Disabled notice reworded to state only what a 404 can prove.

### Post-remediation gates

- Web **581/581** (68 files; 41 GIS-slice tests ×3 runs stable); lint, typecheck,
  build clean. E2E TypeScript clean; evidence-docs guard 9/9; `git diff --check` clean.
- Live: enabled **33/33 passed**; default dark **29 passed / 4 skipped**; stack
  restored to dark (manifest 404) and the demo director reset to normal.

## Review (2026-08-05 20:45 +0700) - PR-G #40 and PR-H #41 merged implementation

### Reviewed
- Repo: `/Users/subhajlimanond/dev/pwa-bigdata-demo`
- Branch: `main`
- Scope: PR #40 merge `c438920f6506a70216924d63fb1bf76a25f741da` (parent
  `1fecd52d3fbdb29734a8a9ba1886c4d86264c92f`) and PR #41 merge
  `b5968466c3a474427ac0e8f223ca0aa4ebeb34b2` (parent `c438920f6506a70216924d63fb1bf76a25f741da`)
- Commands Run: compact `gh pr view` metadata/check inspection; `git show --name-status
  --stat`; targeted source/test/doc reads; `PYTHONDONTWRITEBYTECODE=1
  api/.venv/bin/python -m pytest -p no:cacheprovider api/tests/test_build_pipe_gis.py
  api/tests/test_twin_gis.py -q` (54 passed); focused `pnpm --dir web test` GIS suites
  (41 passed); `pnpm --dir web lint`; `pnpm --dir web typecheck`; `pnpm --dir web build`;
  read-only Compose status and bundle-presence inspection

### Findings
CRITICAL
- None.

HIGH
- **PR-G serves fields outside the reviewed public-data contract.**
  `api/app/gis.py:145-169` validates only FeatureCollection shape, count, and geometry
  type, then `api/app/routes/twin.py:308-311` returns the original bytes unchanged.
  A locally replaced/re-signed bundle containing `remark`, `_createdBy`, audit ids, or
  customer-like fields therefore returns 200 even though
  `docs/data/pipe-ry-provenance.md:42-45` says only the exact allowlist may leave the
  builder and free-text remarks never do. `api/app/models.py:605` likewise accepts any
  key in the binding property snapshot. This is a data-disclosure and provenance-boundary
  failure, not merely a malformed-file case. Fix by validating every feature's exact
  property-key set/value types and coordinate structure/bounds at API load, and validate
  the binding snapshot against the same schema. Add correctly rehashed negative bundles
  carrying private fields, invalid nesting, non-finite/out-of-Thailand coordinates, and
  extra binding properties.
- **PR-G can label the wrong shapefile as the audited REAL Rayong dataset.**
  `scripts/build_pipe_gis.py:195-245` enforces only polyline type and integral unique
  `PIPE_ID`; it does not enforce unique/non-null `globalId`, branch code `5531021`, the
  audited 9,273/19 counts, or an approved source fingerprint, yet
  `scripts/build_pipe_gis.py:481-508` unconditionally labels the result `PIPE RY` with
  REAL geometry/attributes. This contradicts the source identity contract in
  `docs/data/pipe-ry-provenance.md:10-20,58-60` and can silently turn a wrong export into
  judge-facing REAL evidence. Fix by pinning an approved source audit/fingerprint (or an
  explicitly reviewed versioned audit contract) and enforcing the identity/count/branch
  invariants before emitting a REAL manifest. Add wrong-branch, duplicate/missing
  `globalId`, wrong-count/focus-count, and unapproved-fingerprint tests.

MEDIUM
- **PR-G does not prove the simulated binding exists in the served datasets.**
  `api/app/gis.py:171-191` validates the manifest and two payloads independently; it never
  requires `demo_binding.pipe_id` to occur exactly once in both focus and full data, nor
  that `demo_binding.properties` equals the referenced feature. PR-H can therefore place
  P-2 on a nonexistent/mismatched pipe while still showing a verified manifest. Cross-
  validate the binding after parsing and add absent/duplicate/property-mismatch 503 tests.
- **PR-G can record hashes for different source bytes than it converts.**
  `scripts/build_pipe_gis.py:562-563` audits/hashes the sidecars and then reopens them in a
  separate pass. Because the documented delivery is a synced OneDrive directory, a valid
  same-count update between those calls can produce GeoJSON from new bytes while the
  manifest names old source hashes. Build from an immutable staged snapshot or re-hash all
  sidecars after conversion and fail on drift; test a same-count source mutation between
  audit and read.
- **PR-H can show another pump's SEC beside the fixed P-2 GIS binding.**
  `web/src/screens/OperationsTwinScreen.tsx:139-141` selects P-2 only when the first GIS
  fetch resolves while the tab is active. After returning to the logical view and selecting
  another device, later GIS entries do not restore the bound asset; the marker click at
  `web/src/features/twin/GisNetworkView.tsx:210-213` changes only the pipe selection, while
  `OperationsTwinScreen.tsx:452-459` renders SEC from the stale logical selection. Make GIS
  entry/marker selection atomically select both the binding's asset and pipe (or use a
  separate map-bound SEC state). Test select-non-P-2 -> GIS -> marker and the late-fetch ->
  leave -> re-enter path.
- **PR-H's browser oracle can still certify a blank/broken map as ready.**
  `web/src/features/twin/GisNetworkView.tsx:77-129` marks the map loaded before source/layer
  installation, ignores all post-load `error` events, and sets `data-map-ready=true` without
  proving a rendered source feature. `e2e/tests/topic2-gis.spec.ts:92-110,132-157` checks the
  ready attribute, canvas visibility, and React's highlighted-id attribute, not MapLibre's
  rendered/queryable geometry or filter. An asynchronous style/source error can therefore
  repeat the previously observed blank-canvas false pass. Treat setup and relevant post-load
  errors as explicit failure, wait for a successful render/source-loaded condition, and add
  a real-browser `queryRenderedFeatures`/visual assertion plus a post-load error regression.
- **PR-H loads MapLibre on every dark/default visit.**
  `web/src/screens/OperationsTwinScreen.tsx:12` statically imports `GisNetworkView`, whose
  `web/src/features/twin/GisNetworkView.tsx:4-5` imports MapLibre and its CSS. The production
  build emits one 1,394.36 kB JS entry (386.85 kB gzip) and no GIS chunk, so the default
  logical screen pays the GIS dependency even with `PIPE_GIS_ENABLED=0`. Lazy-load the GIS
  component behind tab selection and add a build-manifest/browser assertion that dark
  landing does not preload the MapLibre chunk.

LOW
- **The declared frontend gates are green but not clean.** The focused 41-test run emits
  repeated JSDOM `HTMLCanvasElement.prototype.getContext` errors from
  `web/src/features/twin/gisAdapter.ts:108`, and ESLint reports a missing `markerEl`
  dependency at `web/src/features/twin/GisNetworkView.tsx:171`. Install an intentional
  shared canvas stub/injected rasterizer, fail tests on unexpected console output, and make
  the effect dependency explicit.
- **The ARIA tablist implements click/Tab only, not the tab keyboard pattern.**
  `web/src/features/twin/TwinViewSwitcher.tsx:22-46` gives both buttons `role=tab` but has no
  roving `tabIndex`, arrow/Home/End handling, tab ids, or `aria-controls`. Either implement
  the WAI-ARIA tab pattern with keyboard tests or use ordinary pressed buttons instead of
  incomplete tab semantics.

### Open Questions / Assumptions
- The normative provenance document is treated as the contract for both PRs. If accepting
  arbitrary future exports is intentional, the REAL label still needs a reviewed, versioned
  approval/audit step rather than being unconditional.
- The local source-derived bundle exists but remains git-ignored and permission status is
  PENDING. No source-derived values were copied into this review.
- A running `pwa-demo` Compose stack belongs to a separate Gate-A1 worktree, so it is not
  evidence for current `main`; this review did not mutate or reuse that runtime.

### Recommended Tests / Validation
- Add the PR-G semantic payload, source-identity, binding-consistency, and source-drift
  negatives above; rerun the focused 54 tests and the full API suite.
- Add PR-H re-entry/selection and post-load-render regressions, then rerun the 41-test GIS
  slice, full web tests, lint with zero warnings, typecheck, and production build.
- After permission is recorded, provision the reviewed bundle at the exact remediation SHA
  and run the complete enabled browser gate without skips; retain exact-SHA evidence. Also
  rerun the default dark gate after restoring the stack.
- Add hosted required checks. GitHub reports no status checks and no recorded reviews for
  either merged PR, so current quality evidence is local only.

### Rollout Notes
- Keep `PIPE_GIS_ENABLED=0` for judged/shared runs while
  `docs/data/pipe-ry-provenance.md` remains PENDING. The default browser gate skips four
  real-bundle proofs, so it cannot stand in for enabled acceptance.
- `api/app/gis.py:218` sends permission-sensitive geometry as `public, max-age=3600`.
  Disabling the flag cannot revoke an already-fresh browser/shared-cache response for up to
  an hour. Before authorized activation, choose an explicit cache policy compatible with
  the intended rollback/revocation boundary (for example private revalidation or no-store).
- No product remediation, commit, PR, merge, deployment, or runtime change was authorized
  or performed by this review.
