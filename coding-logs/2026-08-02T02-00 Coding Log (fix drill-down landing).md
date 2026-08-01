# Coding Log — fix: drill-down screens land on real content

Baseline `main` @ 41b9ab5. Branch `fix/drilldown-landing-pickers`. Lifecycle: g-coding. User-reported:
ระดับเขต / ระดับสาขา, when opened from the sidebar (no `?region=`/`?branch=`), showed a dead-end
"go to the national page first" prompt — pathetic as a top-level nav landing.

## Fix
- **Regional** defaults `region` to `REGIONAL_CONFIG.defaultRegion` (1) when none is given, so
  `/regions` lands on a full เขต dashboard; a new **`RegionSelect`** (เขต 1–10) in the header switches
  regions (preserving `?month=`). Removed the no-region prompt; `data.region === region` provenance
  guard intact.
- **Branch** renders an inline **`BranchPicker`** when no branch is selected: a เขต selector + that
  region's REAL branches as drill links (`/branches?branch=CODE&month=MONTH`), via `useOwnedAsync`
  with skeleton/empty/error states. Picking a branch → the full detail view; it never fetches a
  single branch's detail.

## Files
New: `web/src/features/regional/RegionSelect.tsx`, `web/src/features/branch/BranchPicker.tsx` (+ tests).
Edited: `regional.config.ts` (`defaultRegion`), `RegionalScreen.tsx`, `BranchScreen.tsx`, and the two
screen tests. Removed now-dead `Link` (both screens) + `Card` (BranchScreen) imports.

## Gates
`pnpm typecheck` · `pnpm lint` clean · `pnpm test` 501 pass (3× no-flake) · `pnpm build` green.
Dark-mode screenshots (matching the user's report) confirm: /regions → เขต 1 full dashboard + switcher;
/branches → branch picker grid.

## QCHECK (Tier-1 adversarial, general-purpose agent)
VERDICT **SHIP** first pass. No CRITICAL/HIGH/MEDIUM. Fixes applied for the LOWs worth closing:
- **L3** (a FAILED region switch left the previous region's branches under the new เขต selector) →
  added a provenance gate (`data.region === region`, mirroring RegionalScreen) so a switch shows a
  skeleton/error, not stale rows; extracted `BranchLinks` for clean TS narrowing.
- **L2** (picker error branch untested) → added an error-state test.
- **L1** (region-switch test didn't prove a refetch) → now asserts `fetchRegion(5, …)`.
Left as documented/acceptable: out-of-range `?region=99` silently renders เขต 1 (heading+selector
agree, not mislabeled); a `?month=`-without-branch URL uses the latest month for picker links.
Honesty (real data, not badged; regional NRW/status keep their badge), tokens, drill-path
regressions, a11y all verified clean.
