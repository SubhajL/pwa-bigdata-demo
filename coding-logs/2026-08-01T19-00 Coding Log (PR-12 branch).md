# Coding Log — PR-12 · Branch Dashboard (Stitch S3)

Plan: `docs/DREP-PR12-branch.md`. Baseline `main` @ 0a9e19f. Branch `feat/pr12-branch`.
Scope: the `branch` screen (`/branches`, S3), drill target of PR-11's league table, over the REAL
`GET /api/curated/branches/{code}` series (no new backend). The last Path A screen.

## What shipped
Branch KPIs (WATER SOLD selected-month + MoM/YoY, rank-in-region, vs-region-median — REAL; NRW +
status — SIMULATED), a real 39-month trend line with a region-median dashed reference, a 3-level
breadcrumb (national→region→branch, month preserved), a scripted AI card (provenance caption), the
month picker + 5 states. Wired via nav `built:true` + routes SCREENS.

## Honesty + consistency
NRW/status are SIMULATED but SOURCED FROM THE REGION LEAGUE (`branchBars(fetchRegion(region,month))`)
so the branch's NRW is byte-identical to the Regional screen for the same (branch, month). Real
figures (volume, rank, vs-median, trend) carry no badge; the AI card cites only real facts.

## Bug I caught during build
The pipeline `buildChartPath` floors its max at 1, squashing a small branch (~0.2M m³) into the
bottom of the chart and clipping the median line. Replaced with `buildBranchTrend` (scales to the
data's own max, includes the median).

## 2-tier QCHECK (Opus SHIP + Codex BLOCK) — all HIGH/MEDIUM fixed with tests
- **HIGH** month-mixing: `branchVitals` always read the latest month while rank/NRW/median used the
  selected month → made `branchVitals(series, month)` month-aware; historical-month + no-row tests.
- **HIGH** the AI card called a branch AT the median "below median" (`rank > count/2`, a false claim
  about REAL data) → now decided from REAL volume vs `regionMedianM3` with equality handled; tests.
- **MEDIUM** a failed month switch showed "loading" + "stale" simultaneously → `switching` gated on
  `!stale`.
- **MEDIUM** a non-404 region failure blanked the whole real dashboard → region league is a
  secondary/sim source; any non-abort failure → empty standing, real data survives; 404/500/net tests.
- **LOW** added invalid-month, missing-league-entry, historical-month, at-median coverage.

## Verified
web: 390 tests (branch 32, 3× no-flake) · typecheck · lint · build. Live: `/branches?branch=5541018`
(สิงห์บุรี) screenshot shows real WATER SOLD + MoM/YoY, SIMULATED NRW (badged, เฝ้าระวัง), rank
20/30, −24.2% vs region median, a correctly-scaled trend below the median line, and the scripted AI
card. Objective S3 comparison done (Stitch is a much denser static comp with fabricated values;
this build is real, functional, honest, consistent with the Regional screen). Path A complete.
