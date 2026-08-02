# Coding Log — feat: Report Center (S6) lands on a generated report

Baseline `main` @ 6914021 (post theme-toggle #28). Branch `feat/report-lands-populated`. Lifecycle:
g-coding. Phase 3 of the audit→toggle→realign session.

## Audit conclusion (Phase 1) that scoped this
Screenshotted all 10 screens in LIGHT mode against current main (had to run a host-side Vite on :5174
— the Docker web container was baked 29 min before #27, so it still showed pre-#27 dead-ends) next to
`design/screens/S*.png`. Result: the "much drifted from Stitch" impression was ~entirely the OS theme
(dark viewing of light mocks). In light mode 9/10 screens are faithful or RICHER than their mocks
(e.g. S5 Admin has 5 real-looking RBAC rows vs the mock's 1; S7 Alerts is fully realized). Deliberate
divergences confirmed intact: real curated numbers, token system, office-point map, union sidebar,
Path D add-backs. Scored screens (S4 Operations, S8 Pipeline, S10 Predictive) looked sparse ONLY from
cold-simulator data-state (~4-min telemetry cadence) — layout is fine; left untouched. The single
genuine, safe realignment: **S6 Report Center landed on an EMPTY prompt** while Stitch lands populated.

## What
Report Center now lands on a PRE-GENERATED default report (Stitch-faithful) instead of an empty
"press ประมวลผลรายงาน" panel. Rejected the trivial `hasRun=true`: once shown, filters LIVE-drove the
preview, so pre-revealing it would make ประมวลผลรายงาน inert — the exact anti-pattern PR-14's QCHECK
blocked. Instead switched to a SNAPSHOT model:
- `generated: {templateId, level, kpiTypes}` snapshot, initialised to the defaults → lands populated.
- Preview renders from `generated`. Filter edits are PENDING; `ประมวลผลรายงาน` (`runReport`) applies
  pending→snapshot. `isGenerated()` compares (template id, level, set-equal kpiTypes) to derive
  `pendingChanges`, which shows a `role="status"` hint ("ตัวกรองเปลี่ยนแล้ว — กด…เพื่ออัปเดต…") that
  clears on generate. `สร้างรายงานใหม่` (`resetReport`) resets filters AND regenerates defaults.
- Removed the now-dead `PreviewPrompt`/`report-prompt` empty state.

## Files
Edited: `web/src/screens/ReportCenterScreen.tsx` (+ full test rewrite). `ReportPreview`/`ReportFilters`/
`report.config` unchanged; `reportWiring.test.tsx` + `report.test.ts` untouched and green.

## Gates
`pnpm typecheck` · `pnpm lint` clean · `pnpm test` **514 pass (3× no-flake)** · `pnpm build` green.
Tests rewritten to the new contract (RED-proven against old impl first): lands populated (no
report-prompt/report-dirty), KPI/level changes pending-until-generate (asserts hint appears then
clears), reset regenerates defaults. Live Playwright proof (host Vite :5174): preview present on load,
filter change → dirty hint + preview holds, generate → energy tile applied + hint gone. Screenshots in
scratchpad — S6-realign-1-onload now matches the Stitch mock.

## QCHECK (Tier-1 adversarial, general-purpose agent)
VERDICT **no CRITICAL/HIGH product defect** — the reviewer verified (incl. by running the suite +
a mutation) that `isGenerated` set-equality is correct both directions, `snapshot()` copies the Set
(no shared-mutable ref vs `toggleKpi`'s fresh Set), the preview reads the GENERATED (not pending)
selection, reset leaves no stale state, the SimulatedBadge is intact, tokens 49/49, and the
`role="status"` hint + removed `report-prompt` leave no dangling refs. Fixes applied:
- **MEDIUM (test gap, mutation-proven):** the level test called `generate()` immediately, so it passed
  whether level was snapshot-gated or live-driven — the reviewer proved `level={generated.level}` →
  `level={level}` left all tests green. Fixed: the level test now asserts the header still shows
  ระดับองค์กร + `report-dirty` is shown *before* generate; added an analogous template-pending test.
  Re-mutated locally to confirm `level={level}` now FAILS the strengthened test.
- **Nit — hint copy:** "ตัวกรองเปลี่ยนแล้ว" → "ตัวเลือกเปลี่ยนแล้ว" (a template change also raises it,
  and the template picker is not strictly a "filter").
- **Nit — ≤50-line guideline:** extracted `ReportHeader`; the screen body is now 47 lines.
Tier-2 Codex not needed (presentational interaction change; no domain/security/contract-semantics risk).
