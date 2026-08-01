# Coding Log — PR-11 · Regional Dashboard (Stitch S2)

Plan: `docs/DREP-PR11-regional.md`. Baseline `main` @ dcdbbca. Branch `feat/pr11-regional`.
Scope: the `regional` screen (`/regions`, S2), drill target of PR-10's national map/bars, over the
REAL `GET /api/curated/regions/{region}?month=` endpoint (no new backend). Path A product breadth.

## What shipped
Region KPIs (region total water sold + branch count REAL; avg NRW + to-watch SIMULATED), a thin
**region office map** (real office locations for the region), a **branch league table** (rank ·
branch drill · water-sold + magnitude bar · MoM · YoY — REAL; per-branch NRW + status — SIMULATED),
a breadcrumb (→ national, month preserved), a sticky `?month=` picker, and the 5 INTERACTIONS
states. Wired via nav `built:true` + routes SCREENS. Promoted `MonthPicker` to `@/components`
(shared by national + regional).

## Honesty (per user guidance — include Stitch's sim columns, badged, don't drop them)
Water sold / MoM / YoY / office map = REAL, no badge. Avg-NRW + to-watch KPIs and the table's NRW +
status columns = SIMULATED, badged. Per-branch NRW is deterministic MOCK — spread across the range
by volume rank (bigger branch → lower loss) + a per-code jitter, so a realistic normal/warning/
critical mix results (region 2: 19/5/6) rather than all-red. Status is `StatusChip` (icon + Thai
label), fixing S2's `status-column-colour-only` defect.

## Bugs I caught + fixed during build
- First hash (`h*31+c`) then FNV-1a both clustered on the structurally-similar real branch codes
  (all-critical, then 29-normal/1-crit). Root fix: rank-based spread (set-independent, guaranteed mix).

## QCHECK — 2-tier, all findings fixed with tests
Opus (SHIP) + Codex gpt-5.6-sol (BLOCK). Resolved:
- **HIGH** region→region switch rendered the old region's table under the new heading → `loaded` now
  gated on `data.region === region` (skeleton on switch); provenance test with an in-test navigator.
- **HIGH** an invalid/stale URL month stuck the screen in a permanent loading-dim → month state gated
  on `data.months.includes(requestedMonth)`; test.
- **MEDIUM** empty state was untestable/unreachable — the endpoint 404s (not `[]`) for a region with
  no rows → the hook translates a 404 to an empty result; hook + screen tests.
- **MEDIUM** `simulatedBranchNrwPct` returned NaN on non-finite rank/count → finite-safe fallback; test.
- **MEDIUM** the DREP + module header contradicted the (badged-sim) implementation → both corrected.
- **MEDIUM** S2's branch-comparison chart + Step-Test history not built → documented as deferred.
- **LOW** function length (RegionalScreen/BranchLeagueTable) → split ≤50 lines; `widthPct` was
  computed-but-unrendered → now drawn as the volume magnitude bar; weak tests strengthened
  (per-header badge scope, status Thai label, footer honesty, one-branch, non-finite).

## Verified
web: 358 tests (regional 29, 3× no-flake), typecheck · lint · build clean. Live: `/regions?region=2`
screenshot shows real map + real table + badged sim columns + status icon+label + magnitude bars.
Objective S2 comparison done (Stitch is a denser static comp with fabricated values + colour-only
status; this build is real, functional, honest, and fixes the colour-only defect).
