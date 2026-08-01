# DREP — PR-10 · National Executive Dashboard (Stitch S1)

**Goal.** Build the `national` screen (`/national`, Stitch S1, `ownedBy: PR-10`), a
non-scoring **product-breadth** dashboard over the REAL curated water-sold dataset, following
the committed design (S1) and the existing screen-feature pattern (predictive/pipeline).

**Honesty spine (CLAUDE.md / POC_SPEC §3.2).** Water-sold roll-ups are REAL and never marked
simulated. NRW / energy cost / cost-per-m³ are **definitionally synthetic** (produced-water
numerator is not in open data) → each carries `<SimulatedBadge/>`. Tokens only; status never
colour-alone; one y-axis per chart; missing ≠ zero (`—`); no literal KPI in a component.

## Architecture decisions

1. **Real national series is a backend endpoint; synthetic economics is a client reducer.**
   - Add ONE real endpoint `GET /api/curated/national/series` → the 39-month national totals in
     a single call. It powers the trend line AND national MoM/YoY without 39 client requests.
     It joins the existing curated (real-only) routes and never carries `simulated`.
   - NRW / energy / cost-per-m³ are produced by a **deterministic, config-driven reducer**
     `simulatedEconomics(rollup, cfg)` in `nationalClient.ts`, badged `SIMULATED`. Rationale:
     it is derived from the REAL sold volume (not a literal in JSX — satisfies "values come
     from API/reducer, not hardcoded in a component"), it mirrors the codebase's existing pure
     reducers, and it keeps the real/synthetic boundary crisp (real on the wire; synthetic
     clearly client-side + violet-badged). Productionization path = DMAMA `realtime_water_produce`
     (POC_SPEC §3.3) flips these to real via a backend endpoint later.

2. **Map = honest placeholder for PR-10; real choropleth deferred.** The S1 design itself ships
   the GIS map as a placeholder (`manifest.json` issue `map-is-placeholder`); no map lib is a
   dependency. PR-10 renders an honest placeholder card and carries the geographic magnitude via
   the REAL region bar chart (sequential blue, drill to `/regions/{r}`). A hand-rolled SVG
   choropleth over `data/raw/pwa_offices.geojson` is logged as **PR-10b follow-up**.

3. **Deterministic simulated-economics model** (grounded in the real sold volume `S` for the
   month; constants in `national.config.ts`):
   - `nrwPct = NRW_BASE_PCT` (national baseline, ~30% — Thailand PWA order of magnitude).
   - `producedM3 = S / (1 - nrwPct/100)` (produced ≥ sold; the missing numerator, synthesized).
   - `energyCostThb = producedM3 * KWH_PER_M3 * THB_PER_KWH`.
   - `costPerM3Thb = energyCostThb / S`.
   All deterministic (stable across requests — demo-friendly), no RNG.

## Backend — 1 real endpoint (slice B1)

| File | Change |
|---|---|
| `api/app/models.py` | `NationalSeriesPoint{month,total_m3,branch_count}`, `NationalSeries{points:[...]}` |
| `api/app/curated.py` | `CuratedStore.national_series() -> NationalSeries` — one point per month, ascending; `total_m3` per month = sum over that month's rows; `branch_count` = COUNT DISTINCT for the month. ≤ 50 lines. |
| `api/app/routes/curated.py` | `GET /api/curated/national/series` → `NationalSeries`; REAL, never simulated; 503 when store absent (existing `_store`). |
| `api/tests/test_curated.py` | see tests below |

## Frontend — `web/src/features/national/` + screen (slice F1)

| File | Purpose |
|---|---|
| `national.config.ts` | `NATIONAL_CONFIG as const`: economics constants (`NRW_BASE_PCT`, `KWH_PER_M3`, `THB_PER_KWH`), chart dims, drill-href builder `regionHref(region, month)`, region label `เขต ${n}`, AI-card script text + provenance caption. |
| `types.ts` | wire types (`RegionRollup`,`RegionTotal`,`CuratedMonths`,`NationalSeries`,`NationalSeriesPoint`) + view models (`EconomicsVM{nrwPct,energyCostThb,costPerM3,producedM3}`, `NationalDelta{momPct,yoyPct}`, `RegionBar`). |
| `nationalClient.ts` | fetchers `fetchMonths`,`fetchNational(month)`,`fetchNationalSeries()` over `getJson`; reducers `momYoyFromSeries(series,month)` (null, not 0, when prev/year-ago month absent or baseline 0), `simulatedEconomics(rollup,cfg)`, `regionBars(rollup)` (widthPct vs max, one hue), reuse `buildChartPath` from `@/features/pipeline/pipelineClient` for the trend line. |
| `useNational.ts` | `useOwnedAsync` task depending on `month` (via `useCallback([month])`) fetching national+series together; returns `{rollup,series,loading,error,stale}`. |
| `useMonths.ts` | `useOwnedAsync` fetch-on-mount month list. |
| `MonthPicker.tsx` | `<select>` of months (label `formatMonthTh`), writes `?month=` via `useSearchParams`; default = latest month. |
| `NationalKpiRow.tsx` | 4 tiles: WATER SOLD (REAL, `<Num kind=m3>` + MoM/YoY delta via `<Num kind=percent>`, **no** badge); NRW / ENERGY / COST (each `<SimulatedBadge/>`). |
| `RegionVolumeBars.tsx` | REAL bars (CSS width%, `bg-primary`), each a keyboard-accessible drill `<button>`/link to `regionHref`; status via `<StatusChip>` (icon+label), never colour-only; empty state. |
| `RegionMapPlaceholder.tsx` | honest placeholder card (Thai "แผนที่ระดับประเทศจะแสดงในเวอร์ชันถัดไป"); no fabricated map. |
| `NationalTrendChart.tsx` | SVG polyline via `buildChartPath`, single y-axis (mirror `IngestRateChart`); REAL (no SimulatedBadge — real data); empty state. |
| `AiSituationCard.tsx` | scripted narrative naming a specific เขต + action; **always-rendered** provenance caption "ข้อความนี้เป็นสคริปต์ตัวอย่าง ไม่ใช่ LLM แบบเรียลไทม์"; teal accent (token), no violet. |
| `screens/NationalExecutiveScreen.tsx` | state machine (skeleton / error `Alert` / empty / loaded; dim-on-stale), `<h1>` begins "ภาพรวมประเทศ · National Overview" (router.test needs `/ภาพรวมประเทศ/`), month picker in header, honesty footer. |

**Wiring:** flip `built: true` for `national` in `web/src/routes/nav.ts`; add
`national: NationalExecutiveScreen` to `SCREENS` in `web/src/routes/routes.tsx`. (Sidebar +
router both build from `NAV_ITEMS` — nothing else to register.)

## Tests (RED-first)

Backend (`test_curated.py`):
- `test_national_series_has_one_point_per_month_ascending` — 39 points, months ascending.
- `test_national_series_total_matches_national_rollup_each_month` — each point.total_m3 == `national(month).total_m3`.
- `test_national_series_branch_count_is_distinct_per_month` — matches rollup branch_count.
- route: `test_curated_national_series_200_shape` + `test_..._503_when_store_absent`.

Frontend:
- `nationalClient.test.ts` (pure): `momYoyFromSeries` (present→signed pct; prev/year absent→null; zero baseline→null); `simulatedEconomics` determinism + produced≥sold + costPerM3>0; `regionBars` widths vs max, `[]`→empty.
- `NationalExecutiveScreen.test.tsx`: heading renders SYNCHRONOUSLY before fetch; failed load → error `Alert` (not blank); empty month → honest empty (not permanent skeleton). (mock the client module.)
- `nationalComponents.test.tsx`: KPI badges present on the 3 sim tiles, ABSENT on the real WATER SOLD tile; region bar drill href correct; trend renders exactly one `[data-testid=y-axis]`; AiSituationCard always renders the provenance caption + a named เขต.
- `nationalHooks.test.tsx`: `useNational` refetches on month change, keeps last on error + sets stale.
- `nationalWiring.test.tsx`: `national` nav item is `built:true` and `SCREENS.national` is the screen.

## Wiring verification

| Component | Entry point | Registration | Data |
|---|---|---|---|
| `NationalExecutiveScreen` | route `/national` | `SCREENS.national` in routes.tsx + `built:true` in nav.ts | `/api/curated/{months,national,national/series}` |
| `national/series` route | HTTP GET | `curated_routes.router` (already `include_router`'d in main.py) | curated store (real) |
| `simulatedEconomics` | `NationalKpiRow` render | imported in `NationalKpiRow.tsx` | derives from real rollup + config |

## States / edge cases (INTERACTIONS.md)
Loading skeleton keeps geometry; empty "ไม่มีข้อมูลสำหรับเดือนนี้ · กรุณาเลือกเดือนอื่น"; error 3-part
Alert + retry; offline keeps last values dim 60% + "ข้อมูลไม่เป็นปัจจุบัน"; month sticky in URL;
KPI tile does NOT drill; numbers do not animate; `prefers-reduced-motion` respected.

## Risks / rollback
Screen lands behind an already-registered nav item; flipping `built:false` fully reverts the UI.
Backend endpoint is additive (no migration). Biggest scope risk = the deferred choropleth
(mitigated: honest placeholder + real bars). Simulated-economics defensibility validated by the
Codex planning pass (see review deltas appended below).

---

## Codex xhigh planning-review deltas — folded in

The `gpt-5.6-sol` planning review returned "changes required" and materially improved the PR:

**Applied**
- **Real office-point map** (Codex's recommended honest compromise) replaces the grey
  placeholder: `officePoints.ts` (234 real coords, generated by `scripts/build_office_points.py`),
  pure geometry in `nationalMap.ts` (`parseOfficePoints`/`officeBounds`/`projectOffice`/
  `regionFillOpacity`/`regionMarks`), and `OfficeRegionMap.tsx` — ten FOCUSABLE region drill
  controls, status/volume in the accessible NAME, shaded by REAL region volume (one hue). Honest
  office-POINT map, not a fabricated choropleth (the source has points, not polygons).
- **Simulated economics hardened**: promoted to shared, versioned, documented
  `web/src/config/waterEconomicsScenario.ts` (`scenarioId`/`version`/`basis`/`simulated`) so
  PR-10/11/12 cannot drift; `isValidScenario` guards; `simulatedEconomics` returns `null` — never
  a fake 0/Infinity — for an invalid scenario, non-finite/negative sold, or (cost-per-m³) zero sold.
- **Honest label**: the fourth KPI is "energy cost per sold m³", not "cost/m³" (it is energy only).
- **Footer** names exactly which KPIs are simulated (NRW · energy · energy/m³); real elsewhere.
- **No fabricated region status** (volume only); **absent region ≠ zero** (map mark `volumeM3: null`).
- **Function-length rule**: extracted `TrendYAxis`, `RegionGroup`, `SimTile`, `LoadedContent`.
- **Duplicate-landmark a11y fix**: the screen title row is a `<div>`, not a second `<header>`
  banner (caught by `AppShell.test` once `/national` became the landing route).

**Deliberately deferred (documented, honest — not silently dropped)**
- **Data-trust strip + `/api/curated/trust` + `data/curated/metadata.json`** → PR-10b. It is a
  pipeline-provenance concern (rows seen/accepted/quarantined, refresh timestamp) separable from
  the executive data story; PR-8's pipeline monitor already surfaces DLQ/conservation.
- **Trend target-reference line** → deferred as a formal S1 deviation: there is NO authoritative
  target, and INTERACTIONS forbids inventing an unbadged one. (A badged SIMULATED scenario target
  is the follow-up option.)
- **Polygon choropleth** → PR-10c (needs sourced regional boundaries the repo does not have).
- **Inert Export button** in the shared `AppShell` → its own PR (pre-existing, affects every
  screen; out of a single screen's scope).
- **Calendar-gap-aware trend**: the committed series is 39 consecutive months with no gaps, so
  `buildChartPath` is correct here; a gap-splitting geometry is only needed if a gap appears.

**Verified**: api pytest(curated 39)/ruff/mypy green; web 324 tests green (national 39, 3×
no-flake); lint+typecheck+build green; backend `national/series` live (39 real points, no
`simulated`); `/national` live smoke + screenshot confirm real+simulated panels and the map.
