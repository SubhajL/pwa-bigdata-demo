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
