# Coding Log: PR-C — induced SEC evidence + strict twin timing (2.3, 3.3)

Date: 2026-08-04 22:40 +0700
Branch: `feat/sec-evidence-strict-timing` from `main@3e67196` (== `origin/main`, post PR-B/#32)
Roadmap: `coding-logs/2026-08-04-20-14-04 Coding Log (overall-phases-and-pr-roadmap).md` §A3 (PR-C)
Lifecycle: g-coding (plain git + gh)

## Scope

- **2.3** — an induced anomaly (distinct from `pressure_drop`) must display a
  **recomputable** SEC on the open twin: inputs, observation timestamps, pair skew,
  formula, result.
- **3.3** — the model transition clock becomes strict: critical AND recovery **fail past
  30,000 ms**. (Closes the Codex finding deferred from PR-A: `Math.max(…, 1_000)` floor.)
- No API changes: existing `SecResponse` fields (power_kw, flow_m3h, observed_at ×2,
  skew_s) become visible. Additive DOM metadata only.

## Changes

- `web/src/features/twin/SecTooltip.tsx` — renders the derivation (`sec-formula`,
  `sec-observed`) with raw-value attributes `data-sec`/`data-power-kw`/`data-flow-m3h`/
  `data-skew-s` on `sec-card`; ALL derivation attributes absent when there is no usable
  pair (automation must never read a fake input); pure `SecDerivation` helper, never NaN.
  The 120 s skew budget is NOT baked into the component — it stays in the API
  (`TWIN_MAX_PAIR_SKEW_S`) and the E2E assertion.
- `web/src/features/twin/SecTooltip.test.tsx` (new, 3 tests) — derivation rendering,
  no-pair honesty (dash + detail, no attributes), partial-timestamp NaN guard.
- `e2e/tests/scenario-transitions.spec.ts` —
  - new "anomaly → critical ≤ 30 s → SEC derivation recomputable" test: strict remaining
    budget (no floor), `data-sec == data-power-kw / data-flow-m3h` (1e-9 rel), skew ≤ 120,
    formula/observed visible, API payload obeys the same quotient rule, no-reload marker;
  - `pressure_drop` critical clock: floor removed, budget-not-pre-spent guard, hard
    `elapsed ≤ 30_000`;
  - recovery clock: 31_000 allowance → strict 30_000.
- `docs/demo-coverage.md` — 22 → 23 specs (guard-enforced); 2.3 row notes the induced
  proof and the `scenario anomaly` spec.

## TDD

RED: `SecTooltip.test.tsx` 3 failed pre-implementation (no sec-card/attributes). The
strict-clock edits' RED is the boundary argument (a 30,001 ms transition now fails; the
old floor and the 31 s allowance provably passed one).

## Gates

- web **532 passed** ×3 (529 + 3) · lint ✓ · typecheck ✓ · build ✓ · e2e `tsc` ✓
- api `test_evidence_docs.py` 4 ✓ (23-spec claim verified against the actual count)
- Live (web image rebuilt): `scenario-transitions.spec.ts` → **6 passed (44.9 s)** incl.
  the new anomaly test under strict clocks; full `make demo-e2e` → **23 passed (1.5 m)**

## QCHECK

Tier 1: review workflow (11 agents, 0 errors — oracle-validity / component-truth,
adversarial verify per finding; one verifier live-reproduced its finding on the stack).
Tier 2: Codex `gpt-5.6-sol` hung on stdin and was stopped (no output); per the standing
substitution ladder, tier 2 ran as an **Opus adversarial read-only agent** over the
UPDATED slice (which by then included the `demo.py` fix the workflow had motivated).

| Sev | Finding | Disposition |
|---|---|---|
| CRITICAL (wf, live-reproduced) | The anomaly SEC oracle (and a real judge's click) fails ~40% of wall-clock time: the simulator's one-signal-per-visit rotation leaves P-2's newest power/flow pair alternating ~95 s / ~143 s skew; >120 s → `/api/twin/sec` refuses; the anomaly injection did NOT freshen the pair (vibration-only instant; trajectory rows at top-of-hour) | **FIXED in-slice (product)** — `_scenario_instants` now lays the hour-0 trajectory power/flow values at `now` for every telemetry scenario, each reserved in its bucket solve (blended means unchanged). Live-verified at arbitrary phase: `skew_s=0.001` for anomaly AND normal; worn SEC 0.266 vs healthy 0.123 kWh/m³ (coherent wear story). RED test `test_scenario_freshens_the_sec_pair_for_item_2_3` + extended solver test |
| MEDIUM (wf) | Coverage 2.3 row overclaimed on-cue demonstrability (pre-fix) | Resolved by the product fix; runbook §0b documents the mechanism |
| MEDIUM (Opus) | SEC card never refetches when P-2 was selected BEFORE the injection (re-click is a React no-op) — natural narration order shows stale SEC | **FIXED** — SEC effect now depends on the selected device's rendered status (`selectedStatus`); card follows the symbol. RED screen test R13b (fault + recovery refetch) |
| MEDIUM (Opus) | Runbook 2.3 operator row had no scenario prerequisite (fresh pair is a ~120 s guarantee, then honest "—" can return) | **FIXED** — row: press จำลองอุปกรณ์เสื่อมสภาพ then click P-2; derivation named; honest "—" caveat kept |
| LOW (wf) | `data-skew-s` budget check could pass vacuously (`Number(null)`=0) | **FIXED** — presence+finiteness asserted |
| LOW (wf) | Anomaly test relies on the later control test's reset (ends-degraded contract) | **ACCEPTED** — verified preserved; documented in the spec comment |
| LOW (Opus) | 5 s wall-clock window in the api test could flake on a loaded machine | **FIXED** — predicate keyed by the run's `message_id`s |
| LOW (Opus) | `_replace_scenario` crossed 50 lines | **FIXED** — `_scenario_instants` extracted |
| LOW (Opus) | Instants ±2 ms bucket edge; solved rows newer than instants near top-of-hour | **ACCEPTED** — bounded/harmless (reserved == target ⇒ means exact either way; verified analysis in review) |
| LOW (Opus) | SEC timestamps render UTC (slice idiom) vs th-TH elsewhere | **ACCEPTED** — matches `RetrievalEvidence` precedent; skew a judge recomputes is unaffected |
| refuted (wf, by direct measurement) | "Strict 30 s clocks are flaky-tight" (measured worst case ~20 s, ~9-10 s margin); "resetToNormal 45 s inconsistent" (setup ceiling vs oracle contract) | no change — recorded |
| Verified sound (Opus) | solver well-definedness incl. n=0/warm/replace; conservation + REPLACES invariants (E2E `removed_rows` check); no one-instant assumption anywhere; model-path outcomes unchanged (reserved == target); all 236 pumps × both wears: no out-of-band instant; float roundtrip bit-exact (1e-9 assertions compare diff 0) | — |

## Post-fix gates

- web **533 passed** ×3 (532 + R13b) · lint ✓ · typecheck ✓ · build ✓ · e2e `tsc` ✓
- api **311 passed** (310 + fresh-pair test) · ruff ✓ · mypy ✓ · evidence guards 4 ✓
- Live (api+web images rebuilt): `make demo-e2e` → **23 passed (1.5 m)**; scenario suite
  re-run at a different sim phase → **6 passed**; direct probe: anomaly → `skew_s=0.001`,
  normal → `skew_s=0.001`

## Candidate

Branch `feat/sec-evidence-strict-timing`, parent `3e67196` (merged PR-B/#32).
