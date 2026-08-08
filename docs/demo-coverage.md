# Demo Coverage & Readiness Matrix (ผนวก ๑๓)

Honest status of the scored 100-point demo. Read with `POC_SPEC.md` §4A (the rubric),
`docs/demo-runbook.md` (how to run each item), and `e2e/` (the automated gate that proves them).

**Two distinct things, do not conflate:**
- **Design** = a Stitch mockup showing the *intended* screen (static; scores 0 on the live demo).
- **Behavior** = running software a judge watches (this is what the 100 points measure).

**Status legend:** ✅ done · ◑ partial · ❌ not yet.

**Refreshed 2026-08-08 (closure).** The three demo topics are on screen (topic ๒ = PR-7,
topic ๑ = PR-8, topic ๓ = PR-9), and all 16 scored items have implementation paths connected to
their runtime entry points: **16/16 built and wired**. The current warm Playwright suite (37 specs
including the demo-director transitions and the PR-J click-to-200 journey; the six
`PIPE_GIS_ENABLED`-gated proofs in `topic2-gis.spec.ts` — the four real-geometry proofs plus two
PR-J GIS-view checks — self-skip while GIS is off — PR-H lands dark) protects the strongest live paths, including the timed
band `warning` → model `critical` → recovery sequence and the literal operator/DOM oracles for
topic ๓; their exact-merged-SHA acceptance is recorded below.

**Gate A1 ACCEPTED @ `b596846`** — a complete single-SHA acceptance (warm 3× + approved cold run;
core evidence; `PIPE_GIS_ENABLED=0`), corroborated by a retained checksum-valid evidence archive.
Gate A1 postdates PR-D/PR-E/PR-F, so it **closed the five formerly-pending Topic-3 rows**
(3.1/3.2/3.4/3.5/3.6): PR-D delivered the complete judge-visible loaded-model artifact SHA and
displayed dataset-value oracles for 3.1–3.2 (API/UI/preflight share one hash of the exact loaded
bytes; the card exposes all 64 digest characters and tiles expose both the literal served values
and the judge-visible numbers), and PR-E delivered Swagger Try-it-out persistence (with DB-side
verification and harness cleanup), first-three DOM/API worklist correspondence, and induced
rendered RCA variation for 3.4–3.6. It does **not** accept the later PR-I/PR-J work: at `b596846`,
item 2.4 was the pre-PR-J proof, so the current clickable 200-customer 2.4 is Gate A2's, below.

**Gate A2 — the final merged-main bundle (the whole post-PR-I/PR-J matrix) at one exact SHA — is
NOT yet certified at a single SHA; it is re-run at this closure SHA (Path 2).** Its evidence exists
historically but is SPLIT across SHAs and operator-reported (no retained acceptance manifest in
this repo): a warm three-run §7 acceptance at `c67bd54` (operator-reported 31 pass / 6 skip;
`PIPE_GIS_ENABLED=0`; three §7 runs exit 0; `demo-acceptance/v2` manifest clean) and the
judge-sequence rehearsal with archived timings at `9a6c83c` (#46, retained archive, certified on
clean `main`). Because the rehearsal harness landed AFTER the `c67bd54` run, neither SHA carries
the complete Gate A2 bundle. **A changed candidate re-opens acceptance:** any tree change
(including this closure PR) re-runs the full warm §7 acceptance AND the rehearsal at its own merged
SHA, producing the retained, auditable manifest that finally binds Gate A2 to one exact SHA.

**Still open, optional and gated (not scored):** activating the REAL Rayong/Map Ta Phut geometry
(`PIPE_GIS_ENABLED=1`) awaits recorded data-owner redistribution permission; a true-cold
(`CONFIRM_VOLUME_RESET=1`) acceptance runs only under explicit destructive authorization. Neither
blocks the five Topic-3 rows accepted (Gate A1) at `PIPE_GIS_ENABLED=0`.

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
| 2.4 | Pressure drop → clickable footprint/pipe → 200-customer drawer + 12-reading detail (10) | ✅ clickable (200 · 140/35/25) | PR-7 + **PR-J** | `scenario-transitions` (PR-J journey) |
| 2.5 | Source code: config + ≥3 components (5) | ✅ | PR-0 → PR-7 → PR-9 | `topic2 2.5` |
| 3.1 | Trained model file + algorithm + params (5) | ✅ accepted (Gate A1); complete visible loaded-artifact SHA oracle delivered (PR-D) | PR-4, `/api/model` PR-9 | `topic3 3.1` + `3.1b` |
| 3.2 | Health/PTTF vary across ≥2 datasets (5) | ✅ accepted (Gate A1); displayed dataset-value oracle delivered (PR-D) | PR-4, `/api/model` PR-9 | `topic3 3.2` (DOM↔API literal + visible) |
| 3.3 | Health<threshold → twin change ≤30s (5) | ✅ bound in `test_scoring_cycle`; browser-observed in `scenario-transitions` | PR-4/PR-5/PR-7, #30 | `topic3 3.3` |
| 3.4 | Feedback API via Swagger, persists (5) | ✅ accepted (Gate A1); literal Swagger Try-it-out + DB persistence oracle delivered (PR-E) | PR-5, screen PR-9 | `topic3 3.4` + `3.4b` (Swagger↔DB row identity) |
| 3.5 | Prioritized Worklist (5) | ✅ accepted (Gate A1); first-three rendered↔API row oracle delivered (PR-E) | PR-5, screen PR-9 | `topic3 3.5` (first-three rendered↔API, visible cells) |
| 3.6 | Root Cause Analysis (5) | ✅ accepted (Gate A1); induced rendered-cause variation oracle delivered (PR-E) | PR-4/PR-5, screen PR-9 | `topic3 3.6` + `3.6b` (induced top-cause change) |

**Implementation coverage: 16/16 built and wired.** Current automated evidence is 37 Playwright
specs, including a global SIMULATED-marker check, the demo-director transitions plus the PR-J
clickable low-pressure journey in `scenario-transitions.spec.ts`, and the PR-H GIS view specs in
`topic2-gis.spec.ts` (dark-landing UX always; the six `PIPE_GIS_ENABLED`-gated proofs — the four
real-geometry proofs plus two PR-J GIS-view checks — run only on a locally GIS-enabled stack
and are NOT part of scored evidence until data-owner permission is recorded). The PR-D/PR-E literal
oracles are DELIVERED and ACCEPTED at **Gate A1 @ `b596846`** (a complete single-SHA acceptance),
which closed the five formerly-pending Topic-3 rows (3.1/3.2/3.4/3.5/3.6). The rest of the current
matrix — notably the post-`b596846` PR-I/PR-J work behind item 2.4 — is accepted only at the final
**Gate A2** (warm §7 3× + rehearsal at one exact SHA), which is re-run at this closure SHA (Path 2);
a changed candidate re-runs it at its own merged SHA. Design coverage: 15/16 have a mockup (2.5 needs none — it is the repo).

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
> in a clock-hour, so the *backfilled* P-2 reads red only near a **true cold start**
> (`make demo-down CONFIRM_VOLUME_RESET=1` then preflight); after the sim runs a while, live normal-mode telemetry washes it toward `warning`.
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
- **Implementation:** ✅ 16/16 built and wired; the PR-D/PR-E literal oracles are delivered
  (rows above); their five Topic-3 rows are accepted at Gate A1.
- **Acceptance:** ✅ **Gate A1 ACCEPTED @ `b596846`** — a complete single-SHA acceptance (warm 3× +
  approved cold run; core evidence; `PIPE_GIS_ENABLED=0`) that closed the five formerly-pending
  Topic-3 rows (3.1/3.2/3.4/3.5/3.6). ◑ **Gate A2** (the full post-PR-I/PR-J matrix, incl. item
  2.4's clickable 200-customer proof) is not yet bound to one SHA: operator-reported warm §7 3×
  evidence exists at `c67bd54` (31 pass / 6 skip; `demo-acceptance/v2` clean) and the rehearsal +
  archived timings at `9a6c83c` (#46, retained), but — because the rehearsal landed after the
  `c67bd54` run — the complete, auditable bundle is re-run at this closure SHA (Path 2). PR-F's
  harness refreshes remote truth, rejects dirty/stale or Git-context-substituted source, pins one
  candidate Compose stack/endpoints and trusted make executable, and performs a confirmed cold
  reset in the same execution as its gate. **Still optional and separately gated:** the true-cold
  (`CONFIRM_VOLUME_RESET=1`) result needs explicit destructive authorization, and REAL-geometry
  activation (`PIPE_GIS_ENABLED=1`) needs recorded data-owner permission.
- **Stack readiness:** Run `make demo-preflight` → `✓ DEMO READY`, then walk
  `docs/demo-runbook.md`; a preflight result describes the running stack, and a changed candidate
  re-runs warm acceptance at its own merged SHA.
