# Coding Log — PR-D2 (Path D) · tri-state league sort + functional AppShell Export

Baseline `main` @ 27382d2. Branch `feat/pr-d2-league-sort-export`. Lifecycle: g-coding. Two documented
Path D polish items on shipped screens.

## What shipped
- **Tri-state league sort (S2):** the Regional branch league table's numeric columns (ปริมาณจำหน่าย /
  MoM / YoY / NRW) cycle none → desc → asc → none. Pure `sortBranchBars(bars, key, dir)`: non-mutating
  copy, `null` MoM/YoY sort LAST both directions, ties break by the endpoint's original `rank` (stable).
  The `#` column keeps the endpoint rank (no renumber). Headers expose `aria-sort` + a direction glyph
  (↓/↑/⇅) — never colour-only. NRW keeps its SIMULATED badge.
- **AppShell Export → print:** the shared "ส่งออกรายงาน" button now calls `window.print()` (browser
  print-to-PDF of the current view) — a real, honest action, no longer inert chrome.

## Files
`web/src/features/regional/regionalClient.ts` (`sortBranchBars` + `LeagueSortKey`/`SortDir`),
`web/src/features/regional/BranchLeagueTable.tsx` (sortable `LeagueHeader`/`SortableHeader`),
`web/src/components/AppShell.tsx` (Export onClick). Tests: `regionalClient.test.ts` (sort logic),
`BranchLeagueTable.test.tsx` (tri-state cycle + cross-column switch + rank stability + aria-sort),
`AppShellExport.test.tsx` (spies `window.print`). The DREP-locked `AppShell.test.tsx` was NOT modified.

## Gates
`pnpm typecheck` · `pnpm lint` clean · `pnpm test` 475 pass (3× no-flake) · `pnpm build` green.
Screenshot of the sorted table (active ↓ indicator + neutral ⇅ on others) in scratchpad.

## QCHECK (Tier-1 adversarial, general-purpose agent)
VERDICT **SHIP**. No CRITICAL/HIGH. **MEDIUM FIXED**: `BranchLeagueTable` had grown to 56 lines,
breaching the ≤50-line MUST → extracted `LeagueHeader` (now 38 lines). LOW/NIT addressed: added a
cross-column-switch test (resets old column to none, new column to desc); removed the dead
`align="left"` branch (all sortable headers are right-aligned). Sort correctness (non-mutating,
nulls-last, stable tie-break, desc/asc), aria-sort, rank stability, and the export spy were all
verified clean by the reviewer. Tier-2 Codex not run: small frontend sort logic + a print call, no
domain/security/contract semantics.
