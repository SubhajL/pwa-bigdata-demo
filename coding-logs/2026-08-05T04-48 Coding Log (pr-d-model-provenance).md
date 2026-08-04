# Coding Log — PR-D: model artifact provenance and dataset DOM correspondence

Date: 2026-08-05 04:48
Branch: feat/model-provenance-dataset-proof (off origin/main 5b76604)
Lifecycle: g-coding (plain git + gh)
QCHECK: Tier 1 = /code-review high · Tier 2 = Codex g-check skill (user directive 2026-08-05)

## Scope (roadmap PR-D, criteria 3.1/3.2)
- artifact_sha256(path) in api/app/model.py hashes the loaded artifact bytes
- ModelCardResponse.artifact_sha256 additive field — OpenAPI + TypeScript together
- ModelCard.tsx renders the hash machine-readably; DatasetCompare exposes typed DOM values
- demo-preflight compares API hash vs running-image file hash
- e2e: DOM↔API hash match, Health separation >=15 from DOM, PTTF direction, lower-bound marker

## TDD record

RED first, all confirmed failing before implementation:
- `test_artifact_sha256_hashes_the_exact_file_bytes` — plain file digest, recomputable by `sha256sum`
- `test_model_endpoint_attaches_the_loaded_artifact_hash` — route recomputes from the resolved file; 64-hex; ≠ data_sha256
- `test_model_card_schema_requires_the_artifact_hash` — OpenAPI `required` includes the field
- `test_preflight_verifies_served_artifact_provenance` — preflight greps (evidence-docs style)
- web: ModelCard `model-artifact-sha` full-hash attribute + truncated visible text; DatasetCompare tiles expose `data-health-score/pttf-hours/pttf-lower-bound` exact strings
- e2e: new `3.1b` DOM↔API hash equality; `3.2` rewritten — literal DOM↔API tile correspondence, separation ≥15 and PTTF direction read from RENDERED values, ≥ marker iff `pttf_out_of_range`

GREEN implementation:
- `api/app/model.py` — `artifact_sha256(path)` lru_cached per path (same rationale as `_load_cached`)
- `api/app/models.py` — `ModelCardResponse.artifact_sha256: str` (required, additive)
- `api/app/routes/predict.py` — computed inside the card try-block (vanished artifact ⇒ 503, never 500)
- `web` — types.ts contract + ModelCard row (data-sha256 attr, title, truncated text) + DatasetCompare typed attrs (`String()` on the boolean — React drops bare `false` custom attrs)
- `scripts/demo-preflight.sh` — API hash vs in-container `hashlib` digest of `/srv/artifacts/model.pkl`; probe failure reported as probe failure, only two real digests may claim mismatch
- `docs/demo-coverage.md` — 23→24 specs; 3.1/3.2 stay ◑ (oracle landed, exact-SHA acceptance pending Gate A1)

## Gates

- ruff clean · mypy strict 56 files clean · eslint clean · tsc --noEmit clean (web + e2e) · vite build OK
- API 318 passed (was 314; +4) single run; 3× flakiness run in progress
- Wiring: `artifact_sha256` → routes/predict.py:29,265 (non-test); TS field → ModelCard.tsx:46-50

## Flakiness investigation

The first 3× battery: API 318/318, 318/318, then **1 failed / 317 passed** on run 3 (the
`tail -1` capture kept only the summary line, so the failing test's name was lost). Web was
536×3 clean. Four subsequent full API runs with `--tb=long -rf` capture: **318 passed, four
times consecutively** — the failure never reproduced and no test name was ever captured.
Disposition: unreproduced ambient flake under back-to-back-suite load (the suite contains
live-container timing tests, e.g. the PR-C strict scoring clock); the 3×-green gate is
satisfied by the four consecutive greens. Raised to QCHECK reviewers for a second opinion
rather than silently dropped.

## Environment note — host port 5433 squatted on this dev machine

`make demo-e2e` failed twice at stack rebuild: recreating `pwa-demo-timescaledb-1` could
not bind host 5433 — `trend-paper-db` (an unrelated project, started 2026-08-04 14:32Z,
restart=unless-stopped) publishes `0.0.0.0:5433->5432`. The demo's timescaledb had been
running WITHOUT its host binding since before this PR (harmless: every demo path reaches
the DB over the compose network; host 5433 is a manual-psql convenience only — the
`seed_db.py`/`migrate.py` host DSNs are the documented manual alternative, not the
compose path). Resolution: ran the gate with the compose file's documented override
`TSDB_PORT=5435` — scoped to this project; the other project's DB was not touched. On the
actual demo machine 5433 stays the default. Owner follow-up: either stop `trend-paper-db`
when demoing from this machine or export `TSDB_PORT` persistently.

## Review (2026-08-05 05:21:22 +07) - working-tree PR-D model provenance and dataset DOM correspondence

### Reviewed
- Repo: /Users/subhajlimanond/dev/worktrees/pwa-bigdata-review-remediation.BO7ugG
- Branch: feat/model-provenance-dataset-proof
- Scope: working tree at HEAD 5b76604292a8185735e0f2dc51ebc1f91504ac35
- Commands Run: `git status --porcelain=v1`; targeted `git diff --name-only`, `git diff --stat`, and per-file diffs; exact-string `rg`; bounded `sed`/`nl` reads; `git diff --check`; `bash -n scripts/demo-preflight.sh`; `pnpm test -- src/features/predictive/predictiveComponents.test.tsx` (11/11 passed); web `pnpm typecheck` (passed); e2e `pnpm exec tsc --noEmit` (passed); `pnpm exec playwright test --list` (24 tests); targeted pytest (collection blocked: host lacks `psycopg_pool`); Docker/live probes (blocked: sandbox cannot access the OrbStack socket and no localhost stack was reachable)

### Findings
CRITICAL
- None.

HIGH
- The served `artifact_sha256` is not guaranteed to identify the bytes the process loaded. `get_bundle()` deserializes and caches by pathname (`api/app/model.py:61-65,93-103`), startup then resolves the pathname a second time (`api/app/main.py:144-149`), while the digest is independently computed only on the first `/api/model` request (`api/app/model.py:68-82`; `api/app/routes/predict.py:260-265`). If the configured/default artifact is replaced after startup loading but before that request, scoring continues with bundle A while the route hashes file B; preflight then hashes B too and can falsely certify the mismatch between the in-memory model and its claimed provenance. The current test (`api/tests/test_predict_api.py:323-353`) hashes a stable file and cannot expose this race. Fix direction: load from one immutable byte snapshot (or stable descriptor), derive the bundle and SHA from those same bytes, and store bundle/path/SHA together in app state without re-resolving. Add a regression that loads a temporary artifact, replaces it before `/api/model`, and requires the response to retain the loaded bytes' digest or fail closed.

MEDIUM
- The rewritten 3.2 browser oracle proves hidden metadata, not the Health/PTTF values a judge sees. `DatasetCompare` puts raw hours/scores in `data-*` attributes but displays rounded Health and converted days through separate code (`web/src/features/predictive/DatasetCompare.tsx:47-75`). The E2E checks the attributes and computes both discrimination claims from them (`e2e/tests/topic3-predictive.spec.ts:37-62`), so broken `Num` formatting, an incorrect `pttfDays` conversion, or static/swapped visible metric text can pass while `docs/demo-coverage.md:19-20,42` calls the displayed-value oracle landed. Add stable hooks on the visible Health and PTTF outputs and compare those rendered values (including hours-to-days rounding and the lower-bound marker) with the API-derived expectations; keep raw attributes only as supplementary correspondence evidence.
- The preflight discards probe exit status with `|| true` and treats any two non-empty outputs as verdict-bearing digests (`scripts/demo-preflight.sh:90-105`). A failing producer can emit a parseable hash before returning non-zero; the current construction preserves that stdout, resets the status to zero, and can print either `matches` or `mismatch`. It also never validates the two strings as 64-character lowercase digests, contrary to the comment that only two real digests may claim mismatch. The added evidence test only searches for `artifact_sha256` and an `exec ... model.pkl` token sequence (`api/tests/test_evidence_docs.py:122-134`), so it still passes if equality/error handling is removed or made unconditional. Capture each assignment in an `if` that preserves command status, validate both digest formats, and only then compare. Add a behavioral shell test covering equal, unequal, curl failure, container-exec failure, and malformed output.
- The new artifact read makes existing model-card rejection tests pass before reaching the behavior their names assert. The parity, structurally broken, and malformed-card cases set `probe.state.model_path` to `tmp_path/model.pkl` but never create that file (`api/tests/test_predict_api.py:425-442,470-481,484-513`). `artifact_sha256()` now raises at `api/app/routes/predict.py:260-270`, so every case returns 503 for a missing artifact even if version parity, estimator completeness, and Pydantic validation are deleted. Create a readable sibling artifact (the bytes need not be deserialized because the probe already holds the real bundle) and assert the expected error detail/path so each test reaches and protects its named guard.

LOW
- `docs/demo-coverage.md:19,41-42` calls PR-D and its oracles "landed" while the reviewed source is still an uncommitted working-tree candidate. The document otherwise keeps 3.1/3.2 at `◑`, explicitly leaves exact-SHA acceptance to Gate A1, and does not claim full proof. Until merge, use candidate/source-delivery wording (or make this an explicit merge-time documentation update) so lifecycle state is not overstated.

### Open Questions / Assumptions
- Contract parity is correct in the reviewed tree: Pydantic declares required `str`, OpenAPI includes `artifact_sha256` in `required`, and TypeScript declares a required `string` (`api/app/models.py:266-281`; `web/src/features/predictive/types.ts:127-138`).
- The preceding `toHaveAttribute` checks prevent the later `Number(null) === 0` conversions from passing vacuously. Both the expected attribute and React attribute are produced from JSON-parsed JavaScript numbers, so Python wire spelling such as `0.0` becoming JavaScript `"0"` is normalization rather than a comparison drift. If raw JSON lexical identity is required, the API must provide canonical strings instead of numbers.
- The current compose service pins `MODEL_PATH` blank and therefore makes `/srv/artifacts/model.pkl` the expected preflight target. If compose overrides are intended later, the container-side probe must resolve the actual loaded path rather than keep the hard-coded default.

### Recommended Tests / Validation
- Add and run the load/replace/first-request provenance regression, plus a same-path cache reset/isolation test.
- Repair the three short-circuited model-card 503 tests and mutation-check that removing each named guard fails its test.
- Add live Playwright assertions for visible per-tile Health/PTTF values and the artifact hash's visible prefix/title, then rerun the Topic 3 spec against the exact candidate SHA.
- Add behavioral preflight tests for success, mismatch, malformed output, curl failure, and `docker compose exec` failure.
- Once the backend environment/Docker socket is available, rerun the focused pytest cases, full API/web gates, live Topic 3 E2E, and finally Gate A1 on one exact merged SHA. The present review does not treat the Coding Log's earlier gate claims as freshly reverified.

### Rollout Notes
- `artifact_sha256` is additive but required in the response contract; Python/OpenAPI/TypeScript are aligned in this candidate, and strict consumers must be updated together as done here.
- Do not promote 3.1/3.2 from partial or claim Gate A1 complete until the hash is captured from the loaded bytes, the judge-visible dataset oracle is strengthened, and exact-merged-SHA acceptance passes.
- No product code, commit, push, PR, merge, or deployment was performed by this review; this appended report is the only review mutation.

## QCHECK Tier-2 (Codex g-check, gpt-5.6-sol xhigh) — dispositions (planned, pre-Tier-1 de-dup)

| Finding | Disposition |
|---|---|
| HIGH — served hash may not describe the loaded bytes (lazy first-request hashing; path re-resolution) | **FIX** — single byte snapshot at load: additive `pwa_ml.predict.load_bundle_bytes(data)`; `_load_cached` returns `LoadedArtifact(bundle, artifact_sha256)` from one `read_bytes()`; lifespan stashes bundle+path+sha together; route reads state only (no hashing in-route). Regression: load tmp artifact → overwrite file → served sha must stay the loaded one. |
| MEDIUM — 3.2 E2E proves data-* attributes, not the visible Health/PTTF a judge reads | **FIX** — testids on the visible metric values; E2E asserts rendered Health (rounded) and PTTF days (1-decimal) against API-derived expectations; attributes stay as supplementary correspondence. |
| MEDIUM — preflight `\|\| true` discards probe status; no 64-hex validation before verdict | **FIX** — status-preserving capture (`\|\| var=""`), validate both digests `[0-9a-f]{64}` before comparing; static evidence test pins the validation. Full five-case behavioral shell harness **DEFERRED to PR-F** (which owns the shell/contract-test infrastructure per the roadmap) — recorded here as PR-F scope. |
| MEDIUM — card-rejection 503 tests short-circuited by missing tmp artifact (my regression) | **FIX** — structurally resolved by no-hash-in-route (guards reachable again); plus explicit `detail` assertions so each test pins its named guard. |
| LOW — coverage doc says "landed" for an uncommitted candidate | **FIX** — reword to delivery-neutral ("PR-D delivers…"); true at merge, not overstated before. |

False-negative check: report is long, cites file:line throughout, names slice symbols, ran
web tests/typecheck/tsc/playwright --list itself; `## Review` section appended to this log;
no product file touched by the reviewer. Genuine review — accepted.

## Fix round 1 (both tiers de-duplicated: Tier-1 workflow 14 agents/0 errors, 11 confirmed · Tier-2 g-check)

One defect had four independent witnesses (both tiers): the served hash was computed at
FIRST REQUEST from the path, not from the loaded bytes. Fixes applied:

1. **Hash-at-load redesign (HIGH×2 + M dupes):** additive `pwa_ml.predict.load_bundle_bytes`
   (one `io.BytesIO` unpickle); `api.app.model.LoadedArtifact(bundle, artifact_sha256)` built
   in `_load_cached` from ONE `read_bytes()` snapshot; `get_loaded()` public, `get_bundle()`
   thin wrapper; lifespan stashes bundle+path+sha together; the route reads
   `app.state.artifact_sha256` and never hashes. Regression:
   `test_loaded_digest_is_of_the_snapshot_bytes_even_after_replacement` (replace file after
   load → digest and bundle both unmoved).
2. **Probe-grep vacuity (Tier-1 HIGH):** evidence test now matches NON-comment lines and pins
   the load-bearing constructions: `api_sha=$(…artifact_sha256`, `|| api_sha=""`/`|| img_sha=""`,
   in-container `hashlib.sha256` + `model.pkl` fallback, two `[0-9a-f]{64}` validations, and
   the mismatch branch reaching `FAILED=1`.
3. **Visible-value oracle (M, both tiers):** `dataset-health-visible`/`dataset-pttf-visible`
   testids; unit test pins "100"/"22.0"/"30"/"0.0"; e2e 3.2 asserts the visible numbers via
   replicated `formatInt` (half-away-from-zero) and 1-fraction-digit days; 3.1b also asserts
   the visible hash prefix.
4. **Preflight probe (M):** `|| var=""` status-preserving capture; both digests validated
   64-hex before any verdict; container path honors `MODEL_PATH` (`/srv/artifacts/model.pkl`
   fallback) — closes the false-mismatch LOW too.
5. **Short-circuited 503 tests (M):** no in-route hashing anymore, so guards are reachable;
   each rejection test now pins its named guard via the response `detail`.
6. **Route length (LOW):** guards extracted to `_validated_card_response`; `model_card` ≤50.
7. **Dual-hash ambiguity (LOW):** rows relabelled "Data SHA-256 · training corpus" vs
   "Artifact SHA-256 · model.pkl".
8. **Doc wording (LOW×2):** stamp "Refreshed 2026-08-05 with PR-D"; "delivers" not "landed".

Deferred (recorded, with owner): five-case behavioral shell test for the preflight probe →
PR-F (owns the shell/contract-test harness per the roadmap).

Post-fix gates: preflight `bash -n` OK · ml ruff/mypy/pytest 48 OK · api ruff/mypy OK ·
api 318 green (evidence-test regex fixed once: token order) · web lint/typecheck/537
tests/build OK · e2e tsc OK. Re-running now: 3× battery, warm `make demo-e2e`, and BOTH
raising tiers (fresh runs on the fixed tree).

## Review (2026-08-05 05:44:15 +07) - working-tree PR-D second round

### Reviewed
- Repo: /Users/subhajlimanond/dev/worktrees/pwa-bigdata-review-remediation.BO7ugG
- Branch: feat/model-provenance-dataset-proof
- Scope: working tree at HEAD 5b76604292a8185735e0f2dc51ebc1f91504ac35; second-round verification of the first g-check dispositions plus redesign regressions
- Commands Run: `git status --porcelain=v1`; targeted `git diff --name-only`, `git diff --stat`, and per-file diffs; bounded `rg`/`sed`/`nl`; `git diff --check`; `bash -n scripts/demo-preflight.sh`; Pydantic `ModelCardResponse.model_json_schema()` inspection; source-mutation check of the preflight evidence assertions; web `pnpm test -- src/features/predictive/predictiveComponents.test.tsx` (12/12 passed); web `pnpm typecheck` and targeted eslint (passed); e2e `pnpm exec tsc --noEmit` (passed); `pnpm exec playwright test --list` (24 specs); targeted pytest (collection blocked: host lacks `psycopg`); `docker compose ... ps` (blocked: sandbox denied the OrbStack socket)

### Findings
CRITICAL
- None.

HIGH
- The digest now correctly identifies the byte snapshot that produced the loaded `Bundle`, but the rest of the 3.1 provenance response can still be spliced from a different artifact/card. `get_loaded()` resolves and reads one path but returns only bundle+SHA (`api/app/model.py:61-107`); lifespan independently calls `resolve_model_path()` again for `app.state.model_path` (`api/app/main.py:145-155`). If default candidate A disappears or candidate selection changes between those calls, the bundle/SHA can be A while the card path is B. Even without that startup race, `/api/model` rereads the sibling `model_card.json` on every request and validates only `model_version` (`api/app/routes/predict.py:255-307`); replacing the card with a different same-version card can return A's loaded SHA/live scores beside B's algorithm, parameters, metrics, and training-data hash. That is a silent provenance error for the exact scored item this slice claims. Fix direction: include the resolved source path in `LoadedArtifact` and stash it directly without re-resolution; bind the card to the artifact by writing `artifact_sha256` into `model_card.json` during training and validating it against the load-time digest, preferably snapshotting/validating the card during the same startup load. Add route/lifespan regressions that (a) force first resolution to A and a would-be second resolution to B, and (b) replace a complete same-version card after loading and require 503 or the original validated snapshot. Also make the load-replace regression call `/api/model`: the present snapshot test exercises `get_loaded()` only, while the endpoint-hash test uses a stable file, so a future route-level rehash could satisfy both independently (`api/tests/test_predict_api.py:323-371`).

MEDIUM
- The preflight implementation now fails closed correctly, but its named evidence test still does not protect the comparison behavior. `test_preflight_verifies_served_artifact_provenance` checks non-comment source constructions (`api/tests/test_evidence_docs.py:122-158`), not process behavior. A concrete mutation replacing `elif [ "$api_sha" = "$img_sha" ]` with `elif true` leaves every current assertion green, including the dead mismatch branch, while any two valid but unequal digests are reported as a match. That means the prior preflight-test finding is improved but not closed; the current five-case behavioral harness remains deferred to PR-F. Fix direction/test: execute the script or extract the probe into a testable helper and cover equal, unequal, curl/JSON failure, container-exec failure, and malformed output, asserting both message class and exit status.

LOW
- The new visible-value checks close the prior hidden-metadata finding for literal formatting, but the final 3.2 variation assertions still read raw `data-*` attributes (`e2e/tests/topic3-predictive.spec.ts:53-83`) while the comment says the separation/direction claims come from rendered values. Two distinct PTTF-hour values that round to the same one-decimal-day text would pass the raw direction assertion and both per-tile formatting assertions, even though the judge sees no PTTF variation. Capture the two `dataset-pttf-visible` texts and assert that the visible numeric values differ in the required direction (accounting separately for the `>=` marker), or narrow the test/docs claim to visible DOM/API correspondence rather than visible PTTF variation.

### Open Questions / Assumptions
- The first-round lazy-hash race itself is closed: `_load_cached` hashes and deserializes one `read_bytes()` snapshot, the cached SHA remains paired with its bundle, and the route reads state rather than the file. The HIGH above concerns the independently resolved/read path and card, not a mismatch between `LoadedArtifact.bundle` and `LoadedArtifact.artifact_sha256`.
- Contract parity for the requested field is correct in the reviewed tree. Pydantic emits `artifact_sha256` as a required string in the JSON/OpenAPI schema, and TypeScript declares it as a required `string` (`api/app/models.py:266-283`; `web/src/features/predictive/types.ts:127-140`).
- The previous missing-attribute/`Number(null) === 0` concern is closed: `toHaveAttribute` runs before numeric reads, missing dataset names throw on property access, and both attribute values and expectations use JavaScript number serialization after JSON parsing. No Python-float lexical drift was found.
- The rejection tests now reach and pin their version/completeness/Pydantic guards by exact `detail`; the removed in-route file read no longer short-circuits them.
- `docs/demo-coverage.md:12-24,41-50` keeps 3.1/3.2 at partial and repeatedly leaves exact-merged-SHA acceptance to Gate A1. No premature complete-proof claim was found. The prior `landed` wording is fixed.
- The hash probe's curl is bounded to five seconds and the in-container Python process to eight seconds. The latter does not bound a host-side `docker compose exec` that hangs before starting the container process; this is a residual operational limit shared with the existing catalog probe, not a new mismatch-reporting defect.

### Recommended Tests / Validation
- Make `LoadedArtifact` carry its resolved path and add the A-to-B startup-resolution regression plus a same-version foreign-card rejection test.
- Make the load/replace test exercise the actual `/api/model` response, not only `get_loaded()`.
- Add the five-case behavioral preflight test in PR-D or keep PR-F explicitly blocking Gate A1; the static evidence test alone cannot close this review item.
- Assert visible PTTF variation in Topic 3, then rerun the live spec against the exact candidate SHA.
- In an environment with API dependencies and Docker access, rerun the focused API cases, full API gate, live Topic 3 E2E, and warm preflight. This review does not treat earlier Coding Log gate claims as freshly reverified.

### Rollout Notes
- `artifact_sha256` is additive but required; Python schema/OpenAPI/TypeScript are aligned in this candidate, so strict consumers must land together.
- Do not promote 3.1/3.2 or call Gate A1 complete until the artifact/card binding and behavioral preflight gap are dispositioned and exact-merged-SHA acceptance passes.
- No product code, commit, push, PR, merge, or deployment was performed. Appending this second-round report to the active Coding Log was the review's only mutation.

## Fix round 2 (Tier-1 wf round 2: 10 agents/0 errors, 7 confirmed · g-check round 2)

Round-1 fixes verified closed by both tiers. New de-duplicated set, all fixed:

1. **Card↔artifact splice (g-check HIGH ≡ wf MEDIUM, empirically reproduced):**
   `model_version` is a training-time constant, so it cannot bind a card to a run. Fix at
   the SOURCE: `train()._write_card` now embeds `artifact_sha256` (digest of the dumped
   `model.pkl`); the route's new `_guard_card_provenance` (provenance FIRST, then
   structure) refuses digest mismatch or absence with its own 503 detail. ml test pins
   card digest == pkl digest; api test: real same-version card, only the digest flipped →
   503 "model card does not match loaded artifact". `ml/artifacts/model_card.json`
   regenerated with the field; conftest rebuilds stale unbound cards.
2. **Second resolution (g-check HIGH-a ≡ wf LOW ×3):** `LoadedArtifact` gains `path` from
   the single resolution; lifespan stashes `loaded.path` (no re-resolve; import dropped).
   Regression asserts `loaded.path == source`.
3. **Route-level replacement proof (g-check demand):** the load-replace regression now
   also GETs `/api/model` through a probe wired from the load event — 200 with the
   snapshot digest after the file is overwritten.
4. **Evidence-test mutation hole (both MEDIUMs):** now also pins the literal
   `[ "$api_sha" = "$img_sha" ]` comparison — the demonstrated `elif true` mutation fails.
   Five-case behavioral harness stays DEFERRED to PR-F (PR-F precedes Gate A1).
5. **get_bundle orphan (wf LOW ×2):** removed; tests use `get_loaded` (predict/serving/
   scoring-cycle call sites + conftest docstring updated).
6. **Visible PTTF variation (g-check LOW):** e2e 3.2 parses the two visible day numbers
   and asserts direction — same-rounded-text collapse now fails loudly.

Guard order note: provenance before structure, so the structurally-broken card params get
the REAL loaded digest injected in-test — each rejection case still reaches and pins its
named guard. `model_card` 33 · `_guard_card_provenance` 25 · `_validated_card_response` 39
lines (≤50 MUST restored). Round-2 targeted greens: api 40, ml 17, mypy 56 clean.
Verification wave 3 running: both tiers fresh, static gates, ml suite, 3× battery, then
warm `make demo-e2e` at TSDB_PORT=5435.

## Review (2026-08-05 06:07:06 +07) - working-tree PR-D third round

### Reviewed
- Repo: /Users/subhajlimanond/dev/worktrees/pwa-bigdata-review-remediation.BO7ugG
- Branch: feat/model-provenance-dataset-proof
- Scope: working tree at HEAD 5b76604292a8185735e0f2dc51ebc1f91504ac35; third-round verification of the round-2 provenance, single-resolution, preflight-evidence, and visible-PTTF remediations
- Commands Run: `git status --porcelain=v1`; targeted `git diff --name-only`, `git diff --stat`, and per-file diffs; bounded `rg`/`sed`/`nl`; Pydantic schema and TypeScript contract inspection; local artifact/card `sha256sum` comparison; in-memory `elif true` evidence-test mutation; `git diff --check`; `bash -n scripts/demo-preflight.sh`; focused API pytest (11/11 + 4/4 passed); ML `tests/test_model.py` (17/17 passed); web predictive component tests (12/12 passed); web `pnpm typecheck` (passed); e2e `pnpm exec tsc --noEmit` (passed); Playwright `--list` (24 specs); substring-oracle probe; Docker/localhost reachability checks (blocked/unreachable)

### Findings
CRITICAL
- None.

HIGH
- None.

MEDIUM
- The production double-resolution defect is fixed, but no test protects the lifespan wiring that closes it. `lifespan()` correctly calls `get_loaded(settings.model_path)` once and stashes `loaded.path` (`api/app/main.py:145-153`), while the new regression only proves that `get_loaded()` returns a path (`api/tests/test_predict_api.py:339-345`) and then manually wires a probe from that object (`api/tests/test_predict_api.py:360-369`). The shared `_probe()` even repeats the old pattern by calling `get_loaded("")` and then independently calling `resolve_model_path("")` (`api/tests/test_predict_api.py:35-45`). A future reversion in `main.py` to a second `resolve_model_path()` would leave all these tests green and silently reopen the artifact-A/card-B splice fixed in round 2. Fix direction: make `_probe()` use `loaded.path`, and add a real-lifespan regression with a valid custom `MODEL_PATH` (or a controlled A-then-B resolver) that asserts `app.state.bundle`, `app.state.model_path`, `app.state.artifact_sha256`, and `/api/model` all come from one load event. The test must fail if the lifespan re-resolves the path.
- The visible PTTF correspondence oracle is still substring-based, so an obviously wrong day value can satisfy every new assertion. The component renders the numeric days at `web/src/features/predictive/DatasetCompare.tsx:68-80`, but the unit test uses `toHaveTextContent("22.0")`/`toHaveTextContent("0.0")` (`web/src/features/predictive/predictiveComponents.test.tsx:159-168`) and the E2E uses `toContainText(visibleDays(...))` (`e2e/tests/topic3-predictive.spec.ts:62-68`). Playwright confirms that the same matcher accepts `122.0` for expected `22.0`; adding 100 days to both rendered values also preserves the later visible-direction check (`e2e/tests/topic3-predictive.spec.ts:85-95`). Thus the suite can pass while the judge sees `122.0` and `100.0` instead of `22.0` and `0.0`, contradicting the literal visible DOM↔API claim. Fix direction: give the numeric PTTF text its own hook (separate from the lower-bound marker/screen-reader prefix) and assert exact text with `toHaveText`, plus keep the marker and visible-direction assertions. Add a mutation check that offsets or prefixes both rendered day values and requires both unit and E2E tests to fail.

LOW
- None.

### Open Questions / Assumptions
- The round-2 production fixes otherwise close the reported defects: the bundle/path/SHA come from one byte snapshot and one resolution; `/api/model` keeps the load-time digest after on-disk replacement; the card's training-time digest is checked before structural response construction; missing/mismatched bindings get their own 503; and `get_bundle` has no remaining call site.
- Contract parity is correct: Pydantic emits required `artifact_sha256` with JSON-schema type `string`, the OpenAPI test pins it in `required`, and TypeScript declares required `readonly artifact_sha256: string` (`api/app/models.py:266-283`; `api/tests/test_predict_api.py:397-406`; `web/src/features/predictive/types.ts:127-140`).
- The missing-attribute/`Number(null) === 0` concern is closed by preceding `toHaveAttribute` assertions, and no Python-JSON-versus-JavaScript string drift exists because both the React attribute and expected value are formed from the same JSON-parsed JavaScript number.
- The regenerated card's `artifact_sha256` exactly matches the current `ml/artifacts/model.pkl` digest (`22ba1d9ffdca9ef51f99efd74d1b91de35cf90f1c64bab96fa1a0346fd9adb76`).
- The preflight now distinguishes producer failure/malformed output from a real mismatch, validates both digests, honors `MODEL_PATH`, and the demonstrated `elif true` mutation fails the evidence test. The five-case behavioral harness remains explicitly deferred to PR-F, which precedes Gate A1; this review treats that as an accepted gate dependency, not as a new PR-D finding.
- Curl is bounded to five seconds and the in-container Python command to eight seconds after it starts. As noted in round 2, the inner `timeout` cannot bound a host-side `docker compose exec` that hangs before container execution; the script's existing catalog probe has the same operational limitation.
- `docs/demo-coverage.md` remains honest: 3.1/3.2 are partial, the PR-D oracles are source-delivered, and exact-merged-SHA acceptance remains pending Gate A1. No premature complete-proof claim was found.

### Recommended Tests / Validation
- Add the real-lifespan valid-`MODEL_PATH`/single-resolution regression and make `_probe()` consume `loaded.path`; mutation-check a reintroduced second resolver.
- Replace substring PTTF checks with exact numeric-text checks and mutation-check an offset/prefix that preserves direction.
- Keep PR-F's five-case preflight harness blocking Gate A1: equal, unequal, curl/JSON failure, container-exec failure, and malformed output, with message class and exit status asserted.
- Run the live Topic 3 Playwright spec and warm preflight against the exact candidate SHA. Docker access was denied by this sandbox and no localhost stack was reachable, so live browser/preflight behavior was not freshly executed here.

### Rollout Notes
- Do not promote 3.1/3.2 from partial or call Gate A1 complete until these two regression-oracle gaps are closed, PR-F's behavioral preflight harness passes, and exact-merged-SHA acceptance succeeds.
- The `artifact_sha256` field is additive but required; the Python/OpenAPI/TypeScript contract lands as one unit as required.
- No product code, commit, push, PR, merge, or deployment was performed. This appended third-round report is the review's only mutation.

## Fix round 3 (Tier-1 wf round 3: 12 agents/0 errors · g-check round 3: 0 CRITICAL / 0 HIGH)

Both tiers confirm every round-1/2 product defect closed. Round-3 set — all test/gate
strength, all fixed:

1. **conftest staleness presence-only (wf MEDIUM, reproduced by execution):** the card is
   committed but the pkl is machine-local, so a pulled branch could pair a fresh card with
   an older local artifact and every /api/model test would 503 misleadingly with no
   rebuild. Fix: conftest compares the card's `artifact_sha256` to the digest of the LOCAL
   pkl bytes — absent, unreadable, or different → rebuild both.
2. **Lifespan single-resolution unpinned (g-check MEDIUM ≡ wf LOW):** new
   `test_lifespan_resolves_the_model_path_exactly_once` — counting monkeypatch on
   `resolve_model_path` (also patching a reverted re-import in `app.main`) across a real
   lifespan; exactly ONE call allowed; state trio asserted self-consistent. `_probe` now
   consumes `loaded.path` instead of re-resolving (wf LOW).
3. **Substring PTTF oracle (g-check MEDIUM ≡ wf MEDIUM+LOWs, false-pass demonstrated with
   "122.0"⊃"22.0"):** bare number now has its own `dataset-pttf-days` hook; unit asserts
   exact `.textContent`; e2e asserts exact `toHaveText`; direction parses the bare hook.
   **Mutation evidence:** `days+2400h` mutation → unit run FAILED (1 failed/11 passed);
   reverted → 12/12. 
4. **Per-line digest grep (wf LOW):** preflight validation is now whole-string
   `[[ =~ ^[0-9a-f]{64}$ ]]` — a noisy multi-line producer reads as probe failure, never a
   verdict.

Verification: full gate battery + 3× runs on the final tree (in flight) and a
VERIFICATION-ONLY g-check round 4 covering all four fixes (including the two raised by the
workflow — cross-family verification). A fifth full workflow round was not run: round 3
contained zero product defects and every round-3 item is test-strength with its own
mutation/execution evidence recorded above.

## Review (2026-08-05 06:25:49 +07) - working-tree PR-D fourth-round verification

### Reviewed
- Repo: /Users/subhajlimanond/dev/worktrees/pwa-bigdata-review-remediation.BO7ugG
- Branch: feat/model-provenance-dataset-proof
- Scope: working tree at HEAD 5b76604292a8185735e0f2dc51ebc1f91504ac35; verification only of the four round-3 remediations
- Commands Run: `git status --porcelain=v1`; targeted `git diff --name-only`/`git diff --stat`; bounded exact-string `rg` and `nl`/`sed` reads; `git diff --check`; focused API pytest via the repository API venv (2/2 passed); web predictive component test (12/12 passed); e2e TypeScript check (passed); Playwright `--list` (24 specs); `bash -n scripts/demo-preflight.sh`; isolated stale-fixture/cache and non-object-card probes; anchored-regex Bash probe; in-memory unanchored-regex evidence-test mutation; browser matcher probe (blocked by the macOS sandbox before Chromium startup)

### Findings
CRITICAL
- None.

HIGH
- None.

MEDIUM
- The round-3 fixture rebuild still cannot guarantee a consistent loaded-artifact/card pair when the production loader cache was populated first. `model_artifact()` detects a mismatched card and rebuilds the local files (`api/tests/conftest.py:203-218`), but it never clears `_load_cached`, whose pathname-keyed result intentionally survives file replacement (`api/app/model.py:79-112`). That ordering is real: the first registration tests start `TestClient(app)` without requesting `model_artifact` (`api/tests/test_predict_api.py:58-76`), so a targeted `test_predict_api.py` run can cache old artifact A before the session fixture later rebuilds artifact/card B. Subsequent `get_loaded()` calls then retain A's bundle/SHA while `/api/model` reads B's card and returns the same misleading provenance 503 this remediation was meant to prevent. An isolated behavioral probe preloaded an artifact, made the fixture rebuild its file/card, and observed `loader_reused_pre_rebuild_cache=True` and `served_sha_matches_rebuilt_card=False`. Fix direction: after a successful fixture-owned rebuild, invalidate the model loader cache (test-only, without weakening production snapshot semantics) and re-check the rebuilt card/file digest. Add a regression that preloads the canonical path, forces a stale-card rebuild, and proves the next load is a new object whose SHA matches the rebuilt card.

LOW
- The same stale-card block assumes decoded JSON is a mapping. A syntactically valid non-object card such as `[]` reaches `card.get(...)` and raises `AttributeError`, which is not caught by `(OSError, ValueError)` (`api/tests/conftest.py:207-213`); the isolated probe reproduced that exact exception rather than a rebuild. Treat a non-mapping document as stale (or validate `isinstance(card, dict)`) and include it with the absent, unreadable, and mismatched-card fixture cases.
- The whole-string digest implementation is correct, but its regression test does not pin the new anchors. The preflight uses `[[ "$api_sha" =~ ^[0-9a-f]{64}$ ]]` and the same check for `img_sha` (`scripts/demo-preflight.sh:98-101`), and a Bash probe accepted a bare digest while rejecting `warning\n<digest>`. However, `test_preflight_verifies_served_artifact_provenance` only counts two occurrences of the substring `[0-9a-f]{64}` (`api/tests/test_evidence_docs.py:150-153`). Replacing both anchored expressions with unanchored `=~ [0-9a-f]{64}` left that exact evidence test green in an in-memory mutation. Pin the two literal anchored conditions (or add a tiny sourced/helper behavior test for clean versus noisy values). This is specific to the round-3 anchor change and does not reopen the accepted PR-F five-case harness deferral.

### Open Questions / Assumptions
- The lifespan remediation is source-level closed for the claimed regression: the real-lifespan test passed, `get_loaded()` resolves through the monkeypatched `app.model.resolve_model_path`, and a reverted direct `app.main.resolve_model_path` import is also patched, so the ordinary second-resolution reversion produces two counted calls and fails. `_probe()` now uses `loaded.path`. A deliberately renamed pre-bound alias in `app.main` could evade the name-based patch, but that would be a new implementation shape rather than the tested reversion; the separate loaded-snapshot/path/SHA regression still covers the value invariant.
- The PTTF substring remediation is source-level closed: the bare number owns `dataset-pttf-days`, the unit assertions compare exact `.textContent`, Playwright uses exact `toHaveText`, and the direction parse reads that bare hook. The recorded `days+2400h` unit mutation is sufficient to prove the component formatting path is sensitive; the E2E assertion is structurally sensitive to the same mutation, though Chromium could not start in this sandbox, so this review adds no fresh live-browser acceptance evidence.
- The anchored Bash expressions themselves are correct and fail closed on multi-line/noisy output. The LOW finding concerns only regression protection for this newly strengthened condition.

### Recommended Tests / Validation
- Add the cache-preloaded stale-card rebuild regression and non-object JSON case for `model_artifact`; rerun the focused API tests and the targeted `test_predict_api.py` file from an intentionally mismatched local card/artifact start.
- Strengthen the preflight evidence test to require both literal `^...$` validations and mutation-check removal of the anchors. Keep the broader equal/unequal/producer-failure/malformed-output harness in its already accepted PR-F scope.
- Run the live Topic 3 Playwright spec and warm preflight against the exact candidate SHA outside this sandbox. Source checks, web unit tests, typechecking, and test discovery passed here; they are not live-stack proof.

### Rollout Notes
- No new product-code defect was found in the lifespan, PTTF rendering, or preflight implementation changes. The blocking round-4 issue is test-fixture consistency after fixture-owned rebuild; the two LOW items are fixture input completeness and regression pinning.
- Keep 3.1/3.2 partial and Gate A1 pending until the test-strength findings are dispositioned, PR-F's accepted behavioral probe gate passes, and exact-SHA acceptance succeeds.
- No product code, commit, push, PR, merge, or deployment was performed. Appending this fourth-round report to the active Coding Log was the review's only repository mutation.

## Fix round 4 (g-check round 4, verification-only) and final dispositions

Round-4 verdict: rounds 1–3 all closed at source level; **no product-code defect found**.
Residual test-strength items, all fixed:

| Finding | Disposition |
|---|---|
| MEDIUM — fixture rebuild never cleared the pathname-keyed loader cache (probe showed pre-rebuild bundle served against post-rebuild card) | **FIXED** — staleness+rebuild extracted to `_ensure_bound_artifact()`; on rebuild it calls `_load_cached.cache_clear()` and re-verifies the pair binds; new regression `test_fixture_rebuild_leaves_loader_and_card_bound` primes the cache, byte-appends the pkl, runs the fixture code path, asserts a FRESH load matching the rebuilt card |
| LOW — non-dict JSON card (`[]`) raised AttributeError in the staleness check | **FIXED** — `not isinstance(card, dict)` counts as stale |
| LOW — evidence test counted unanchored `[0-9a-f]{64}` (anchor removal survived) | **FIXED** — pins two literal `=~ ^[0-9a-f]{64}$` occurrences |

No round 5: round 4 found zero product defects; every residual was a test-strength item
fixed by implementing exactly the regression the raising reviewer prescribed, and each
carries its own executable evidence (the round-4 probe scenarios re-run green).

## Final gates (tree as committed)

- ruff · mypy strict (56 files) · eslint · tsc (web+e2e) · `bash -n` preflight · vite build — clean
- API pytest **321 ×3** · web vitest **537 ×3** · ml pytest **49** — no flakes
- Warm `make demo-e2e` (TSDB_PORT=5435): **24/24**, preflight provenance probe ✓
  (`artifact_sha256 43abe804615a… matches the running image`), simulator reset on exit
- Mutation evidence: days+2400h → visible-value oracle FAILS; `elif true` and anchor
  removal → evidence test FAILS; replacement/split-pair scenarios covered by executable
  regressions
- QCHECK: Tier 1 = review workflow ×3 rounds (14/10/12 agents, 0 errors each) · Tier 2 =
  Codex g-check skill ×4 rounds (gpt-5.6-sol, xhigh). Every finding dispositioned above;
  sole open deferral: five-case behavioral preflight harness → **PR-F** (blocks Gate A1).
