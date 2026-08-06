# Coding Log: Rayong Pipe GIS + Real-Time Digital Twin Plan

Date: 2026-08-04  
Mode: Planning only; no product implementation in this log  
Repository: `/Users/subhajlimanond/dev/pwa-bigdata-demo`  
Baseline: `main@a98a359c8a4f7c15bd1a43b557fff0c5bb2cab95` (`main == origin/main`)  
Primary evaluation target: POC Evaluation Criteria 2 — ระบบแสดงผลแผนผังดิจิทัลแบบเรียลไทม์

## Request and outcome

Determine how to use the supplied Rayong pipe GIS to make Criterion 2 more realistic, and whether East Water's energy-management disclosure can support specific energy consumption (SEC).

Recommended outcome: add a real GIS map as a synchronized geospatial view beside the existing logical SVG process view, use the 19 Map Ta Phut-related pipe features as the default demo extent, and retain the deterministic P-2 scenario engine. Treat every unverified relationship—station placement, pipe binding, flow direction, affected customers, telemetry, and station SEC—as simulated. Add East Water's `0.54 kWh/m³` only as an official 2025 **system-wide reference**, never as Map Ta Phut station SEC, a live measurement, a target, or an alarm threshold.

## Planning method and evidence

- Auggie semantic exploration was attempted first and timed out at the two-second limit; direct repository reads and exact-string searches were used as the documented fallback.
- Current rubric: `POC_SPEC.md`, Topic 2, Criteria 2.1–2.5.
- Current judge workflow: `docs/demo-runbook.md` and the deterministic transition coverage in `e2e/tests/scenario-transitions.spec.ts`.
- Current implementation: `OperationsTwinScreen`, `ProcessSchematic`, twin REST/WebSocket routes, topology tables, scenario director, and downstream-impact model.
- Source GIS: `/Users/subhajlimanond/Library/CloudStorage/OneDrive-Personal/Personal/UU/SHP PIPE RY/PIPE RY.shp` and its sidecar files.
- Supplemental ALOS-2 folder was inspected but is not a delivered pipe-network dataset; it contains AOI/aggregate material and is not selected for Criterion 2.
- Official energy source: <https://www.eastwater.com/en/sustainability/sustainability-overview/environment-dimension/energy-management>
- Official real-time grid context: <https://www.eastwater.com/en/ew-business/raw-water/raw-water-overview>
- Official UU automatic pump-control context: <https://uu.co.th/th/smart-eco/%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A%E0%B8%84%E0%B8%A7%E0%B8%9A%E0%B8%84%E0%B8%B8%E0%B8%A1%E0%B9%80%E0%B8%84%E0%B8%A3%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%87%E0%B8%AA%E0%B8%B9%E0%B8%9A%E0%B8%99%E0%B9%89%E0%B8%B3%E0%B8%AD%E0%B8%B1%E0%B8%95%E0%B9%82%E0%B8%99%E0%B8%A1%E0%B8%B1%E0%B8%95%E0%B8%B4>

## Verified evidence and constraints

### Rayong GIS

- ESRI LineString dataset, source CRS `EPSG:32647`.
- 9,273 valid, non-empty pipe features; `PIPE_ID` and `globalId` are unique.
- Geographic extent after reprojection is approximately `101.175–101.419 E`, `12.594–12.843 N`.
- Geometric pipe length is approximately `1,894,203.85 m`.
- Useful fields include pipe ID, project, asset code, type, grade, size, class, function, laying, product, depth, length, installation year, location, and PWA code.
- All records carry PWA code `5531021`, matching the Rayong branch represented in curated branch data.
- A targeted Map Ta Phut text match yields 19 features, approximately `11,023.95 m`, with a WGS84 bounding box of about `101.180567,12.675776–101.210274,12.722228`.
- The 19-feature focus contains sizes 50, 110, 160, and 315 mm and pressure/class attributes suitable for judge-visible pipe details.
- Whole-network endpoint audit is not a reliable hydraulic graph: about 90% of exact-coordinate endpoint nodes have degree one. Snapping, flow direction, asset attachment, and customer service mapping remain unresolved.

### Existing twin

- `/operations` already renders a logical SVG schematic and receives real-time simulated events without page refresh.
- The current topology is deliberately synthetic and unit-coordinate based; it is not GIS.
- P-2 currently belongs to a Samut Sakhon simulator roster, so renaming it as a verified Rayong asset would be false without a new, explicit scenario profile.
- The current downstream pipe/customer graph is simulated. It should remain deterministic for the evaluation, but its provenance must be visible.
- Current transition E2E coverage already observes status change, pipe highlighting, customer impact, model criticality, and recovery on one open page. New GIS work must extend, not weaken, this proof.

### SEC and Map Ta Phut evidence boundary

- East Water states that electrical use is a major operating cost and varies with water pumped; its disclosure discusses pumping stations, substations/meters, VSD/inverter operation, high-efficiency motors, and pump-system improvements.
- The same official page identifies a Map Ta Phut Booster Pumping Station, which supports use of a Map Ta Phut pumping scenario as realistic context.
- East Water reports `0.54 kWh/m³` for 2025 as energy consumption per unit of water supplied for its water-grid system. It is annual/system-wide, not station-specific and not live.
- No verified public evidence currently provides the exact Map Ta Phut station coordinate, pump count, rated capacity, live power, live flow, or station SEC.
- Therefore the UI may compare simulated instantaneous P-2 SEC with the official system reference, but may not call `0.54 kWh/m³` the P-2 baseline, normal range, target, or measured value.
- SEC formula remains `power_kW / flow_m3h = kWh/m³` for aligned instantaneous values. The UI must show `N/A` for zero, missing, invalid, or stale flow rather than divide or reuse an old denominator.

## Decision record

1. Use the real Rayong pipe geometry and attributes.
2. Default to the 19-feature Map Ta Phut focus; allow an optional full-Rayong scope.
3. Keep the SVG process schematic as a distinct logical view; it is not a GIS fallback and must not be relabeled as one.
4. Add a Canvas/WebGL GIS view with MapLibre GL JS so zoom remains crisp and Criterion 2.1 is literal.
5. Synchronize the existing scenario state into both views.
6. Bind P-2 to one selected real `PIPE_ID` through an explicit demo crosswalk, and label the attachment/marker location `SIMULATED PLACEMENT` until verified.
7. Highlight the bound real pipe geometry during `pressure_drop`; retain affected-customer values as `SIMULATED IMPACT`.
8. Add a field-level provenance legend rather than a page-wide ambiguous badge.
9. Add `0.54 kWh/m³` as `OFFICIAL REFERENCE · East Water water-grid system · 2025`; show the live scenario SEC separately as `SIMULATED LIVE`.
10. Do not infer qualitative health or trigger alarms from the official reference without engineering approval.
11. Do not copy the full shapefile into runtime databases or derive a hydraulic graph in this phase.
12. Do not commit or host source-derived GIS artifacts until the dataset owner confirms redistribution and demo-use permission.

## Plan Draft A — thin GIS evidence overlay

### Shape

- Convert the 19 Map Ta Phut features to a small WGS84 GeoJSON bundle.
- Render the bundle in a MapLibre map next to the existing SVG schematic.
- Select one actual pipe as the deterministic P-2 scenario binding.
- Drive marker/pipe style from the existing WebSocket state and scenario director.
- Keep current API topology and impact logic unchanged.
- Add the official SEC reference card and provenance labels.

### Strengths

- Small, judge-visible, and compatible with the already proven scenario transitions.
- Uses real geometry and actual pipe attributes without pretending the GIS is a solved hydraulic network.
- Minimal database and backend risk.
- Keeps the demo fast and deterministic.

### Weaknesses

- Asset-to-pipe attachment, direction, and customer impact are still demo crosswalks.
- A single focus extent does not prove a complete Rayong operational GIS.
- Requires careful language so `real pipe geometry` is not misread as `real integrated SCADA/GIS`.

## Plan Draft B — GIS-derived operational network

### Shape

- Import all 9,273 lines into a spatial database.
- Snap endpoints, construct network nodes, establish direction, bind stations/valves, and attach customer/service areas.
- Use the resulting directed graph for all downstream impact and hydraulic interactions.
- Compute and store station-specific energy baselines from measured power and flow.

### Strengths

- Long-term architecture for a genuine operational digital twin.
- One authoritative graph could serve map display, impact analysis, hydraulic modeling, and asset management.

### Weaknesses and blockers

- Current exact endpoints are too fragmented for safe graph derivation.
- No authoritative direction, station crosswalk, customer-service mapping, station coordinate, or station telemetry was supplied.
- Current compose stack does not prove PostGIS availability.
- Data licensing and redistribution are unresolved.
- Attempting this for the POC would add large data-engineering risk while encouraging unsupported claims.

### Disposition

Defer Draft B. Capture it as a post-POC discovery track requiring PWA/UU/East Water source-owner participation and engineering sign-off.

## Unified execution plan

### Phase 0 — source authorization and immutable audit

1. Obtain written confirmation that the Rayong shapefile may be transformed, used in the evaluation, committed if necessary, and shown to evaluators.
2. Record source file names, SHA-256 hashes, CRS, feature count, field inventory, extent, and extraction timestamp in a generated manifest.
3. Confirm whether PWA code `5531021` and the project/location fields may appear in the UI.
4. Select the demo-bound pipe using a documented rule and record its `PIPE_ID`, source attributes, and midpoint. The station-to-pipe relationship remains simulated unless the owner provides a crosswalk.
5. If permission is denied or unclear, keep generated GIS files local/ignored and do not package or publish them; the existing logical view remains intact and honestly labeled.

### Phase 1 — tests-first offline GIS builder

Add `scripts/build_pipe_gis.py` with pure, testable functions:

- `inspect_source(path) -> SourceAudit`
- `select_map_ta_phut_features(features) -> list[Feature]`
- `normalize_properties(feature) -> dict`
- `reproject_geometry(geometry, source_crs, target_crs='EPSG:4326')`
- `choose_demo_binding(features, configured_pipe_id=None) -> DemoBinding`
- `build_manifest(source_audit, full, focus, binding) -> dict`
- `write_bundle(output_dir, full, focus, manifest, binding)`

Preferred generated, permission-dependent outputs under `data/curated/pipe_ry/`:

- `network.geojson` — all 9,273 normalized WGS84 features.
- `map_ta_phut.geojson` — the 19-feature default focus.
- `manifest.json` — hashes, counts, source/target CRS, bounds, length QA, generation metadata, provenance, and schema version.
- `demo-crosswalk.json` — scenario asset to source `PIPE_ID` and simulated marker placement.

Builder tests in `scripts/tests/test_build_pipe_gis.py` must be written before implementation and cover:

- exact selection count and stable pipe IDs for the audited fixture;
- CRS rejection when missing or unexpected;
- valid WGS84 output bounds;
- property allowlist and null normalization;
- unique source pipe IDs;
- deterministic binding selection;
- source hash and manifest schema;
- zero Map Ta Phut matches as a hard failure;
- invalid geometry as a hard failure;
- output paths constrained to the configured directory.

Do not add a database migration in this phase. The GeoJSON bundle is read-only reference data, not the operational topology table.

### Phase 2 — fail-closed API contract

Add configuration in `api/app/config.py`:

- `PIPE_GIS_ENABLED: bool = False`
- `PIPE_GIS_DIR: Path | None = None`
- `PIPE_GIS_MAX_BYTES` with a bounded safe default

Add `api/app/gis.py`:

- `load_gis_bundle(config) -> GisBundle`
- `validate_manifest(manifest) -> GisManifest`
- `get_network_scope(bundle, scope) -> Path`
- `build_cache_headers(manifest, scope) -> dict`

Add typed public models in the established API model location:

- `GisManifest`
- `GisDatasetSummary`
- `GisProvenance`
- `GisDemoBinding`
- `EnergyReference`

Extend `api/app/routes/twin.py`:

- `GET /api/twin/gis/manifest`
- `GET /api/twin/gis/network?scope=map-ta-phut|full`

Contract rules:

- Disabled configuration returns `404` or the repository-standard feature-disabled response.
- Enabled but missing/invalid bundles return `503`; never silently substitute synthetic lines.
- Unknown scope returns `422`.
- File access never accepts arbitrary paths.
- GeoJSON is streamed with `ETag`/cache headers based on the manifest hash.
- Manifest exposes the official SEC reference as context, with URL, year, scope `system-wide`, unit, and `station_specific=false`.
- No official value is inserted into the simulated telemetry stream.

Write API tests first in `api/tests/test_twin_gis.py` for disabled, missing, corrupt, size-limit, manifest, both scopes, cache headers, schema/provenance, and traversal-resistant behavior.

### Phase 3 — synchronized dual-view frontend

Add `maplibre-gl` to `web/package.json` and update `pnpm-lock.yaml`.

Add:

- `web/src/features/twin/GisNetworkView.tsx` — MapLibre lifecycle and source/layer composition.
- `web/src/features/twin/GisDeviceMarker.tsx` — P-2 scenario marker with simulated-placement label.
- `web/src/features/twin/GisPipeDetails.tsx` — actual source pipe fields on selection.
- `web/src/features/twin/TwinProvenanceLegend.tsx` — field-level REAL / OFFICIAL / SIMULATED definitions.
- `web/src/features/twin/EnergyContextCard.tsx` — simulated instantaneous SEC and official system reference.
- `web/src/features/twin/TwinViewSwitcher.tsx` — explicit `GIS network` and `Logical process` tabs.
- `web/src/features/twin/gisAdapter.ts` — pure mapping from twin event state to feature-state/style inputs.
- `web/src/features/twin/gis.config.ts` — source IDs, layers, focus bounds, and non-secret feature flag.

Extend:

- `web/src/features/twin/types.ts` with manifest, binding, provenance, and energy-reference types.
- `web/src/features/twin/twinClient.ts` with `getGisManifest()` and `getGisNetwork(scope)`.
- `web/src/screens/OperationsTwinScreen.tsx` to load the bundle once, share current event state across both views, and preserve the existing scenario controls.
- `web/src/features/twin/SecTooltip.tsx` or its caller so instantaneous SEC is visibly simulated and invalid/stale flow produces `N/A`.

Frontend state rules:

- Normal: source pipe style, P-2 marker state, and SEC all derive from the same current scenario snapshot.
- Pump anomaly: marker changes without page reload; tooltip shows simulated kW, flow, SEC, timestamp, freshness, and formula.
- Pressure drop: the bound actual `PIPE_ID` highlights; impact panel says `SIMULATED IMPACT` for customers.
- Recovery: feature state and panels return to normal without map remount or page reload.
- Official reference stays constant and visually separate from the changing simulated SEC.
- A numerical delta may be shown as arithmetic only; do not color it good/bad or use it to raise an alert.

Write component/unit tests first:

- `gisAdapter.test.ts` for binding and state-to-style mapping.
- `GisNetworkView.test.tsx` for source/layer setup, focus bounds, selection, and cleanup.
- `EnergyContextCard.test.tsx` for exact scope/year labels, source link, no target/baseline language, and invalid-flow behavior.
- `TwinProvenanceLegend.test.tsx` for every evidence class.
- Extend `OperationsTwinScreen.test.tsx` for view switching, shared status, unavailable GIS behavior, and no false-real labels.

### Phase 4 — configuration, preflight, and operator truth

Update `infra/docker-compose.yml` to mount/configure the generated bundle only when explicitly enabled. Avoid adding PostGIS for this phase.

Update `scripts/demo-preflight.sh`:

- When GIS is enabled, require all files and exact manifest counts (`9,273` full, `19` focus for the currently audited source).
- Verify source/target CRS, binding existence, WGS84 bounds, hashes, endpoint response, and official-reference metadata.
- Fail closed on drift. Do not fall back to the synthetic schematic while claiming GIS readiness.

Add a `make gis-build` target and a GIS-enabled demo target only after the Makefile's existing conventions are confirmed. Keep ordinary startup usable with GIS disabled.

Update documentation:

- `POC_SPEC.md` — distinguish real geometry/attributes from simulated state and impacts.
- `docs/demo-runbook.md` — add GIS focus, pipe click, provenance legend, and official-reference narration; replace any claim of a `real customer list` with `deterministic simulated affected-customer list`.
- `docs/demo-coverage.md` — map every Criterion 2 claim to automated evidence.
- `e2e/README.md` — align with the current deterministic transition suite and GIS extension.
- Add `docs/data/pipe-ry-provenance.md` — source owner, permission status, hashes, transformations, field allowlist, and explicit non-claims.

### Phase 5 — browser evidence and regression gates

Extend `e2e/tests/scenario-transitions.spec.ts` or add `e2e/tests/topic2-gis.spec.ts` so one open browser page proves:

1. Criterion 2.1: GIS renders in Canvas/WebGL, labels/lines stay crisp under zoom, and the 19-feature Map Ta Phut focus is initially visible.
2. Criterion 2.2: scenario injection changes the P-2 map marker automatically without reload.
3. Criterion 2.3: pump anomaly exposes simulated power, flow, and SEC; the `0.54 kWh/m³` official system reference is visible and unambiguously separate.
4. Criterion 2.4: pressure drop highlights the bound actual GIS `PIPE_ID`; the affected-customer panel is visibly simulated.
5. Criterion 2.5: at least three component types remain present across the synchronized GIS/logical views, backed by configuration and source metadata.
6. Recovery clears GIS feature state and preserves the same document navigation entry.
7. No network request fetches the OneDrive source path at runtime.

Retain all existing API, simulator, web, and E2E gates. Run the repository's normal full gate only after focused red/green cycles pass.

### Phase 6 — rollout and rollback

- Default `PIPE_GIS_ENABLED=false` until permission, bundle QA, tests, and demo rehearsal pass.
- Enable first in the local evaluation stack; do not claim hosted activation from source delivery alone.
- Record exact Git SHA, bundle manifest hash, source hash, and E2E evidence together.
- Roll back by disabling `PIPE_GIS_ENABLED`; the logical process view and deterministic scenario remain available with honest labels.
- If the GIS bundle fails after enablement, show an explicit GIS-unavailable state and retain the logical view; never substitute logical coordinates inside the map.

## Files-to-change inventory

| File | Planned change |
|---|---|
| `scripts/build_pipe_gis.py` | New audited offline converter and bundle builder |
| `scripts/tests/test_build_pipe_gis.py` | Builder TDD and source-QA tests |
| `data/curated/pipe_ry/*` | Permission-dependent generated artifacts only |
| `api/app/config.py` | GIS feature/path/size configuration |
| `api/app/gis.py` | Load, validate, select, and cache bundle |
| `api/app/routes/twin.py` | Manifest and GeoJSON endpoints |
| `api/tests/test_twin_gis.py` | Fail-closed API contract tests |
| `web/package.json`, `pnpm-lock.yaml` | MapLibre dependency |
| `web/src/features/twin/types.ts` | GIS, provenance, binding, energy types |
| `web/src/features/twin/twinClient.ts` | GIS REST client methods |
| `web/src/features/twin/gis.config.ts` | Map source/layer/focus configuration |
| `web/src/features/twin/gisAdapter.ts` | Pure feature-state adapter |
| `web/src/features/twin/GisNetworkView.tsx` | Canvas/WebGL GIS view |
| `web/src/features/twin/GisDeviceMarker.tsx` | Scenario asset marker |
| `web/src/features/twin/GisPipeDetails.tsx` | Real pipe attribute details |
| `web/src/features/twin/TwinProvenanceLegend.tsx` | Evidence boundary legend |
| `web/src/features/twin/EnergyContextCard.tsx` | Simulated SEC plus official reference |
| `web/src/features/twin/TwinViewSwitcher.tsx` | Logical/GIS navigation |
| `web/src/features/twin/SecTooltip.tsx` | SEC freshness and simulation labeling |
| `web/src/screens/OperationsTwinScreen.tsx` | Shared scenario state and dual views |
| Corresponding `*.test.ts(x)` files | Tests written before component implementation |
| `infra/docker-compose.yml` | Optional bundle mount and environment |
| `scripts/demo-preflight.sh` | Manifest/provenance/hash readiness checks |
| `Makefile` | Builder and GIS-enabled demo targets |
| `e2e/tests/topic2-gis.spec.ts` | Literal judge-visible Criterion 2 proof |
| `POC_SPEC.md`, `docs/demo-runbook.md`, `docs/demo-coverage.md`, `e2e/README.md` | Accurate evidence and operator wording |
| `docs/data/pipe-ry-provenance.md` | Data lineage, permission, transformations, non-claims |

## Wiring verification table

| Source | Transform / contract | Runtime consumer | Judge-visible result | Verification |
|---|---|---|---|---|
| Rayong shapefile | Builder reprojection + allowlist | GIS API | Real Map Ta Phut pipe geometry | Builder QA + API test + browser assertion |
| Source `PIPE_ID` | `demo-crosswalk.json` | `gisAdapter` | Actual selected pipe highlights | Unit + E2E exact ID assertion |
| Existing scenario event | Existing WS hook | Logical and GIS views | Same-state automatic transition | Existing transition suite extended |
| Simulated kW + flow | SEC calculation with freshness guard | Tooltip/card | Live scenario SEC, clearly simulated | Unit tests for formula/zero/stale cases |
| East Water `0.54 kWh/m³` | Manifest `EnergyReference` | Energy context card | Official 2025 system reference | API schema + exact UI-label test |
| Current impact API | Existing downstream model | Impact panel | Deterministic customer list | E2E plus visible `SIMULATED IMPACT` label |
| Manifest hashes/counts | Preflight validation | Demo startup | Reproducible evidence bundle | Negative and drift tests |
| Provenance metadata | API types + legend | All evidence panels | Real/official/simulated boundary | Component and E2E text assertions |

## Cross-language schema verification

- Python `GisManifest` and TypeScript `GisManifest` must share a versioned JSON fixture.
- Required fields: `schema_version`, source hash/name/CRS, output CRS, counts, bounds, scopes, binding, provenance, and energy reference.
- CI validates the fixture in both API and web tests; incompatible changes require a schema-version increment.
- GeoJSON properties use a documented allowlist and stable JSON casing; no raw DB-only or source-path fields leak to the browser.

## Definition of done

- Data-use permission is recorded, or artifacts remain local/ignored with that restriction explicit.
- Generated manifest verifies 9,273 full features and 19 Map Ta Phut focus features for this audited dataset; WGS84 bounds and unique IDs pass.
- Map view uses Canvas/WebGL and keeps linework crisp during zoom.
- One open page shows automatic P-2 status changes and actual bound GIS-pipe highlighting with no reload.
- Simulated instantaneous SEC uses aligned power/flow and returns `N/A` for invalid or stale flow.
- `0.54 kWh/m³` is labeled exactly as a 2025 East Water water-grid system reference, never station SEC, target, baseline, or live data.
- Map Ta Phut station existence is cited, but exact coordinate, pump count, capacity, live values, and physical PWA-pipe attachment are not claimed.
- Customer impact, telemetry, flow direction, station placement, and asset binding are visibly labeled simulated where unverified.
- Existing deterministic transition and recovery tests continue to pass.
- GIS-enabled preflight fails closed on missing, corrupt, or drifted bundles.
- Focused unit/API/component tests and the repository's full quality gates pass at the same exact SHA and bundle hash.
- Operator documentation uses the same evidence language shown in the UI.

## Explicitly deferred work

- PostGIS migration and spatial querying.
- Network-wide endpoint snapping and topology repair.
- Authoritative pipe flow direction.
- Verified Map Ta Phut station coordinates/assets/capacities.
- Customer/service-area crosswalks.
- Live East Water/UU/PWA SCADA integration.
- Station-specific SEC baseline, target, or energy optimization logic.
- Hydraulic modeling derived from the supplied GIS.

These require authoritative operational data and owner/engineering approval; they are not safe inferences from the supplied shapefile or public sustainability disclosure.
