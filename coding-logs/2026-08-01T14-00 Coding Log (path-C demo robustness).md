# Coding Log — Path C · demo robustness polish

Baseline: `main` @ 3b84273. Branch `chore/demo-preflight-latency-deflake`.
Scope: two non-scoring robustness fixes in PR-17-owned infra. No production behavior change.

## What & why

Two demo-operator/gate flakes surfaced in the PR-7 session, both false-negatives that make
the demo look broken when it isn't:

1. **`scripts/demo-preflight.sh`** — the frontend surface was probed once, with no retry,
   unlike the API health-wait (60×2s). A slow Vite dev-server boot false-failed
   `make demo-preflight`. Added a symmetric 30×2s wait loop for `$WEB/`. On genuine timeout
   it does **not** `exit` (the frontend is one of many surfaces): it falls through to the
   existing aggregated `check "frontend"` which owns the ✗ verdict and non-zero exit — so a
   truly-down frontend still fails the gate, only a *slow* one now passes.

2. **`api/tests/test_latency.py::test_latest_query_uses_the_index_and_does_not_scan`** —
   flaked ~1 run in 4. Root cause was a **fixture** defect, not a query defect: it seeded
   500 rows of a *single* asset, so `asset_id='P-2'` selected every row and the composite
   `(asset_id, ts DESC)` index, the hypertable's time-only index, and a small-table seq scan
   all cost ~1 tuple — the planner's tie-break was a coin-flip. Fix: seed real background
   volume across 30 other roster assets so `asset_id='P-2'` is genuinely selective, then
   `ANALYZE`. The composite seek is then the decisively-cheapest plan on its own merits, with
   nothing forced. Verified deterministic 25/25 across a growing table (temp probe, deleted).

   *(First attempt — `SET LOCAL enable_seqscan=off` — backfired: it pushed the planner onto
   the time-only `_ts_idx`, not the composite index. Reverted. Making `asset_id` selective is
   the correct lever; forcing GUCs is not.)*

## Gates
- ruff `.` clean; mypy `.` clean (49 files).
- `test_latency.py` 3×: 8/8 each (was 7; +1 wiring test).
- preflight run end-to-end against live stack: green (both `→ waiting for …` lines, all
  surfaces ✓, DEMO READY). Re-run after the curl refactor: still green.

## QCHECK — 2-tier, uncorrelated findings (the gate earned its keep)

Tier-1 adversarial Opus subagent → **SHIP** (no CRITICAL/HIGH); flagged 2 LOW.
Tier-2 Codex `gpt-5.6-sol` high, read-only → **HIGH** + 2 MEDIUM + 1 LOW. Disjoint from Opus.

Codex **HIGH**: the guard proved *index-selection on the `LATEST_QUERY` constant* but not
*bounded retrieval*, and never proved `latest_reading()` runs that constant — two regressions
would pass: (a) dropping `LIMIT 1` (still an ordered index scan over the asset's whole
history), (b) rewiring `latest_reading()` to `query_range()[-1]` (correctness tests stay
green). Structurally pre-existing, but the selectivity fixture made (a) *more* likely to pass
deterministically — worth closing while in the file. Fixes:
- Assert a **`Limit` node with `Actual Rows == 1`** (bounded seek). Mutation-probe confirmed
  it BITES: real query → Limit(rows=1); `LIMIT`-less variant → no Limit node → guard fails.
- New **`test_latest_reading_executes_the_indexed_query`** (whitebox `inspect.getsource`)
  pins that production `latest_reading()` still executes `LATEST_QUERY`.

Codex **MEDIUM**: (i) curls had no `--connect-timeout`/`--max-time`, so a TCP-accepting-but-
hung frontend could wedge the gate past its nominal budget → added a shared
`CURL=(curl -sf --connect-timeout 2 --max-time 5)` used at every probe site. (ii) `LIMIT 30`
returns *up to* 30 — a shrunk roster could silently re-flake → assert `len(assets) >= 25`
(fail loud, not silent).

LOW (both reviewers converged on leftover noise): purge the 30-asset background volume in a
`finally` (both tables carry `run_id` since migration 002; deletes are index-served),
matching the file's existing purge discipline. Also corrected a docstring "Sort" overreach.

All CRITICAL/HIGH/MEDIUM resolved; re-ran gates green after fixes.

## Follow-up (not this PR)
The `query_range()[-1]` rewire is now caught by the wiring test; no other debt opened.
