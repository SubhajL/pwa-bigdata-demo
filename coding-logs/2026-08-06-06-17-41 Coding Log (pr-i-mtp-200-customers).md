# Coding Log: PR-I — Map Ta Phut 200-Customer Profile, Schema, Seed, API

Branch: `feat/mtp-customer-profile-api` · Baseline: `origin/main@19c4977`
Mode: g2-planning DREP (finalized below, post-Codex) → g2-coding implementation.

Source spec: roadmap `overall-phases-and-pr-roadmap.md` §A3 "PR-I" + A6/A9/A10; detailed
input `map-ta-phut-200-customer-impact.md` (backend rows only — the clickable UI + full
E2E are PR-J).

---

## Codex adversarial pass (gpt-5.6-sol, xhigh) — disposition

| # | Finding | Disposition |
|---|---------|-------------|
| 0.1 | Upgraded-volume path never exercised (fixture is fresh 001) | ACCEPT — add own-container 006→007 upgrade test (T_upgrade_006) |
| 0.2 | Production-fresh initdb path untested | ACCEPT-noted — identical idempotent 007 SQL; T_upgrade_006 is the proof |
| 0.3 | Legacy 5-row writer must be REMOVED not followed | ACCEPT — `_topology()` stops emitting 72-1-*; all seeding via `seed_demo_customer_profiles` |
| 0.4 | Subtype mix has no persisted path; type/subtype pairing unproven | ACCEPT — persisted GROUP BY test + JOINT-pair generator assertion |
| 0.5 | Persisted privacy unproved; constraints omit customer_id/address | ACCEPT — CHECK customer_id + address_label; seeded-row PII DB scan |
| 0.6 | Ban Chang/Rayong coherence unowned; P-2/V-9 still Samut Sakhon | PARTIAL — customer area/branch→Ban Chang/Rayong + disclose 5531021/5531022; REJECT moving device roster (scope), disclose as seam |
| 0.7 | Compose doesn't forward MTP vars; MTP_CUSTOMER_PROFILE inert | ACCEPT — compose passthrough + wire profile into zone default & profile_version predicate |
| 0.8 | No OpenAPI fixture / Python↔TS cross-validation | ACCEPT — test validates TS fixture against live /openapi.json |
| 0.9 | Readings should be a hypertable | REJECT-reasoned — 12 fixed closed monthly periods = bounded relational reference data, not telemetry; documented in-migration |
| 2.FN5 | LEFT JOIN multiplies / retains unprofiled | ACCEPT — INNER JOIN profile (profile_version) + DISTINCT ON latest; assert one exact customer |
| 2.off | Optional None serializes as null, not "absent" | ACCEPT — contract = "null when off"; TS `?: T\|null` |
| §3 | Vacuous tests | ACCEPT all — named constraints, all-200, checksum idempotency |
| 6.F9 | ImpactPanel comment leakage | KEEP — comment-only honesty fix |
| ✓ | No app.main router edit needed; settings already on app.state | CONFIRMED by Codex |

---

# FINALIZED DREP

## §0 Repo Profile
- Python 3.13 (api/simulator/ml/scripts) + TS/React 18 (web).
- api: `cd api && pytest` (real TimescaleDB+Mosquitto via docker, session fixtures;
  `testpaths=["tests"]`) · `ruff check .` (len 100) · `mypy .` (py3.13).
- web: `pnpm test` (vitest) · `pnpm lint` (eslint src) · `pnpm typecheck` (tsc --noEmit) ·
  `pnpm build` (tsc -b && vite build && verify-gis-chunk.mjs).
- Migrations `infra/db/NNN_*.sql` via `scripts/migrate.py` (idempotent ledger; IF NOT EXISTS).
  Next = **007**. Fresh Compose = initdb runs whole dir; existing = migrate service.
- Coding log: this file; pointer `.codex/coding-log.current`.
- Ownership: repo ours · runtime ours · disposition may-become-production.
- MUST NOT (CLAUDE.md): no synthetic value w/o visible SIMULATED; DLQ not crash; typed sigs
  no `any`/full hints; fns ≤50 lines; **time-series → hypertable**; every route registered,
  no orphan components; Thai UI tokens; no hardcoded KPI; no `@ts-ignore`/bare `except:`.

## §1 Goal / Non-Goals
**Goal.** Replace the five `72-1-*` Samut Sakhon service points with exactly 200 deterministic,
privacy-safe Ban Chang/Rayong (Map Ta Phut) simulated accounts (140/35/25 across 17 subtypes) +
2,400 integer monthly readings, behind additive migration 007, fail-closed on
`MTP_CUSTOMER_IMPACT_ENABLED` (default off). Ship the Python/OpenAPI/TS contract PR-J consumes,
proven on FRESH and UPGRADED stacks.

**Non-Goals.** Clickable UI/drawer/table/detail-panel/MapLibre (PR-J); new web components or
twinClient fetch fns; real PII/billing/hydraulics/PostGIS; legacy five-row fallback; moving the
demo DEVICE roster (P-2/V-9) off Samut Sakhon (disclosed as a seam, not changed); demo injection
engine changes; destructive resets.

## §2 Requirements (R1..R21) — every R has a call site (§6) + test (§5)
- **R1** 007 creates `demo_customer_profile` + `demo_customer_meter_reading`, additive/IF NOT
  EXISTS, forward-applies on a volume already at 006 (with 5 legacy rows) without rebuild.
- **R2** DB CHECKs reject non-`SIM-MTP-` `customer_id`/`account_no`/`meter_no`, an
  `address_label` without `จำลอง`, and `simulated<>true` — asserted by NAMED constraint.
- **R3** reading CHECK: `usage_m3 = reading_m3 - previous_reading_m3` AND
  `reading_m3 >= previous_reading_m3` (integer m³) — asserted by NAMED constraint.
- **R4** readings FK → `demo_customer_profile(customer_id)`; PK `(customer_id, period)`.
  `demo_customer_profile.customer_id` FK → `customer_service_point(customer_id)`.
- **R5** `demo_customer_meter_reading` is a plain relational table (NOT a hypertable): bounded
  12 closed monthly periods/customer; documented in-migration (telemetry stays the hypertable).
- **R6** generator returns exactly 200; type counts 140/35/25; JOINT `(type_code,subtype_code)`
  counts equal the locked table exactly.
- **R7** every `customer_id`/`account_no`/`meter_no` is `SIM-MTP-`-prefixed & unique; every
  `address_label` contains `จำลอง`; `area`/`branch` are the Ban Chang/Rayong simulated labels;
  NO name/phone/email/13-digit-id/lat-long anywhere.
- **R8** 12 readings/customer (2,400), cumulative integers: period N previous == period N-1
  reading, usage>=0.
- **R9** determinism: same `seed`+`end_month` ⇒ byte-identical dataclasses; NO wall-clock/tz/rng.
- **R10** `validate_demo_customer_profile` runs in the seed BEFORE any write (fail-closed).
- **R11** seed removes the legacy 5-row writer AND deletes the 5 owned `72-1-*` rows; lands
  exactly 200 service points + 200 profiles + 2,400 readings; a NON-`72-1` bystander survives;
  re-seed is idempotent (counts + per-row values unchanged, no churn).
- **R12** node binding 120×n1 / 80×n2 ⇒ corridor `PIPE-TANK-V9`→200 distinct; last-leg
  `PIPE-N1-N2`→80.
- **R13** enriched `downstream_customers`: INNER JOIN profile on `customer_id` AND
  `profile_version=<profile>`, latest reading via `DISTINCT ON (customer_id) … ORDER BY period
  DESC` (no row multiplication); `type_breakdown` sums to `count`==distinct; stable sort;
  one sampled customer has EXACT type/subtype/account/meter/latest_usage.
- **R14** contract "null when off": impact route enriched fields (top-level `type_breakdown`,
  `zone`, per-customer `type_code/subtype_code/account_no/meter_no/latest_usage_m3`) are
  populated when `MTP_CUSTOMER_IMPACT_ENABLED=1`, `null` when off; never the five ids either way.
- **R15** `GET /api/twin/customers/{customer_id}` → profile + exactly 12 ordered readings for a
  demo id (filtered by profile_version) when enabled; 404 unknown/non-demo id; 404 all ids when
  disabled; raises if stored readings ≠ 12 (fail-closed).
- **R16** `GET /api/twin/gis/impact-zones?scenario_id=…` (default = `settings.mtp_customer_profile`)
  → versioned simulated FeatureCollection (`provenance=SIMULATED_LOW_PRESSURE_FOOTPRINT`,
  `zone_id=MTP-LPZ-01`, coarse polygon, no customer point) when enabled; 404 disabled; 404 unknown.
- **R17** `/openapi.json` documents both new routes + the enriched ImpactResponse + the
  DemoCustomerDetail/DemoMeterReading/ImpactZone schemas with their full field sets.
- **R18** committed TS fixture validates (compile-time `satisfies` + runtime) against BOTH the
  interfaces AND the live `/openapi.json` field sets (Python↔TS cross-check); pins 200 + 140/35/25.
- **R19** `MTP_CUSTOMER_IMPACT_ENABLED` + `MTP_CUSTOMER_PROFILE` are forwarded into the API
  container in `infra/docker-compose.yml` (default off) and documented in `infra/env.sample`.
- **R20** provenance doc discloses: 200 SIMULATED accounts (never "real"); GIS source branch
  `5531021` vs PWA service `5531022`; the demo device (P-2/V-9) identity is an unchanged
  Samut Sakhon simulation seam, not Rayong hardware. Added to the evidence-docs guard list.
- **R21** preflight asserts DB `200 profiles / 2400 readings / 140-35-25` (flag-independent).

## §3 Change Contract (F1..F20)
| ID | Path | Action | Anchor | Purpose |
|----|------|--------|--------|---------|
| F1 | `infra/db/007_map_ta_phut_demo_customers.sql` | MIGRATION | — | profile+readings tables, FK chain, NAMED CHECKs, indexes; hypertable-rejection note |
| F2 | `scripts/map_ta_phut_customer_profile.py` | CREATE | — | pure generator+validate; TYPE/SUBTYPE_ALLOCATION, MTP_PROFILE_VERSION, Ban Chang geography consts |
| F3 | `scripts/seed_db.py` | MODIFY | `_topology` L97, `main` L126 | REMOVE 5-row writer; `RETIRED_CUSTOMERS` delete; `seed_demo_customer_profiles`; validate-before-write |
| F4 | `api/app/config.py` | MODIFY | Settings L17 | `mtp_customer_impact_enabled=False`, `mtp_customer_profile="mtp-low-pressure-200-v1"` |
| F5 | `api/app/models.py` | MODIFY | after ImpactResponse L485 | enriched AffectedCustomer/ImpactResponse (nullable); TypeBreakdown, DemoMeterReading, DemoCustomerDetail, ImpactZoneFeature, ImpactZoneCollection |
| F6 | `api/app/topology.py` | MODIFY | `downstream_customers` L104 | enriched join (DISTINCT ON, profile_version); `get_demo_customer_detail`; `load_impact_zone`; `MTP_IMPACT_ZONE` |
| F7 | `api/app/routes/twin.py` | MODIFY | `twin_impact` L230 | gate+enrich impact; add customers + impact-zone routes |
| F8 | `web/src/features/twin/types.ts` | MODIFY | AffectedCustomer L78 | enriched (`?: T\|null`) + new interfaces |
| F9 | `web/src/features/twin/ImpactPanel.tsx` | MODIFY | comment L13 | correct stale 5/2 → 200/80 (comment only) |
| F10 | `infra/docker-compose.yml` | MODIFY | api service env L100 | forward the two MTP vars (default off) |
| F11 | `infra/env.sample` | MODIFY | after GIS block | document the two MTP vars |
| F12 | `scripts/demo-preflight.sh` | MODIFY | end | assert 200/2400/140-35-25 from DB |
| F13 | `docs/data/map-ta-phut-customer-profile.md` | CREATE | — | sources, synthetic method, privacy, 5531021/5531022 + device-seam disclosure, non-claims |
| F14 | `api/tests/test_mtp_customer_profile.py` | CREATE (Claude) | — | generator tests |
| F15 | `api/tests/test_mtp_migration_seed.py` | CREATE (Claude) | — | 007 upgrade(own container)+named-constraints+seed replace/idempotent/persisted-subtype/PII-scan |
| F16 | `api/tests/test_topology.py` | MODIFY (Claude) | L28-32,L118-136 | 200/80 corridor+last-leg+breakdown+order |
| F17 | `api/tests/test_twin_routes.py` | MODIFY (Claude) | L171 | enriched/null-when-off impact, detail, zone, openapi-fixture cross-check |
| F18 | `web/src/features/twin/mtpContract.test.ts` | CREATE (Claude) | — | TS fixture `satisfies` + runtime pins |
| F19 | `web/src/features/twin/__fixtures__/mtp-contract.json` | CREATE (Claude) | — | canonical contract fixture |
| F20 | `docs/demo-runbook.md` | MODIFY | customer/impact line | note 200-account MTP replacement (honesty) |

## §4 Function Contracts (revised per Codex)
```
FN1 build_map_ta_phut_profiles(*, seed=20260804) -> list[DemoCustomerProfileSeed]
    200 rows; customer_id SIM-MTP-{i:05d}; account SIM-MTP-ACC-{i:05d}; meter SIM-MTP-MTR-{i:05d};
    (type_code,subtype_code) expanded from locked JOINT table in fixed order; node n1 if i<=120
    else n2; area="ต.มาบตาพุด อ.เมืองระยอง จ.ระยอง"; branch="กปภ.สาขาบ้านฉาง (จำลอง)";
    address_label="ที่อยู่จำลอง: จุดบริการ MTP-Z01-{i:03d}, ต.มาบตาพุด อ.เมืองระยอง จ.ระยอง";
    pressure_zone_id="MTP-LPZ-01"; meter_size deterministic-by-subtype; profile_version=
    MTP_PROFILE_VERSION; simulated=True. Post: JOINT counter == locked table. ≤50 lines (helpers).
FN2 build_monthly_readings(profiles, *, end_month="2026-03", seed=20260804)
    -> list[DemoMeterReadingSeed]
    12 rows/profile ending end_month; INTEGER m³ registers strictly-cumulative; usage=diff>=0;
    continuity across periods. NO clock/tz/rng. Post: len==12*n, exact-int arithmetic.
FN3 validate_demo_customer_profile(profiles, readings) -> None  # raises ValueError, fail-closed
    count/type/JOINT-subtype/uniqueness/prefix/area+branch/12-coverage/int-arithmetic/no-PII.
FN4 seed_demo_customer_profiles(cur, profiles, readings) -> None  # Claude (data-safety)
    DELETE RETIRED_CUSTOMERS (the 5 owned 72-1-* — the complete owned set); upsert 200 service
    points, 200 profiles, 2400 readings (named ON CONFLICT keys); parent order sp→profile→reading;
    one txn; deletes ONLY those 5.
FN5 downstream_customers(pool, pipe_id, *, enriched=False, profile_version=None) -> ImpactResponse
    BFS unchanged. enriched: INNER JOIN demo_customer_profile ON customer_id AND profile_version=…,
    latest reading DISTINCT ON (customer_id) ORDER BY period DESC; per-customer type/subtype/
    account/meter/latest_usage; top-level type_breakdown+zone(MTP-LPZ-01). count==len==breakdown
    sum over profiled. not enriched: current basic behavior; enriched fields None. KeyError if pipe
    matches no edge.
FN6 get_demo_customer_detail(pool, customer_id, *, profile_version) -> DemoCustomerDetail
    profile (filtered profile_version) + 12 readings ORDER BY period. KeyError if absent; raises if
    readings != 12. Reads only demo_customer_profile — cannot surface a non-demo customer.
FN7 load_impact_zone(scenario_id) -> ImpactZoneCollection  # pure, MTP_IMPACT_ZONE constant
    versioned simulated FeatureCollection; KeyError unknown id. Coarse polygon, no customer point.
FN8 twin_customer_detail(request, customer_id)  # route: 404 disabled; 503 no pool; 404 KeyError;
    profile_version=settings.mtp_customer_profile.
FN9 twin_impact_zones(request, scenario_id=None)  # 404 disabled; default id=settings.mtp_customer_
    profile; 404 KeyError.
twin_impact MODIFY: enriched=settings.mtp_customer_impact_enabled,
    profile_version=settings.mtp_customer_profile.
```

## §5 Test Plan (RED-proofs; strengthened per Codex §3)
Generator (F14, pure): T_gen_count(200) · T_gen_type_mix(140/35/25) · **T_gen_joint_subtypes**
(exact (type,subtype) pairs, not independent counters) · T_gen_synthetic_ids(prefix+unique) ·
T_gen_no_pii(regex scan + จำลอง) · T_gen_geography(area+branch Ban Chang/Rayong) ·
T_gen_twelve+T_gen_cumulative(int arithmetic+continuity) · **T_gen_reproducible**(fixed
seed+end_month equal; assert no `date.today`/`datetime.now` reference via source scan or by
running twice with a monkeypatched clock that would differ).

Migration/seed (F15, real DB; each isolates state + `finally` cleanup):
- **T_upgrade_006** (own throwaway container): initdb 001 → apply 002..006 only → insert 5
  legacy 72-1-* rows → apply 007 → run `seed_db.py` → assert profiles==200, readings==2400,
  `72-1-%`==0, tables+indexes exist. RED: relation-missing / 5 survive. (R1,R11)
- **T_mig_named_constraints**: with a VALID parent service point, INSERT profile account_no
  `REAL-1` → IntegrityError whose `.diag.constraint_name` is the account-prefix check; repeat for
  customer_id, address_label, simulated. RED: any-error or no-error. (R2)
- **T_mig_reading_named_check**: valid parent profile, INSERT reading usage≠diff → the named
  arithmetic check fires. (R3)
- **T_seed_persisted_subtypes**: `SELECT type_code,subtype_code,count(*) … GROUP BY` on the
  seeded session DB == locked JOINT table. (R6 persisted)
- **T_seed_persisted_no_pii**: scan every text column of demo_customer_profile for phone/email/
  13-digit/lat-long; all SIM-MTP + จำลอง. (R7 persisted)
- **T_seed_idempotent**: run seed twice (subprocess); 200/2400 unchanged AND a
  `md5(array_agg(... ORDER BY))` checksum of readings is identical (no churn) AND every customer
  has 12 DISTINCT periods. (R11)
- **T_seed_keeps_non72_bystander** (inside T_upgrade or session with cleanup): a `KEEP-9`
  service point survives the seed. (R11)

Topology (F16 — update L28-32/L118-136): T_impact_corridor_200(enriched, PIPE-TANK-V9→200
distinct) · T_impact_last_leg_80(PIPE-N1-N2→80) · T_impact_breakdown_sums(==count==200, ==140/35/25)
· T_impact_one_exact_customer(sampled SIM-MTP id's exact type/subtype/account/meter/latest_usage)
· T_impact_stable_order. Retain cyclic/duplicate/unknown.

Routes (F17 — `client` rebuilds app w/ env): T_route_impact_enriched(enabled: 200, breakdown
140/35/25, ALL customers carry type_code+latest_usage) · T_route_impact_null_when_off(default: 80,
`type_breakdown is None`, customers' type_code None, NOT 72-1-*) · T_route_detail_twelve(enabled:
12 ascending periods + arithmetic for sampled id) · T_route_detail_unknown_404(NOPE + 72-1-00001)
· T_route_detail_disabled_404 · T_route_zone_geojson(FeatureCollection+provenance+zone_id) ·
T_route_zone_disabled_404 · T_route_zone_unknown_404 · **T_openapi_fixture_crosscheck**(load
`mtp-contract.json`; every key ∈ the live `/openapi.json` component schema for ImpactResponse/
DemoCustomerDetail/DemoMeterReading/ImpactZone; both new paths present).

Web (F18/F19): T_web_contract — `satisfies` each interface at compile time; runtime asserts
`impact.count===200`, breakdown sums 200 (140/35/25), detail has 12 readings.

Preflight (F12): T_preflight_counts — psql count block, non-zero exit on drift (warm gate;
T_upgrade_006 is the fresh+upgraded proof).

## §6 Traceability (every R → realizing call site)
R1→007 CREATE TABLE + T_upgrade_006 apply path. R2/R3→007 named CHECK clauses. R4→007 FK/PK
clauses. R5→007 plain-table + doc comment. R6→FN1 JOINT expansion loop + T_seed_persisted_subtypes.
R7→FN1 id/address/area/branch construction + FN3 guard. R8→FN2 cumulative int loop. R9→FN1/FN2
seeded-only. R10→`seed_db.main()` calls FN3 before FN4. R11→FN4 DELETE+upserts; `_topology()`
no longer returns customers; `main()` no longer inserts 72-1-*. R12→FN4 node split + FN5 join.
R13→FN5 DISTINCT-ON join + `_build_type_breakdown`. R14→`twin_impact` passes enriched flag;
None-when-off in FN5. R15→`twin_customer_detail`→FN6. R16→`twin_impact_zones`→FN7. R17→route
decorators + response_models. R18→FN@ fixture test. R19→compose `environment:` keys. R20→F13 doc
+ evidence-docs guard list. R21→preflight psql block.

## §7 Wiring (unchanged core + additions)
`router` already `include_router`-ed (main.py:241) → new `@router.get` handlers auto-register;
lifespan already stores `app.state.settings` (main.py:103) → routes read the flag/profile. New:
compose `environment` forwards MTP vars (F10); readings FK→profile (F1); FN3 called in seed main
(F3); fixture consumed by T_openapi_fixture_crosscheck + T_web_contract.

## §8 Slice Plan (owners/stop-lines/oracles)
| S | Scope | Owner | Stop | Oracle |
|---|-------|-------|------|--------|
| S1 | F1 (+T_upgrade_006, named-constraint tests) | **Claude** | — (migration) | T_upgrade_006, T_mig_named_* |
| S2 | F2 (+F14) | DeepSeek | SL-2 (pure, strong oracle) | T_gen_* |
| S3 | F3 (+seed tests in F15) | **Claude** | — (DELETE data-safety) | T_seed_* |
| S4 | F4,F10,F11 | DeepSeek | SL-1 (config/compose) | Settings default test + compose lint |
| S5 | F5,F6 (+F16) | DeepSeek | SL-2 (typed contract, DB oracle) | T_impact_* |
| S6 | F7 (+F17) | DeepSeek | SL-2 (routes, strong oracle) | T_route_* + T_openapi_fixture_crosscheck |
| S7 | F8,F9,F18,F19 | **Claude** | — (contract+fixture authorship) | T_web_contract + tsc/eslint |
| S8 | F12,F13,F20 | **Claude** | — (shell/prose) | T_preflight_counts + evidence-docs guard |
Order: S1→S2→S3→(S4∥S5)→S6→S7→S8. One PR (PR-I); slices are internal checkpoints.

## §9 Risks/Rollback
Enriched-leak-when-off → gate flag default off + T_route_impact_null_when_off. Seed deletes
bystander → explicit RETIRED_CUSTOMERS + T_seed_keeps_non72_bystander. Count drift → generator+DB
CHECK+preflight. 007 breaks 006 volume → additive IF NOT EXISTS + T_upgrade_006. Ships default-off;
backout = unset flag, additive tables inert, impact shows 200 basic (honest), never the five.

## §10 Do-Not-Touch (delegate must not modify)
All test/contract/fixture files (F14–F19), `infra/db/007_*.sql` (S1), `scripts/seed_db.py` (S3),
`api/tests/test_demo_scenario.py`, `api/tests/test_topology_status.py` (must stay green), and any
file outside a delegate's handed F-row.

---

# Implementation record (g2-coding)

**Stop-line / delegation decision:** Claude implemented ALL slices (Phase 0e fallback). The
DeepSeek delegate requires sending this proprietary "may-become-production" POC to
api.deepseek.com and no external-egress authorization was given; 4/8 slices are never-delegate by
Q0 anyway (S1 migration, S3 data-deletion, S7 contract, S8 prose). No handoff ⇒ Phase 2c-ter
strict test→RED→implement→GREEN applied throughout. Generator (S2) was genuine RED (ImportError)
then GREEN; DB/route slices were RED via the shared session fixture (tables/routes absent) then
GREEN. Admin-merge authorized by the user (overrides the skill's --admin caution; repo has no
hosted CI).

**Slices (all Claude):** S1 migration 007 · S2 generator · S3 seed · S4 config/compose/env ·
S5 models+topology enrichment · S6 routes · S7 web contract+fixture · S8 preflight+docs.

**Gates (all run by Claude):**
- api: `pytest` **527 passed** (486 baseline + 41 new); 3× on the 5 affected files (72 each) — no
  flakiness; `ruff check` clean; `mypy app/` clean (the real gate; DREP §0 said `mypy .` but the
  baseline already carries 2 pre-existing `test_build_pipe_gis.py` no-any-return errors, so the
  team gate is `mypy app/`).
- web: `pnpm test` **601 passed** (+4 contract); `lint` clean; `typecheck` clean; `build` OK
  (GIS chunk isolation verified).
- preflight `bash -n` OK; `docker compose config -q` OK; evidence-docs guard 9/9 (new doc +
  runbook pass `test_no_real_customer_claim`).
- Wiring: every new export has a runtime caller (seed→generator; routes→topology fns; router
  already included; config read via app.state.settings); both new routes appear in /openapi.json.
- Diff audit: scope = exactly the plan's F-list; no mock/random/skip/xfail/ts-ignore; the only
  test removals are the stale 5-customer constants, replaced by stronger 200/80 + enriched checks.

**Notable deviations from the draft plan (all recorded in the Codex disposition):** readings are a
plain relational table not a hypertable (documented reason); enriched fields are "null when off"
(not absent) with TS `?: T|null` so existing constructors compile; generator `seed` kwarg dropped
from `build_map_ta_phut_profiles` (fully deterministic, no rng) — kept on `build_monthly_readings`;
demo.py needed no functional change (scenario engine is profile-agnostic; P-2's downstream is the
200-set via the seed). Generator test lives in `api/tests/` (testpaths=["tests"]) not `scripts/tests`.

---

# QCHECK (g2-qcheck) — loop-until-dry

Gates confirmed green before review (api 527 · web 601 · lint/type/build). Implementer = Claude
(all slices), so Tier 1 = Claude-family fresh-context agent, Tier 2 = Codex gpt-5.6-sol xhigh
(MANDATORY: migration + config/env + core contract triggers). Both tiers ran every round; findings
were disjoint each round (as expected).

## Round 1 — framing: contract-correctness

**Tier 1 (Opus, fresh context):** no CRITICAL/HIGH/MEDIUM. Verified wiring, fan-out-free enriched
SQL, breakdown-sums, null-when-off, cross-file constant consistency, non-vacuous tests, no
regressions (ran the generator + cross-checked the fixture). LOW: L1 stale "five customer ids"
comments; L2 stale web mock.

**Tier 2 (Codex):** disjoint set — 1 HIGH, several MEDIUM/LOW + vacuity findings.

Dispositions:
- **Codex HIGH R12/R14 (basic mode not profile-scoped → bystander 201):** REJECTED as HIGH,
  accepted as MEDIUM-documented. Evidence: `seed_db.py` is the sole writer of
  `customer_service_point`, deletes exactly the five, lands exactly 200 on the line; the `KEEP-9`
  bystander exists only in the upgrade test's throwaway container. Basic="all downstream service
  points" is the correct pre-PR-I item-2.4 semantics; the "201" is unreachable in a shipped run.
  → clarifying docstring added to `_collect_basic`; seeded count-200 invariant already pinned.
- **Period `2026-13` accepted:** FIXED — generator `_months_ending` validates month 1..12; DB
  CHECK tightened to `^[0-9]{4}-(0[1-9]|1[0-2])$`; + generator test + DB-reject test.
- **`seed=` kwarg absent on build_map_ta_phut_profiles:** REJECTED — fully deterministic (no rng),
  no caller passes it; documented draft-FN1 deviation.
- **DISTINCT ON vs LATERAL LIMIT 1:** REJECTED — equivalent, fan-out-free (both tiers verified).
- **R18 subset-only + zone `as` cast:** FIXED — Python cross-check now EXACT key equality for all
  response models; TS zone gets a compile-time structural shape check.
- **R21 preflight has no behavioral test:** DEFERRED (LOW) — shell assertion against the live
  stack, same coverage class as the existing hypertable/provenance preflight checks (Gate A2).
- **Vacuous tests (FIXED all):** monotonicity CHECK conjunct now tested; idempotency digest now
  covers every reading field + a profile digest; reproducibility pins the fixed 12 periods;
  exact latest-usage computed from the generator (not `>0`); all-200 assert ALL enriched fields;
  upgrade test now a true ledger-at-006 (applies ONLY 007); 12-reading fail-closed branch tested;
  profile-version decoy proves the predicate is applied.
- **L1 / L2 (Tier 1):** FIXED — comments + web mock updated to the 200-account MTP reality.

Re-run after fixes: api affected 78 passed (+6); ruff+mypy clean; web typecheck/lint clean;
mtpContract 4 + OperationsTwinScreen 16 green.

## Round 2 — framing: adversarial provenance / security / privacy

**Tier 1 (Opus):** DRY — nothing above LOW. Verified fail-closed gating runs before DB/settings
access (no param/path override), provenance markers on every served model, exhaustive PII scan,
full SQL parameterization, seed ownership. LOW: fixture values fabricated (flat 25) vs generator
(latest 20); idempotency-digest comment overstates delete-reinsert detection; the documented
OFF/ON count caveat (KEEP-9 planted on n1); `/gis/` prefix proximity.

**Tier 2 (Codex):** disjoint — 1 HIGH, 4 MEDIUM, 2 LOW.

Dispositions:
- **Codex HIGH (PII guards bypassable + doc overclaim):** FIXED. `_no_pii` was too narrow
  (accepted `SIM-MTP-MTR-081-234-5678`, hyphenated Thai national id, `13.7 N, 100.5 E`).
  Strengthened the phone/national-id/coordinate patterns (bare + separator forms); corrected the
  provenance doc's "can never be seeded even by mistake" overclaim to an accurate two-layer
  statement (generator+validator is the guarantee; CHECKs are prefix/marker tripwires); broadened
  the persisted-PII DB scan to area/branch with the strengthened patterns. Active-exploit severity
  was low (generator is the sole writer of clean data, both tiers verified) but the guarantee is
  now actually enforced. + generator tests: PII-after-marker rejected (phone/id/coord/email).
- **Codex MEDIUM (detail 12-reading ValueError → uncaught 500):** FIXED — route maps ValueError →
  controlled 503; `get_demo_customer_detail` adds a cross-row continuity check; + a monkeypatched
  route-503 test.
- **Codex LOW (`_months_ending` accepts `2026-1`/`10000-01`):** FIXED — strict `\d{4}-\d{2}` format;
  + parametrized malformed-month test.
- **Codex LOW (idempotency digest omits fields):** FIXED — digest now covers all profile fields +
  a service-point digest; comment softened (content-stability, not physical no-churn).
- **Tier 1 LOW fixture values:** FIXED — regenerated `mtp-contract.json` from the actual generator
  (SIM-MTP-00001 12 readings, latest 20; SIM-MTP-00200 latest 337).
- **Tier 1 LOW KEEP-9 on the line:** FIXED — moved to an off-line node in the upgrade fixture.
- **Codex MEDIUM (basic mode not profile-scoped):** REJECTED/documented — DUP test requires
  unscoped basic mode; seed produces only clean synthetic rows; already commented in `_collect_basic`.
- **Codex MEDIUM (retirement list not ownership proof):** REJECTED — `72-1-0000{1..5}` is the
  demo's own synthetic id namespace (the pre-PR-I seed's exact output); deleting them is correct.
- **Codex MEDIUM (IF NOT EXISTS can certify a constraint-free colliding schema):** REJECTED
  out-of-scope — the established idempotent-migration pattern across ALL of 001-006; a whole-system
  concern, not PR-I's. Noted for a potential future migration-hardening PR.
- **Codex LOW (trailing-slash 307; empty scenario_id defaults; /gis/ prefix):** REJECTED — no data
  leak (307 → 404), empty=unspecified is intentional, the path was plan-specified + self-labelled.

Re-gate after fixes: canonical data still validates + all bypasses/bad-months rejected (verified);
api affected 87 passed (+9); ruff+mypy clean; web typecheck/lint clean, full web 601 green.

## Round 3 — framing: merged-artifact / build / integration

**Tier 1 (Opus):** DRY — no CRITICAL/HIGH/MEDIUM. Verified BY EXECUTION: both PII regex sets
byte-identical + 0 false-positives on canonical data; periods satisfy both guards; fixture
byte-identical to generator output; broadened digest SQL valid on real Postgres; continuity never
raises on valid data; all cross-file constants agree; no regressions/unused imports; migration
wired into both start paths. LOW: no single source of truth for version/zone strings; three
PII-regex copies; fixture 2-of-200 sample; stale mock comment.

**Tier 2 (Codex):** no CRITICAL/HIGH; 3 MEDIUM + 3 LOW (disjoint).

Dispositions (all FIXED):
- **MEDIUM (fixture claims count:200 but has 2 customers; no `length==count` assert):** FIXED —
  regenerated `mtp-contract.json` as the FULL faithful 200-customer response from the generator
  (count==len==200, breakdown 140/35/25); added `customers.length===count` in the TS test and
  `len(customers)==count` in the Python route + cross-check tests.
- **MEDIUM ("15 subtypes" vs 17 actual pairs):** FIXED — the input plan's "15" was an arithmetic
  typo (4+6+7=17); the generator (17 pairs, sums to 200) is authoritative. Corrected the doc +
  coding log to 17; added `SUBTYPE_COUNT=17` + `len(SUBTYPE_ALLOCATION)==17` pin.
- **MEDIUM (`_months_ending` accepts `0000-01` → emits `-001-02` the DB rejects):** FIXED — reject
  year < 1; + `0000-01` test case.
- **LOW (persisted-PII omits pressure_zone_id/profile_version/node; 007 comment overclaims):**
  FIXED — scan every served field via the shared `find_pii`; corrected the migration comment to
  the accurate two-layer (tripwire vs generator-guarantee) statement.
- **LOW (continuity branch only tested via count/monkeypatch):** FIXED — added a real
  12-discontinuous-rows test that reverting the continuity guard would fail.
- **LOW (ruff on scripts/):** verified — `ruff check api scripts` is clean (project line-length 100;
  Codex's finding was a default-config artifact).
- **Tier 1 LOW (no single source of truth):** FIXED — added a test pinning
  `MTP_IMPACT_ZONE.scenario_id`/`zone_id` and `Settings().mtp_customer_profile` to the generator
  constants.
- **Tier 1 LOW (three PII-regex copies):** FIXED — deduped into the shared `PII_PATTERNS`/`find_pii`,
  imported by both test files.
- **Tier 1 LOW (stale mock comment):** FIXED.

Re-gate: generator sanity OK; api affected 91 passed (+4 net); ruff+mypy clean; web
typecheck/lint clean; mtpContract 4 + OperationsTwinScreen 16 green.

## Round 4 — framing: regression + completeness critic

**Tier 1 (Opus):** DRY — nothing above LOW. Verified BY EXECUTION: `find_pii` 0 false-positives
across all 200 profiles + 2,400 readings and rejects all crafted forms; fixture 0 mismatches vs
generator; exact key parity for all 7 schemas; every "Done" bullet realized+tested; all 5 deferred
dispositions re-confirmed. LOW: `_months_ending` year-guard cosmetically asymmetric; pre-existing
historical docs (DREP-PR7, SESSION-HANDOFF) say "five customers" (untouched, out of guard scope).

**Tier 2 (Codex):** no CRITICAL/HIGH; 5 MEDIUM + 2 LOW (disjoint).

Dispositions:
- **MEDIUM (PII blocklist can't catch arbitrary names — "สมชาย ใจดี", dotted phone, short coords):**
  FIXED — replaced the prefix/marker checks with an **allowlist** (`_check_synthetic_grammar`): every
  string field must match its exact synthetic shape (address regex, id regexes, fixed area/branch/
  meter-size/zone), so no arbitrary text passes. `find_pii` kept as a secondary net. + 3 bypass
  regressions (name/dotted-phone/short-coord). Corrected the 007 comment + doc to the allowlist
  guarantee.
- **MEDIUM (`MTP_CUSTOMER_PROFILE` accepts any string → silent-empty impact):** FIXED — added a
  `field_validator` rejecting any non-seeded profile → startup fail-closed; + a rejection test.
- **MEDIUM (production fresh-initdb path untested — explicit Done gate, re-opened):** FIXED — added
  `test_fresh_initdb_bundle_lands_200_2400` mounting the whole `infra/db` into initdb (runs 001..007
  in order) then seeding → 200/2400/zero-legacy.
- **MEDIUM (year underflow `0001-01`→`0000-02`):** FIXED — guard the produced earliest year >= 0001;
  + `0001-01` test case.
- **MEDIUM (vacuity: R4 FK / R5 hypertable / R16 / R19 / R20 untested):** FIXED — added
  FK-enforcement test, hypertable-catalog test (readings NOT a hypertable, telemetry IS), zone
  feature-count, compose-forwarding static test, and the 5531021/5531022 + device-seam disclosure
  test. R10 (validate-before-write fault injection) and R21 (live preflight) noted as
  disproportionate/Gate-A2 — the validator is tested + visibly called.
- **LOW (cross-check only member[0]):** FIXED — iterate ALL customers/readings/features.
- **LOW (runbook says customer-detail route is PR-J):** FIXED — it is PR-I backend (dark); only the
  UI is PR-J.

Re-gate: allowlist sanity (canonical passes, name/dotted-phone/short-coord/arbitrary rejected,
year-underflow rejected); api affected 101 passed (+10, incl. fresh-initdb own-container +
config-reject); ruff+mypy clean; web typecheck/lint/mtpContract green.

## Round 5 — framing: verify round-4 fixes + final adversarial sweep (CONVERGENCE)

**Tier 1 (Opus): DRY** — "Nothing above LOW. The loop has converged." Verified all four remediation
tranches BY EXECUTION: allowlist accepts all 200 canonical + rejects name/dotted-phone/short-coord/
arbitrary (confirmed `find_pii` genuinely misses them, so the allowlist is the real guarantee, and
the reject tests are non-vacuous); config default constructs + override raises, no over-reach;
fresh-initdb faithful; FK/hypertable/config-reject/R19/R20/iterate-all non-vacuous; fixture 0
mismatches vs generator; 31 generator tests pass; ruff+mypy clean.

**Tier 2 (Codex): DRY** — "Nothing remains above LOW. Round 5 is dry at the requested convergence
threshold." Same verification independently (44 non-DB tests + 217 fixture/OpenAPI shape comparisons
passed). No earlier rejected/deferred disposition gained evidence to reopen above LOW.

**Both tiers dry ⇒ loop converged.** Codex's LOW items — three applied as cheap hardening:
- allowlist `\d`→`[0-9]` (ASCII-only ids; Unicode-digit id now rejected);
- R20 test also asserts `V-9` + `SIMULATED` disclosure;
- `_months_ending` guards `count >= 1`.
LOW items left as-is (evidence-confirmed non-issues): `_no_pii` now redundant-but-harmless secondary
net; R19 static-grep is adequate; R10/R21 disproportionate/Gate-A2 (validator visibly called
pre-write; preflight is a live-stack assertion).

**QCHECK RESULT: PASS.** 5 rounds × 2 independent tiers (Opus Tier 1 + Codex gpt-5.6-sol xhigh
Tier 2), varied framings (contract → adversarial-provenance → merged-artifact → regression+
completeness → verify+sweep). Zero open CRITICAL/HIGH/MEDIUM. Two HIGHs found+fixed across the run
(PII-guard bypass in R2; the allowlist replacement in R4). Every finding dispositioned with a reason.
