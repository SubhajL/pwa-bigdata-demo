# Coding Log — PR-D3 (Path D) · Branch (S3) sub-panels

Baseline `main` @ 7aa0048. Branch `feat/pr-d3-branch-panels`. Lifecycle: g-coding. Builds the deferred
S3 branch sub-panels (documented follow-up).

## What shipped (3 cards in the loaded Branch view)
- **อันดับเทียบเพื่อนร่วมเขต (peer standing) — REAL** (rank/branchCount → top-%; no SimulatedBadge).
- **การผลิตและจ่ายน้ำ (production) — SIMULATED**: produced = sold/(1−NRW), NRW volume, customers ≈
  sold/28. Real sold volume omitted (it's on the KPI row) so the whole card is genuinely simulated
  under one badge.
- **พยากรณ์เดือนถัดไป (AI forecast) — SIMULATED**: naive MoM projection ±3%, labelled "ไม่ใช่แบบจำลองจริง".

Pure derivations `peerTopPercentile`/`simProduction`/`simForecast` return `null` (never Inf/NaN/fake)
on bad input. Wired into `BranchScreen` LoadedContent.

## Files
New: `web/src/features/branch/{branchPanels.ts,BranchDetailPanels.tsx}` (+ tests). Edited:
`web/src/screens/BranchScreen.tsx` (+ test assertion the panels render loaded).

## Deferred (documented, NOT faked)
National-median trend overlay stays deferred — the trend already shows the REAL region-median; a
national median would need national data on this screen and a fabricated one would be dishonest.

## Gates
`pnpm typecheck` · `pnpm lint` clean · `pnpm test` 487 pass (3× no-flake) · `pnpm build` green.
Screenshot of the 3 panels in scratchpad.

## QCHECK (Tier-1 adversarial, general-purpose agent)
VERDICT **SHIP**. No CRITICAL/HIGH. It confirmed the honesty foundation (rank is the endpoint's
volume-desc order — REAL; the simulated NRW is derived FROM rank, so the unbadged peer card is correct,
not a mirror violation). MEDIUM (the REAL card showed "+15%" because `Num kind="percent"` signs
deltas) — **already FIXED before the review finished** (screenshot review → `kind="int"` + `%`); added
a test pinning the unsigned percentile. LOW/NIT addressed: `simForecast` now guards negative volume
(symmetry with `simProduction`) + test; removed the dead `Metric` `kind` prop. Null-safety, peer math,
tokens, wiring, no-regressions all verified clean. Tier-2 Codex not run: small presentational
derivations, no domain/security/contract semantics.
