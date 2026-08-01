# DREP — PR-11 · Regional Dashboard (Stitch S2)

**Goal.** Build the `regional` screen (`/regions`, S2), the drill target of PR-10's national
map/bars. Frontend-only: the backend endpoint `GET /api/curated/regions/{region}?month=` →
`list[BranchRow]` already exists. Reuses the PR-10 feature pattern + shared economics scenario.

## Honesty decisions (S2's design is flagged `fabricated-table-values`, `status-column-colour-only`)
Per explicit user guidance (see memory `stitch-compare-and-sim-ok`): **include** S2's simulated
columns to match the design, using MOCK data, as long as every synthetic value is badged.
- **REAL (no badge):** region total water sold (Σ branch volumes), branch count, the branch league
  table's water sold / MoM / YoY (straight from the endpoint), and the office map (real locations).
- **SIMULATED (badged):** region **average NRW** KPI and **"to-watch"** KPI; and the league table's
  **per-branch NRW** column + **status** column. The per-branch NRW is illustrative MOCK data —
  deterministic, spread across the range by volume rank (bigger branches → lower loss) with a small
  per-code jitter — never presented as measured. `regionalClient.simulatedBranchNrwPct`.
- **Status column defect fixed:** status is rendered via `StatusChip` = **icon + Thai label** +
  colour (never colour-alone), derived from the simulated NRW at the S7 alert thresholds
  (≥35% วิกฤต, ≥30% เฝ้าระวัง).

## Files
| File | Purpose |
|---|---|
| `web/src/components/MonthPicker.tsx` | **Promote** the national MonthPicker to shared (national + regional use it); update national's import. |
| `web/src/features/regional/regional.config.ts` | branch drill href `/branches?branch=CODE&month=M`, YoY trend thresholds, labels. |
| `web/src/features/regional/types.ts` | `BranchRow` wire type + view models (`RegionSummary`, `BranchBar`, `VolumeTrend`). |
| `web/src/features/regional/regionalClient.ts` | `fetchRegion(region,month)`, `fetchMonths`; reducers `regionSummary(rows)` (totalM3, branchCount, decliningCount), `branchBars(rows)` (width vs max, clamped), `volumeTrend(yoyPct)` → up/down/flat. |
| `web/src/features/regional/useRegional.ts` | `useOwnedAsync` keyed on (region,month): fetch months + region rows together. |
| `web/src/features/regional/RegionalKpiRow.tsx` | region total (REAL) · branch count (REAL) · branches declining (REAL) · avg NRW (SIMULATED, badged). |
| `web/src/features/regional/BranchLeagueTable.tsx` | rank · branch(+province) · water-sold bar · MoM · YoY (trend icon+label) · drill `<Link>` per row (month preserved). Default sort volume desc, rank stored. |
| `web/src/features/regional/RegionBreadcrumb.tsx` | ภาพรวมประเทศ (link, month preserved) / เขต N (current). |
| `web/src/screens/RegionalScreen.tsx` | reads `region`+`month` from URL; state machine (skeleton/error/empty/stale/loaded); missing/invalid region → honest prompt back to national; month picker; honesty footer. |
| `web/src/routes/nav.ts` | flip `regional` `built:true`. |
| `web/src/routes/routes.tsx` | add `regional: RegionalScreen` to SCREENS. |

## Tests (RED-first, mirror PR-10)
- `regionalClient.test.ts` — regionSummary (total = Σ, decliningCount = count YoY<0, YoY null ≠ declining); branchBars (width vs max, [] → [], negative clamp); volumeTrend (up/down/flat, null → flat/unknown).
- `RegionalScreen.test.tsx` — heading synchronous; failed load → Alert; empty region → honest empty; missing region param → prompt (not a crash); loaded → table + KPIs.
- `regionalComponents.test.tsx` — avg-NRW tile badged, real tiles not; row drill href preserves month; YoY trend has icon+label (not colour-only); breadcrumb links national with month.
- `regionalHooks.test.tsx` — refetch on region/month change; keep-last + stale on error.
- `regionalWiring.test.tsx` — nav built + SCREENS mapping; `/regions?region=2&month=2025-12` renders the real screen.

## Wiring
`RegionalScreen` ← SCREENS.regional + nav built. Row drill → `/branches?...` (PR-12 unbuilt →
honest PlaceholderScreen). Breadcrumb → `/national?month=`. No new backend.

## Deferred (documented follow-ups — S2 elements not in this thin build)
- **Branch comparison chart** and **simulated Step-Test history** (POC ผนวก ๖) — the league table +
  region office map + KPIs are shipped; these two S2 sub-panels are deferred (thin presentation OK
  per user guidance). Tracked here; the nav marks the regional *route* built.
- Tri-state column sorting (INTERACTIONS §Sorting) → follow-up.
- Region choropleth (polygon boundaries) → with PR-10c; the thin office-point map ships now.

## QCHECK notes (2-tier) — findings resolved
Opus (SHIP) + Codex (BLOCK) both flagged, and this build fixes: the region-switch data/label
mismatch (loaded now gated on `data.region === region` → skeleton on switch, provenance test added);
an invalid URL month sticking a permanent loading-dim (month state gated on `data.months.includes`);
the empty-state being unreachable because the endpoint 404s (translated to an empty result in the
hook); finite-safe `simulatedBranchNrwPct`; the magnitude bar now rendered (was computed-but-unused);
function splits (RegionalScreen/BranchLeagueTable ≤50 lines); and this DREP corrected to match the
implemented (badged) simulated columns.
