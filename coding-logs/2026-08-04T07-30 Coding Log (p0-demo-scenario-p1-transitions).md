# Coding Log — P0 demo-scenario director + P1 transition-observing E2E

**Slice:** `feat/demo-scenario-api` · **Owner:** Claude (no delegation) · **Date:** 2026-08-04
**Lifecycle:** g-planning → g-coding · **Gate:** QCHECK Tier 1 (g2-check, self) + Tier 2 (Codex gpt-5.6-sol, read-only)

## Goal (from /goal work order)
- **P0**: a demo-only, environment-gated endpoint — `POST /api/demo/scenario {mode, target:"P-2"} → {run_id}` —
  that injects a targeted fault immediately (<1s band flip + degraded model health), idempotently,
  never reachable on a production path; plus a "สาธิตเหตุการณ์" control on the twin showing the active run_id.
  One fault → items 2.2, 2.3, 2.4, 3.3 fire on command (sidesteps the ~48s roster round-robin).
- **P1**: a transition-observing Playwright spec — inject via the API, assert the SAME loaded DOM
  changes (no reload): status flip, pipe highlight, affected customers, model→twin ≤30s on a real timer.

## Design (synthesized: Claude plan + Codex gpt-5.6-sol xhigh second plan)
- **Mean-solve injection.** Injected readings BLEND into each hourly bucket's per-signal mean
  (`features._bucket_means`), so the endpoint reads each bucket's existing (n, mean) and solves
  `k=min(3·max(1,n), 240)` rows of `x=(t(n+k)−nm)/k` so the blended mean lands EXACTLY on a
  `pwa_ml.lifecycle` trajectory value — deterministic at any stack age. Worn wear 0.34 → health ≈32
  (critical, pre-failure); healthy wear 0.02 → ≈96. Pinned against the shipped `model.pkl`.
- **Honest model path.** No health row or health frame is fabricated: the untouched 10s scoring loop
  scores the steered window through the shipped bundle and broadcasts `kind="health"` itself.
  The instant reading is at most band-`warning` by construction, so a DOM `critical` is ONLY
  reachable via the model — that is what makes the E2E's second stage attributable.
- **Atomic replacement (adopted from Codex).** Each application takes a per-target
  `pg_try_advisory_xact_lock` (409 to the loser), deletes the target's previous `source='DEMO'`
  pairs (ledger through the telemetry join), re-reads stats, solves, and inserts — ONE transaction.
  Re-apply replaces; it never accumulates.
- **Conservation.** Every telemetry row is paired with its ledger row in the same transaction, both
  `source='DEMO'` (mirrors `BACKFILL` provenance, `005_row_provenance.sql` — no migration needed).
  `bad_asset` writes a `DEMO_DLQ`-ledger + dead_letter pair, never deleted (dead_letter has no
  provenance column; deleting the ledger side would orphan it).
- **`normal` FORCES healthy** (divergence from the Codex plan, deliberate): P-2's backfilled baseline
  is critical at cold start and washed toward normal on a warm stack, so a pure delete cannot show a
  recovery. Steering the window healthy makes normal→warning→critical→normal deterministic on the
  demonstrated pump — which the /goal names explicitly. Codex's alternative (seed a second normal
  pump P-1 with its own DMA branch) was rejected as scope creep that still leaves topic-2 flakiness.
- **Gate.** `Settings.demo_controls=False` default; only `infra/docker-compose.yml` sets
  `DEMO_CONTROLS=1`. POST → 403 when off; GET `{enabled:false}` drives the UI panel to render nothing.

## Defect found and fixed in SHIPPED code (exposed by the P1 spec on a warm stack)
`scoring.score_all` returns events worst-health-first and `run_scoring_loop` broadcast the whole
burst in one event-loop turn. After ~24h uptime EVERY roster pump is scoreable and non-normal
(~229 health frames/cycle), and `ws.Subscriber._offer` evicts the least-recently-updated asset over
the 64-asset cap — i.e. the WORST device, first, every cycle, forever. P-2's critical frame never
reached any browser while status frames kept flowing: item 3.3 was silently dark on exactly the
warm stack a judge would see. Fix: `broadcast_scoring_events` hands frames to the hub healthiest-
FIRST, so buffer pressure sheds healthy assets and the worst always survives to the wire.
Pinned by `api/tests/test_scoring_broadcast.py` (buffer cap 2, burst of 3, worst survives).

## TDD evidence
- RED→GREEN, in order: `test_demo_solver.py` (17: solver exactness/bounds, trajectory oracle
  through shipped bundle, instant-reading bands) → `app/demo.py`; `test_demo_scenario.py`
  (15 integration on throwaway TimescaleDB: 403 gate, 404/422/409, conservation before/after,
  instant-warning broadcast via stub hub, window-scores-critical and reset-scores-healthy through
  the REAL `query_range → build_window → score_window`, replacement-not-accumulation, other-source
  preservation, forged message_id collision → loud rollback, Swagger presence, GET run_id) →
  `routes/demo.py` + `main.py` + `config.py` + `models.py`; `test_scoring_broadcast.py` (2) →
  scoring fix; web `DemoScenarioPanel.test.tsx` (5) + screen wiring test → panel + wiring.
- Full gates: api **306 passed** · ruff · mypy clean; web **521+ passed** · eslint · tsc · build clean;
  e2e **22 passed** (17 existing topics + 5 new) against the live compose stack, 3× flakiness clean
  on the new api tests.

## Review (2026-08-04, Asia/Bangkok) — working-tree, feat/demo-scenario-api

### Reviewed
- Repo/branch: pwa-bigdata-demo / feat/demo-scenario-api (working tree, pre-commit)
- Scope: all new/modified files (excluding the pre-existing user edit to
  `coding-logs/2026-08-01T09-30 …` — not mine, not committed here)
- Commands: git diff/status, targeted greps (wiring, tokens, raw hex, advisory-lock uniqueness),
  full pytest ×2 + new-file 3×, vitest, eslint, tsc, build, live-stack Playwright ×3,
  live WS frame observation (25s capture — the evidence for the eviction defect)
- Not inspected: Makefile (unchanged; `demo-scenario.sh` gained a best-effort director reset
  per Tier-2 MED-6), topic1–3 specs (unmodified, re-run green), simulator (untouched)

### Findings (Tier 1, self — all fixed pre-commit)
MEDIUM
- Conservation not structural under forged message_id collision — `api/app/demo.py` batch
  `_LEDGER_INSERT` had `ON CONFLICT DO NOTHING` while telemetry always inserted; a pre-claimed id
  would skew `ledger == telemetry + dead_letter` silently. Fix: batch insert has NO conflict clause
  (collision → UniqueViolation → whole replacement rolls back); DLQ path keeps the checked
  RETURNING idiom. Test: `test_a_forged_message_id_collision_fails_loudly_and_writes_nothing`.
LOW
- Vacuous test `test_score_all_still_reports_rows_worst_first` (asserted empty==empty) — removed;
  rows ordering already pinned by `test_scoring_cycle.py::test_score_all_returns_rows_worst_first`.
- `DemoScenarioRequest.target` unbounded — bounded `max_length=64`.

### Findings (Tier 2, Codex gpt-5.6-sol high, read-only) — 2 HIGH · 7 MEDIUM · 2 LOW
Characteristically disjoint from Tier 1 (semantic/temporal), exactly the split the QCHECK
protocol predicts. Disposition:

**Adopted (fixed pre-commit, each with a pinning test where applicable):**
- HIGH-1 — my reversal fix sent recovery (`normal`) frames FIRST, and `ws.Subscriber._evict_one`
  sheds all-normal buckets regardless of recency; a recovery is emitted exactly once, and a stale
  live health frame beats every later topology refetch client-side → a connected twin could stay
  red forever. Fix: `broadcast_scoring_events` is now async and `await asyncio.sleep(0)` after
  every offer, so socket tasks drain at production rate and pressure never builds; healthiest-first
  ordering kept as the wedged-client fallback. Test:
  `test_a_recovery_frame_survives_the_burst_when_a_drainer_is_running`.
- HIGH-2 — the E2E suite skipped wholesale when `DEMO_CONTROLS` was off → a broken scenario API
  produced a green gate with zero scenario tests. Now a hard `expect(...).toBe(true)` in beforeAll.
- MED-3 — the instant reading skewed the newest bucket's solved mean by d/(n+k+1). `solve_injection`
  now takes `reserved=` and `_solved_rows` folds the instant reading into its bucket's solve.
  Tests: `test_solver_folds_a_reserved_reading…`, `test_solved_rows_leave_the_instant_buckets_mean…`.
- MED-4 — a post-commit `ANALYZE` failure 500'd an already-successful mutation and suppressed the
  instant broadcast. `_analyze` is now best-effort (logged, never raised).
  Test: `test_analyze_failure_never_propagates`.
- MED-6 — `make demo-scenario MODE=normal` (runbook's documented reset) didn't clear director
  injections. `scripts/demo-scenario.sh` now also POSTs `{mode:"normal"}` best-effort on reset.
- MED-8 — the bad_asset E2E proved liveness via `received` (paho callback counter, increments even
  with a wedged consumer). Now asserts the PERSISTED conservation ledger keeps growing.
- MED-9 — `active_run_id` never reflects `bad_asset` runs; contract narrowed explicitly to "newest
  TELEMETRY-injection run" in the model + route docstrings (DLQ runs are traceable in the browser).
- LOW-10 (route half) — `demo_scenario` exceeded 50 lines; target validation extracted to
  `_require_pump_target`.
- E2E recovery budget tightened from 45s to the advertised 30s (part of MED-7).

**Declined, with rationale:**
- MED-5 (unauthenticated demo control on host-published :8000) — the compose demo stack is the
  explicit enablement boundary; every write surface of this local demo is unauthenticated by
  design. Documented as an accepted-exposure note in the runbook §0b instead.
- MED-7 (MutationObserver batching) — React commits the two status changes seconds apart; a
  same-microtask batch is unreachable in this flow. The +1s poll floor caps overshoot at ~1s.
- MED-3 (MQTT-race half) — a reading committing between stats-read and insert shifts one bucket
  mean by one unsolved term; margin is ~8 health points and the oracle test pins the end state.
  Serializable retry loops are overkill for a demo surface. Accepted, documented here.
- LOW-10 (component half) — `DemoScenarioPanel` at ~79 lines follows the repo's established
  screen/panel component precedent (OperationsTwinScreen ~250 lines).

### Open Questions / Assumptions
- Demo dead letters accumulate forever by design (parity with FAULT_MODE=bad_asset). Accepted.
- Repeated fault applications briefly hold the advisory lock ~0.2–1s; concurrent operator sees 409
  and simply retries. Accepted for a demo surface.
- The scoring firehose itself (every warm-stack pump broadcasting `warning` every cycle) is
  pre-existing behaviour, out of this slice's scope; the eviction fix makes it harmless for the
  demonstrated pump. A follow-up could rate-limit unchanged-status re-announcements.

### Rollout Notes
- No migration. Flag default-off (`DEMO_CONTROLS`); compose-only enablement. Rollback = unset flag
  (+ optionally `DELETE FROM telemetry/ingress_ledger WHERE source='DEMO'`).
- The scenario E2E file deliberately ENDS on `pressure_drop`, leaving P-2 degraded — the state the
  topic-2/3 snapshot specs expect, making them LESS flaky on warm stacks.
