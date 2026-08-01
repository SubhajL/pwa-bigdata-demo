# Coding Log — PR-14 · Report Center (Stitch S6)

Baseline `main` @ 99aa9d6. Branch `feat/pr14-report-center`. Lifecycle: g-coding (Path B, screen 2 of
4). Non-scoring proposal screen.

## Scope
The `reports` screen (`/reports`, Stitch S6): a report generator that previews a SIMULATED report.
No backend — every figure is illustrative "กปภ.เขต 2" data (not a curated query), badged SIMULATED.

## What shipped
- **Report Templates** — real `role="radiogroup"` (Executive Summary / Hierarchical / Deep Analysis);
  selection drives the preview title.
- **Report Filters** — level (`radiogroup`) and KPI-type (`aria-pressed` chips) are real state that
  SHAPE the preview: level appears in the report header, each KPI type shows/hides its tile.
- **Generate → Preview** — "ประมวลผลรายงาน" reveals the preview; "สร้างรายงานใหม่" resets; an honest
  empty-state prompt before generating.
- **Preview** — filtered KPI tiles, a single-hue single-y-axis quarterly bar chart (zero baseline,
  direct labels), and an actual-vs-target table with `StatusChip` (icon + Thai label). Export chips
  (PDF/XLSX/CSV) are `disabled` proposal chrome. Whole-card `SimulatedBadge` + footer disclaimer.
- Wired: nav `reports.built:true`, `SCREENS.reports`.

## Files
New: `web/src/features/report/{report.config.ts,ReportTemplatePicker.tsx,ReportFilters.tsx,ReportPreview.tsx}`,
`web/src/screens/ReportCenterScreen.tsx`; tests `report.test.ts`, `ReportCenterScreen.test.tsx`,
`features/report/reportWiring.test.tsx`. Edited: `routes.tsx`, `nav.ts`.

## Gates
`pnpm typecheck` clean · `pnpm lint` clean · `pnpm test` 428 pass (3× no-flake) · `pnpm build` green.
Wiring verified; `reportWiring.test.tsx` asserts `/reports` renders the real screen, not the
placeholder. h1 carries the nav labelTh "ศูนย์รายงาน" so router T4 matches.

## Screenshot review (dataviz step 7 — "render it and look at it")
Two visual defects the unit tests couldn't see, caught by screenshot and fixed:
1. **Bars collapsed to zero height** — `height:%` resolved against a flex item that `items-end`
   shrank to content. Fixed with a fixed-height (`h-32`) bar track; added a bar-geometry regression
   test (`quarter-bar` height is a % and the max bar reaches 100%).
2. **Clustered values → four identical bars** — re-spread the illustrative quarterly values to read
   as a rising trend (zero baseline kept; a truncated bar axis is an anti-pattern).

## QCHECK (Tier-1 adversarial, general-purpose agent)
First verdict **BLOCK** on **H1**: the level/KPI-type filters were interactive but did not affect the
generated report, and comments falsely claimed they "drive the preview" — a misleading affordance
(the same class flagged on PR-13, worse because the controls looked functional). **FIXED** by making
the filters genuinely drive the preview: `level` renders in the report header, `kpiTypes` filters the
KPI tiles (default hides the energy tile until selected — a visible effect). Comments corrected. New
tests assert the filter→preview coupling. LOW/NIT also addressed: reset test now asserts template +
chip reset (L1); `ReportFilters`/`ReportCenterScreen` refactored under the 50-line MUST via
`LevelFilter`/`KpiFilter`/`ReportWorkspace` extraction (L2); KPI-toggle test is now bidirectional
(N1). Tier-2 Codex not run: no domain/security/contract semantics in a static presentational screen.
