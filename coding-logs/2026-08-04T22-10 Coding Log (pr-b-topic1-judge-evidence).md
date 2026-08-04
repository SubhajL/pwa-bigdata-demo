# Coding Log: PR-B — Topic 1 same-DOM judge evidence (1.1–1.5)

Date: 2026-08-04 22:10 +0700
Branch: `test/topic1-judge-visible` from `main@10975a4` (== `origin/main`, post PR #31/PR-A)
Roadmap: `coding-logs/2026-08-04-20-14-04 Coding Log (overall-phases-and-pr-roadmap).md` §A3 (PR-B)
Lifecycle: g-coding (plain git + gh)

## Scope

Protect scored items 1.1–1.5 (35 pts): every proof observable on ONE open `/pipeline` DOM —
the page a judge actually watches — with committed rows distinguished from the pre-validation
`received` callback counter throughout. No HTTP/WS schema change; pipeline semantics unchanged.

## Changes

**Production (presentation-layer only):**

- `KpiRow.tsx` — KPI tiles expose `data-value` (absent when the honest display is "—").
- `ResponseTimeTable.tsx` — each `rt-row` exposes `data-path`/`data-count`/`data-failures`/
  `data-mean-ms` (mean absent for an all-failed endpoint).
- `DlqTable.tsx` — the all-runs total exposes `data-testid="dlq-total"` + `data-value`.
- `PipelineMonitorScreen.tsx` — when the polled `conservation.dead_letter` total moves,
  refetch DLQ page 0 (never on first arrival; never off page 0) so a dead-lettered message
  becomes visible on the already-open page.

**Evidence/scripts:**

- `topic1-pipeline.spec.ts` rewritten (still 5 tests): 1.1 committed-KPI growth + live pill;
  1.2 visible outage (`stop mosquitto` → pill `down|pending`) then pill `ok` + committed
  growth ≤ 30 s measured from broker start, same DOM, no reload (marker-checked); 1.3 all
  three rows 5/5 calls, zero failures, on-screen means ≤ 500 + Server-Timing `db;dur`;
  1.5 simulator MQTT `bad_asset` → DLQ KPI grows, the `PWA-UNKNOWN-DEVICE-000` row renders
  with no reload, then committed rows resume. 1.4 unchanged.
- `e2e/lib/api.ts` — `stopBroker()`/`startBroker()`.
- `scripts/demo-reconnect.sh` — success now requires `conservation.telemetry` growth
  (committed persistence), not just the pre-validation `received` counter.
- `scripts/demo-preflight.sh` — read-only TimescaleDB catalog check
  (`timescaledb_information.hypertables` → "hypertable, N chunk(s)").
- `scripts/show-hypertable.sql` — ordering narration (inspection newest-first vs API ascending).
- `e2e/playwright.config.ts` — stale "scenario specs reset" comment corrected to the
  ends-degraded design; runbook rows 1.2/1.4/1.5 updated to the strengthened evidence.

## TDD (RED first)

- Web: `pipelineComponents.test.tsx` T18 (evidence attributes ×3) and
  `pipelineWiring.test.tsx` T21 (DLQ auto-refresh fires on total change, NOT on first
  arrival) — captured 4 failing before implementation.
- E2E: rewritten spec run against the live stack pre-implementation — 1.1 RED
  (`kpi-rows exposes no data-value yet`).

## Gates

- web `pnpm test` **525 passed** ×3 (521 + 4 new) · lint ✓ · typecheck ✓ · build ✓
- api `test_evidence_docs.py` 4 ✓ (docs claims still pinned; spec count still 22)
- e2e `tsc --noEmit` ✓
- Live: web image rebuilt (source is baked into the container), then
  `pnpm --dir e2e exec playwright test tests/topic1-pipeline.spec.ts` → **5 passed (44.8 s)**
  and full `make demo-e2e` → **22 passed (1.3 m)**
- Scripts live: preflight prints `✓ topic ๑ · TimescaleDB catalog  hypertable, 1 chunk(s)`
  and ends `✓ DEMO READY`; `demo-reconnect.sh` →
  `✓ reconnected AND committed ingest resumed in 2s (received 9734→9742, committed 664872→664880)`

## QCHECK

Tier 1: review workflow (18 agents, 0 errors — correctness / oracle-validity / doc-truth,
adversarial verify per finding). Tier 2: Codex `gpt-5.6-sol` high, read-only. Converged on
the same core defects. No CRITICAL. Dispositions (every FIX re-gated green):

| Sev | Finding | Disposition |
|---|---|---|
| HIGH (Codex) | 1.2 stopwatch started after `compose start` returned (container startup excluded) | **FIXED** — `t0` before `startBroker()`; residual (≤~3.75 s disposition-retry commit) documented, guarded by the reconnect+SUBACK conjunct |
| HIGH (wf) | Runbook 1.5 cell claimed committed rows keep rising DURING `bad_asset` — every envelope is bad in that mode; they pause and resume after `MODE=normal` | **FIXED** — cell states the pause + post-reset rise |
| MEDIUM (both) | `demo-reconnect.sh` false-pass: baselines pre-restart satisfied by pre-outage traffic; unreadable baseline defaulted to 0 (fail-open) | **FIXED** — integer-validated pre-restart baseline (abort otherwise) + committed watermark taken AFTER restart returns |
| MEDIUM (Codex) | 1.5 could pass without exercising the auto-refresh (row could pre-exist from an earlier run) | **FIXED** — spec arms a page-0 (`limit=25`) refetch listener before injecting and awaits it |
| MEDIUM (Codex) | DLQ refresh abort-starvation under sustained growth (reload aborts in-flight fetch every poll) | **FIXED** — `useDlqLiveRefresh` coalesces: never reloads mid-flight, one follow-up after settle; unit-tested |
| MEDIUM (wf, mutation-proven) | offset guard (`dlqOffset === 0`) unpinned — deleting it survived 525/525 | **FIXED** — hook test pins no-reload off page 0 |
| MEDIUM (Codex) | 1.4 same-DOM rendered-order proof missing | **FIXED** — `range-row` exposes `data-ts`; spec asserts rendered ascending |
| MEDIUM (Codex) / refuted (wf: phase-locked cadence) | 1.3 torn read across probe rounds | **FIXED anyway** — single `$$eval` snapshot; all assertions from one atomic round |
| LOW (wf) | preflight catalog probe unbounded + infra failure misdiagnosed as schema verdict | **FIXED** — in-container `timeout 8`, exec failure reported distinctly |
| LOW (Codex) | runbook 1.3 row weaker than the automated gate | **FIXED** — all-three-rows 5/5 zero-failures wording |
| LOW (both) | screen function grew past the (pre-existing) 50-line breach | **FIXED** — logic extracted to `useDlqLiveRefresh` in `useDlq.ts` (screen shrank vs. the first draft) |
| LOW (wf) | 1.1 "stayed live throughout" overstated a single sample | **FIXED** — message reads "live at proof time" |
| refuted | T18 not pinning throughput/latency `data-value` (no consumer); 1.3 torn-read reachability (workflow) | no change — recorded |

## Post-fix gates

- web **529 passed** ×3 (525 + 4 hook/data-ts tests) · lint ✓ · typecheck ✓ · build ✓
- e2e `tsc` ✓ · api `test_evidence_docs.py` 4 ✓ · `bash -n` both scripts ✓
- Live (web image rebuilt): preflight `✓ TimescaleDB catalog hypertable, 1 chunk(s)` +
  `✓ DEMO READY`; reconnect drill `✓ … resumed in 1s (committed 670984→670987)` with the
  post-restart watermark printed; full `make demo-e2e` → **22 passed (1.2 m)**

## Candidate

Branch `test/topic1-judge-visible`, parent `10975a4` (merged PR-A/#31). Squash SHA in the
post-merge note.
