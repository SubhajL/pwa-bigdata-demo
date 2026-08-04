# Coding Log: PR-A — evidence truth and documentation drift

Date: 2026-08-04 21:40 +0700
Branch: `fix/evidence-truth` from `main@a98a359` (== `origin/main`, post PR #30)
Roadmap: `coding-logs/2026-08-04-20-14-04 Coding Log (overall-phases-and-pr-roadmap).md` §A3 (PR-A)
Lifecycle: g-coding (plain git + gh; no Graphite, no stacking)

## Scope

Phase 0 evidence truth: make the repository describe current PR #30 behavior accurately.
Comments/docs/narration only + one static test file. No product subsystem change, no API/DB change.

## Defects corrected (all observed RED first)

| # | Stale claim | Where | Truth |
|---|---|---|---|
| 1 | "17 specs" + no mention of the director E2E; retired pre-PR-7 caveat ("health ≈ 64", "stays inside the twin's band") | `docs/demo-coverage.md:39`, `e2e/README.md:31-43` | 22 Playwright specs incl. `scenario-transitions.spec.ts`; P-2 backfills critical (PR-7), `pressure_drop` goes below band; timed transitions browser-observed (#30) |
| 2 | "real customers render" / "a real, non-zero customer list" | `e2e/tests/scenario-transitions.spec.ts:99`, `docs/demo-runbook.md` item 2.4 | seeded, SIMULATED-badged customer list |
| 3 | preflight called "cold-start + readiness gate" / runbook §0 "Cold start" | `scripts/demo-preflight.sh:2`, `Makefile:16`, `docs/demo-runbook.md:11` | preflight = stack readiness on **existing volumes**; true cold start = `make demo-down` then preflight |
| 4 | director injections "travel the same MQTT-consumer/scoring paths"; DLQ button labelled "(item 1.5)" | `web/src/features/twin/DemoScenarioPanel.tsx:28-29`, `docs/demo-runbook.md` §0b | `api/app/demo.py` inserts rows directly into the DB (`source='DEMO'`); `bad_asset` = direct dead-letter insert; scored 1.5 proof stays `make demo-scenario MODE=bad_asset` through the real broker |

## TDD

New `api/tests/test_evidence_docs.py` (static repo-file oracles, no stack):

- `test_demo_docs_match_current_director` — claimed spec count must equal the actual
  `^test(` count across `e2e/tests/*.spec.ts` (22 today, self-updating); coverage doc and
  e2e README must name `scenario-transitions`; retired caveat phrases banned.
- `test_no_real_customer_claim` — bans `real … customer` (negations like "no real customer
  PII" allowed) across runbook/coverage/e2e README/preflight/spec files.
- `test_preflight_is_not_called_cold_start` — no cold-start language in
  `demo-preflight.sh` or its Makefile help line; runbook must not head §0 "Cold start" and
  must document true cold start = `make demo-down` → preflight.
- `test_bad_asset_narration_names_direct_injection` — panel JSDoc must not claim the
  MQTT-consumer path and must name direct insertion; runbook must not present the DLQ
  button as the item-1.5 proof and must keep `MODE=bad_asset`.

RED captured: 4/4 failed on the pre-edit tree (stale strings quoted in the failures).
One test-robustness fix during GREEN: `true cold start` regex → `true\s+cold\s+start`
(markdown line-wrap).

## Commands & counts

- `cd api && .venv/bin/python -m pytest` → **310 passed** (was 306 at #30; +4 new) — full
  suite incl. integration (own throwaway containers; required starting the OrbStack Docker
  daemon, which was down; without it: 202 passed + 108 environmental errors)
- `cd api && ruff check .` → clean; `mypy .` → clean (55 files)
- `cd web && pnpm test` → **521 passed** ×3 · `pnpm lint` ✓ · `pnpm typecheck` ✓ · `pnpm build` ✓
- `tests/test_evidence_docs.py` 3× → 4 passed each
- Live smoke: `docker compose -f infra/docker-compose.yml up -d --build` then
  `scripts/demo-preflight.sh` → `✓ DEMO READY — every scored surface is live.` (12 devices scored)

## QCHECK

- Tier 1: multi-agent review workflow — 3 finder angles (truth-vs-code, residual-stale,
  test-oracle-quality), every finding adversarially verified; 25 agents, 0 errors.
- Tier 2: Codex `gpt-5.6-sol`, `model_reasoning_effort=high`, read-only sandbox. The two
  tiers **converged independently** on the top findings. No CRITICAL.

Findings and dispositions (all FIXED items re-gated green):

| Sev | Finding | Disposition |
|---|---|---|
| HIGH (Codex) / conf. | New narration blanketed `source='DEMO'` over `bad_asset`; actual: telemetry pairs = `DEMO` (swept by `normal`), bad-asset ledger row = `DEMO_DLQ` (permanent), `dead_letter` has no source column | **FIXED** — panel JSDoc + runbook §0b scoped precisely |
| HIGH (Codex) / conf. MEDIUM | e2e README "one loaded DOM observes … recovery … run-id" overstated: fault arc, recovery, and run-id proof are three tests, each its own DOM | **FIXED** — reworded to per-test unreloaded DOMs |
| MEDIUM conf. | e2e README "scenario specs reset to `normal` … residual state can't…" contradicts the deliberate ends-degraded design (#30) | **FIXED** — describes the real serialization contract |
| MEDIUM conf. | Runbook "Automated verification" omitted `scenario-transitions.spec.ts` | **FIXED** |
| MEDIUM conf. | `topic2-twin.spec.ts` header/2.3 comments kept pre-#30 cold-start framing | **FIXED** — comments state the current mechanism |
| MEDIUM (Codex) | ≤30 s "browser-timed" phrasing overstated strictness: spec clamps `Math.max(30_000−elapsed, 1_000)`, never fails at 30.001 s | Wording **FIXED** (softened to "polled against the 30 s budget", PR-C noted); strict enforcement **DEFERRED to PR-C** (its explicit mandate) |
| MEDIUM conf. | `_actual_spec_count` non-recursive `*.spec.ts`, column-0 `test(` only; docstring claimed Playwright-exactness | **FIXED** — rglob spec+test patterns, indentation/annotation-aware, honest docstring; Codex verified `playwright test --list` = 22 today |
| MEDIUM conf. | MQTT ban matched only literal `MQTT-consumer` (hyphenated) | **FIXED** — negation-stripping + `MQTT[-\s]consumer` ban |
| MEDIUM (Codex) | Preflight test pinned wording, not behavior | **FIXED** — added destructive-op ban (`down -v`/`volume rm|prune`) |
| LOW (Codex) | `test_no_real_customer_claim` is a phrase tripwire, not a universal semantic policy | **ACCEPTED** — tripwire by design; UI provenance is guarded by SimulatedBadge conventions |
| refuted (scope) | Makefile trap lacks director reset; `global-setup.ts` overclaim; `playwright.config.ts` comment; coverage Bottom-line pointer | Out of PR-A's slice — candidates for PR-B/PR-F |
| — | demo-scenario.sh header "no scenario API" contradicted its own director-reset POST | **FIXED** opportunistically (roadmap lists this file's comments in PR-A) |

## Post-fix gates

- api `pytest` **310 passed** · `ruff` ✓ · `mypy` ✓ · evidence tests 3× green
- web `pnpm test` **521** ✓ · lint ✓ · typecheck ✓ · build ✓ · `e2e tsc --noEmit` ✓
- Live: `make demo-e2e` → **22 passed (1.1m)** — the corrected "22 specs" claim verified in a
  real browser at the candidate tree

## Candidate

Branch `fix/evidence-truth`, parent `a98a359` (merged PR #30). All gates above were run on
this exact tree; the live `make demo-e2e` 22-pass evidence is from the same tree. Squash-merge
SHA recorded in the post-merge verification note.
