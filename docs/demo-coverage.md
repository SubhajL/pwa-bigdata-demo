# Demo Coverage & Readiness Matrix (ผนวก ๑๓)

Honest status of the scored 100-point demo. Read with `POC_SPEC.md` §4A (the rubric),
`docs/demo-runbook.md` (how to run each item), and `e2e/` (the automated gate that proves them).

**Two distinct things, do not conflate:**
- **Design** = a Stitch mockup showing the *intended* screen (static; scores 0 on the live demo).
- **Behavior** = running software a judge watches (this is what the 100 points measure).

**Status legend:** ✅ done · ◑ partial · ❌ not yet.

**Refreshed 2026-08-05 after PR-C landed.** The three demo topics are on screen (topic ๒ = PR-7,
topic ๑ = PR-8, topic ๓ = PR-9), and all 16 scored items have implementation paths connected to
their runtime entry points: **16/16 built and wired**. The current warm Playwright suite (23 specs
including the demo-director transitions) protects the strongest live paths, including the timed
band `warning` → model `critical` → recovery sequence. It does not yet provide every literal
operator/DOM oracle required for full acceptance.

**Gate A1 pending.** PR-D still owns loaded-model artifact SHA and displayed dataset-value proof
for 3.1–3.2. PR-E still owns Swagger Try-it-out persistence, DOM/API worklist correspondence, and
induced rendered RCA variation for 3.4–3.6. Until those land and Gate A1 runs at one exact merged
SHA, this matrix must not be promoted to a complete E2E-readiness claim.

---

## Scored items (100 pts) — behavior is what counts

| # | Item (pts) | Implementation/evidence status **now** | Delivered by | E2E spec |
|---|---|---|---|---|
| 1.1 | MQTT connect + continuous ingest (5) | ✅ | PR-1/PR-2, screen PR-8 | `topic1 1.1` |
| 1.2 | Auto-reconnect ≤30s (5) | ✅ (≈1–2s) | PR-2, timing PR-17 | `topic1 1.2` |
| 1.3 | Response ≤500ms in DevTools (5) | ✅ | PR-3, screen PR-8 | `topic1 1.3` |
| 1.4 | Time-series DB write + retrieval (10) | ✅ | PR-0/PR-2/PR-3 | `topic1 1.4` |
| 1.5 | Bad Asset ID → DLQ, loop continues (10) | ✅ | PR-1/PR-2, screen PR-8 | `topic1 1.5` |
| 2.1 | SVG zoom, no blur (5) | ✅ | PR-7 | `topic2 2.1` |
| 2.2 | Device status auto-updates, no refresh (5) | ✅ (director forces the transition on cue) | PR-7, director #30 | `topic2 2.2` |
| 2.3 | Pump anomaly + SEC tooltip (10) | ✅ (induced anomaly + on-screen recomputable derivation) | PR-7, PR-C | `topic2 2.3` + `scenario anomaly` |
| 2.4 | Pressure drop → pipe highlight + affected customers (10) | ✅ (drop < 2.0 bar) | PR-7 | `topic2 2.4` |
| 2.5 | Source code: config + ≥3 components (5) | ✅ | PR-0 → PR-7 → PR-9 | `topic2 2.5` |
| 3.1 | Trained model file + algorithm + params (5) | ◑ built/wired; literal loaded-artifact SHA pending PR-D | PR-4, `/api/model` PR-9 | `topic3 3.1` (partial oracle) |
| 3.2 | Health/PTTF vary across ≥2 datasets (5) | ◑ built/wired; displayed dataset values pending PR-D | PR-4, `/api/model` PR-9 | `topic3 3.2` (partial oracle) |
| 3.3 | Health<threshold → twin change ≤30s (5) | ✅ bound in `test_scoring_cycle`; browser-observed in `scenario-transitions` | PR-4/PR-5/PR-7, #30 | `topic3 3.3` |
| 3.4 | Feedback API via Swagger, persists (5) | ◑ built/wired; literal Swagger Try-it-out pending PR-E | PR-5, screen PR-9 | `topic3 3.4` (custom-form oracle) |
| 3.5 | Prioritized Worklist (5) | ◑ built/wired; rendered DOM/API row correspondence pending PR-E | PR-5, screen PR-9 | `topic3 3.5` (partial oracle) |
| 3.6 | Root Cause Analysis (5) | ◑ built/wired; induced rendered cause variation pending PR-E | PR-4/PR-5, screen PR-9 | `topic3 3.6` (partial oracle) |

**Implementation coverage: 16/16 built and wired.** Current automated evidence is 23 Playwright
specs, including a global SIMULATED-marker check and the demo-director transitions in
`scenario-transitions.spec.ts`. PR-D/PR-E and Gate A1 remain the boundary for complete literal
operator/DOM evidence. Design coverage: 15/16 have a mockup (2.5 needs none — it is the repo).

> **2.2 / 2.4 demo-data tuning (PR-7, landed 2026-08-01).** The score gate surfaced that the seed
> produced no red device: a single below-band reading tops out at `warning` (`api/app/bands.py` —
> reaching `critical` needs a value a full band-width outside the band, unreachable for pressure), so
> the only path to a `critical` symbol is the model-health path, and demo pump **P-2 backfilled to
> `normal`/`warning`** rather than red. Fixed by pinning P-2's backfill wear
> (`scripts/backfill_history.py::DEMO_WEAR_OVERRIDE = {"P-2": 0.34}`, the fleet max capped so no pump
> is scored post-failure): its cold-start window scores **health ≈ 32 → `critical`** while staying
> **pre-failure** — a genuine "degraded, predicted to fail" case, not saturated post-failure output —
> so the twin colours P-2 red and it ranks #1 on the worklist. Verified deterministically in
> `api/tests/test_backfill_demo_health.py`. The earlier note that `pressure_drop` "(~2.9 bar) stays
> inside the band" was **wrong** — the fault mode drives pressure **below the 2.0 low band**
> (`simulator/tests/test_pressure_drop.py`), so item 2.4's pipe highlight fires as a
> `warning`, which is what 2.4 requires. **Caveat that remains:** the live window averages every reading
> in a clock-hour, so the *backfilled* P-2 reads red only near a **true cold start** (`make demo-down`
> then preflight); after the sim runs a while, live normal-mode telemetry washes it toward `warning`.
> **Retired by PR #30:** the demo director (`POST /api/demo/scenario`, runbook §0b) steers P-2's
> feature window deterministically at any stack age, so the twin items no longer depend on running
> shortly after a cold start.

---

## Non-scored POC modules (proposal narrative)

| Module | Design | Behavior |
|---|---|---|
| Executive / Regional / Branch dashboards (S1–S3, PR-10–12) | ✅ | ❌ (not required for the scored demo) |
| Admin / Reports / Alerts / AI chat (S5–S7, S9, PR-13–16) | ✅ | ❌ |

These score in the **written 80% technical proposal**, not the live demo.

---

## Bottom line

- **Clickable app:** ✅ topic ๑/๒/๓ screens live and wired to the backend.
- **Implementation:** ✅ 16/16 built and wired; the remaining PR-D/PR-E evidence gaps are listed
  above.
- **Acceptance:** ◑ Gate A1 pending; a warm `make demo-e2e` run is strong rehearsal evidence, not
  a substitute for the missing literal oracles or the exact-SHA acceptance gate.
- **Stack readiness:** Run `make demo-preflight` → `✓ DEMO READY`, then walk
  `docs/demo-runbook.md`; this preflight result describes the running stack, not final evidence
  acceptance.
