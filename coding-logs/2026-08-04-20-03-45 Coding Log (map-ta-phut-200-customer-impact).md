# Coding Log: Map Ta Phut 200-Customer Low-Pressure Impact Plan

Date: 2026-08-04 20:03:45 +0700  
Mode: research and planning only; no product implementation  
Repository: `/Users/subhajlimanond/dev/pwa-bigdata-demo`  
Baseline: `main@a98a359c8a4f7c15bd1a43b557fff0c5bb2cab95` (`main == origin/main`)  
Parent plans:

- `coding-logs/2026-08-04-19-39-34 Coding Log (evaluation-criteria-evidence-improvement-roadmap).md`
- `coding-logs/2026-08-04T19-10 Coding Log (rayong-pipe-gis-sec-plan).md`

## Requirement locked from the user

Replace the five Samut Sakhon synthetic service points with a Map Ta Phut low-pressure scenario containing exactly 200 simulated affected customer accounts. The map must visibly show a low-pressure area; clicking either that area or its highlighted pipe corridor must open the customer-impact surface and show the same 200-account incident set. The records must mix household, government/small-business, and industrial/large-business types and include realistic account/meter/address/monthly-reading fields without using real personal data.

## Exploration and evidence boundary

- Auggie semantic search was attempted first and timed out at the required two-second boundary. Planning therefore used direct file inspection and exact-string searches.
- Inspected repository sources: `CLAUDE.md`, `POC_SPEC.md`, `infra/db/001_init.sql`, `infra/db/006_twin_topology.sql`, `scripts/seed_db.py`, `simulator/app/roster.py`, `api/app/demo.py`, `api/app/topology.py`, `api/app/models.py`, `api/app/routes/twin.py`, `web/src/features/twin/*`, `web/src/screens/OperationsTwinScreen.tsx`, and their Python/TypeScript/Playwright tests.
- Inspected supplied local data read-only. `SHP PIPE RY` has 9,273 real Rayong pipe features and 19 Map Ta Phut project-name matches, but no customer, meter, account, billing, or service-point rows. `ALOS-2` is unrelated to this customer-impact feature.
- No redistribution permission was found for the supplied pipe data. Derived GIS artifacts remain local/off until permission is confirmed.
- The supplied Map Ta Phut pipe subset carries PWA code `5531021` (Rayong), while official PWA reporting says the Map Ta Phut/Noen Phra/Thap Ma service point is operated by PWA Ban Chang, whose curated branch code is `5531022`. The GIS-to-service-area binding is therefore simulated and must be displayed as such.

## Research conclusions

### Which customer domain to model

Use a **PWA retail service-account model**, not an East Water raw-water customer roster.

- The current Criterion 2 impact implementation is a PWA `customer_service_point` join and displays customer/meter-like service accounts.
- PWA officially reports that its Ban Chang branch serves more than 20,000 users across Map Ta Phut, Noen Phra, and Thap Ma through the Map Ta Phut 1 service point. This supports the service-area context, but it does not identify any affected customer or prove that 200 are connected to a particular pipe.
- East Water's public material supports Map Ta Phut pumping, raw-water transmission, industrial estates/factories, PWA/municipal/housing-estate bulk consumers, and energy context. It does not provide a retail household account roster. East Water stays an official station/energy context layer and is not used to manufacture PWA meter accounts.
- The 200-account mix is a deterministic demonstration design requested by the user, not an observed Map Ta Phut distribution.

### Authoritative PWA classifications

The current PWA classification regulation, effective 1 April 2026, defines three top-level types:

1. `1` — ที่อยู่อาศัยและอื่นๆ (residential and other)
2. `2` — ราชการและธุรกิจขนาดเล็ก (government and small business)
3. `3` — รัฐวิสาหกิจ อุตสาหกรรมและธุรกิจขนาดใหญ่ (state enterprise, industry, and large business)

The plan uses official subtype codes and labels but assigns them to synthetic accounts only. Relevant subtypes include private residences (`11`), mixed residence/small trade (`13`), government/public service (`21`), public health (`22`), education (`25`/`26`), retail/market (`28`), small business (`29`), state enterprise (`31`), industry (`32`), large commercial/service (`33`), bank (`34`), private hospital (`35`), energy station (`37`), and other large business (`39`).

PWA also documents scheduled monthly meter reading and monthly billing from meter consumption. This supports a 12-month reading history in the demo, but the generated consumption distributions are not official Map Ta Phut statistics.

### Privacy boundary

PWA's privacy policy treats names, water-customer numbers, addresses, contact details, and location-linked identifying data as personal data. Therefore:

- never seed real names, phone numbers, emails, national IDs, tax IDs, real water-customer numbers, real meter numbers, or exact residential coordinates;
- use unmistakable `SIM-MTP-*` account and meter identifiers;
- use fictional service labels instead of person/company names;
- use structured scenario-zone addresses such as `ที่อยู่จำลอง: จุดบริการ MTP-Z01-001, ต.มาบตาพุด อ.เมืองระยอง จ.ระยอง`, not real civic addresses;
- store no customer-point longitude/latitude; the impact zone is geographic, but individual points are not;
- label the count, binding, address, readings, and pressure footprint `SIMULATED` in API provenance and UI.

### Primary sources

- PWA customer classification 2026: https://www.pwa.co.th/contents/service/customer-type
- PWA tariff groups and Rayong inclusion: https://www.pwa.co.th/contents/service/table-price
- PWA customer guide, meter sizes and monthly reading: https://www.pwa.co.th/contents/service/customer-guide
- PWA Map Ta Phut 1 service-area report: https://www.pwa.co.th/news/view/101505
- PWA Map Ta Phut service-point opening: https://www.pwa.co.th/news/view/103363
- PWA privacy policy: https://pwa.co.th/contents/privacy-policy
- East Water energy/Map Ta Phut pumping context: https://www.eastwater.com/en/sustainability/sustainability-overview/environment-dimension/energy-management
- East Water customer-domain context: https://investor.eastwater.com/en/ir-corner/faq
- IEAT Map Ta Phut estate context: https://www.ieat.go.th/en/estates/54

## Fixed demonstration dataset

Exactly 200 accounts belong to `MTP-LPZ-01`. This is a designed mix, not a statistical claim:

| PWA type | Count | Share | Subtype allocation |
|---|---:|---:|---|
| Type 1 — residential and other | 140 | 70.0% | `11`: 105, `13`: 25, `14`: 5, `18`: 5 |
| Type 2 — government and small business | 35 | 17.5% | `21`: 5, `22`: 2, `25`: 3, `26`: 2, `28`: 10, `29`: 13 |
| Type 3 — state enterprise, industry, large business | 25 | 12.5% | `31`: 2, `32`: 12, `33`: 5, `34`: 1, `35`: 1, `37`: 2, `39`: 2 |
| **Total** | **200** | **100%** | 15 subtypes |

Topology placement remains deliberately computable: 120 accounts attach to the first downstream service node and 80 to the final node. A pressure drop at the scenario pump/outgoing corridor reaches all 200; a discriminating last-leg query reaches only its 80 attached accounts. This preserves a meaningful directional traversal test.

Each account gets exactly 12 closed monthly periods. Readings are cumulative and arithmetically consistent: `usage_m3 = current_reading_m3 - previous_reading_m3`, with deterministic subtype-specific synthetic ranges. The latest usage is shown in the incident table; the full history is shown only after selecting one account.

## Required judge interaction

1. Open the GIS twin on `/operations` with no active incident.
2. Trigger `pressure_drop` for the Map Ta Phut demo profile.
3. On the same loaded page, the scenario pump changes status, affected pipes highlight, and a non-colour-only `พื้นที่แรงดันต่ำจำลอง` footprint appears.
4. Click either the low-pressure footprint or one highlighted pipe.
5. The impact drawer opens and shows `200 ราย`, `SIMULATED IMPACT`, the `140 / 35 / 25` type breakdown, and page 1 of the affected-account list.
6. Filtering to any top-level type updates the visible rows without changing the incident total.
7. Selecting a row displays its synthetic customer number, meter number, type/subtype, scenario address, meter size, pressure zone, and 12 monthly readings.
8. Trigger `normal`; the footprint and highlights clear and the drawer closes so stale affected-customer data is not left on screen.

# Plan Draft A — normalized database-backed incident accounts

## A1. Overview

Extend the relational topology with explicitly demo-only customer profiles and monthly readings, seed exactly 200 deterministic Map Ta Phut accounts, and expose them through additive impact/detail API contracts. Add a clickable MapLibre low-pressure footprint and a paginated impact drawer, preserving the existing same-DOM pressure transition and topology traversal.

## A2. Decision completeness

### Goal

Produce a realistic, privacy-safe, database-backed Map Ta Phut pressure-impact demonstration in which one induced low-pressure zone deterministically yields exactly 200 inspectable simulated customer accounts.

### Non-goals

- No real customer import, re-identification, or plausible real PII.
- No assertion that the 200-account distribution matches actual Map Ta Phut customers.
- No claim that the GIS proves hydraulic direction, pressure extent, or customer connection.
- No East Water retail account model and no mixing of bulk offtakers with PWA meters.
- No customer billing engine or tariff calculation.
- No preservation of the five-account Samut Sakhon impact profile as a fallback.
- No PostGIS or full hydraulic solver.

### Success criteria

- Seed and database contain exactly 200 active `MTP-LPZ-01` profiles and 2,400 monthly reading rows.
- The exact type counts are 140, 35, and 25; subtype counts match the locked table.
- Every identifier/address is synthetically prefixed and every record carries simulated provenance.
- The scenario pump's upstream impact query returns exactly 200 distinct accounts; the last-leg discriminator returns exactly 80.
- One open browser page renders the low-pressure footprint and highlighted pipes after injection, opens the drawer on click, shows `200`, and renders all three type counts.
- Pagination shows 25 accounts per page and eight pages; filters never change the incident total.
- Selecting an account shows 12 arithmetically consistent readings.
- Recovery clears the area/pipe states and closes the drawer.
- No existing Criterion 2.2/2.4/3.3 transition test regresses.

### Public interfaces

- Migration `infra/db/007_map_ta_phut_demo_customers.sql` adds `demo_customer_profile` and `demo_customer_meter_reading`; it does not store real-customer fields.
- Existing `GET /api/twin/impact/{pipe_id}` gains `zone`, `type_breakdown`, `latest_usage_m3`, type/subtype, synthetic account/meter IDs, and structured provenance.
- New `GET /api/twin/customers/{customer_id}` returns one synthetic profile plus exactly 12 readings; unknown/non-demo IDs return 404.
- Planned GIS route `GET /api/twin/gis/impact-zones?scenario_id=mtp-low-pressure-200-v1` returns a versioned GeoJSON FeatureCollection with `provenance=SIMULATED_LOW_PRESSURE_FOOTPRINT`.
- Existing `POST /api/demo/scenario` keeps its request shape but the `/operations` demonstration targets the Map Ta Phut profile.
- New configuration: `MTP_CUSTOMER_IMPACT_ENABLED=false` by default and `MTP_CUSTOMER_PROFILE=mtp-low-pressure-200-v1`. Demo Compose explicitly enables both only with GIS/customer-profile readiness.
- TypeScript contracts mirror the OpenAPI fields exactly; no `any`.

### Edge cases and failure modes

- Feature disabled: customer detail and zone routes fail closed with 404/503 and the UI shows an explicit unavailable state; it never falls back to the old five records.
- Seed count or type mix drifts: seed/preflight fails before API/web startup.
- Duplicate account/meter IDs: unique constraints abort seeding.
- A real-looking ID/address or `simulated=false` appears: validation aborts seeding.
- Missing monthly period, decreasing cumulative reading, or arithmetic mismatch: database/test validation fails closed.
- GIS permission/bundle absent: no geographic acceptance claim; the map reports unavailable rather than displaying logical coordinates as GIS.
- Impact API returns a count/list mismatch: response construction raises and E2E fails.
- Customer detail request races with recovery: request token invalidates the response and the drawer closes.
- More than one click while loading: one drawer/request remains authoritative.
- Branch-code mismatch (`5531021` GIS versus `5531022` service context): provenance legend exposes both and the binding remains `SIMULATED`, never `REAL`.

### Rollout, monitoring, and backout

- Migration is additive and forward-safe on existing volumes.
- Seed explicitly removes only the five known generated `72-1-*` demo rows, never arbitrary customer rows.
- Keep the feature default-off until migration, seed, permission/hash manifest, API, component, and E2E gates pass.
- Demo environment enables it explicitly; non-demo environments do not expose synthetic customer details.
- Log profile ID, generated counts, type breakdown, reading count, selected source `PIPE_ID`, run ID, impact-query duration, and drawer payload size—never record customer detail payloads.
- Backout disables `MTP_CUSTOMER_IMPACT_ENABLED`; the additive tables can remain. The UI shows unavailable, not legacy Samut Sakhon data.

## A3. Files to change

| File | Purpose |
|---|---|
| `infra/db/007_map_ta_phut_demo_customers.sql` | Demo profile/readings schema, constraints, indexes |
| `scripts/seed_db.py` | Replace five rows with deterministic 200-account profile |
| `scripts/map_ta_phut_customer_profile.py` | Pure profile/type/reading generator and validation |
| `simulator/app/roster.py` | Move named demo geography to Ban Chang/Rayong scenario context |
| `api/app/config.py` | Feature/profile configuration |
| `api/app/models.py` | Impact summary, type breakdown, profile/detail/readings contracts |
| `api/app/topology.py` | Join impact traversal to demo profiles/latest readings |
| `api/app/routes/twin.py` | Add customer detail and impact-zone routes |
| `api/app/demo.py` | Map Ta Phut scenario target/profile identity |
| `api/tests/test_migrations.py` or current migration test file | Forward-apply and schema constraints |
| `api/tests/test_topology.py` | Exact 200/80 traversal and deduplication |
| `api/tests/test_twin_routes.py` | Impact/detail/OpenAPI/provenance contracts |
| `api/tests/test_demo_scenario.py` | Profile target and idempotent recovery |
| `scripts/tests/test_map_ta_phut_customer_profile.py` | Generator distribution, IDs, readings, privacy guard |
| `web/src/features/twin/types.ts` | New cross-language impact/detail contracts |
| `web/src/features/twin/twinClient.ts` | Fetch impact zone and customer detail |
| `web/src/features/twin/GisLowPressureArea.tsx` | Clickable, non-colour-only simulated footprint |
| `web/src/features/twin/ImpactPanel.tsx` | Summary and drawer launcher |
| `web/src/features/twin/AffectedCustomerDrawer.tsx` | 200-count summary, filters, pagination |
| `web/src/features/twin/AffectedCustomerTable.tsx` | 25-row accessible result table |
| `web/src/features/twin/CustomerDetailPanel.tsx` | Synthetic profile and meter metadata |
| `web/src/features/twin/MonthlyMeterReadings.tsx` | Twelve-period reading history |
| `web/src/screens/OperationsTwinScreen.tsx` | Shared area/pipe selection and recovery clearing |
| Corresponding `*.test.tsx` files | Component/state/accessibility tests first |
| `e2e/tests/scenario-transitions.spec.ts` | Same-DOM area click, 200 accounts, recovery |
| `e2e/tests/topic2-gis.spec.ts` | GIS footprint/provenance/pipe binding proof |
| `scripts/demo-preflight.sh` | Count, mix, readings, feature, permission/hash checks |
| `infra/docker-compose.yml`, `infra/env.sample` | Explicit demo-only enablement |
| `Makefile` | Focused seed/profile verification targets |
| `POC_SPEC.md`, `docs/demo-runbook.md`, `docs/demo-coverage.md`, `e2e/README.md` | Exact 200-account and simulation wording |
| `docs/data/map-ta-phut-customer-profile.md` | Sources, synthetic method, non-claims, privacy |

## A4. Tests-first implementation sequence

1. Add generator tests and confirm failures for count, mix, prefixes, privacy, deterministic output, and reading arithmetic.
2. Implement `build_map_ta_phut_profiles()` and `build_monthly_readings()` minimally.
3. Add migration/schema tests and confirm missing-table/constraint failures.
4. Add migration `007`, apply on fresh and upgraded test databases, then refactor only duplicated constraints.
5. Add seed integration tests for exact replacement and rerun idempotency; implement seed wiring.
6. Add topology/API tests for exact 200/80 traversal, breakdown, detail, readings, failure modes, and OpenAPI; implement backend joins/routes.
7. Add component tests for footprint click, summary, filters, eight-page pagination, detail, readings, and recovery; implement frontend components.
8. Add Playwright transitions before wiring the full interaction; confirm they fail on absent footprint/count/detail/recovery.
9. Wire scenario/map/customer state, then run focused gates.
10. Run exact-SHA full gates, warm-stack rehearsal, and—only after explicit destructive-reset approval—true-cold rehearsal.

## A5. Function outlines

- `build_map_ta_phut_profiles(seed: int) -> list[DemoCustomerProfileSeed]`: deterministically creates exactly 200 profile rows with the locked type/subtype and node distribution; raises if any identity/address does not meet the synthetic contract.
- `build_monthly_readings(profiles, end_month, seed) -> list[DemoMeterReadingSeed]`: produces 12 cumulative, internally consistent monthly rows per customer using subtype-specific scenario ranges.
- `validate_demo_customer_profile(profiles, readings) -> None`: checks count, distribution, uniqueness, prefixes, geography, reading coverage, arithmetic, and absence of prohibited fields before any DB write.
- `_map_ta_phut_topology()`: returns the logical Map Ta Phut scenario line and two service nodes; it remains explicitly schematic/simulated.
- `seed_demo_customer_profiles(cur, profiles, readings)`: atomically replaces only owned demo rows and upserts the new profile/readings.
- `downstream_customers(pool, pipe_id) -> ImpactResponse`: keeps bounded directed BFS, then joins profile and latest-reading summaries and builds exact type counts.
- `get_demo_customer_detail(pool, customer_id) -> DemoCustomerDetail`: returns one profile and ordered 12-month history; refuses non-demo rows.
- `load_impact_zone(profile_id) -> FeatureCollection`: validates schema/profile/provenance and returns the simulated click footprint only when GIS readiness is enabled.
- `selectImpactZone(zoneId)` in `OperationsTwinScreen`: makes area and highlighted-pipe clicks converge on one incident selection.
- `filterAndPageCustomers(customers, filters, page)`: pure stable type/search filter and 25-row pagination without changing total incident count.
- `clearRecoveredImpact()`: invalidates pending detail requests, closes the drawer, and clears area/pipe feature state on normal recovery.

## A6. Test coverage

### `scripts/tests/test_map_ta_phut_customer_profile.py`

- `test_profile_has_exactly_200_accounts` — Creates exactly two hundred deterministic profiles.
- `test_profile_matches_locked_type_distribution` — Pins 140, 35, 25 type totals.
- `test_profile_matches_all_subtype_counts` — Pins every official subtype allocation.
- `test_ids_and_addresses_are_unmistakably_synthetic` — Rejects real-looking identifiers and civic addresses.
- `test_profile_contains_no_personal_contact_fields` — Prevents names, phones, emails, national IDs.
- `test_each_account_has_twelve_months` — Requires complete twelve-period history per account.
- `test_meter_readings_are_cumulative_and_consistent` — Pins nondecreasing registers and usage arithmetic.
- `test_generator_is_reproducible_for_fixed_seed` — Same seed produces byte-identical records.

### migration/seed integration

- `test_007_forward_applies_to_existing_volume` — Adds tables without rebuilding prior schema.
- `test_demo_profile_constraints_reject_wrong_prefixes` — Database rejects non-synthetic account and meter IDs.
- `test_seed_replaces_only_owned_five_customer_rows` — Removes legacy demo rows without broad deletion.
- `test_seed_is_idempotent_at_200_and_2400` — Reapply preserves exact customer/reading totals.

### `api/tests/test_topology.py`

- `test_map_ta_phut_pressure_corridor_reaches_200` — Upstream pressure impact returns every account.
- `test_map_ta_phut_last_leg_reaches_80` — Directional discriminator returns final-node accounts only.
- `test_impact_breakdown_sums_to_exact_count` — Type totals equal distinct returned customers.
- `test_impact_customers_are_stably_sorted` — Stable synthetic customer ordering prevents UI shuffle.

### `api/tests/test_twin_routes.py`

- `test_impact_returns_profile_and_latest_usage` — Returns required summary fields and provenance.
- `test_customer_detail_returns_twelve_readings` — Returns ordered complete reading history.
- `test_customer_detail_rejects_non_demo_id` — Prevents generic customer-data lookup surface.
- `test_impact_zone_is_simulated_geojson` — Pins schema, click ID, and provenance.
- `test_disabled_customer_feature_fails_closed` — Disabled mode exposes no synthetic details.

### frontend component tests

- `shows_low_pressure_area_with_text_and_pattern` — Status is not communicated by colour alone.
- `opens_same_drawer_from_area_and_pipe_click` — Both map targets select identical incident.
- `shows_200_and_140_35_25_breakdown` — Pins headline and category summary totals.
- `paginates_200_accounts_in_eight_pages` — Shows 25 stable rows per page.
- `filters_rows_without_changing_incident_total` — Filtered results preserve 200 headline count.
- `shows_synthetic_account_meter_address_and_type` — Renders requested non-PII account fields.
- `shows_twelve_consistent_monthly_readings` — Renders ordered consumption history for selection.
- `recovery_closes_drawer_and_clears_footprint` — Prevents stale incident information after recovery.

### Playwright

- `pressure_drop_area_click_shows_exactly_200_customers` — Induced same-DOM map-to-drawer transition.
- `customer_type_filter_and_detail_are_inspectable` — Judge can inspect mixed types and readings.
- `normal_recovery_clears_area_and_customer_drawer` — Recovery removes every visible impact state.
- `gis_and_customer_provenance_remain_distinct` — Real geometry never relabels simulated impact.

## A7. Dependencies

- Written demo/redistribution permission for the supplied pipe data before GIS packaging.
- Existing Phase 5 GIS manifest/network work and MapLibre dependency.
- Current PWA classification labels copied into a versioned configuration with source date.
- No new third-party customer-data dependency and no PII access.

## A8. Acceptance checks

- `pytest scripts/tests/test_map_ta_phut_customer_profile.py`
- `pytest api/tests/test_topology.py api/tests/test_twin_routes.py api/tests/test_demo_scenario.py`
- `ruff check api simulator ml scripts`
- `mypy api simulator ml scripts`
- `cd web && pnpm test --run` (or the repository's bounded equivalent)
- `cd web && pnpm lint && pnpm typecheck && pnpm build`
- Preflight reports exactly `200 profiles`, `2400 readings`, `140/35/25`, profile `mtp-low-pressure-200-v1`, and a permitted/hash-matched GIS bundle.
- Warm `make demo-e2e` proves same-DOM footprint → click → 200 → detail → recovery.
- True-cold volume reset and rehearsal occur only after explicit destructive-action approval.

## A9. Wiring verification

| Component | Entry point | Registration/wiring | Schema/table |
|---|---|---|---|
| Migration `007` | `scripts/migrate.py` / initdb order | mounted `infra/db/NNN_*.sql` | `demo_customer_profile`, `demo_customer_meter_reading` |
| Profile generator | `scripts/seed_db.py:main()` | direct import and validation before transaction | seed dataclasses |
| Demo profiles | seed one-shot service | Compose `seed` after `migrate` | `customer_service_point` + `demo_customer_profile` |
| Monthly readings | seed one-shot service | same atomic seed transaction | `demo_customer_meter_reading` |
| Enriched impact query | `GET /api/twin/impact/{pipe_id}` | existing twin router | topology + profile + latest reading |
| Customer detail | `GET /api/twin/customers/{customer_id}` | twin router imported by FastAPI app | profile + 12 readings |
| Low-pressure footprint | GIS impact-zone endpoint | twin router + GIS config/loader | versioned GeoJSON; no PostGIS |
| Scenario target | `POST /api/demo/scenario` | demo router and `/operations` controls | `device`, telemetry, scenario profile |
| Map area layer | `/operations` GIS view | `OperationsTwinScreen` imports component | impact-zone GeoJSON + live scenario state |
| Impact drawer | area/pipe click | `OperationsTwinScreen` shared selection | `ImpactResponse` |
| Customer detail panel | row selection | drawer imports detail component/client | `DemoCustomerDetail` |
| Preflight gate | `make demo-preflight` | shell/Make target before E2E | counts, mix, hashes, flags |

## A10. Cross-language schema verification

Before migration implementation, exact-string searches must confirm every field across SQL, Python, OpenAPI, TypeScript, fixtures, and E2E. Canonical names are:

- SQL: `customer_service_point`, `demo_customer_profile`, `demo_customer_meter_reading`
- Python: `AffectedCustomer`, `ImpactResponse`, `DemoCustomerDetail`, `DemoMeterReading`
- TypeScript: matching snake-case JSON fields through explicit interfaces
- Join key: `customer_id`; topology key: `node`; scenario key: `pressure_zone_id`
- Source GIS key: `PIPE_ID`; its relation to the scenario remains a versioned simulated crosswalk

# Plan Draft B — versioned static scenario bundle

## B1. Overview

Generate one versioned JSON bundle containing the 200 profiles, 2,400 readings, type breakdown, and low-pressure GeoJSON, then have the API validate and serve it without new database tables. This is faster and makes the demo dataset easily inspectable, but weakens the existing relational customer-join story and makes future authority-backed replacement harder.

## B2. Decision completeness

### Goal

Deliver the same click-to-200 interaction with minimal schema change and a reproducible, hash-pinned offline bundle.

### Non-goals

- No database persistence or relational reading query.
- No real-customer import, billing, hydraulics, or legacy five-record fallback.
- No claim that bundle rows are actual Map Ta Phut accounts.

### Success criteria

- Bundle validation pins 200/2,400, mix, synthetic prefixes, geometry provenance, and SHA-256.
- API and UI behavior matches Draft A, including click interaction and recovery.
- Missing/corrupt/drifted bundle fails closed.

### Public interfaces

- No DB migration.
- New `MTP_CUSTOMER_BUNDLE_PATH` and `MTP_CUSTOMER_BUNDLE_SHA256` settings.
- Same additive impact/detail/impact-zone HTTP contracts as Draft A.

### Edge cases, rollout, and backout

- Missing/hash-drift/schema-invalid bundle yields 503 and explicit GIS/customer unavailable UI.
- Default off; enable only with exact bundle manifest.
- Backout disables the feature and leaves no database changes.

## B3. Files to change

- Add builder/test, versioned schema, permission-dependent generated bundle, loader/cache, API models/routes/tests, the same frontend components/tests, Compose/preflight wiring, and documentation.
- Do not add migration `007`; `api/app/map_ta_phut_customers.py` validates and indexes the bundle in memory.

## B4. Tests-first implementation sequence

1. Write bundle generator/schema/hash tests and confirm missing-contract failures.
2. Generate/validate the deterministic bundle.
3. Write loader/API fail-closed tests and implement bounded caching.
4. Follow the same frontend and Playwright red-green sequence as Draft A.
5. Run exact-SHA warm/cold acceptance with manifest evidence.

## B5. Function outlines

- `build_customer_bundle()` combines profiles, readings, breakdown, zone, and provenance into one canonical JSON artifact.
- `load_customer_bundle(settings)` verifies size, hash, schema, counts, and indexes customers by ID.
- API and frontend functions otherwise match Draft A.

## B6. Test coverage

- `test_bundle_is_canonical_and_reproducible` — Stable bytes and hash for fixed seed.
- `test_bundle_rejects_wrong_counts_or_mix` — Fails on 199, 201, or drifted categories.
- `test_loader_fails_closed_on_hash_drift` — Never serves unverified synthetic data.
- Use the same component and Playwright tests listed in Draft A.

## B7. Dependencies

- Bundle storage/mount policy and pipe-data redistribution permission.
- No database dependency beyond existing topology if impact traversal remains active.

## B8. Acceptance checks

- Builder/hash/schema tests, API/component/E2E gates, manifest preflight, exact-SHA warm/cold rehearsal.

## B9. Wiring verification

| Component | Entry point | Registration/wiring | Schema/table |
|---|---|---|---|
| Bundle builder | `make mtp-customer-bundle` | Makefile/script | versioned JSON schema |
| Bundle loader | API lifespan/first route access | config + twin router | in-memory indexes; no DB |
| HTTP/UI surfaces | same as Draft A | same route/component wiring | validated bundle contracts |
| Preflight | `make demo-preflight` | manifest/hash checks | bundle files |

## B10. Cross-language verification

One JSON Schema is canonical for Python and TypeScript fixtures. Field names, enum values, schema version, count invariants, and provenance values are verified in both languages.

# Comparative analysis

| Dimension | Draft A — database-backed | Draft B — static bundle |
|---|---|---|
| Criterion 2.4 story | Strong relational topology/customer join | Visually strong but less relational |
| Monthly readings | Queryable, indexed, future-ready | Embedded and memory-loaded |
| Migration risk | Additive migration and seed complexity | No migration |
| Failure isolation | DB constraints plus generator validation | Schema/hash validation only |
| Future real adapter | Cleaner seam after privacy/authority work | Requires later migration/refactor |
| Demo reproducibility | Deterministic seed plus DB state | Canonical hash-pinned artifact |
| Recommended | **Yes** | Only if schedule forbids migration |

Draft A is selected. The system already uses Timescale/Postgres for relational topology and presents affected customers as a database join; normalized demo-only profile/readings tables preserve that evidence and provide a safer future integration seam. Draft B's canonical generator/hash ideas are retained for seed reproducibility and preflight, but JSON is not the runtime source of customer records.

# Unified execution plan

## U1. Overview

Implement the database-backed plan with a pure deterministic generator and a versioned scenario configuration. Replace the five Samut Sakhon demo customers with exactly 200 Map Ta Phut service accounts, add 12 months of readings, and make the simulated low-pressure area and highlighted pipe open one shared impact drawer. Keep real GIS geometry, official PWA classifications, simulated pressure/customer bindings, and East Water energy context visibly distinct.

## U2. Locked decisions

- Exactly 200 affected accounts—never “about 200” at runtime.
- Exact `140 / 35 / 25` top-level distribution and the subtype table above.
- Exactly 12 monthly readings per account.
- PWA retail classifications; East Water is not the customer-account source.
- No real person/company identities, account numbers, meters, civic addresses, or customer points.
- One simulated zone `MTP-LPZ-01`; upstream incident returns 200, final leg returns 80.
- Map/pipe click opens 25-row pages; incident headline remains 200.
- Recovery closes/clears all impact state.
- Real pipe geometry never upgrades the pressure zone or customer binding from simulated to real.
- Default off outside the explicitly configured demo.

## U3. Phased TDD implementation

### Phase 0 — documentation and identity truth

1. Update the parent evaluation/GIS plan references to point to this detailed tranche.
2. Document the `5531021` GIS versus `5531022` PWA service-area mismatch.
3. Replace all “real customers” wording with “200 deterministic simulated service accounts.”
4. Lock profile/schema versions and PWA source/effective dates.

### Phase 1 — generator and schema

1. Write the eight generator tests and run them red.
2. Implement deterministic profile and reading generation.
3. Write forward-migration/constraint tests and run them red.
4. Add migration `007`; verify fresh and upgraded databases.
5. Add idempotent seed replacement; assert exactly 200/2,400 and no legacy five rows.

### Phase 2 — topology, profile identity, and API

1. Move named demo geography coherently to Ban Chang/Rayong while retaining a visibly simulated P-2/Map Ta Phut scenario identity.
2. Seed logical Map Ta Phut service nodes and bind 120/80 customers.
3. Write exact 200/80 directed-traversal tests.
4. Enrich `ImpactResponse` with profile summaries and type breakdown.
5. Add customer detail/readings and impact-zone routes, OpenAPI examples, provenance, and fail-closed feature gating.

### Phase 3 — clickable low-pressure experience

1. Write component tests for the footprint, two click entry points, totals, filters, pagination, detail, readings, accessibility, and recovery.
2. Implement the patterned/icon-labelled low-pressure layer.
3. Implement the shared impact drawer with 25-row pages.
4. Implement the detail/readings panel and request-race cancellation.
5. Clear all impact UI state on recovery.

### Phase 4 — live transition evidence

1. Extend the same-DOM Playwright scenario test: normal → pressure drop → area/pipe highlight → click → exactly 200 → inspect mixed type/detail → normal recovery.
2. Assert type counts sum to 200 and that page 1 has 25 rows.
3. Assert `SIMULATED IMPACT`, source/provenance legend, and branch/GIS mismatch note.
4. Assert the existing model-driven critical transition still occurs within a literal 30 seconds.

### Phase 5 — preflight, acceptance, and handoff

1. Add profile/mix/reading/permission/hash checks to preflight.
2. Run focused and full Python/web gates.
3. Run warm exact-SHA E2E and archive reports.
4. Obtain explicit approval before deleting Docker volumes for true-cold rehearsal.
5. Run the full judge script and record trigger-to-footprint, click-to-drawer, and recovery timings.

## U4. Unified files and interfaces

Use Draft A's complete files-to-change list and public interfaces. The two new runtime tables and two new read surfaces are mandatory; the deterministic generator is the only source of demo profile/readings. No customer JSON bundle is mounted at runtime.

## U5. Unified failure behavior

All trust-boundary failures are fail-closed: feature disabled, wrong profile version, count/mix drift, unsafe identifier/address, incomplete readings, GIS hash/permission failure, branch mismatch hidden, or API count inconsistency. UI may still show the existing logical twin, but it must not show a Map Ta Phut GIS/customer claim when the Map Ta Phut readiness contract fails.

## U6. Unified validation

The feature is complete only when tests prove the database invariants, OpenAPI/TypeScript contracts, click interaction, exact 200 total, mixed categories, requested account fields, 12 monthly readings, same-DOM transition, and recovery. A screenshot or static seeded snapshot is insufficient.

## U7. Unified wiring verification

Draft A's wiring table is normative. Final implementation review must independently trace:

`pressure_drop POST -> DEMO telemetry -> WebSocket warning -> GIS pipe/zone feature state -> click selection -> impact API (200) -> drawer/table -> customer detail API -> readings -> normal recovery clear`.

Every arrow must have a test that fails if it is disconnected.

## U8. Decision-complete checklist

- [x] Goal, non-goals, exact counts, and visible interaction are locked.
- [x] Customer domain is PWA retail; East Water remains separate context.
- [x] Type/subtype allocation is exact and fully specified.
- [x] Requested account, meter, address, type, and reading fields are covered.
- [x] PII prohibitions and synthetic prefixes are explicit.
- [x] DB migration, API, env, GIS, and frontend public surfaces are named.
- [x] Failure behavior is fail-closed and has a backout path.
- [x] Tests are listed before implementation for every behavior.
- [x] Wiring table covers generator, migration, seed, query, routes, UI, E2E, and preflight.
- [x] No legacy five-customer fallback is planned.
- [x] No open implementation decision remains.

## Plan update to the overall roadmap

In `evaluation-criteria-evidence-improvement-roadmap`, expand Phase 5 from “Rayong GIS and official SEC realism” into two ordered sub-tranches:

1. **Phase 5A — pipe GIS/SEC provenance:** permission/hash audit, WGS84 map, source pipe details, simulated crosswalk, official system-wide SEC context.
2. **Phase 5B — Map Ta Phut 200-customer low-pressure impact:** this plan, implemented after the GIS contract is stable but before DMAMA/real-customer authority work.

Phase 5B improves Criterion 2.4 judge realism but does not convert the 200 accounts into real affected customers. DMAMA and any authoritative customer-to-pipe mapping remain Phase 6 authority-dependent work.
