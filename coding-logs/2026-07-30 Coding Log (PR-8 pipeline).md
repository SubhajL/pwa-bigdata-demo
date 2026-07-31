# Coding Log — PR-8 · Data Pipeline & Quality monitor

Plan: `docs/DREP-PR8-pipeline.md` (Codex-hardened, 27 findings accepted).
Baseline: worktree off origin/main @ 40fd376. Branch `feat/pr8-pipeline-monitor`.

## S0 (Claude) — gate repair
Host `pnpm lint` was broken (`eslint-plugin-jsx-a11y` missing from stale node_modules).
Repaired via `pnpm install --frozen-lockfile`. All 4 web gates green (lint/typecheck/
test 202✓/build). Also: hardened pip in api/simulator Dockerfiles (flaky-PyPI resilience).

## S1 (DeepSeek, SL-2) — pure logic module
Stop line: **SL-2**, chosen by Q0–Q2:
- Q0 (never-delegate): NO — no security/auth/tenant/migration; spec fixed by DREP §4;
  oracle = Claude-authored unit tests T1–T9.
- Q1 (one hard part + plumbing): NO — several independent pure functions, not one core.
- Q2 (public surface / boundary / >3 fns): YES — new module `features/pipeline/`, new
  exports (types + config + ~7 fns), DREP §4 lists 7 contracts. → **SL-2**.
Claude authors: types + config + fn signatures with unimplemented bodies (seams) + the
acceptance tests (RED-proven). DeepSeek fills the bodies to GREEN.

### S1 outcome — GREEN
- Delegate: DeepSeek v4-pro (pi, Mode A), SL-2. Implemented 7 fn bodies (probeLatency,
  computeIngestRate, latencySummary, connectionKind, conservationHolds, toCsv, buildChartPath)
  + helpers (parseDbMs, escapeField, sortKeysDeep). **1 fix round.**
- Claude authored T1–T9 (RED-proven: 18/18 failed on "unimplemented", the right reason).
- Tier-1 review (Claude) found 1 MEDIUM: `sortedJson` used JSON.stringify's array-replacer,
  which is a global allow-list that DROPS nested keys → CSV export data loss for nested `raw`.
  Fixed by delegate (recursive `sortKeysDeep`); LOCKED with a Claude-authored nested test and
  **mutation-verified** (reverting the fix fails exactly that test, 1 failed | 18 passed).
- Claude fixes to own seams: pipeline.config.ts comment contained "2000ms" which tripped
  tokens.test.ts (POC acceptance #10, no hardcoded ms in src/) — reworded. F16 formatDecimal
  was ALREADY present in lib/format.ts (SEC) → no-op, scope reduced.
- Gates (Claude-run): tsc 0 · eslint 0 · full suite 221 passed (202 baseline + 19 S1) ·
  build green · 3× flakiness stable.
- Tier-2 QCHECK: deferred to the PR boundary (PR-8 lands as ONE PR after S2/S3); Tier-1 done.
- Stop-line adaptation: S1 clean at SL-2 with 1 fix round (within tolerance) → S2 stays SL-3,
  S3 stays SL-1 as planned.
- NOT landed: per user "build S1, then check in" + DREP one-PR model. Files staged in worktree
  feat/pr8-pipeline-monitor, uncommitted.

### S2 outcome — GREEN (Claude-implemented, Q0)
- Stop line: Q0 fired — StrictMode/generation concurrency correctness has NO cheap oracle
  (Codex CRITICAL). Claude implemented all of S2; delegate NOT used for this slice.
- Files: ownedHooks.ts (useOwnedAsync + useOwnedPoll — generation+abort primitives, mirroring
  useTwinSocket), usePipelineStatus.ts (+pushSample), useLatencyProbe.ts (+runProbeRound,
  sequential probing), useDlq.ts (offset pagination), useRange.ts (item 1.4).
- Tests: ownedHooks.test.tsx (7) + pipelineHooks.test.tsx (6). Impl-before-test (Q0) →
  MUTATION-VERIFIED: removing the generation guard fails the "drops superseded" oracle;
  removing the recursive re-schedule fails the "re-runs after delay" oracle. Both restored green.
- React-Compiler lint (react-hooks v7): refactored to satisfy "no ref access during render"
  (callers pass useCallback-stable tasks; optsRef synced in an effect) and "no synchronous
  setState in effect" (loading is initial-only; a reload keeps last data). No eslint escape hatch.
- Gates: tsc 0 · eslint 0 · full suite 234 passed · build green.

### S3 outcome — UI (DeepSeek, SL-2) + QCHECK fix round
- Claude authored: all component/screen/wiring tests (T10–T21), the 7 component seams, the SCREEN
  (F15, wiring+honesty-critical: h1/testid render without a fetch, 5 states), Num `decimal` kind,
  nav flip + routes registration. Delegate wrote the 7 component render bodies.
- Tier-2 QCHECK: independent Codex gpt-5.6-sol xhigh. Verdict "DO NOT MERGE" → 1 CRITICAL, 4 HIGH,
  3 MEDIUM, 2 LOW. Dispositions (all CRITICAL+HIGH fixed; key MEDIUMs fixed):
  - CRIT (honesty): ResponseTimeTable put a violet SIMULATED badge on MEASURED latency + no SLA
    caption + printed "0.0ms" for all-failed → ACCEPT. Remove badge; add demo-env/"not a production
    SLA" caption; render "—" for count===0. Locked by T12.
  - HIGH (honesty): per-tile provenance → ACCEPT. Per-tile SimulatedBadge on the 3 feed tiles; the
    measured latency tile gets a demo note, not violet. Locked by T17.
  - HIGH (correctness): samples not reset on run-id change (old run mislabelled "this session") →
    ACCEPT. pushSample now RESETS on run-id change (Claude). Locked by pushSample + hook tests.
  - HIGH (correctness): KPI latency averaged all-failed (meanMs 0) → reassuring zero; missing
    conservation shown as 0 → ACCEPT. Success-weighted latency ignoring count:0; disabled/missing
    conservation → "—". Locked by T17.
  - HIGH (UX): DLQ Next never disabled → overrun hides both controls, stranding the operator →
    ACCEPT. hasNext from total/offset/limit; keep controls on empty overrun. Locked by T13.
  - MED (security): toCsv formula-guard bypassable via leading tab ("\t=HYPERLINK") → ACCEPT.
    FORMULA_TRIGGER now includes leading tab/CR (Claude). Locked by toCsv test.
  - MED (vacuous concurrency tests): overlap not distinguished from setInterval; StrictMode test was
    expect(true) → ACCEPT. Added a deferred max-concurrency-1 overlap test + a real StrictMode oracle
    (no console.error, exactly-one apply). Impl already correct (both pass first try).
  - MED (per-card error states): RetrievalEvidence "loading forever" after failure; DLQ empty card on
    error → ACCEPT. Screen passes error/stale; components render error states.
  - MED (component test vacuity): strengthened T13 (assert serialised raw value), T14 (blob type+size
    +revoke; contents covered by toCsv units — jsdom Blob has no .text()), T15 (assert counts), T17
    (recheck all tiles), T21 (await a loaded leaf before axe, not the skeleton).
  - LOW: screen used PIPELINE_CONFIG for budget + page size (was hardcoded 500/25). Fixed.
- Fix round delegated to DeepSeek (component bodies); Claude fixed own seams (pushSample, toCsv,
  screen, interfaces) + all test strengthening.

### Verification + landing
- After the fix round: diff audit clean (all 18 test files byte-identical), fabrication scan clean,
  ResponseTimeTable renders NO SimulatedBadge (comment only) + data-derived "ไม่ใช่ SLA production"
  caption + "—" for failed rows; KpiRow badges its 3 feed tiles. Gates (Claude-run): tsc 0 · eslint 0
  · full suite 253 passed · build green · 3× flakiness stable · wiring verified (screen→routes; all
  7 components + 4 hooks → screen; no orphans).
- Tier-2 re-verification: every CRITICAL/HIGH finding is now enforced by a strengthened acceptance
  oracle (T12 no-badge+caption+—; T17 per-tile+success-weighted+disabled→—; T13 pagination; pushSample
  run-id reset; toCsv leading-tab guard; ownedHooks max-concurrency-1 + real StrictMode). Disposition:
  findings oracle-locked rather than re-narrated by a second full Codex pass.
- Delegate fix rounds: S1=1, S3=1. Stop-line adaptation: both delegated slices landed clean within 1
  round → no escalation; the concurrency-critical S2 was correctly kept with Claude (Q0).
