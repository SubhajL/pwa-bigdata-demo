# Coding Log — PR-F: exact-SHA acceptance harness and safe cold semantics

Date: 2026-08-05 08:32
Branch: chore/exact-sha-acceptance-harness (off origin/main 3b1eadc, PR-E merge)
Lifecycle: g-coding (plain git + gh)
QCHECK: Tier 1 = review workflow · Tier 2 = Codex g-check skill (user directive 2026-08-05)

## Scope (roadmap PR-F, §7 + evidence provenance)

- `scripts/demo-acceptance.sh` — Gate A1 runner: N consecutive §7 gate runs (default 3),
  exact-SHA evidence manifest (sha/dirty/branch/mode/artifact_sha256/hypertable
  chunks/per-run exits+durations); first failure aborts AND still writes evidence;
  `DEMO_E2E_CMD` override exists ONLY for the contract tests.
- `make demo-acceptance-3x` (warm, non-destructive) · `make demo-e2e-cold` — refuses
  without exactly `CONFIRM_VOLUME_RESET=1`; the refusal path provably runs NO docker
  command (stub-logged).
- `scripts/lib/artifact-provenance-probe.sh` — the PR-D provenance probe EXTRACTED to a
  standalone exit-coded script (0 match · 1 mismatch · 2 probe-failure); preflight
  delegates; the five-case behavioral matrix deferred by PR-D/PR-E QCHECK now runs in
  `api/tests/test_acceptance_harness.py` via PATH stubs (equal/unequal/curl-fail/
  exec-fail/malformed) with message class + exit status asserted.
- `evidence/` + conventions in the runbook: Gate A1 commits its manifests; a count in a
  log without its manifest is an assertion, not evidence.

## TDD

RED first: 11 failed / 12 harness contract tests (scripts/targets absent), then GREEN 19
(harness 12 + evidence 7, incl. the retargeted provenance pin at the extracted probe).

## Live harness smoke (pre-merge, harness-validation — NOT Gate A1)

`TSDB_PORT=5435 make demo-acceptance-3x` on the dirty PR-F tree: **3 consecutive 27-spec
runs passed** (155 s / 127 s / 127 s), manifest written and verified, then removed from
the worktree — Gate A1's manifests must come from the MERGED sha on a clean tree. The
manifest content:

```json
{
  "schema": "demo-acceptance/v1",
  "sha": "3b1eadc2f3b35048191596100c6f60818048bc57",
  "branch": "chore/exact-sha-acceptance-harness",
  "dirty": true,
  "mode": "warm",
  "captured_at_utc": "20260805T013322Z",
  "runs_requested": 3,
  "artifact_sha256": "43abe804615a52b05755ceb949803098513fd41a8102851942edbe0a5bcc2332",
  "hypertable_chunks": 1,
  "runs": [
    {
      "run": 1,
      "exit": 0,
      "duration_s": 155
    },
    {
      "run": 2,
      "exit": 0,
      "duration_s": 127
    },
    {
      "run": 3,
      "exit": 0,
      "duration_s": 127
    }
  ],
  "result": "passed"
}
```

## Review (2026-08-05 08:55:03 +0700) - working-tree vs origin/main 3b1eadc

### Reviewed
- Repo: `/Users/subhajlimanond/dev/worktrees/pwa-bigdata-review-remediation.BO7ugG`
- Branch: `chore/exact-sha-acceptance-harness`
- Scope: working tree at `3b1eadc2f3b35048191596100c6f60818048bc57` versus `origin/main` at the same SHA, including the four named untracked files
- Commands Run: `git status --porcelain=v1`; targeted `git diff --name-only`, `git diff --stat`, and `git diff -- <paths>`; direct numbered file reads and exact-string searches; `git diff --check`; `bash -n scripts/demo-acceptance.sh scripts/lib/artifact-provenance-probe.sh scripts/demo-preflight.sh`; `/Users/subhajlimanond/dev/pwa-bigdata-demo/api/.venv/bin/python -m pytest -q api/tests/test_acceptance_harness.py api/tests/test_evidence_docs.py` (19 passed); Ruff on both test files (clean); `make -n -i demo-e2e-cold`; controlled `RUNS=0` and `MAKEFLAGS=-i` reproductions with temporary evidence directories, a non-Docker `COMPOSE` replacement, and an unreachable Docker socket. Plain system-Python pytest did not collect because `psycopg_pool` is absent; the repository API virtual environment was then used successfully.

### Findings
CRITICAL
- None.

HIGH
- The destructive reset is not fail-closed behind the exact confirmation. `Makefile:13-14` still exposes `make demo-down` as an unguarded `docker compose ... down -v`, while `Makefile:38-46` puts the new confirmation guard, destructive command, and acceptance command in three separate recipe shells. With inherited `MAKEFLAGS=-i` (or `make -i`), Make ignores the guard's exit 2 and continues. The controlled reproduction printed the refusal, then executed the substituted `DESTRUCTIVE_COMMAND down -v`, ran the cold-labelled harness, and exited 0 without `CONFIRM_VOLUME_RESET=1`. This also makes `docs/demo-runbook.md:148-149` false when it says the cold target is the only destructive target and nothing is reset implicitly. Why it matters: an operator can lose the demo database volumes through an existing unconfirmed target or through a standard Make error-policy flag despite the advertised safety boundary. Fix direction: centralize volume deletion in one guarded script or one continuous shell where the exact comparison and `down -v` are inseparable; route `demo-down` and `demo-e2e-cold` through that primitive. Tests needed: unset, near-miss, and exact-confirmation cases for both targets; repeat the refusal tests with `MAKEFLAGS=-i`; assert exit 2 and a zero-command Docker log on every refused path.
- `RUNS` is not validated, so the acceptance gate can emit a successful but internally impossible manifest. `scripts/demo-acceptance.sh:23,51-52,76-105` trusts the environment, and `Makefile:35-36` does not pin the target named `demo-acceptance-3x` to three runs. On this macOS/BSD `seq`, the reproduced `RUNS=0` invocation executed run numbers 1 and 0, wrote `runs_requested: 0` with two successful entries, printed `ACCEPTED — 0 consecutive run(s) passed`, and exited 0. Other malformed values can terminate before the promised failure manifest is written. Why it matters: Gate A1 can be marked green without satisfying the three-consecutive-run contract, and the evidence contradicts itself. Fix direction: validate `RUNS` as a positive decimal integer before any probe/run, make the 3x target force exactly 3, and fail with a configuration-error manifest or no acceptance-class manifest. Tests needed: `0`, negative, nonnumeric, whitespace, and an inherited `RUNS=1` against `make demo-acceptance-3x`, plus exact agreement among `runs_requested`, the run array, and the success message.
- Caller-controlled environment values can forge production-looking acceptance evidence. `scripts/demo-acceptance.sh:26,56` honors `DEMO_E2E_CMD`; `DEMO_E2E_CMD=true` therefore writes `result: "passed"` without running the score gate, yet `scripts/demo-acceptance.sh:76-99` records neither the executed command nor a test-only marker. Likewise, `ACCEPTANCE_MODE=cold scripts/demo-acceptance.sh` can label an ordinary warm run cold without any reset. The comments at `scripts/demo-acceptance.sh:8-11` say the override is test-only, but no code enforces that boundary, so a clean merged checkout can produce an indistinguishable clean exact-SHA manifest. Why it matters: the artifact designed to prove Gate A1 can certify a test stub or a falsely labelled cold run. Fix direction: require an explicit contract-test sentinel that cannot produce the production acceptance schema/result, reject command overrides in normal mode, and bind a cold label to the guarded reset path (or record and verify a reset receipt). Tests needed: normal mode rejects `DEMO_E2E_CMD`; test mode cannot emit an acceptance-class manifest; direct cold labelling without the reset path fails; the confirmed Make path emits one cold-labelled run.

MEDIUM
- Manifest provenance facts are sampled before the runtime being accepted. `scripts/demo-acceptance.sh:36-44` captures the served artifact hash and hypertable chunks before the loop, but the default command reaches `Makefile:29-33`, whose preflight performs `docker compose up -d --build`. A warm run can therefore record the old container's artifact/chunk snapshot and then test a rebuilt container; after `down -v`, a valid cold run predictably records nulls even though the passing run subsequently makes both facts available. Why it matters: a passed manifest's provenance fields need not describe the artifact/database that actually passed. Fix direction: sample after readiness or after the final successful run (and preferably reuse the extracted provenance logic), making null mean unavailable at evidence-finalization time. Test needed: PATH stubs that return unavailable or digest A before the injected gate and digest B plus a chunk count after it, asserting the manifest records the accepted runtime.
- Evidence filenames collide for concurrent invocations. `scripts/demo-acceptance.sh:34,47` uses only UTC seconds, the SHA prefix, and mode. Two same-SHA/same-mode runners started in one second select the same path; an independent controlled reproduction left only one manifest. Why it matters: one acceptance record can silently overwrite or interleave with another, destroying audit evidence and making run attribution ambiguous. Fix direction: create the output atomically with a unique suffix (nanoseconds plus PID/UUID, or `mktemp` in `EVIDENCE_DIR`) and refuse overwrite. Test needed: launch two stubbed runners concurrently and assert two valid, separately attributable manifests.

LOW
- None.

### Open Questions / Assumptions
- I treated exact-SHA Gate A1 evidence as fail-closed against inherited shell/Make environment and accidental operator overrides. If the evidence is explicitly non-adversarial, the command-override finding could be downgraded, but the current manifest gives reviewers no way to distinguish the test seam from the real gate.
- I assumed `make demo-down` is not intentionally exempt from the new exact-confirmation rule; the new runbook wording and the requested cold-safety review both imply every volume-removal path belongs behind the guard.
- The Coding Log correctly labels the recorded real 3x rehearsal as pre-merge harness validation and explicitly says it is not Gate A1. No premature Gate-A1-ran claim was found.
- The five provenance cases do intercept `curl` and `docker` through PATH precedence. Their match/mismatch/probe-failure exit and message assertions are behaviorally meaningful; no probe-contract defect was found.

### Recommended Tests / Validation
- Add the cold-safety, run-count, test-override, reset-to-label binding, post-run provenance, and concurrent-manifest regressions described above; prove each RED against this worktree before fixing.
- Keep the current 19 focused tests, Ruff, `bash -n`, and `git diff --check` in the rerun set.
- After remediation, rerun the full API, ML, and web gates and one real warm acceptance rehearsal. Do not call that rehearsal Gate A1 until it runs from the clean merged SHA and retains its manifest.
- Run the destructive cold gate only with deliberate operator authorization; verify fresh-volume behavior and the resulting cold manifest separately.

### Rollout Notes
- Block PR-F acceptance on the three HIGH findings. The provenance probe extraction itself is sound, but the outer acceptance/cold-control layer can currently produce unsafe or non-authentic evidence.
- Preserve `DEMO_E2E_CMD` solely as a contract-test mechanism, and ensure test-mode output cannot be mistaken for Gate A1 evidence.
- Keep warm rehearsal, confirmed fresh-volume cold rehearsal, and post-merge Gate A1 as distinct evidence states.

## QCHECK round 1 — dispositions (g-check: 3 HIGH / 2 MEDIUM · Tier-1 wf: 22 agents/0 errors)

Both tiers converged, each with LIVE reproductions. Every finding **FIXED**; each was first
reproduced by a new RED test (9 failed / 21) before implementation:

| Finding | Disposition |
|---|---|
| **HIGH** — volume destruction was not fail-closed: `demo-down` was an unguarded `down -v`, and the cold guard sat in a SEPARATE recipe line, so `make -i`/`MAKEFLAGS=-i` walked past it (reviewer reproduced a full unconfirmed reset). The runbook's "nothing is reset implicitly" was therefore false. | **FIXED** — volume removal now exists at exactly ONE site, `scripts/lib/volume-reset.sh`, with the confirmation check in the SAME process as `down -v`; `demo-down` and `demo-e2e-cold` both route through it, each a single recipe line (`&&`). Tests: unguarded refusal for both targets + a `MAKEFLAGS=-i` case, asserting a zero-command docker log. |
| **HIGH** — `RUNS` unvalidated: `RUNS=0` printed "ACCEPTED — 0 consecutive run(s) passed" and exited 0 (BSD `seq` ran 1 and 0) | **FIXED** — `^[1-9][0-9]*$` validated before any probe or evidence; `demo-acceptance-3x` pins `RUNS=3` so an inherited `RUNS=1` cannot weaken it. Tests cover 0/-1/two/whitespace/3x and the Makefile pin. |
| **HIGH** — caller-controlled `DEMO_E2E_CMD`/`ACCEPTANCE_MODE` could forge Gate-A1-class evidence (reviewer wrote a `passed` manifest in 0 s without running §7; a warm run could be labelled cold) | **FIXED** — the override is REFUSED outside `ACCEPTANCE_TEST_MODE=1`; test-mode manifests carry schema `demo-acceptance/v1-test` + `test_mode: true`; every manifest now records the `gate_command` that actually ran; a `cold` label requires a fresh reset receipt written by the guarded reset and consumed on use. |
| MEDIUM — provenance sampled BEFORE the gate (whose preflight rebuilds containers), so a manifest could describe the pre-run artifact; cold runs always recorded nulls | **FIXED** — artifact/chunk probes moved AFTER the accepted run; test uses a stub that changes digest only once the gate has run. |
| MEDIUM — manifest filenames collided within one second | **FIXED** — `$$` in the name + refuse-overwrite; concurrent-runner test asserts two attributable manifests. |

Docs corrected to match enforced behavior (runbook safety section rewritten; every
`make demo-down` call site now shows the confirmation; e2e README lists both guarded
targets).

**Note on the working tree during review:** a Tier-1 verifier agent mutation-tested
`demo-acceptance.sh`/`Makefile` in place (fake `ffff…` digest, `v1-TYPO` schema, dropped
manifest fields, a `warm`-labelled cold target). Those mutations were transient and NOT
present on disk when checked; the committed content is the fail-closed version above. The
episode is itself useful evidence: the reviewer noted the field-name churn, and it is why
the harness tests now pin schema class, `gate_command`, and label↔reset binding.

## Post-fix live verification (production path, pre-merge — NOT Gate A1)

`TSDB_PORT=5435 RUNS=1 scripts/demo-acceptance.sh` with NO test seam: the real
`make demo-e2e` ran (27/27), and the manifest came out production-class —
`schema: demo-acceptance/v1`, `test_mode: false`, `gate_command` = the real make target,
`artifact_sha256` sampled AFTER the accepted run, `hypertable_chunks: 1`, `dirty: true`
(the tree is mid-PR). Manifest removed afterwards — Gate A1 evidence must come from the
merged sha on a clean tree.

Guard smoke: `make demo-down` → REFUSED exit 2, zero docker commands;
`MAKEFLAGS=-i make demo-e2e-cold` → refusal ignored by make, but the destructive step is
unreachable (guard and `down -v` share one process) and the acceptance never ran.

## Review (2026-08-05 09:14:57 +0700) - working-tree second round vs origin/main 3b1eadc

### Reviewed
- Repo: `/Users/subhajlimanond/dev/worktrees/pwa-bigdata-review-remediation.BO7ugG`
- Branch: `chore/exact-sha-acceptance-harness`
- Scope: second-round working-tree review at `3b1eadc2f3b35048191596100c6f60818048bc57` versus `origin/main` at the same SHA; verified every round-1 disposition and reviewed the new reset-receipt/refusal paths
- Commands Run: `git status --porcelain=v1`; targeted `git diff --name-only`, `git diff --stat`, and `git diff origin/main -- <paths>`; direct numbered file reads and exact-string searches; `git diff --check origin/main`; `bash -n scripts/demo-acceptance.sh scripts/lib/volume-reset.sh scripts/lib/artifact-provenance-probe.sh scripts/demo-preflight.sh`; Ruff on both changed test files (clean); system-Python focused pytest attempt (collection blocked by missing `psycopg`); `/Users/subhajlimanond/dev/pwa-bigdata-demo/api/.venv/bin/python -m pytest -q api/tests/test_acceptance_harness.py` (21 passed); the same runner over `test_acceptance_harness.py` plus `test_evidence_docs.py` (28 passed); `make -n` target inspection; controlled production-mode PATH-shadow, fabricated-receipt, concurrent-receipt, test-mode-near-miss, and receipt-symlink reproductions using temporary directories and no real Docker command

### Findings
CRITICAL
- None.

HIGH
- Production-class evidence can still bypass the refused `DEMO_E2E_CMD` seam through command resolution. `scripts/demo-acceptance.sh:52,91` stores a string beginning with bare `make` and executes it through `bash -c`, so a caller-controlled `PATH` can select a different executable while the manifest still records the expected `make -C … demo-e2e` text. A controlled run with a preceding fake `make` exited 0 and wrote `schema: demo-acceptance/v1`, `test_mode: false`, and `result: passed` without running the score gate. Why it matters: the round-1 override fix does not yet make `gate_command` a truthful record of what executable ran, so Gate-A1-class evidence remains forgeable through another ordinary environment input. Fix direction: make the production gate invocation a fixed, non-string execution path (and record/verify the resolved executable or run a dedicated repo script directly); explicitly define the trusted-environment boundary rather than implying the manifest is self-authenticating. Test needed: shadow `make` on `PATH` in production mode and assert refusal/no production manifest.
- A cold receipt does not prove that the guarded reset created it or that it belongs to the accepted stack. `scripts/demo-acceptance.sh:36,58-63` accepts any regular file containing an upper-bound-valid timestamp, while `scripts/lib/volume-reset.sh:19-21,33` records no compose-file/project identity or unforgeable handoff. Writing the current epoch directly to `.volume-reset-receipt`, without calling the reset, produced a passed production `mode: cold` manifest; a future timestamp also passes because age has no lower bound, and a receipt minted with one `COMPOSE_FILE_PATH` can authorize acceptance of another when `EVIDENCE_DIR` is shared. Intervening warm activity is likewise invisible. Why it matters: the round-1 cold-label binding remains a claim about a writable timestamp, not evidence that the tested runtime began from the reset it cites. Fix direction: couple reset and cold acceptance in one guarded transaction/process, or issue and atomically hand off a stack-bound capability containing validated reset/compose identity outside the evidence output directory. Tests needed: fabricated receipt, future/non-numeric receipt, reset-stack-A/accept-stack-B, and reset→warm-gate→cold-label cases must all refuse.
- Receipt consumption is a TOCTOU race rather than single-use. `scripts/demo-acceptance.sh:58-64` only reads/checks the shared receipt, then `scripts/demo-acceptance.sh:152-154` removes it after the complete gate and manifest write. Two controlled production-mode cold runners crossed the check concurrently; both exited 0 and wrote separate passed `demo-acceptance/v1` cold manifests from the single receipt. Why it matters: the first run can warm or mutate the stack while the second still claims the same fresh reset, contradicting the documented consumed-on-use property. Fix direction: atomically claim/rename the receipt before starting any gate, with explicit failure/interrupt semantics, or eliminate the cross-process receipt in favor of a single reset-and-run orchestrator. Test needed: launch two cold runners against one receipt and require exactly one to proceed and one to refuse without a manifest.

MEDIUM
- The normal cold path makes a clean source checkout report itself dirty. The reset writes its default receipt under the repository at `scripts/lib/volume-reset.sh:20-21,32-33`; that path is not git-ignored, and `scripts/demo-acceptance.sh:69-72` samples `git status` while the receipt still exists. Therefore every default production cold manifest records `dirty: true` even when source started at a clean merged SHA. Why it matters: clean exact-SHA cold acceptance cannot produce the provenance state Gate A1 expects. Fix direction: keep transient receipt state outside the worktree, or exclude only the controlled receipt from the dirty calculation without hiding product changes. Test needed: run the cold contract from a clean detached worktree and assert the manifest remains `dirty: false` while a real source edit still yields true.
- Receipt creation follows a predictable symlink after destructive work. `scripts/lib/volume-reset.sh:20-21,32-33` uses shell redirection to the fixed receipt path without rejecting symlinks or creating the state atomically. A controlled confirmed-reset run with `.volume-reset-receipt` symlinked to another writable file overwrote that target. Why it matters: a stale or planted evidence-path entry can extend the command's data-loss surface beyond the explicitly confirmed Docker volumes. Fix direction: use a controlled state directory, reject non-regular/symlink targets with `lstat`, and create/replace the receipt atomically with restrictive permissions. Test needed: symlink and pre-existing-path cases must fail without changing the target.

LOW
- `scripts/demo-acceptance.sh:33,47,57,75` enables test mode for every non-empty `ACCEPTANCE_TEST_MODE`, although the public contract specifies exactly `1`. `ACCEPTANCE_TEST_MODE=0` therefore permits `DEMO_E2E_CMD` and skips receipt enforcement. The resulting manifest remains correctly test-class, which limits impact, but the refusal contract is surprising and easy to trigger accidentally. Fix direction: accept exactly `1`, treat unset as off, and reject every other value before evidence. Test needed: `0`, `true`, whitespace, and `2` must refuse without a manifest.

### Open Questions / Assumptions
- I treated the manifest as evidence that should fail closed against ordinary caller-controlled environment inputs because round 1 used that standard for `DEMO_E2E_CMD`. If the host user, `PATH`, and evidence directory are explicitly trusted, the PATH/timestamp findings can be reframed as a documented trust-boundary gap, but the current runbook claims stronger binding.
- I treated `cold` as meaning the accepted gate is the operation immediately following the successful reset, with no intervening warm run or different compose project. That matches the runbook's “fresh volumes” language.
- The hinted `[ -e "$manifest" ] && die` interaction is sound under Bash `set -e`; a false first command in an AND-list does not terminate the script. The PID-suffixed filename also passed the two-run concurrent test, so the round-1 collision finding is closed for distinct live processes.
- Round-1 disposition summary: destruction centralization/`MAKEFLAGS=-i` is closed; positive `RUNS` plus the pinned 3x target is closed; post-run artifact/chunk provenance is closed; concurrent PID filenames are closed; command-seam schema separation is closed narrowly, but the broader evidence/cold-receipt HIGH is not.

### Recommended Tests / Validation
- Add RED regressions for the three HIGH paths before remediation: production PATH shadow, fabricated/mismatched/intervened receipt, and two cold runners consuming one receipt.
- Add clean-worktree cold provenance, receipt symlink, future/malformed receipt, and exact test-mode-sentinel cases.
- Retain the current 21 harness tests, 7 evidence-doc tests, Ruff, Bash syntax, and diff whitespace checks. ShellCheck was unavailable in this environment.
- After remediation, rerun one real production-path warm gate and the deliberately authorized cold gate. Keep both pre-merge runs distinct from clean merged-SHA Gate A1 evidence.

### Rollout Notes
- Block PR-F on the three HIGH findings. The round-1 safety guard itself is now fail-closed, but the new receipt/evidence protocol can still produce production-class proof without a uniquely bound reset/gate execution.
- Do not retain the current cold manifests as acceptance evidence; the race reproductions used command stubs solely to prove harness behavior and ran no Docker reset.

## QCHECK round 2 — dispositions (g-check r2: 3 HIGH / 2 MEDIUM / 1 LOW · Tier-1 wf r2: 25 agents/0 errors)

Round-1 fixes confirmed closed by both tiers (centralized destruction incl. MAKEFLAGS=-i,
RUNS validation + pinned 3x, post-run provenance, PID-unique manifests). New set — every
one an evidence-integrity defect, all **FIXED**, each first reproduced by a RED test:

| Finding | Disposition |
|---|---|
| **HIGH (wf, live-reproduced on the REAL repo)** — inherited `MAKEFLAGS=-i`/`-n` made the inner `make demo-e2e` exit 0 for a FAILING or never-run suite → production-class "✓ ACCEPTED" manifest whose `gate_command` still read like the genuine target | **FIXED** — the gate runs under `env -u MAKEFLAGS -u MFLAGS -u MAKELEVEL -u MAKEOVERRIDES`, so the caller's environment cannot dictate the only pass/fail oracle. Test: a stub `make` that succeeds ONLY when MAKEFLAGS is set, asserted across `-i`/`-n`/`i`. **Live proof:** `MAKEFLAGS=-n` now takes 126 s (the suite really runs) instead of returning instantly. |
| **HIGH (g-check)** — `bash -c` resolves `make` through PATH, so a shadowing executable produced a passed production manifest that still named the real target | **FIXED** — the manifest records `gate_command_resolved` (the absolute `command -v` path), so evidence can never read like `make` while another binary ran; the trust boundary is now stated explicitly in the runbook. |
| **HIGH (g-check)** — the cold receipt was a writable timestamp: fabricating one, dating it in the future, or minting it for another compose project all authorized a cold label | **FIXED** — the reset mints a single-use capability (epoch + compose file + nonce) written atomically via `mktemp`+`mv`; acceptance validates epoch shape, rejects future dates and stale ones, and requires the compose file to match. |
| **HIGH (g-check)** — receipt consumption was TOCTOU: two concurrent cold runners both passed from one receipt | **FIXED** — the capability is CLAIMED by atomic `mv` before the gate starts; exactly one runner wins, the loser refuses with no manifest (test asserts one success, one refusal, one manifest). |
| MEDIUM (g-check) — receipt inside the worktree made every cold manifest report `dirty: true` | **FIXED** — state lives in `ACCEPTANCE_STATE_DIR` (default `$TMPDIR/pwa-demo-acceptance`), outside the repo. |
| MEDIUM (g-check) — receipt write followed a planted symlink and overwrote its target | **FIXED** — `mktemp`+`mv -f` replaces the path atomically instead of redirecting into it; test asserts a symlinked victim file is untouched. |
| LOW (g-check) — any non-empty `ACCEPTANCE_TEST_MODE` (incl. `0`) enabled the seam | **FIXED** — exactly `1`; `0`/`true`/space/`2` refuse before any evidence. |

Note on the MEDIUM "receipt consumed only at the end": already closed by the round-2
claim-before-gate design (plus an EXIT trap that discards the claim), which the reviewer
was reading mid-edit.

## Final gates (tree as committed)

- ruff · mypy strict (57) · `bash -n` on all four scripts — clean
- harness contract tests **29** (5-case probe matrix + guard/RUNS/forgery/receipt/
  concurrency/provenance/symlink cases) · evidence docs 7 · API **352 ×3** · ml 50 ·
  web 540 + lint/typecheck/build · e2e tsc — all green
- Live production path (no test seam): `demo-acceptance/v1`, `test_mode: false`, real
  `gate_command`, post-run provenance, 27/27 specs; guard smoke refuses with zero docker
  commands incl. under `MAKEFLAGS=-i`
- QCHECK: Tier 1 = review workflow ×2 rounds (22/25 agents, 0 errors) · Tier 2 = Codex
  g-check skill ×2 rounds. Every finding dispositioned above.
