# Coding Log — PR-10 · National Executive Dashboard (Stitch S1)

Plan: `docs/DREP-PR10-executive.md` (Claude + Codex xhigh planning pass).
Baseline: `main` @ 61fc36f. Branch `feat/pr10-executive-national`.
Scope: the `national` screen (`/national`, S1) over the REAL curated water-sold dataset —
non-scoring product breadth (Path A). One backend REAL endpoint + the frontend screen.

## What shipped

**Backend (1 real endpoint):** `GET /api/curated/national/series` → `NationalSeries{points:
[{month,total_m3,branch_count}]}` — the 39-month national series in one call (powers the trend
line and national MoM/YoY without 39 client requests). Joins the real-only curated routes; never
carries `simulated`. `CuratedStore.national_series()` agrees point-for-point with `national(m)`.

**Frontend (`web/src/features/national/` + screen):** KPI row (WATER SOLD real + MoM/YoY; NRW ·
energy cost · energy-cost-per-m³ SIMULATED, badged), an honest **office-point map** (234 real PWA
office coords shaded by real region volume, ten focusable region drill groups), ranked region
volume bars with drill, the 39-month trend line (real, SVG), a scripted AI situation card
(provenance caption always rendered), a month picker (sticky `?month=` URL). Wired via `nav.ts`
`built:true` + `routes.tsx` SCREENS. State machine mirrors the predictive screen (skeleton /
error Alert / empty / loaded-with-dim-on-stale).

## Honesty spine
Water-sold, map, bars, trend = REAL, no badge. NRW/energy/energy-per-m³ = SIMULATED, each badged;
derived by a config-driven reducer from the SHARED, versioned `waterEconomicsScenario.ts` (so
PR-10/11/12 can't drift) with `isValidScenario` guards → `null` (never fake 0/Infinity) for an
invalid scenario or non-positive sold. No fabricated region status; absent region ≠ zero.

## QCHECK — 2-tier

Planning pass (Codex gpt-5.6-sol xhigh) returned "changes required"; folded in: the honest
office-point map (replacing a grey placeholder — its #1 objection), the shared/versioned/guarded
economics scenario, the honest "energy cost per sold m³" label, null-not-zero economics, function
splits, and a duplicate-`<header>`-banner a11y fix (the screen title is a `<div>`; AppShell.test
caught it once `/national` became the landing route).

Pre-commit pass — Opus subagent (Tier 1): **SHIP**, no CRITICAL/HIGH; two MEDIUMs FIXED:
- Month picker snapped back to the old month mid-switch with no cue → picker now binds to the
  REQUESTED month, and content dims + announces "กำลังโหลดเดือนที่เลือก…" while the new month loads.
- Honesty footer had no test (a test claimed to cover it but didn't) → now asserts the footer's
  `SIMULATED` badge + "เป็นค่าจำลอง" wording; added a picker-binding test.
Codex second pass (gpt-5.6-sol) returned **BLOCK** (no CRITICAL) — every finding FIXED, each
with a test encoding its failure mode:
- HIGH — selected month could disagree with rendered data with no marker (Codex saw the
  pre-fix staged version). Resolved: picker binds to the REQUESTED month; a pending switch dims +
  announces "กำลังโหลดเดือนที่เลือก…". Added the deferred-promise intermediate-state test.
- MEDIUM — `nrwPct` rendered for invalid sold + Infinity at overflow. Resolved: invalid/zero/
  negative/non-finite sold → ALL null (NRW included); computed outputs finite-guarded.
- MEDIUM — negative volumes broke map/bar geometry AND the loader accepted them. Resolved:
  `curated.py` quarantines negative water-sold (counted, like NaN); `regionFillOpacity` clamps to
  [MIN_FILL,1], `regionBars` width to [0,100]. Backend + frontend tests added.
- LOW — footer test didn't assert the footer. Resolved (asserts the SIMULATED partition).
Re-gated green after fixes (backend 40, web 329, national 44 × 3 no-flake).

## Deferred (documented, honest) → follow-ups
Data-trust strip + `/api/curated/trust` + `metadata.json` (PR-10b); trend target line (no
authoritative target — formal S1 deviation, not an unbadged invention); polygon choropleth
(needs sourced boundaries) (PR-10c); the shared AppShell inert Export button (its own PR).

## Verified
api: pytest curated 39/39, ruff + mypy clean (49 files). web: 325 tests green (national 40, 3×
no-flake), lint + typecheck + build clean. Live: `national/series` returns 39 real points (no
`simulated`), Dec total 120,999,833.55 matches; `/national` live smoke + screenshot show the real
Thailand office map, real KPIs, and SIMULATED badges on exactly the three synthetic tiles.
