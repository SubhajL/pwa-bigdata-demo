# DREP — PR-12 · Branch Dashboard (Stitch S3)

**Goal.** Build the `branch` screen (`/branches`, S3), drill target of PR-11's league table, over
the REAL `GET /api/curated/branches/{code}` series (no new backend). The last Path A screen.

## Honesty
- **REAL (no badge):** the branch's 39-month water-sold series (trend line), the SELECTED month's
  volume + MoM/YoY, rank-in-region, and "vs region median". Real breadcrumb geography.
- **SIMULATED (badged):** branch NRW + status. Crucially, these are **sourced from the region
  league** (`regional` feature's `branchBars(fetchRegion(region, month))`) so the branch's NRW is
  **byte-identical** to what the Regional screen shows for the same (branch, month) — no cross-screen
  contradiction. The AI narrative card cites only real facts (rank, YoY, vs-median) + a mandatory
  provenance caption; it never restates an unbadged simulated number.

## Files
`features/branch/`: types · branch.config · branchClient (`branchVitals`, `median`,
`buildBranchTrend`) · useBranch (series + region-league standing) · BranchKpiRow (WATER SOLD real ·
NRW sim · rank real · vs-median real) · BranchTrendChart (real line + region-median dashed ref) ·
BranchBreadcrumb (national→region→branch) · BranchAiCard (scripted + provenance). `screens/
BranchScreen.tsx`. Wired via nav `built:true` + routes SCREENS.

## Key design points
- **`buildBranchTrend`** replaces the pipeline `buildChartPath` (which floored max at 1, squashing a
  small branch ~0.2M m³) — it scales to the data's own max AND includes the region median so a
  below-median branch's reference line fits.
- **Month-aware vitals**: `branchVitals(series, month)` reads the SELECTED month (not always latest)
  so the KPI headline never mixes a December volume with a September rank/median.

## 2-tier QCHECK — Opus SHIP + Codex BLOCK, all HIGH/MEDIUM fixed with tests
- **HIGH** month-mixing (vitals latest vs standing selected-month) → `branchVitals` is now month-aware;
  historical-month + no-row-month tests.
- **HIGH** the AI card called a branch AT the median "below median" (`rank > count/2`) → now decided
  from REAL volume vs `regionMedianM3` with equality handled; at-median + below-median tests.
- **MEDIUM** a failed month switch showed "loading" + "stale" at once → `switching` gated on `!stale`.
- **MEDIUM** a non-404 region failure blanked the whole (real) dashboard → the region league is a
  secondary/sim source; any non-abort failure degrades to an empty standing, real data survives; tests.
- **LOW** added invalid-month, missing-league-entry, historical-month coverage.

## Deferred (documented — S3 panels not in this thin build; thin presentation OK per user guidance)
CUSTOMERS KPI (sim); peer-percentile distribution card; national-median overlay on the trend (3rd
line); Production & Distribution card (sim); AI-predictive forecast card. The branch NRW as-of a
historical month uses the branch's current name (the backend `BranchSeries` resolves the label
as-of the latest month — a known backend behavior, fine on the latest-month happy path).
