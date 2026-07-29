## Findings

### CRITICAL

1. **Item 3.1 does not ship a trained artifact.**

   Only `ml/artifacts/.gitkeep` exists. The pickle is ignored in [.gitignore:22](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/.gitignore:22), the card is absent, and `train()` has no CLI/build entry point. The only non-library calls to `train()` are tests.

   [test_model.py:38](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/tests/test_model.py:38) creates a throwaway model in pytest’s temporary directory. Therefore `test_the_artifact_loads_through_the_production_loader` passes while the demo has nothing for [load_bundle():90](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/pwa_ml/predict.py:90) to load.

   **Needed failing test:** execute a documented build command, then load the canonical `ml/artifacts/model.pkl` and compare it with the canonical committed/generated card.

### HIGH

2. **The committed item-3.2 datasets are stale.**

   Regenerating through [build_demo_datasets.py:24](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/scripts/build_demo_datasets.py:24) produces different content for all 720 data rows in both CSVs. The manifest still matches because it records IDs/configuration, not row content.

   `test_health_and_pttf_separate_materially_on_the_holdout_datasets` at [test_model.py:97](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/tests/test_model.py:97) never opens either committed CSV; it regenerates different in-memory lifecycles. It stays green even if the files shown in the scored demo are stale, swapped, or corrupted.

   **Needed failing test:** byte-compare both committed CSVs and the manifest against seeded regeneration.

3. **`pttf_censored` is not censoring; it is an arbitrary threshold.**

   The current worktree changed the pasted health/horizon rule to `prediction >= 0.9 * max_observed_pttf` at [predict.py:38](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/pwa_ml/predict.py:38) and [predict.py:140](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/pwa_ml/predict.py:140). Neither version establishes that an incoming outcome is censored or that the reported number is a lower bound. Top-of-range observed failures are still exact, uncensored labels.

   The comment claiming a linear model cannot extrapolate beyond its fitted target range is also statistically false.

   `test_pttf_reports_a_lower_bound_when_censored` at [test_model.py:166](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/tests/test_model.py:166) only checks one `True` result. `pttf_censored=True` unconditionally passes it.

   Training itself correctly filters censored windows at [train.py:76](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/pwa_ml/train.py:76). The inference semantics are the broken part. Rename this to a calibrated extrapolation/uncertainty flag, or carry real observation/event information and implement a genuine survival/lower-bound contract.

4. **A leaky fitter can pass the entire anti-theatre suite.**

   The current implementation does use only `corpus.train`, and the in-memory train/validation/reserved IDs are deterministic and disjoint. But the tests prove only what the generated card claims.

   Concrete passing mutation:

   - Fit health on train + validation + both demo lifecycles.
   - Fit PTTF on every uncensored window from those lifecycles.
   - Continue writing the original split IDs, PTTF counts, and metrics into the card.

   This mutation still satisfies:

   - `test_the_demo_datasets_were_never_trained_on` at [test_model.py:136](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/tests/test_model.py:136)
   - `test_splits_do_not_share_a_lifecycle`
   - `test_the_model_beats_a_dummy_baseline`
   - `test_pttf_was_fitted_ONLY_on_uncensored_windows`

   All four inspect self-reported card fields rather than actual fit inputs or independently recomputed metrics.

   **Needed failing tests:** mutate demo/validation rows and assert fitted scaler/model parameters remain invariant; independently recompute loaded-artifact MAE and DummyRegressor MAE from the declared split.

5. **The model card’s “data hash” does not identify the fitted data.**

   [datasets.py:68](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/pwa_ml/datasets.py:68) hashes lifecycle IDs, hours, and latent health only. It ignores every observable feature actually fitted, and also includes validation despite calling itself a hash of “training inputs.”

   I changed a training vibration value by `+999` in memory; `Corpus.sha256()` remained identical.

   `test_the_card_is_falsifiable...` at [test_model.py:79](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/tests/test_model.py:79) merely checks that the hash string is nonempty. The card assembled at [train.py:169](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/pwa_ml/train.py:169) also omits the planned code/artifact hashes, dependency versions, thresholds, and RCA baseline definition.

6. **RCA mixes clipped and unclipped predictions.**

   [score_window():132](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/pwa_ml/predict.py:132) clips actual health before passing it to `explain()`, but the counterfactual at [predict.py:179](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/pwa_ml/predict.py:179) remains raw.

   If actual and counterfactual raw predictions are 120 and 110, both displayed scores are 100, yet RCA reports a contribution of `+10`. Rankings, signs, and magnitudes can therefore be false at the boundaries.

   Both RCA ranking tests remain green because they never verify the contribution against a direct prediction delta.

### MEDIUM

7. **RCA is local model attribution, but not defensible “root cause” attribution yet.**

   The current `explain()` genuinely re-scores through the loaded pipeline. A literal fixed ranking fails the two injected-anomaly tests.

   However, the baseline at [train.py:221](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/pwa_ml/train.py:221) is the mean of all training windows—not a nominal healthy device. Resetting one signal while every correlated signal remains degraded creates combinations absent from this generator.

   The sign is `counterfactual − actual`: positive means resetting that signal to baseline raises predicted health. It does **not** mean the signal is a causal root cause.

   `test_rca_follows_the_serialized_model` only asserts `a != b`; a baseline-dependent z-score heuristic can satisfy it without using prediction deltas. The extreme `+6` vibration and `+35°C` tests also do not show that rankings vary on natural/demo windows.

8. **Inference accepts feature windows unlike anything used in training.**

   Training uses exactly 24-hour windows, but [predict.py:28](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/pwa_ml/predict.py:28) accepts any eight rows. [features.py:37](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/pwa_ml/features.py:37) calculates slope by sample position without checking hour order, gaps, duplication, staleness, or finiteness.

   `test_a_short_window_is_nodata...` at [test_model.py:186](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s5/ml/tests/test_model.py:186) checks only two rows. Eight rows, reversed rows, or widely gapped rows all get confident predictions.

### LOW

No additional low-severity issue. For valid contiguous hourly input, the mean/max/slope calculations are reasonable, `StandardScaler → Ridge(alpha=1)` is numerically coherent, and SEC’s `power / flow` units are correct.

## Verdict

This is still partially AI theatre at the evidence layer. The actual fitter is presently lifecycle-separated and the RCA implementation is genuinely input-local, but the suite can certify a leaked model, does not test the committed demo datasets, and manufactures its only artifact inside pytest. I would block S5 acceptance until the CRITICAL and HIGH findings are closed.

Validation performed:

- 25 non-model tests passed.
- Ruff passed.
- Mypy passed.
- The slow artifact suite could not run in this read-only session because pytest/artifact training requires writable temporary storage; the current interpreter also lacks `joblib`.
- The mandatory `g-check` Coding Log append was attempted and rejected by the read-only sandbox.

The worktree changed during review; these findings reflect the stable final snapshot with `train.py` SHA-256 `cf799989…` and `predict.py` SHA-256 `ec00af76…`, not the older pasted PTTF condition.

