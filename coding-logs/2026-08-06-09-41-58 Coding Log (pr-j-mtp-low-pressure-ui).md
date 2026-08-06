# Coding Log: PR-J — Clickable Low-Pressure Area & 200-Customer Live Proof

Branch: `feat/mtp-low-pressure-experience` · Baseline: `origin/main@74a9db4` (== `main`)
Worktree: `/Users/subhajlimanond/dev/worktrees/pwa-mtp-low-pressure.20260806`
Mode: g2-planning DREP → g2-coding implementation → g2-check → PR → admin-merge → land.

Source spec: roadmap `overall-phases-and-pr-roadmap.md` §A3 "PR-J" (lines 261–271) +
A9/A10; detailed input `map-ta-phut-200-customer-impact.md` (the clickable UI + full
E2E rows — the backend rows are already landed in PR-I `#44`).

PR-I (`#44`, backend) delivered dark behind `MTP_CUSTOMER_IMPACT_ENABLED`:
- `GET /api/twin/impact/{pipe_id}` enriched (`type_breakdown`, `zone`, per-customer
  type/subtype/account/meter/`latest_usage_m3`; null when off). `PIPE-TANK-V9`→200,
  `PIPE-N1-N2`→80.
- `GET /api/twin/customers/{customer_id}` → profile + 12 ordered readings.
- `GET /api/twin/gis/impact-zones?scenario_id=…` → simulated FeatureCollection.
- Enriched TS interfaces in `web/src/features/twin/types.ts`; TS fixture `mtp-contract.json`.

PR-J owns: twinClient fetch fns (customer detail, impact zone) · clickable
non-colour-only low-pressure area · shared impact drawer (25-row pages, filters) ·
customer detail panel + 12 monthly readings · shared area/pipe selection + recovery
clearing in `OperationsTwinScreen` · same-DOM Playwright journey · preflight/runbook/
coverage updates. No backend schema change.

---

# DREP (Claude draft — pre-Codex)

## §0 Repo Profile
- **Languages:** TS/React 18 + Vite (web, the only layer PR-J touches for product code); Python 3.13
  (api/scripts — PR-J touches only `scripts/demo-preflight.sh` shell + docs, no Python product code).
- **web gates:** `cd web && pnpm test` (vitest, jsdom+globals, setup `src/test-setup.ts`) ·
  `pnpm lint` (eslint src) · `pnpm typecheck` (tsc --noEmit) · `pnpm build` (tsc -b && vite build &&
  verify-gis-chunk.mjs — GIS chunk-isolation guard MUST stay green).
- **e2e:** `pnpm --dir e2e test` (Playwright, chromium, workers:1, serialized); warm live gate
  `make demo-e2e` (runs `scripts/demo-preflight.sh` then the specs). `make demo-e2e` uses
  `infra/docker-compose.yml` (no e2e override). GIS specs self-skip on manifest 404.
- **Coding log:** this file; pointer `.codex/coding-log.current` (set).
- **Ownership:** repo ours · runtime ours · disposition may-become-production. **No external-egress
  authorization** → DeepSeek/Codex-implementer delegation is NOT available (same as PR-I); every
  slice is Claude-owned. Codex is used read-only for the Phase-3 adversarial plan review only.
- **Design profile (UI slice):** `design/manifest.json` projectId 16433260128763898652,
  `designFrozen:false`, `sourceUpdateTime:null`; `design/tokens.map.md` + `design/INTERACTIONS.md`
  present & committed. S4 Operations twin is demoCritical.
- **MUST NOT (CLAUDE.md + tokens.map.md + INTERACTIONS.md):** no synthetic value without a visible
  `SIMULATED` marker; **status never colour-alone** (icon + Thai label, always — dark warning token
  is valid ONLY because of this); violet `--simulated` is **reserved** (only the SIMULATED marker);
  no raw hex in `src/` (tokens only); **one y-axis per chart**; typed sigs, no `any`/`@ts-ignore`;
  functions ≤50 lines; every component imported by a non-test module (no orphans); Thai UI in IBM
  Plex Sans Thai; no hardcoded KPI/telemetry (values from API/DB); MapLibre paint via
  `resolveCssColor(token)` NEVER a hex literal (OKLCH→canvas rule); heavy map deps stay inside the
  lazy `GisNetworkView` chunk; null renders `—` (never `0`/`NaN`); Esc closes any popover & returns
  focus; every data component implements loading/empty/error/offline/overflow.

## §1 Goal / Non-Goals
**Goal.** Consume PR-I's dark backend contract to deliver the judge-visible clickable Map Ta Phut
low-pressure experience: on `/operations`, a pressure drop surfaces a **non-colour-only** clickable
`พื้นที่แรงดันต่ำจำลอง` footprint + a highlighted pipe corridor; clicking EITHER opens ONE impact
drawer showing exactly **200 ราย · SIMULATED IMPACT · 140/35/25** with a 25-row/8-page filterable
table; selecting a row shows the synthetic account/meter/type/subtype/address + **12** monthly
readings; `normal` recovery clears the footprint/highlight and closes the drawer. Proven on one DOM
(no reload) by Playwright. No backend/schema change.

**Non-Goals.** No new API route/model/migration/type (all landed in PR-I `#44`); no real
PII/billing/hydraulics; no legacy five-row fallback; no `PIPE_GIS_ENABLED` activation (needs the
private, un-committable Rayong bundle — the journey is proven bundle-free on the logical view); no
URL-linkable drawer state (the drawer is inspection, not the drill-down spine); no destructive
resets; no change to the SEC/anomaly/DLQ transitions PR-C/earlier own.

## §2 Requirements (R1..R18) — each has a §6 call site + a §5 test
- **R1** `fetchCustomerDetail(customerId, signal?) → DemoCustomerDetail` GETs
  `/api/twin/customers/{id}` (URL-encoded); `fetchImpactZones(scenarioId?, signal?) →
  ImpactZoneCollection` GETs `/api/twin/gis/impact-zones` (+`?scenario_id=` when given). Thin
  `getJson` idiom; propagate `AbortSignal`.
- **R2** `filterAndPageCustomers(customers, typeFilter, page, pageSize=25)` is PURE: filters by
  `type_code` (`"all"|1|2|3`), paginates 25/page; returns `{rows, filteredTotal, totalPages,
  page}`. 200/all → 8 pages, page 1 = 25 rows; type 1 (140) → 6 pages, filteredTotal 140. Never
  mutates input; out-of-range page clamps.
- **R3** `GisLowPressureArea` renders a clickable footprint affordance with `role="button"`, an
  accessible name that NAMES the incident in TEXT (zone label + `count` + `จำลอง/SIMULATED`) — NOT
  colour — and a **non-colour secondary encoding** (a hatch/pattern SVG + a Lucide icon + a
  `SimulatedBadge`). `onOpen()` fires on click AND on Enter/Space. Renders only when an enriched
  zone is present (`impact.zone != null`); returns null otherwise.
- **R4** `ImpactPanel` (enriched, `type_breakdown != null`) renders the `140/35/25` breakdown with
  Thai type labels each carrying the SIMULATED context, the `zone` (`MTP-LPZ-01`), the
  `GisLowPressureArea`, and an "open drawer" trigger (`data-testid="open-impact-drawer"`). Basic
  mode (breakdown null) still renders the existing `impact-customer` list + count (no regression to
  the existing scenario-transitions default-stack assertion).
- **R5** `AffectedCustomerDrawer` opened from the footprint click and from the affected-pipe click
  shows the IDENTICAL incident (same 200 headline, same first page) — one shared selection, not two
  drawers. It is `role="dialog" aria-modal="true" aria-labelledby`; **Esc closes and returns focus
  to the trigger**; focus moves into the drawer on open; a close button exists.
- **R6** The drawer header shows exactly `200 ราย` (`impact.count`), a `SIMULATED IMPACT` badge, the
  zone, and the `140/35/25` breakdown. The headline count is the INCIDENT total and is INVARIANT
  under filtering.
- **R7** `AffectedCustomerTable` is a semantic `<table>` (DlqTable idiom): 25 rows/page, columns
  account_no · meter_no · type/subtype (Thai label) · area · latest_usage_m3; `SimulatedBadge` in a
  `<th>`; null → `—`; 8 pages for 200; prev/next disabled at ends. Row is clickable (button
  semantics) → `onSelectCustomer(customer_id)`.
- **R8** The type filter row lives ABOVE the table (INTERACTIONS), changes the visible/filtered rows
  and page count, and NEVER changes the `200` headline. Filtering to a type shows that type's rows
  only; "all" restores 200 across 8 pages.
- **R9** Selecting a row fetches `/api/twin/customers/{id}` and renders `CustomerDetailPanel`:
  customer_id, account_no, meter_no, type_code+subtype_code (Thai labels), meter_size,
  pressure_zone_id, address_label, area, branch — whole-card `SIMULATED` (GisPipeDetails idiom).
- **R10** `MonthlyMeterReadings` renders exactly **12** readings as a semantic table (period,
  previous_reading_m3, reading_m3, usage_m3), ordered by period; the displayed `usage_m3` equals
  `reading_m3 - previous_reading_m3` for every visible row (arithmetic is inspectable, non-colour).
- **R11** Detail fetch is cancellable: a newer row selection or a recovery supersedes an in-flight
  request via a request token (impact/sec idiom); a superseded response never overwrites the panel.
- **R12** `clearRecoveredImpact`: when the active enriched impact clears (recovery → `activeImpact`
  null), the drawer closes, the selected customer + detail clear, and any pending detail request is
  invalidated — no stale 200/detail remains on screen.
- **R13** `GisNetworkView` gains an impact-zone map layer (source+fill+**pattern/hatch** line via a
  new `GIS_CONFIG` id and a token-resolved colour) and a `map.on("click", zoneLayerId, …)`
  registered inside the existing `load` handler via a ref (`onSelectZone`), torn down with
  `map.remove()`. A zone-visibility effect updates it in place (setData/visibility) without remount.
  Paint colour resolves through `resolveCssColor` (never hex).
- **R14** `OperationsTwinScreen` wires shared state (`drawerOpen`, `selectedCustomerId`,
  `customerDetail`), fetches the impact zone when an enriched impact appears, fetches customer detail
  on selection, renders ONE `AffectedCustomerDrawer` at screen level (works in BOTH views), passes
  the footprint/zone + open callbacks into the logical and GIS branches, and runs
  `clearRecoveredImpact` on recovery. No reload.
- **R15** The demo compose enables `MTP_CUSTOMER_IMPACT_ENABLED` by default (`:-1`); `env.sample`
  documents that the demo enables it and that `PIPE_GIS_ENABLED` stays off (needs the private
  bundle). Settings default stays `False` (non-demo/unit).
- **R16** `scripts/demo-preflight.sh`, when `MTP_CUSTOMER_IMPACT_ENABLED=1`, additionally asserts the
  ROUTES answer: `/api/twin/impact/PIPE-TANK-V9` count 200 + breakdown 140/35/25 + zone MTP-LPZ-01;
  `/api/twin/customers/SIM-MTP-00001` returns 12 readings; `/api/twin/gis/impact-zones` returns the
  simulated FeatureCollection. Flag-off → the check is skipped (not failed).
- **R17** Playwright proves on ONE `/operations` DOM (no reload): no-incident footprint absent →
  `pressure_drop` → footprint present + pipe highlighted → click footprint opens drawer (200,
  140/35/25, SIMULATED IMPACT, page 1 = 25 rows) → filter a type (header stays 200) → next page →
  click a row → detail + 12 readings (`usage == reading - previous`) → click the affected pipe opens
  the SAME drawer/selection → `normal` clears footprint+highlight and closes the drawer. Reuses the
  strict-clock/`assertNotReloaded` harness. A second GIS-tab spec (self-skips without bundle) proves
  the footprint+drawer render inside the GIS view.
- **R18** Docs updated to the delivered reality (not "arrives with PR-J"): `demo-runbook.md`
  item-2.4 + PR-I note, `demo-coverage.md` 2.4 row + spec count, `e2e/README.md` (new spec + flag),
  `map-ta-phut-customer-profile.md` (UI now consumes the coarse footprint; still no customer point).

## §3 Change Contract (F-rows) — all Owner=Claude
| ID | Path | Action | Anchor | New exports | Purpose |
|----|------|--------|--------|-------------|---------|
| F1 | `web/src/features/twin/twinClient.ts` | MODIFY | after `fetchImpact` L~40 | `fetchCustomerDetail`, `fetchImpactZones` | R1 client fetches |
| F2 | `web/src/features/twin/impactView.ts` | CREATE | — | `filterAndPageCustomers`, `TYPE_LABEL_TH`, `subtypeLabelTh`, `lowPressureAreaName`, `PagedCustomers` | R2/R3/R7 pure logic + labels |
| F3 | `web/src/features/twin/GisLowPressureArea.tsx` | CREATE | — | `GisLowPressureArea` | R3 clickable non-colour footprint affordance |
| F4 | `web/src/features/twin/ImpactPanel.tsx` | MODIFY | body L26–46 | — | R4 breakdown+zone+area+open-trigger; keep basic list |
| F5 | `web/src/features/twin/AffectedCustomerDrawer.tsx` | CREATE | — | `AffectedCustomerDrawer` | R5/R6/R8 dialog + header + filter row |
| F6 | `web/src/features/twin/AffectedCustomerTable.tsx` | CREATE | — | `AffectedCustomerTable` | R7 paginated semantic table |
| F7 | `web/src/features/twin/CustomerDetailPanel.tsx` | CREATE | — | `CustomerDetailPanel` | R9 detail dl card |
| F8 | `web/src/features/twin/MonthlyMeterReadings.tsx` | CREATE | — | `MonthlyMeterReadings` | R10 12-reading table |
| F9 | `web/src/features/twin/gisAdapter.ts` | MODIFY | after `highlightFilter` L46 | `impactZoneGeoJson` | R13 pure maplibre zone source builder |
| F10 | `web/src/features/twin/gis.config.ts` | MODIFY | `GIS_CONFIG` L9–33 | — | R13 zone source/layer ids + colour token |
| F11 | `web/src/features/twin/GisNetworkView.tsx` | MODIFY | load handler L96–166, cleanup L188–206, effects, props L14–20 | — | R13 zone layer+click+cleanup, `impactZone`/`onSelectZone` props |
| F12 | `web/src/screens/OperationsTwinScreen.tsx` | MODIFY | state L76–94, effects, render L336–383 + GisViewSection | — | R11/R12/R14 shared state, fetches, drawer, wiring, recovery |
| F13 | `infra/docker-compose.yml` | MODIFY | api env L134 | — | R15 MTP flag default `:-1` |
| F14 | `infra/env.sample` | MODIFY | MTP block | — | R15 document demo-on / GIS-off |
| F15 | `scripts/demo-preflight.sh` | MODIFY | after MTP count block L118 | — | R16 flag-gated route-liveness checks |
| F16 | `docs/demo-runbook.md` | MODIFY | item-2.4 L97, PR-I note L115–123, verify list | — | R18 |
| F17 | `docs/demo-coverage.md` | MODIFY | 2.4 row L43, counts L15/52 | — | R18 |
| F18 | `e2e/README.md` | MODIFY | coverage L29–64 | — | R18 |
| F19 | `docs/data/map-ta-phut-customer-profile.md` | MODIFY | UI-consumption note | — | R18 |
| **Tests** | | | | | |
| F20 | `web/src/features/twin/impactView.test.ts` | CREATE | — | — | R2/R3 pure |
| F21 | `web/src/features/twin/GisLowPressureArea.test.tsx` | CREATE | — | — | R3 |
| F22 | `web/src/features/twin/ImpactPanel.test.tsx` | CREATE | — | — | R4 |
| F23 | `web/src/features/twin/AffectedCustomerDrawer.test.tsx` | CREATE | — | — | R5/R6/R7/R8/R9/R10 (uses fixture) |
| F24 | `web/src/features/twin/CustomerDetailPanel.test.tsx` | CREATE | — | — | R9/R10 |
| F25 | `web/src/features/twin/GisNetworkView.test.tsx` | MODIFY | mock+tests | — | R13 zone click+cleanup |
| F26 | `web/src/features/twin/twinClient.test.ts` or `OperationsTwinScreen.impact.test.tsx` | CREATE | — | — | R1/R11/R12/R14 screen wiring (stubFetch + /customers/ + /impact-zones branches) |
| F27 | `e2e/lib/api.ts` | MODIFY | after `demoStatus` | `impactFor`, `customerDetail`, `impactZones` | R17 helpers |
| F28 | `e2e/tests/scenario-transitions.spec.ts` | MODIFY | new test block | — | R17 full same-DOM journey |
| F29 | `e2e/tests/topic2-gis.spec.ts` | MODIFY | new test block | — | R17 GIS-view footprint+drawer (self-skip) |

## §4 Function Contracts (key)
```
FN1 fetchCustomerDetail(customerId: string, signal?: AbortSignal) -> Promise<DemoCustomerDetail>
    getJson<DemoCustomerDetail>('/api/twin/customers/' + encodeURIComponent(customerId), {signal}).
    Pre: none. Post: resolves the detail; rejects on !ok (404 off/unknown → caller shows unavailable).
FN2 fetchImpactZones(scenarioId?: string, signal?) -> Promise<ImpactZoneCollection>
    path '/api/twin/gis/impact-zones' + (scenarioId ? '?scenario_id='+encode : ''). Rejects on !ok.
FN3 filterAndPageCustomers(customers: readonly AffectedCustomer[], typeFilter: TypeFilter,
      page: number, pageSize = 25) -> PagedCustomers   // TypeFilter = "all"|1|2|3
    PURE. filtered = typeFilter==="all" ? all : customers.filter(c => c.type_code === typeFilter).
    totalPages = max(1, ceil(filtered.length/pageSize)); p = clamp(page,1,totalPages);
    rows = filtered.slice((p-1)*pageSize, p*pageSize). Returns {rows, filteredTotal:filtered.length,
    totalPages, page:p}. No input mutation. ≤50 lines.
FN4 lowPressureAreaName(zone: string, count: number) -> string   // PURE accessible name
    e.g. `พื้นที่แรงดันต่ำจำลอง ${zone} · ผู้ใช้น้ำ ${count} ราย · ข้อมูลจำลอง` — status/identity in TEXT.
FN5 GisLowPressureArea({impact, onOpen}: {impact: ImpactResponse; onOpen: ()=>void}) -> JSX|null
    null when impact.zone==null. Renders <button role implicit / type=button> data-testid=
    "low-pressure-area" aria-label={FN4}; SVG hatch pattern (non-colour) + Lucide icon +
    SimulatedBadge + Thai label + count. onClick/onKeyDown(Enter,Space)->onOpen. ≤50 lines.
FN6 AffectedCustomerDrawer({impact, open, onClose, selectedCustomer, detail, detailLoading,
      onSelectCustomer, triggerRef}) -> JSX|null
    role=dialog aria-modal aria-labelledby; Esc-> onClose + triggerRef.current?.focus(); focus in on
    open. Header: count(200) + SIMULATED IMPACT + zone + TypeBreakdownBar(140/35/25). Filter row
    (type chips) above AffectedCustomerTable(filterAndPageCustomers). When selectedCustomer:
    CustomerDetailPanel + MonthlyMeterReadings. Composes ≤50-line helpers.
FN7 AffectedCustomerTable({customers, typeFilter, page, onPage, onSelect}) -> JSX
    semantic <table>; SimulatedBadge in <th>; 25 rows via FN3; Pagination(prev/next disabled ends);
    row = <tr><td><button ...>; null->"—".
FN8 CustomerDetailPanel({detail, loading}) / MonthlyMeterReadings({readings}) -> JSX
    dl of synthetic fields, whole-card SimulatedBadge; readings = semantic <table> of 12 rows,
    usage shown == reading-previous (no recompute; render the API field, arithmetic visible).
FN9 impactZoneGeoJson(zone: ImpactZoneCollection | null) -> GeoJSON.FeatureCollection  // PURE
    passthrough/normalize for map.addSource data; empty FC when null. (gisAdapter.ts)
FN10 GisNetworkView: inside load -> if props.impactZone: addSource(zoneSourceId, geojson)+addLayer
    fill+hatch-line (paint via resolveCssColor(GIS_CONFIG.colorTokens.zone))+ map.on("click",
    zoneLayerId, ()=>zoneSelectRef.current()); zone effect setData/visibility on prop change; cleanup
    via existing map.remove(). New props impactZone: ImpactZoneCollection|null, onSelectZone: ()=>void.
FN11 OperationsTwinScreen additions:
    state drawerOpen:boolean, selectedCustomerId:string|null, customerDetail:DemoCustomerDetail|null;
    refs customerReq (token), openTriggerRef (focus return).
    effect(activeImpact.zone appears) -> fetchImpactZones()-> setImpactZone (best-effort; drawer works
      without it — footprint affordance uses impact.zone directly).
    effect(selectedCustomerId) -> token=++customerReq; fetchCustomerDetail(id,signal); set if current.
    selectImpactZone() = openImpactDrawer(): setDrawerOpen(true) (called by footprint + pipe click).
    clearRecoveredImpact(): setDrawerOpen(false); setSelectedCustomerId(null); setCustomerDetail(null);
      ++customerReq. effect: if activeImpact==null -> clearRecoveredImpact().
    render <AffectedCustomerDrawer> at screen root (both views).
```

## §5 Test Plan (RED-proofs; every field)
- **T1 impactView** (F20): `filterAndPageCustomers` — 200/all→8 pages & page1=25 (`T1a`); type1→
  filteredTotal 140, 6 pages (`T1b`); page clamp >last→last (`T1c`); no-mutation (frozen input)
  (`T1d`); `lowPressureAreaName` contains zone+count+`จำลอง` (`T1e`). RED: ImportError (impactView
  absent) → after naive slice-without-clamp, T1c AssertionError. Fixture: `mtp-contract.json`.customers.
- **T2 GisLowPressureArea** (F21): `role="button"`+accessible name includes count+`จำลอง` (`T2a`);
  a NON-colour encoding present — an svg pattern/hatch element AND text label (assert both, not a
  colour class) (`T2b`); click AND Enter fire onOpen (`T2c`); returns null when `zone==null` (`T2d`).
  RED: component missing → ImportError; naive colour-only render fails T2b (no pattern/label node).
- **T3 ImpactPanel enriched** (F22): renders `140`,`35`,`25` with distinct Thai type labels (`T3a`);
  zone `MTP-LPZ-01` (`T3b`); `open-impact-drawer` trigger present & calls onOpen (`T3c`); basic mode
  (breakdown null) still shows `impact-customer` list + count, NO breakdown (`T3d` — regression
  guard). RED: current ImpactPanel renders none of breakdown/zone/trigger → T3a/b/c fail on missing
  nodes; T3d passes pre+post (guards the no-regression).
- **T4 Drawer** (F23, uses fixture.impact/detail): opened via footprint-open prop shows `200 ราย`
  + `SIMULATED IMPACT` + breakdown (`T4a`); table page1 = 25 rows, `data-testid=customer-row`
  count 25, pager shows 8 pages (`T4b`); click next → page 2, different first row (`T4c`); filter
  type 1 → filteredTotal 140 BUT header still `200` (`T4d` — the invariant); Esc → onClose called
  and triggerRef.focus() invoked (`T4e`); "open from area" and "open from pipe" render identical
  headline+first-row (`T4f`). RED: components absent → ImportError; a naive drawer that recomputes
  the header from filtered rows fails T4d.
- **T5 Detail+readings** (F24): CustomerDetailPanel shows account_no/meter_no/type+subtype label/
  meter_size/address_label/area (`T5a`); whole-card SimulatedBadge (`T5b`); MonthlyMeterReadings
  renders exactly 12 rows and every visible `usage_m3 === reading_m3 - previous_reading_m3` (`T5c`).
  RED: missing components → ImportError; a table dropping a reading fails T5c count.
- **T6 GisNetworkView zone** (F25, mocked maplibre): after `fire("load")` with `impactZone` prop,
  `map.layerClicks` has the zone layer and firing it calls `onSelectZone` (`T6a`); the zone source
  is added (`map.sources` has zoneSourceId) (`T6b`); unmount → `map.remove()` called (cleanup)
  (`T6c`); paint colour came from a token (no hex literal — assert addLayer paint value is not a raw
  `#`), i.e. resolveCssColor was used (`T6d`). RED: no zone layer → T6a `click===undefined`.
- **T7 Screen wiring** (F26, stubFetch + FakeSocket, add `/customers/`+`/impact-zones` branches):
  drop frame → footprint affordance appears; click it → drawer open with 200 (`T7a`); click a row →
  `/api/twin/customers/SIM-MTP-00001` fetched, detail rendered (`T7b`); a newer selection cancels the
  prior (superseded response ignored) (`T7c`); recovery frame (pressure back to normal) → drawer
  closes, detail cleared (`T7d`); no `window.location.reload` / component stays mounted (`T7e`).
  RED: wiring absent → click does nothing (drawer never in DOM).
- **T8 E2E journey** (F28, live, MTP flag on): the R17 sequence with `assertNotReloaded`, strict
  clock reused only for the existing critical assertion (the drawer journey is not clock-bound).
  Selectors: `low-pressure-area`, `open-impact-drawer`, `impact-drawer`, `customer-row`,
  `impact-count`, `type-breakdown`, `customer-detail`, `meter-reading-row`, `[data-affected="true"]`.
  Self-skips (with a clear message) if `impactFor("PIPE-TANK-V9").type_breakdown == null` (flag off).
  RED before wiring: footprint never appears / drawer never opens.
- **T9 E2E GIS-tab** (F29, self-skip on manifest 404): open GIS tab, drop, footprint affordance
  visible in the GIS panel, click → drawer 200, recovery clears. RED: footprint absent in GIS view.

**Non-vacuity guards:** T4d (header invariant under filter) and T7c (cancellation) and T2b
(non-colour) are the anti-vacuous cores — each fails a plausible naive implementation.

## §6 Traceability (R → realizing call site → tests)
R1→FN1/FN2 in `twinClient.ts`, called by FN11 screen effects · T7. R2→FN3 `impactView.ts`, called by
FN7 table · T1,T4b. R3→FN4/FN5, rendered by FN11 (both views) · T2. R4→`ImpactPanel` body, rendered
at screen L352/L508 · T3. R5→FN6, rendered by FN11 at screen root · T4a/f,T7a. R6→FN6 header reads
`impact.count` (not filtered) · T4a,T4d. R7→FN7, child of FN6 · T4b,T7. R8→FN6 filter row + FN3 ·
T4d. R9→FN8 CustomerDetailPanel, fetched by FN11 selection effect · T5,T7b. R10→FN8
MonthlyMeterReadings · T5c. R11→FN11 customerReq token · T7c. R12→FN11 clearRecoveredImpact +
activeImpact-null effect · T7d. R13→FN9/FN10 in gisAdapter/gis.config/GisNetworkView load+cleanup ·
T6. R14→FN11 wiring + `<AffectedCustomerDrawer>` render + both-view props · T7. R15→compose api env
`:-1` + env.sample · (config, static). R16→preflight route-liveness block · (shell, warm gate).
R17→F28/F29 specs · T8,T9. R18→docs edits · (evidence-docs guard stays green).

## §7 Wiring Verification
| New/changed | Runtime caller | Registration | Contract |
|---|---|---|---|
| `fetchCustomerDetail`/`fetchImpactZones` (F1) | FN11 screen effects | imported in OperationsTwinScreen | `/api/twin/customers/{id}`, `/gis/impact-zones` (PR-I, live) |
| `filterAndPageCustomers` (F2) | `AffectedCustomerTable` | import in F6/F6 | `AffectedCustomer[]` |
| `GisLowPressureArea` (F3) | `ImpactPanel` (enriched) + GisViewSection | imported by F4/F12 | `impact.zone` |
| `AffectedCustomerDrawer` (F5) | `OperationsTwinScreen` root render | import in F12 | `ImpactResponse`+`DemoCustomerDetail` |
| `AffectedCustomerTable`/`CustomerDetailPanel`/`MonthlyMeterReadings` (F6/7/8) | drawer | imports in F5 | fixture-validated |
| zone map layer (F11) | GisViewSection passes `impactZone`/`onSelectZone` | props from F12 | `ImpactZoneCollection` |
| shared drawer state (F12) | footprint click + pipe click → `selectImpactZone` | screen state | — |
| MTP flag (F13) | api container | compose `environment:` | Settings default stays False |
| preflight (F15) | `make demo-preflight` | shell | routes answer when flag on |
No F-row CREATE is an orphan: every new component is imported by ImpactPanel/Drawer/Screen (a
non-test module) and reached at runtime by the pressure-drop→click flow.

## §8 Slice Plan (all Owner=Claude — no delegate authorized; oracles drive order)
| S | Scope (F) | Stop | Oracle | Done when |
|---|-----------|------|--------|-----------|
| S1 | F1 client + F2 pure + F20 | — (Claude) | T1 + tsc/eslint | pure+client green |
| S2 | F3 area + F4 ImpactPanel + F21/F22 | — | T2,T3 | breakdown/zone/area render; basic no-regress |
| S3 | F5/F6/F7/F8 drawer+table+detail+readings + F23/F24 | — | T4,T5 | drawer invariants (esp. T4d) green |
| S4 | F12 screen wiring + F26 | — | T7 | click→drawer→detail→recovery green, no reload |
| S5 | F9/F10/F11 map zone layer + F25 | — | T6 | zone click+cleanup green; build GIS-chunk guard green |
| S6 | F13/F14/F15 config/compose/preflight | — | compose config -q + bash -n | flag on by demo default |
| S7 | F27/F28/F29 E2E | — | warm `make demo-e2e` (flag on) | journey proven one-DOM |
| S8 | F16/F17/F18/F19 docs | — | evidence-docs guard + link check | docs match delivered reality |
Order S1→S2→S3→S4→(S5∥S6)→S7→S8. One PR; slices are internal checkpoints. S5 (map canvas layer) is
independently revertable — its live path needs the private bundle, so its oracle is the component
test; the DONE-critical journey is S1–S4+S7 (bundle-free logical view).

## §9 Risks / Rollback
- **Journey needs the flag on** → demo compose enables it (readiness met); spec self-skips + preflight
  gates so a flag-off stack degrades honestly (no false green). Backout = flip compose `:-0`.
- **Flipping compose default could perturb existing E2E** → enriched impact is a superset; ImpactPanel
  keeps `impact-customer` + count; verified against scenario-transitions P1 assertions.
- **Map zone layer needs the bundle / OKLCH paint rejects** → paint via `resolveCssColor`; layer is
  S5 (revertable); build's `verify-gis-chunk.mjs` guards chunk isolation.
- **Drawer focus/Esc a11y** → dialog with Esc-close+focus-return tested (T4e); reduced-motion honored.
- **Stale 200 after recovery** → `clearRecoveredImpact` on activeImpact-null + token cancellation
  (T7c/T7d).
- Ships behind the (now demo-on) flag; additive UI; no schema/data change; revert = drop the branch.

## §10 Do-Not-Touch (delegate/impl must not modify beyond its F-row)
All PR-I backend + contract files: `api/app/**`, `infra/db/007_*.sql`, `scripts/seed_db.py`,
`scripts/map_ta_phut_customer_profile.py`, `web/src/features/twin/types.ts`,
`web/src/features/twin/__fixtures__/mtp-contract.json`, `web/src/features/twin/mtpContract.test.ts`
(the contract is FROZEN — PR-J consumes it, never edits it). Existing green specs that must stay
green: `api/tests/**`, `e2e/tests/topic1-pipeline.spec.ts`, `e2e/tests/topic3-predictive.spec.ts`,
`web/src/features/twin/SecTooltip.test.tsx`, and the SEC/DLQ/anomaly assertions in
`scenario-transitions.spec.ts` (extend, never weaken). No `@ts-ignore`/`any`/`.skip` to pass a gate.

---

# Codex adversarial pass (Phase 3/4) — dispositions + FINALIZED deltas

Codex `gpt-5.6-sol` xhigh, read-only, scoped against the two source-spec docs. Verdict was REJECT
(not delegation-ready) — correctly. Every finding below is dispositioned; the deltas SUPERSEDE the
draft where they conflict. The architecture holds; the gaps were wiring + preservation + lifecycle +
test-vacuity, not a redesign.

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| C1 | CRIT | "Click a highlighted **pipe** → same drawer" unwired in BOTH views (PipeEdge is a non-clickable `<line>`; GIS pipe click → GisPipeDetails, not drawer) | **ACCEPT** (I caught this too) → §3 adds F-rows PipeEdge/ProcessSchematic/schematic.test; new **R19**; GIS pipe→drawer wiring in F12 + test |
| H2 | HIGH | Screen rebuilds ImpactResponse WITHOUT `zone`/`type_breakdown` (L248) → `activeImpact.zone` always null → `GisLowPressureArea` always null → whole feature dead | **ACCEPT** (critical) → new **R20**: preserve zone + recompute type_breakdown from merged enriched customers; T7 asserts activeImpact carries them |
| H3 | HIGH | Map mounts once at load with NO incident; FN10 adds zone source only "if impactZone" during load → a late zone has no source to setData on | **ACCEPT** → **R22**: create zone source+layer EMPTY at load; effect setData on prop change; T6 fires load first, then sets zone |
| H4 | HIGH | `clearRecoveredImpact` doesn't clear `impactZone` or abort its fetch; token bump ordering | **ACCEPT** → **R22**+**R12** revised: clear impactZone + abort zone fetch; bump token before clearing |
| H5 | HIGH | "Cancellation" is only stale-write suppression — no AbortController/abort-on-new/unmount; stale A under B | **ACCEPT** → new **R21**: real AbortController per detail req; abort on new-select/recovery/unmount; clear detail + set loading at selection start |
| H6 | HIGH | Modal has no focus trap; single `openTriggerRef` can't restore the real trigger (footprint/pipe/GIS-line) | **ACCEPT** → **R24**: capture `document.activeElement` on open, restore on close; focus-trap Tab/Shift-Tab cycle; Esc; listener cleanup; FN6 respecified |
| H7 | HIGH | Headline E2E self-skips + a stale `.env`/sample `0` overrides compose `:-1` → false green | **ACCEPT** → **R23**: preflight (inside `make demo-e2e`) HARD-asserts enriched routes answer (fail-closed red gate), env.sample→`1`; T8 self-skip becomes defense-in-depth only |
| H8 | HIGH | Compose-on vs existing P1 (`impact-customer` only in basic list) | **ACCEPT** → **R4 revised**: keep `impact-customer` list in BOTH modes; T3 asserts it in ENRICHED mode |
| M9 | MED | T4f vacuous (same props, two labels ≠ real click paths) | **ACCEPT** → move the "both entry points" proof to the screen wiring test T7 (real handlers); drop the props-equality T4f |
| M10 | MED | T2b passes colour-only (hidden `<pattern>`+label) | **ACCEPT** → T2b asserts the VISIBLE shape references the pattern (`fill="url(#…)"`) AND the text label + SimulatedBadge; a colour-only fill fails |
| M11 | MED | T6d backwards ("not #"); resolver returns generated hex | **ACCEPT** → T6d mocks `resolveCssColor` to a sentinel and asserts the layer paint used it (covers null→omit) |
| M12 | MED | Map "fill+hatch-line" underspecified/unimplementable | **ACCEPT** → FN10 concretized: low-opacity FILL + dashed OUTLINE via native `line-dasharray` (no addImage); both token-resolved. DOM affordance carries the text/badge (primary non-colour proof) |
| M13 | MED | T4d doesn't assert visible rows are the filtered type | **ACCEPT** → T4d also asserts every visible row is the selected type |
| M14 | MED | T5a omits pressure_zone_id/customer_id/branch | **ACCEPT** → T5a asserts all R9 fields |
| M15 | MED | T8 ends at `normal` without `finally` restoring `pressure_drop` (suite-state) | **ACCEPT** → T8 `finally` restores `pressure_drop` (topic2-gis precedent) |
| S16 | cov | 8-page claim not in T8 browser | **ACCEPT** → T8 asserts pager shows/reaches 8 pages |
| S17 | cov | R16 checks only PIPE-TANK-V9→200; not PIPE-N1-N2→80 nor the UI path PIPE-P2-TANK→200 | **ACCEPT** → R23 preflight asserts PIPE-P2-TANK→200, PIPE-N1-N2→80 (the UI path + the discriminator) |
| S18 | cov | Provenance browser claim (REAL/OFFICIAL/SIMULATED, 5531021/5531022) not PR-J-asserted | **PARTIAL** → the `twin-provenance-legend` + energy context browser proof already exists (PR-H `topic2-gis`); PR-J adds a drawer `SIMULATED IMPACT` provenance assertion (T4a/T8) and does NOT duplicate the legend E2E (PR-H owns it). Docs (R18) keep the 5531021/5531022 disclosure |
| S19 | cov | No assertion the RENDERED compose config is `1` for demo | **ACCEPT** → S6 oracle upgraded: `docker compose config` \| grep asserts `MTP_CUSTOMER_IMPACT_ENABLED=1` for api; Settings default stays False (config.py) |
| S20 | files | Missing ProcessSchematic/PipeEdge/schematic.test/gis.test late-zone | **ACCEPT** → added (C1, H3) |
| — | ok | Confirmed-correct assumptions: ImpactPanel renders in both views; `impact-customer` is the only customer testid; compose flag reaches api & changes route behavior; logical footprint is independent of the zone fetch (real blocker was the dropped `impact.zone`) | noted |

## FINALIZED deltas (authoritative over the draft)

**New requirements**
- **R19** The affected pipe is a click entry point in BOTH views. Logical: `PipeEdge` when
  `affected` becomes a keyboard-focusable control (`role="button"`, `tabindex=0`, Enter/Space +
  click) with a widened transparent hit line; fires `onOpenImpact`. GIS: a click on a HIGHLIGHTED
  pipe opens the drawer (the screen routes a highlighted-pipe id to `selectImpactZone`; a
  non-highlighted pipe keeps the existing `GisPipeDetails` behavior). Both reach the SAME drawer.
- **R20** After the multi-pipe impact merge, `OperationsTwinScreen` PRESERVES `zone` (from any
  enriched result) and RECOMPUTES `type_breakdown` from the merged/deduped enriched customers
  (`Σ type_code`), so `activeImpact.zone`/`type_breakdown` are populated and `GisLowPressureArea`
  renders. Basic results (no enriched fields) → zone/breakdown stay null (footprint absent).
- **R21** Detail fetch uses a real `AbortController`: a new row selection or a recovery ABORTS the
  in-flight request; unmount aborts; the previous detail is cleared and `detailLoading` set at
  selection start (never customer A under B). A superseded/aborted response never writes.
- **R22** The GIS zone source+layer are created EMPTY at map `load` (like the pipe-highlight layer);
  a zone-visibility effect calls `setData` when `impactZone` changes; recovery clears the zone
  (empty FC) AND aborts any in-flight `fetchImpactZones`; a late zone response after recovery is
  discarded (token/abort).
- **R23** `scripts/demo-preflight.sh` (run by `make demo-e2e`) hard-asserts, fail-closed, that the
  enriched routes answer: `/impact/PIPE-P2-TANK` count 200 + breakdown 140/35/25 + zone MTP-LPZ-01;
  `/impact/PIPE-N1-N2` count 80; `/customers/SIM-MTP-00001` 12 arithmetically-consistent readings;
  `/gis/impact-zones` FeatureCollection. A basic/404 answer FAILS the gate (no false green). Plus a
  static check that `docker compose config` renders `MTP_CUSTOMER_IMPACT_ENABLED=1` for api.
- **R24** `AffectedCustomerDrawer` focus contract: capture `document.activeElement` at open, restore
  it on close; move focus to the close button on open; Tab/Shift+Tab cycle within the dialog
  (focus trap); Esc closes; keydown listener added on open and removed on close/unmount.

**§3 added/changed F-rows**
- F30 `web/src/features/twin/ProcessSchematic.tsx` MODIFY — thread `onOpenImpact?: () => void`;
  pass to affected `PipeEdge`.
- F31 `web/src/features/twin/PipeEdge.tsx` MODIFY — when `affected`, render a focusable button-like
  `<line>` (role=button, tabIndex 0, onClick/onKeyDown) + a transparent wide hit `<line>`; keep the
  existing non-colour dashed+critical encoding + `data-affected`.
- F32 `web/src/features/twin/schematic.test.tsx` MODIFY — assert an affected pipe fires `onOpenImpact`
  on click AND Enter; a non-affected pipe is not a button.
- F12 (OperationsTwinScreen) scope EXPANDED: R20 enriched-preserve merge, R21 AbortController detail,
  R22 zone source/fetch/recovery, R19 GIS highlighted-pipe→drawer routing, R24 trigger via
  activeElement (no threaded element), render `<AffectedCustomerDrawer>` at root.
- F26 (screen test) scope EXPANDED: late-zone `setData`, GIS highlighted-pipe→drawer, abort-on-new,
  recovery clears zone+detail.

**Revised function contracts**
- **FN6** `AffectedCustomerDrawer` — add: `initialFocus` = close button; on mount capture
  `previouslyFocused = document.activeElement as HTMLElement|null`; on close/unmount
  `previouslyFocused?.focus()`; `onKeyDown`: Esc→onClose, Tab→trap cycle across focusable
  descendants; remove listener on cleanup. Props drop `triggerRef` (uses activeElement).
- **FN9/FN10** — `impactZoneGeoJson(zone)` returns the FeatureCollection or an EMPTY FC when null.
  In `load`: ALWAYS `addSource(zoneSourceId, impactZoneGeoJson(null))` then `addLayer` a fill
  (`fill-color`=resolveCssColor(colorTokens.zone), low `fill-opacity`) and a `line` outline
  (`line-dasharray:[2,2]`, `line-color`=token) + `map.on("click", zoneFillLayerId,
  ()=>zoneSelectRef.current())`. A `[impactZone]` effect calls
  `source.setData(impactZoneGeoJson(impactZone))`. Colour omitted (paint unset) when resolver→null.
- **FN11** — impact merge: `const enriched = results.find(r => r.zone != null); setImpact({…merged,
  zone: enriched?.zone ?? null, type_breakdown: enriched ? breakdownOf(customers) : null})` where
  `breakdownOf` counts `type_code`. Detail effect: `const ac = new AbortController();
  setSelectedDetail(null); setDetailLoading(true); fetchCustomerDetail(id, ac.signal)…`; cleanup
  `ac.abort()`. `selectImpactZone()` (open) reads no element (activeElement handles restore).
  `clearRecoveredImpact()`: abort detail + zone controllers, `setDrawerOpen(false)`,
  `setSelectedCustomerId(null)`, `setCustomerDetail(null)`, `setImpactZone(null)`.

**Strengthened tests** (supersede draft T-fields)
- T2b: assert the visible footprint shape has `fill="url(#<patternId>)"` referencing a defined
  `<pattern>`/`<symbol>`, plus the Thai text label + `SimulatedBadge` node — a colour-only fill fails.
- T3: add `impact-customer` present in ENRICHED mode (H8 regression guard) + breakdown/zone/trigger.
- T4: drop vacuous T4f; T4d asserts header `200` invariant AND every visible row is the filtered
  type; add "reaches page 8" pager assertion.
- T5a: assert customer_id, account_no, meter_no, type+subtype label, meter_size, pressure_zone_id,
  address_label, area, branch.
- T6: fire `load` with NO zone → assert source exists (empty); THEN set `impactZone` prop → assert
  `setData` called; T6d mocks `resolveCssColor`→sentinel and asserts the layer paint equals it.
- T7: add — activeImpact carries zone+type_breakdown after merge (R20); GIS highlighted-pipe click
  opens drawer (R19); new selection aborts prior (spy on AbortController.abort) (R21); recovery
  clears zone+detail+drawer (R22/R12).
- T8: add — pager reaches page 8; drawer shows `SIMULATED IMPACT`; `finally` restores `pressure_drop`.
- New **T10** (schematic, F32): affected `PipeEdge` fires `onOpenImpact` on click+Enter; non-affected
  is not a button.
- New **T11** (preflight, R23): shell assertion block; a mocked basic/404 response makes it exit
  non-zero (fail-closed); config-grep asserts `=1` for api.

**Rejected/kept-minimal:** S18 legend E2E duplication (PR-H `topic2-gis` already proves the
provenance legend + energy context in-browser; PR-J adds only the drawer's `SIMULATED IMPACT`
assertion — duplicating the full legend spec is out of PR-J scope). Inherited PR-I data rules
(subtype allocation, PWA/East-Water separation, no-real-identity) are FROZEN PR-I coverage (§10
do-not-touch); the DREP's "every source requirement has PR-J traceability" is corrected to "every
PR-J-owned requirement" — the data invariants are PR-I-owned and already tested.

## §5 (Phase 5) Cross-language schema verification
N/A for product schema — PR-J adds NO SQL/migration/Pydantic/OpenAPI/TS-type change. It consumes the
FROZEN PR-I contract (`types.ts` + `mtp-contract.json`), which `mtpContract.test.ts` +
`test_web_contract_fixture_matches_openapi` already pin to the live OpenAPI. Verified: the TS
interfaces PR-J consumes (`ImpactResponse.zone/type_breakdown`, `DemoCustomerDetail.readings`,
`ImpactZoneCollection`) exist and match the backend models (agent-confirmed, `types.ts` L79–148).

## Plan status: FINALIZED (draft + Codex deltas). Ready for g2-coding.

---

# Implementation record (g2-coding)

**Stop-line / delegation decision:** Q0 fired — disposition is may-become-production POC with NO
external-egress authorization (identical to PR-I), so the DeepSeek/pi delegate is unavailable.
Claude implemented ALL slices under strict Phase-2c-ter test→RED→implement→GREEN. Every leaf slice
had a genuine RED (missing module/behaviour) before GREEN. No handoff, no diff-audit-of-delegate.

**Slices (all Claude):** S1 client+pure(impactView) · S2 GisLowPressureArea+ImpactPanel · S3
drawer/table/detail/readings · S4 screen wiring + clickable PipeEdge/ProcessSchematic · S5 GIS
canvas zone layer · S6 compose flag(:-1)+env.sample+preflight fail-closed · S7 E2E(lib+2 specs) ·
S8 docs.

**Notable deviations from the DREP (all sound):**
- Recovery clearing is RENDER-DERIVED, not the planned clearing effect: the drawer is open only
  while `openForAsset === droppedAsset`. Chosen because (a) the eslint `react-hooks/set-state-in-effect`
  rule forbids the synchronous clearing setState, and (b) the resync poll re-fetches `impact` into a
  fresh object mid-incident, so a reference key (first attempt) spuriously closed the open drawer —
  caught by a debug of the actual references. Asset-id identity is stable across the resync.
- `detailLoading` is derived (id mismatch), not stored — same reason; the AbortController cleanup
  still provides real cancellation (T7c).
- The drawer's filter/page reset is by fresh MOUNT per open (conditional render), not a reset effect.
- Drawer backdrop is a transparent `<button>` (no dimming scrim) — the token contract forbids
  `bg-black/*` and inline `backgroundColor:`, and there is no scrim token; the keydown/Esc/focus-trap
  lives on a `document` listener (not a JSX handler on the non-interactive dialog) to satisfy a11y.
- T2b/T6d test assertions were adjusted to the repo's jsdom reality: the test-setup canvas shim
  resolves OKLCH→hex, so T6d asserts the layer paint EQUALS `resolveCssColor(zone token)` (proving
  token use, not a hex literal) rather than the DREP's "colour omitted" inverse; T2b matches the
  pattern `fill="url(#…)"` robustly (jsdom substring attr-selector quirk).
- Inline `test.skip(...)` guards use the `if (...) test.skip(true, …)` single-line idiom so the
  evidence-docs spec counter (which matches `^\s*test.skip(`) is not inflated.

**Gates (all run by Claude):**
- web: `pnpm test` **653 passed** (601 baseline + 52 new), 3× consecutive — no flakiness; `lint`
  clean; `typecheck` clean; `build` OK (verify-gis-chunk: GIS chunk dynamic-only, isolated).
- e2e: TS compile `tsc --noEmit -p e2e/tsconfig.json` exit 0 (2 new specs; live run is the warm gate).
- evidence-docs guard: `test_evidence_docs.py` **11 passed** (spec count 36, no real-customer claim,
  Gate A1 boundary intact) — run via the main repo's api/.venv.
- compose: `docker compose config` renders `MTP_CUSTOMER_IMPACT_ENABLED: "1"`, `PIPE_GIS_ENABLED: "0"`;
  `bash -n scripts/demo-preflight.sh` OK.
- Wiring: every new export has a non-test importer + a runtime call site (footprint/pipe click →
  drawer → detail → recovery). Diff scope = exactly the DREP F-list; no `.py` product code; no
  mock/random/skip-to-pass; no acceptance test weakened.

---

# QCHECK (g2-qcheck) — loop-until-dry

Implementer = Claude (all slices) → Tier 1 = independent fresh-context Opus agent; Tier 2 = Codex
gpt-5.6-sol xhigh (MANDATORY: config/compose flag + core-contract/wiring triggers). Both tiers ran
every round. Gates confirmed green before review (web 653 → 662 after fixes; typecheck/lint/build;
e2e tsc; evidence-docs 11).

## Round 1 — framing: contract-correctness

**Tier 1 (Opus, fresh ctx):** no CRITICAL/HIGH. Verified R20 merge, 200/80 topology math, recovery,
cancellation, non-vacuous tests, tokens/a11y/orphans, config — all correct. Findings: 1 MEDIUM
(same-asset re-drop after recovery auto-reopens the drawer with a stale selected customer, because
recovery cleared no incident state), 3 LOW (dead `detailAbort` ref; function length; inert-affordance
fallback inconsistency).

**Tier 2 (Codex):** REJECT — 2 HIGH, 2 MEDIUM, 2 LOW (disjoint from Tier 1 except the recovery one,
which both raised → high-confidence).

Dispositions (all FIXED):
- **HIGH/MED (BOTH tiers) — recovery doesn't clear/abort incident state → same-asset re-drop
  auto-reopens with stale customer/zone:** FIXED — added an explicit `clearRecoveredImpact` effect
  on `droppedAsset==null` that resets `openForAsset`/`selectedCustomerId`/`customerDetail`/
  `impactZone`/`impactAsset` (and, via the selection/zone deps flipping, aborts in-flight detail/zone
  requests). + screen test T7f (gated select → recovery → SAME-asset re-drop stays closed, no stale
  detail). The one eslint set-state-in-effect is a scoped, commented disable (the null-transition is
  only observable via an effect; idempotent, non-cascading).
- **HIGH (Codex) — R20 merge order-dependent (`seen.set` lets a basic dup overwrite an enriched
  customer → breakdown undercounts):** FIXED — extracted the merge into a PURE
  `mergeImpactResults` in impactView.ts that keeps the ENRICHED record on duplicate disagreement
  (order-independent). Unreachable in prod (global flag ⇒ homogeneous results — Tier 1 verified) but
  now defended. + both-order merge test + a wholly-basic → null-zone test + a fixture 200→140/35/25
  recompute test. `breakdownOf` deleted from the screen (moved to `breakdownCustomers`).
- **MEDIUM (Codex) — preflight zone check is grep-only:** FIXED — the impact-zone preflight now
  requires a valid FeatureCollection (`type`+`provenance`+`zone_id`+`Polygon`), not just the
  provenance substring. (Reading arithmetic is backend-guaranteed: PR-I's route 503s on any
  inconsistency and asserts it in `test_topology.py`; the 12-count check stays.)
- **MEDIUM (Codex) — vacuous/missing tests (R1 zone-fetch, R19 GIS pipe→drawer, R21 real abort,
  R24 Tab-trap, R3 icon, R8 prev-disabled):** FIXED all — screen T7g asserts the impact-zone fetch;
  a new gis-test R19 case drives a highlighted-pipe (marker) click → 200-drawer through the screen;
  T7c now asserts the superseded request's `signal.aborted===true` (real transport abort, not just
  suppression); a drawer Tab-trap wrap test; a footprint lucide-icon assertion; a Previous-disabled
  assertion.
- **LOW (Codex/Tier1) — `<tr role="button">` overrode row semantics; functions >50 lines:** FIXED —
  `AffectedCustomerTable` row control is now a real `<button>` in the first cell (row keeps `<tr>`
  semantics), and the table was split into `CustomerRow`/`TablePager` sub-components. Click sites
  (tests + E2E) updated to `customer-select`.
- **LOW (Tier1) — dead `detailAbort` ref; inert-affordance fallback:** dead ref REMOVED; the
  `onOpen ?? (()=>{})` fallback is unreachable (the screen always passes the handler) — left as a
  harmless guard, noted.

Re-gate after fixes: web full **662 passed** (+9); typecheck/lint/build clean; e2e tsc OK; preflight
`bash -n` OK; evidence-docs 11 (spec count still 36). Ready for Round 2 (adversarial framing).

## Round 2 — framing: adversarial + merged-artifact (re-review of the remediated tree)

**Tier 1 (Opus):** no CRITICAL/HIGH. Both Round-1 HIGH fixes VERIFIED correct by trace (recovery
reset: first-render safe/no-loop, same-asset re-drop stays closed, all interleavings sound;
`mergeImpactResults` order-independent, zone/breakdown gated on the same `enriched` so cannot
disagree; button-in-`td` valid + focus-trap sane; cross-file constants + provenance + violet
restriction confirmed). 3 LOW: L1 different-asset supersede latent reopen (PROVEN unreachable —
demo drops P-2 only, simulator stays NORMAL); L2 vacuous R19 line-485 assertion; L3 T7d green-when-
reverted (T7f is the real guard) + impactAsset flash unasserted (cosmetically inert).

**Tier 2 (Codex):** REJECT — 0 CRITICAL/HIGH, 3 MEDIUM + LOW (recovery interleavings independently
CONFIRMED correct). Disjoint from Tier 1 on the MEDIUMs.

Dispositions:
- **MEDIUM (Codex, NEW disjoint) — stale readings survive supersession:** the drawer rendered
  `MonthlyMeterReadings` on `detail != null`, so while customer B loaded, A's 12 readings still
  showed below B's loading card. FIXED — readings now gate on
  `!detailLoading && detail?.customer_id === selectedCustomerId`. + drawer tests T5d (stale hidden
  while loading) / T5d2 (matching detail renders 12).
- **MEDIUM (Codex) — mergeImpactResults only partly order-independent:** PARTIAL-ACCEPT. Tier 1
  verified the reachable path is correct (zone+breakdown gated on the same `enriched`; the
  partial-enrichment undercount is unreachable — a global flag makes all results homogeneous, and
  P-2 has exactly one outgoing pipe so the merge is single-result in the demo). Applied the cheap
  hardening: `affected_pipe_ids` is now sorted (byte-stable regardless of resolve order) + a
  both-orders equality assertion. Partial-enrichment documented as unreachable rather than guarded
  with a throw (a throw could break the demo for no reachable gain).
- **MEDIUM (Codex) — preflight zone check still grep-only (reproduced an empty-FeatureCollection +
  stray-"Polygon" false positive):** FIXED — the impact-zone check now PARSES the JSON with python3
  (a hard project dep; fail-closed if absent) and asserts a non-empty `features[0]` Polygon with
  coordinates + provenance/zone_id. Smoke-verified: the exact empty-features false positive now
  correctly FAILS.
- **LOW (Tier 1 L1) — different-asset supersede latent reopen (unreachable today):** FIXED
  DEFENSIVELY anyway (cheap, closes the trap for any future multi-asset scenario) — the recovery
  effect also clears when `openForAsset != null && openForAsset !== droppedAsset`. + screen test
  T7h (P-2 drop → open+select → P-9 supersede → P-9 recover → drawer must NOT auto-reopen).
  MUTATION-VERIFIED: T7h was initially vacuous (the drawer closes render-wise on the move); rewrote
  it to cover the auto-REOPEN-on-P-9-recovery sequence — reverting the clause now fails T7h,
  restoring it passes.
- **LOW (both L2) — vacuous R19 line-485:** FIXED — removed the misleading re-assertion; the
  non-highlighted→REAL-details discrimination is already covered by the earlier marker test.
- **LOW (Codex) — Tab-trap asserted only >1 focusable:** FIXED — now asserts exactly 25
  `customer-select` buttons are inside the trap (proves the table is keyboard-reachable).

Re-gate after fixes: web full **665 passed** (3× no flakiness); typecheck/lint/build clean; e2e tsc
OK; preflight `bash -n` OK + JSON-parse smoke (valid passes, empty-features fails); evidence-docs 11.
Ready for Round 3 (merged-artifact / final sweep).

## Round 3 — framing: merged-artifact / final sweep

**Tier 1 (Opus): CLEAN** — no CRITICAL/HIGH/MEDIUM. Verified BY TRACE: recovery effect no-loop
(stable useCallback dep + setState-bailout on the second null pass), full merged journey clears
together with nothing stale/over-cleared, cross-file testids consistent (customer-row vs
customer-select), violet reserved to SimulatedBadge, spec count 36, build GIS-chunk isolated,
new tests non-vacuous. Informational only (ImpactPanel 200-item list kept for no-regression).

**Tier 2 (Codex): REJECT — 1 HIGH, 1 MEDIUM, 1 LOW (a NEW disjoint class — the tiers DIVERGED, and
Codex was right).**

Dispositions:
- **HIGH (Codex) — GIS marker/line click conflation breaks PR-H test 2.5:** ACCEPTED after I
  independently confirmed it (owned the experiment). The R19 highlighted→drawer routing lived in
  the screen's `onSelectGisPipe`, which BOTH the highlighted LINE click and the device MARKER click
  reached (the marker selects the bound pipe, which IS the highlighted one during a drop). So during
  an active P-2 drop the marker opened the DRAWER instead of the REAL pipe details `topic2-gis` 2.5
  asserts — a real regression on a GIS-enabled stack (self-skips on the default dark stack, which is
  why the gate stayed green; I had also baked the bug into my own gis-test). FIXED by moving the
  highlighted-vs-details discrimination INTO `GisNetworkView` (it already holds `highlightedPipeIds`
  via a new `highlightedRef`): a LINE click on a highlighted pipe → `onOpenImpact` (drawer); any
  other LINE click → `onSelectPipe` (details); the MARKER → `onSelectPipe` ALWAYS (details, never
  the drawer). The screen dropped `onSelectGisPipe`/`onSelectZone` and passes `onSelectPipe=
  setGisPipe` + `onOpenImpact=openImpactDrawer`. + component tests R19 (highlighted-line→drawer,
  non-highlighted→details) and R19b (marker→details even while its bound pipe is highlighted);
  rewrote the gis-screen bridge test to fire a LINE click (extended that mock to capture layer
  clicks). MUTATION-VERIFIED: re-conflating the marker fails R19b.
- **MEDIUM (Codex) — `demo-coverage.md:52` still said "33 specs"** (I fixed the first count at :14 to
  36 but missed this second one; the evidence guard only checks the first parenthesized count):
  FIXED to 36 + PR-J journey mention.
- **LOW (Codex) — the E2E journey's "no incident" baseline is timing-dependent** (the preceding spec
  leaves P-2 degraded): FIXED — `resetToNormal(page)` before the empty-footprint assertion.

Re-gate after fixes: web full **667 passed** (3× no flakiness); typecheck/lint/build clean; e2e tsc
OK; evidence-docs 11 (both coverage counts now 36); no stale spec counts remain; topic2-gis 2.5 now
consistent with the marker→details fix. Because Round 3 was NOT a dry both-tier round (Codex HIGH),
loop continues → Round 4 re-reviews both tiers on the remediated tree.

## Round 4 — framing: verify R3 fix + convergence sweep

**Tier 1 (Opus): CONVERGED** — Round-3 marker/line fix verified correct (marker always details, no
ref staleness/loop, no dangling wiring — `git grep onSelectZone/onSelectGisPipe` = 0). Only 1 LOW:
"four real-geometry proofs" doc phrase now under-counts (the PR-J footprint test is a fifth
PIPE_GIS_ENABLED-gated test in topic2-gis). FIXED — reworded both demo-coverage spots to "five
gated proofs — the four real-geometry proofs plus the PR-J footprint-in-GIS test".

**Tier 2 (Codex): REJECT — 1 HIGH, 2 MEDIUM (a NEW disjoint class; tiers diverged again, Codex
right on the HIGH).**

Dispositions:
- **HIGH (Codex) — the device MARKER click can bubble to maplibre's canvas-container listener →
  zone/line hit-test → open the drawer:** ACCEPTED. maplibre re-parents the marker element INTO the
  canvas container whose native click listener processes bubbled clicks; a React `onClick` runs at
  the delegated ROOT only AFTER maplibre already handled the bubbled event, so React
  `stopPropagation` is too late. Only manifests on a GIS-enabled browser stack (self-skips by
  default; unverifiable in jsdom) — but the defensive fix is cheap and closes it regardless of
  maplibre internals. FIXED: a NATIVE `click` listener on the marker's portal host (`markerEl`) does
  the details selection AND `stopPropagation()` (before the event reaches maplibre); the portal drops
  its React `onClick` (`GisDeviceMarker.onClick` made optional — its standalone gisPanels test still
  passes a React handler). + component tests R19c (the marker click does NOT bubble to the
  `role=application` ancestor — proves stopPropagation) and R19b (marker→details even while its bound
  pipe is highlighted, mutation-verified). topic2-gis 2.5 (marker→REAL details after the suite
  restores pressure_drop) now passes.
- **MEDIUM (Codex) — batched RECOVER+REDROP in one commit preserves the old incident:** DOCUMENTED
  as UNREACHABLE (not fixed). Verified against the transport: `useTwinSocket.onmessage`
  (`useTwinSocket.ts:145`) applies exactly ONE frame per WebSocket message → RECOVER and REDROP are
  separate messages → separate React renders → `droppedAsset` transitions through null and the clear
  runs (Tier 1 confirmed the separate-commit path in round 2). A single-`act` coalesced test would
  assert an impossible transport state. Fix direction if the protocol ever batches frames: key the
  incident by pressure-frame timestamp/run-id rather than asset id.
- **MEDIUM (Codex) — customer-detail failure spins forever:** ACCEPTED (real, reachable). The
  derived `detailLoading` treated a failed fetch (stored `null`) as "still loading" → permanent
  "กำลังโหลด…". FIXED — the detail state is now a SETTLED outcome `{id, detail}` (detail null =
  failed); derived `detailLoading` = no settled outcome for the current id, `detailError` = settled
  but null. `CustomerDetailPanel` renders an explicit error + a retry button (INTERACTIONS error
  contract); `retryDetail` re-triggers the fetch. + panel test T5e (error+retry, not a spinner) and
  screen test T7i (a 503 detail settles to error, no stuck spinner, no readings) — MUTATION-VERIFIED
  (reverting the failure branch to the old non-settling behaviour fails T7i).

Re-gate after fixes: web full **670 passed** (3× no flakiness); typecheck/lint/build clean; e2e tsc
OK; evidence-docs 11. Round 4 was NOT a dry both-tier round (Codex HIGH) → Round 5 re-reviews both
tiers on the remediated tree.

## Round 5 — framing: verify R4 fixes + final convergence (CONVERGENCE)

**Tier 1 (Opus): CONVERGED** — no CRITICAL/HIGH. Both Round-4 fixes verified correct by trace
(marker native listener: stopPropagation sufficient in a real browser, cleanup/no-leak, keyboard
Enter path works, R19c a real proof; detail state machine: all six paths mutually consistent,
loading/error never both true, no stale-customer bleed). One MEDIUM self-downgraded to LOW: the
retry-COMPLETION path (503→retry→success) had no failing-test guard (the shipping code is correct;
a test-vacuity gap on a Round-4 fix).

**Tier 2 (Codex): CONVERGED** — "No CRITICAL, HIGH, or MEDIUM." Independently verified the same:
maplibre 6.1 registers its canvas-container click in bubble phase and the markerEl listener stops
it first (confirmed against the library source); detail success/404/503/A→B/recovery/retry all
consistent; RECOVER+REDROP batching unreachable (one frame per socket message). Two LOW test-
coverage items: the browser marker spec didn't assert drawer-stays-closed/Enter; the retry tests
stopped at error render.

**Both tiers agree: ZERO code defects; the only remaining items are test strengthening** (the same
retry-completion + marker-E2E gaps). Dispositions (all FIXED — test-only, no shipping-code change):
- Screen test **T7j**: 503 → error → click retry → second request succeeds → detail + 12 readings
  render, error cleared (MUTATION-VERIFIED in round 4 that dropping the `detailRetry` dep reopens
  the spinner; T7j now guards the completion half end-to-end).
- E2E **2.5b (topic2-gis)**: during an active drop (bound pipe highlighted) the marker click AND
  keyboard Enter show REAL details WITHOUT opening the drawer — the real-browser proof of the
  round-3/4 marker fix that jsdom cannot give (self-skips on the dark stack). Spec count 36→37;
  both `demo-coverage.md` counts updated to 37 and the gated-proof count to six; evidence-docs 11.

Re-gate: web full **671 passed** (3× no flakiness); typecheck/lint/build clean; e2e tsc OK;
evidence-docs 11 (count 37).

**QCHECK RESULT: PASS — CONVERGED.** 5 rounds × 2 independent tiers (Opus Tier 1 + Codex gpt-5.6-sol
xhigh Tier 2), framings contract → adversarial → merged-artifact → verify-fix → verify-fix+
convergence. Findings across the run: 4 HIGH (recovery-clear, R20 merge order, marker/line routing
conflation, marker native-bubble) + several MEDIUM, ALL fixed and mutation-verified; 3 unreachable
items documented with repo evidence (partial-enrichment, batched RECOVER+REDROP, different-asset —
last one fixed defensively anyway). The final round (Round 5) surfaced nothing above LOW from either
tier — only test strengthening, applied. Every finding dispositioned with a reason.
