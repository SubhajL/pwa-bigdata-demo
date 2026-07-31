# Coding Log — PR-9 (Predictive panel S10) + PR-17 (S-D demo director / score gate)

Started 2026-07-31. g2 lifecycle. DREP: `docs/DREP-PR9-PR17.md`.

Scope confirmed with user (AskUserQuestion, 2026-07-31):
- PR-9 3.1/3.2 → **Full `GET /api/model`** (real card + live-scored two demo datasets).
- PR-17 Playwright → **live Docker stack** (real MQTT/DB/twin), all 16 items.
- Scenario driver → **scripts over existing `FAULT_MODE` + broker restart** (no new scenario API).

Land order: **PR-9 first** (admin merges to origin/main), pull to local main, then **PR-17**.

---

## Entries

### 2026-07-31 · Planning complete (DREP + Codex Phase 3/4)
- DREP `docs/DREP-PR9-PR17.md` drafted; Codex `gpt-5.6-sol` xhigh adversarial pass ran
  (`scratchpad/codex-plan-attack.md`): 14 findings, **13 accepted + 1 reframed**, all
  dispositioned in DREP §12. High-value catches: C1 (no `GET /api/feedback` → E3.4 re-GET
  impossible), H1 (card↔model parity), H2 (degraded-window must mirror the repo's canonical
  `test_model.py:97` A/B, not a post-failure window), H3 (`lru_cache` on `Bundle` → TypeError),
  H4 (T9.2 vacuous), H6 (`getJson` signature), C2 (E2E state isolation).
- **Stop lines:** S9-A → **Claude implements** (small + model-integrity subtlety; no delegation).
  S9-B/C/D → **SL-2, DeepSeek-eligible** (typed seams + strong vitest/tsc/eslint oracle).
  S9-E + all PR-17 → **Claude** (wiring judgment; Playwright specs ARE the acceptance oracle).

### 2026-07-31 · S9-A — GET /api/model (items 3.1/3.2) — Claude-implemented
- **Stop line:** N/A — Claude implemented (small + model-integrity subtlety; no delegate).
  TDD: 4 acceptance tests authored + RED-proven (route 404 / registration miss) → GREEN.
- Files: `ml/pwa_ml/datasets.py` (canonical `CORPUS_SEED`), `ml/pwa_ml/__main__.py` +
  `scripts/build_demo_datasets.py` (import it — dedup), `api/app/models.py` (EstimatorCard,
  MetricPair, DatasetScore, ModelCardResponse), `api/app/model.py` (`read_model_card`,
  `score_demo_datasets` memoised on resolved path — H3-safe), `api/app/main.py` (stash
  `app.state.model_path` — H1 parity), `api/app/routes/predict.py` (`GET /api/model` +
  version-parity 503 guard), `api/tests/test_predict_api.py` (T9.1–T9.3 + parity).
- **Codex fixes applied:** H1 (card↔model parity via resolved path + version check → 503),
  H2 (windows mirror `test_model.py`: healthy `[:24]` / degraded `[-24:]`), H3 (dict memo by
  path, no `lru_cache` on Bundle), H4 (T9.2 asserts ≥15 separation + reserved ids + not-nodata).
- **Gates:** api unit 169 pass (3× no-flake) · ml 48 pass · ruff clean (api/ml/scripts) ·
  mypy strict clean. Real output: healthy 99.5/22d normal, degraded 0.0/0d critical.
- QCHECK on S9-A diff (implementer Claude → Tier 1 g2-check + Tier 2 Codex gpt-5.6-sol xhigh;
  Tier 2 mandatory: new public API contract consumed by the frontend).

#### Review (2026-07-31) — S9-A working-tree — Tier 1 (g2-check, Claude)
Reviewed: `feat/pr9-predictive`; api/app/{models,model,main,routes/predict}.py, ml/pwa_ml/
{datasets,__main__}.py, scripts/build_demo_datasets.py, api/tests/test_predict_api.py.
Findings:
- **MEDIUM (confirmed):** `routes/predict.py` `model_card` — a structurally-malformed card
  makes `EstimatorCard(**v)`/`MetricPair(**v)` raise pydantic `ValidationError`; the build
  block catches only `(KeyError, TypeError)`, and the read block only `(FileNotFoundError,
  ValueError)` (misses `PermissionError`/other `OSError`). Either → **HTTP 500**, breaking the
  file's "unavailable → 503" contract. Verified `ValidationError ⊂ ValueError` in pydantic
  2.10.4. Fix: read except `(OSError, ValueError)`; build except `(KeyError, TypeError,
  ValueError)`. Test: `app.state.model_path` → dir with a card missing `estimator_class` → 503.
- **LOW (noted, not fixing):** `DatasetScore` has no per-item `simulated` flag;
  `ModelCardResponse.simulated=True` marks the whole response — sufficient (the entire card is
  simulated). Frontend still badges it (S9-D).
- No CRITICAL/HIGH. Wiring OK (route in openapi, helpers imported+called). Tests non-vacuous
  (RED-proven 404; T9.2 ≥15 separation kills the epsilon scorer). CLAUDE.md MUST-NOT clean.
#### Review (2026-07-31) — S9-A — Tier 2 (Codex gpt-5.6-sol, xhigh) — findings & dispositions
No CRITICAL. All dispositioned; fixed in one round, each with a mutation-proven regression test.
- **HIGH — degraded window was post-failure saturation (dishonest).** ACCEPT. Empirically
  confirmed: `demo_degraded` fails at hour 209; `[-24:]` = hours 696–719 (out of training
  domain) → health 0.0/PTTF 0.0. **Fix:** `_demo_window` scores the last window ending BEFORE
  failure (`rows[fh-24:fh]`, in-domain) → degraded **health 30.1 / critical** (honest "about to
  fail"). Also **`DatasetScore` now surfaces `pttf_out_of_range`** (healthy 527h is censored →
  True; was being presented as an exact estimate). T9.2 asserts `degraded health>0`
  (mutation-proven: reverting to `[-24:]` fails it). Supersedes the planning-phase H2 "mirror the
  canonical test" disposition — the canonical ml test is unchanged and still passes.
- **HIGH — card↔model parity TOCTOU / same-version-swap / symlink.** REJECT with evidence
  (repo-checkable, not deferred): `infra/docker-compose.yml:110` sets `MODEL_PATH: ""`; the
  artifact is baked into the image at a fixed path (`api/Dockerfile` `RUN python -m pwa_ml`) and
  loaded once at startup lifespan, never swapped at runtime, no symlink. The runtime-swap/symlink
  paths cannot occur in this deployment; the version-parity check remains as defense-in-depth.
- **MEDIUM — 503 isolation incomplete.** ACCEPT. read except → `(OSError, ValueError)`;
  `read_model_card` rejects non-dict JSON (ValueError); build except → `(KeyError, TypeError,
  ValueError, AttributeError)`; completeness guard 503s when pipelines/metrics lack health+pttf.
  Covered by T9.2d (missing estimator_class → ValidationError) + T9.2e (json-scalar, empty
  estimators). ("Extra keys ignored by pydantic" — rejected: lenient/forward-compatible is desired.)
- **MEDIUM — T9.2c vacuous.** ACCEPT. Now uses the REAL card with only `model_version` changed →
  only the parity check 503s it (mutation-proven: disabling parity → 200 → test fails).
- **MEDIUM — T9.2 `>=` PTTF + missing pttf assertions.** ACCEPT. `>` strict; asserts BOTH health
  and pttf `estimator_class` + `model_mae<baseline_mae`.
- **LOW — process-local path-keyed cache.** ACCEPT-as-noted: safe for the immutable-image
  deployment (fixed path, loaded once); no runtime bundle swap; tests use distinct paths that 503
  before scoring, so no test-order staleness.
- Confirmed sound by Codex: windows/seed match the corpus; `CORPUS_SEED` re-export keeps
  `test_shipped_artifact` importing; `20260729` unchanged.
- **Gates after fixes:** ruff clean · mypy strict clean · ml 48 pass · api unit 172 pass (3×
  no-flake) · honest output healthy 99.5/normal(oor) vs degraded 30.1/critical. Final honest A/B.
#### Review (2026-07-31) — S9-A — Tier 2 confirming pass (Codex gpt-5.6-sol, xhigh)
Confirmed both HIGHs resolved (degraded window now hours 185–208, health 30.115; parity-rejection
sound for the Compose deployment). Found issues the FIRST round of fixes introduced:
- **MEDIUM (reproduced 500):** the completeness guard ran `set(card.get("pipelines"))` OUTSIDE the
  try, so `"pipelines": 7` → `set(7)` → TypeError → 500. **Fixed:** guard moved INSIDE the try
  (TypeError → 503). New test `T9.2e[pipelines-not-a-mapping]`; mutation-proven (guard outside try
  → 500 → fails).
- **MEDIUM (T9.2d vacuous):** the completeness guard short-circuited before the pydantic path, so
  T9.2d 503'd via the guard, not `ValidationError`. **Fixed:** T9.2d's card now names both
  estimators+metrics (passes the guard) with a malformed sub-object → reaches `EstimatorCard(**v)`
  → ValidationError; mutation-proven (narrow the build except → 500 → fails).
- **LOW:** stale docstring claiming the endpoint uses the canonical test's "exact windows".
  **Fixed:** docstring now points to `app.model._demo_window` (in-domain pre-failure window).
- **Gates after this round:** ruff clean · mypy strict clean · ml 48 · api unit **173 pass**
  (was 172 + the new param). 8 model-endpoint acceptance tests, all mutation-proven where written
  after the code. No further Codex pass — every confirming-pass finding has a mutation-proven test.

**S9-A CLOSED.** Two QCHECK tiers + one confirming pass; all findings fixed & dispositioned;
zero open CRITICAL/HIGH. Honest A/B: healthy 99.5/normal(oor) vs degraded 30.1/critical.
