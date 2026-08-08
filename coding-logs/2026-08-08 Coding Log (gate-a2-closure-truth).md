# Coding Log — Gate A2 closure: evidence/handoff truth

**Date:** 2026-08-08 · **Branch:** `fix/gate-a2-closure-truth` · **Parent:** `9a6c83c` (main)
**Lifecycle:** g-coding (TDD docs-guard → QCHECK loop-until-dry → PR → squash-merge)
**Session shape:** four-path closure — Path 1 (this PR) → Path 2 (final warm acceptance at the
closure SHA) → Path 3 (authorized true-cold) → Path 4 (GIS authority track — **blocked**, readiness
only). Path-3 destructive authorization and Path-4 "tokens not available yet" were confirmed by the
operator before work began.

## Goal (Path 1)

Land one narrow evidence/handoff-truth PR so the repository describes the *current* accepted state
before any re-acceptance run. Scope, and nothing else:

1. **`.gitignore` disposition** — ignore runtime rehearsal/acceptance evidence archives
   (`evidence/*`, keep `!evidence/.gitkeep`). Decided: **KEEP**. Rationale: these archives are
   SHA/hash/timing-stamped *runtime output*; the harness that writes them is committed, its run
   artifacts are not — the same pattern already applied to `data/curated/pipe_ry/`. Leaving the
   change uncommitted also kept the tree dirty, and both `demo-acceptance.sh` and
   `demo-rehearsal.sh` refuse a dirty tree — so committing it is a precondition for Path 2/3.
2. **`docs/demo-coverage.md` truth-up** — the matrix still said "Gate A1 pending" in ~8 places and
   never recorded the accepted state. Corrected to: **Gate A1 ACCEPTED @ `b596846`** — a complete
   single-SHA acceptance (warm 3× + approved cold run; core evidence; `PIPE_GIS_ENABLED=0`),
   corroborated by a retained checksum-valid archive. It **closed the five formerly-pending Topic-3
   rows** (3.1/3.2/3.4/3.5/3.6); it does NOT accept the later PR-I/PR-J work, so the current item
   2.4 (clickable 200-customer proof) is the final Gate A2's. **Gate A2 is NOT yet certified at a
   single SHA:** its evidence is split and operator-reported — a warm three-run §7 acceptance at
   `c67bd54` (31 pass / 6 skip; `PIPE_GIS_ENABLED=0`; 3× §7 exit 0; `demo-acceptance/v2` manifest
   clean; no retained manifest in this repo) and the judge-sequence rehearsal + archived timings at
   `9a6c83c` (#46, retained archive) — and because the rehearsal landed AFTER c67bd54, no single
   SHA carries the complete bundle; the single-SHA Gate A2 is re-run at this closure SHA (Path 2),
   producing the auditable manifest. Criteria 3.1/3.2/3.4/3.5/3.6 flipped ◑ → ✅ (Gate A1).
   Optional/gated items (true-cold, `PIPE_GIS_ENABLED=1`) recorded as open, out of the 16 scored
   items.
3. **Coding-log pointer** — `.codex/coding-log.current` repointed to this file.
4. **This closure log.**

## TDD

The doc was stale *because a guard test pinned it stale*: `test_coverage_keeps_gate_a1_evidence_
boundary` required both `"Gate A1 pending" in coverage` and the `◑` partial markers. So the RED
step was to **invert the guard**, not merely add one.

- **RED** — renamed → `test_coverage_records_accepted_gates`, asserting: `"Gate A1 pending"` is
  gone; `Gate A1 … ACCEPTED … b596846`; BOTH split-SHA evidence markers (`c67bd54`, `9a6c83c`) are
  present; Gate A2 is recorded "not yet"/"re-run at" the closure candidate (NOT a completed
  single-SHA acceptance); the honesty qualifiers (changed-candidate, `PIPE_GIS_ENABLED=0`,
  permission, `CONFIRM_VOLUME_RESET`) are pinned; and each of 3.1/3.2/3.4/3.5/3.6 is `✅`, no longer
  "pending Gate A1". Ran against the unchanged doc → FAILED as intended (twice: first on the stale
  `'Gate A1 pending'`, then — after the QCHECK HIGH — on the Gate A2 single-SHA overclaim).
- **GREEN** — four edits to `docs/demo-coverage.md` (header stamp + acceptance boundary; the five
  criteria rows; the post-table summary; the Bottom line). Full `test_evidence_docs.py` → **11
  passed**.
- **Honesty rail retained** — the blanket-overclaim `forbidden` patterns (no lazy
  "16/16 E2E-verified" / "all scored items verified end-to-end") were kept verbatim; acceptance is
  stated only with exact SHAs. A changed candidate still re-runs warm acceptance at its own SHA —
  which is Path 2, below.

## Gates (Path 1)

- `pytest api/tests/test_evidence_docs.py` — 11 passed (RED→GREEN captured).
- Change surface is docs + one Python guard test + `.gitignore` + coding-log pointer — no product
  runtime path, no web/e2e spec (spec count stays **37**, so `test_demo_docs_match_current_director`
  is unaffected), no migration.

## QCHECK — 2-tier (Codex `gpt-5.6-sol` xhigh + Opus 4.8), loop-until-dry

Five rounds; each surfaced a distinct, real defect the prior pass missed — the value of two
independent model families on a truth-claims change:

- **R1 — contract/factual.** **HIGH (Codex):** the draft claimed "Gate A2 ACCEPTED @ `c67bd54`" as a
  complete single-SHA gate, but the warm §7 3× ran at `c67bd54` while the required judge rehearsal
  (#46) landed later at `9a6c83c` — no single SHA carried the whole bundle. + 2 MED (greedy row
  regex; unpinned qualifiers) + LOW (A1 cold-run under-described). All fixed.
- **R2 — adversarial provenance.** **HIGH (Codex):** Gate A1 @ `b596846` was applied across a CHANGED
  candidate — the current item 2.4 cites PR-J (`8e8801d`, later), and the archived Gate-A1 report
  says it "does not start or accept PR-I/PR-J work". Fix: Gate A1 scoped to CLOSING the five Topic-3
  rows; the rest deferred to a re-run Gate A2. + 3 MED (guard permitted a contradictory acceptance
  sentence; weak negative/qualifier binds; `c67bd54` figures unauditable → relabelled
  operator-reported) + LOW (`PIPE_GIS=1`→`PIPE_GIS_ENABLED=1`). All fixed; mutations proven rejected.
- **R3 — merged-artifact/guard-strength.** 3 MED (guard lacked Gate-A1 EXCLUSIVITY; qualifiers still
  doc-global; ACCEPTED-negative untempered) + a branch-provenance note. Fixed: exact row-set
  assertion `{3.1,3.2,3.4,3.5,3.6}`; optional-gates section extraction; tempered negatives.
- **R4 — guard precision.** 1 MED (Codex): the line-wide temper was too broad — an unrelated `no`
  suppressed detection (`"…has no retained manifest but is now ACCEPTED at deadbeef"`). Fix:
  per-occurrence check requiring a negation in the 30 chars immediately before the verb. Opus: DRY.
- **R5 — closing.** Both tiers **DRY** (nothing above LOW; Codex independently reproduced the
  mutation proof). One LOW/observational (a hypothetical newline-split overclaim with a novel SHA
  could evade the loop; the real doc contains no such statement) accepted per the disposition rule.

Every guard change was verified deterministically with adversarial mutation tests (single-SHA
overclaim, contradictory sentence, ◑-row-with-trailing-✅, `pending`-in-status, 2.4-tagged-Gate-A1,
permission-removed, and R4's "no…ACCEPTED @ deadbeef") — all rejected; honest negations pass; the
real doc + suite stay green (11 passed).

## Forward pointers (post-merge, this session)

- **Path 2 — final warm Gate A2 at the closure SHA.** After this PR squash-merges and local `main`
  lands the new SHA, run `EVIDENCE_DIR=<external> make demo-acceptance-3x` + `make demo-rehearsal`
  + all source/package gates + `make demo-e2e`. The merge SHA of THIS PR is the only final Gate A2
  candidate. Preflight note: free tsdb host port 5433 (stop `trend-paper-db` or `TSDB_PORT=5435`);
  all worktrees share `COMPOSE_PROJECT_NAME=pwa-demo`.
- **Path 3 — true-cold (authorized).** `EVIDENCE_DIR=<external> make demo-e2e-cold
  CONFIRM_VOLUME_RESET=1`, then verify normal runtime restoration and archive the cold manifest
  separately. The earlier Gate A1 deletion authorization is NOT carried forward; a fresh
  exact-command confirm precedes the volume wipe.
- **Path 4 — GIS authority track (BLOCKED).** Needs written redistribution permission + approved
  source fingerprint + approved bundle sha256; none are in the repo and must not be reconstructed
  from the bundle. Readiness checklist delivered separately; activation deferred.
