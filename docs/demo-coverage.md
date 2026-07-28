# Demo Coverage & Readiness Matrix (ผนวก ๑๓)

Honest status of the scored 100-point demo vs. what exists today. Read with
`POC_SPEC.md` §4A (the rubric) and `docs/DREP-demo-poc.md` (the build plan).

**Two distinct things, do not conflate them:**
- **Design** = a Stitch mockup showing the *intended* screen (static; scores 0 on the live demo).
- **Behavior** = running software a judge watches (this is what the 100 points measure).

**Status legend:** ✅ done · ◑ partial · ❌ not yet.

---

## Scored items (100 pts) — behavior is what counts

| # | Item (pts) | Design target | Behavior demonstrable **now** | Built by (DREP slice) |
|---|---|---|---|---|
| 1.1 | MQTT connect + continuous ingest (5) | ◑ S8 (MQTT pill, ingest chart) | ❌ | S1+S2 |
| 1.2 | Auto-reconnect ≤30s (5) | ◑ S8 (connection timeline, static) | ❌ | S2 (FN3) |
| 1.3 | Response ≤500ms in DevTools (5) | ◑ S8 (DevTools-style panel, static) | ❌ | S3 |
| 1.4 | Time-series DB write + retrieval (10) | ◑ S8 (lineage node) | ❌ | S2 |
| 1.5 | Bad Asset ID → DLQ, loop continues (10) | ◑ S8 (DLQ table, static) | ❌ | S2 |
| 2.1 | SVG zoom, no blur (5) | ◑ S4 (schematic + zoom controls, static PNG) | ❌ | S4 |
| 2.2 | Device status auto-updates, no refresh (5) | ◑ S4 (static — can't show liveness) | ❌ | S3(WS)+S4 |
| 2.3 | Pump anomaly + SEC tooltip from live data (10) | ◑ S4 (P-2 red + SEC tooltip, static) | ❌ | S4+S5 |
| 2.4 | Pressure drop → pipe highlight + affected customers (10) | ◑ S4 (highlight + list, static) | ❌ | S4+S2 |
| 2.5 | Source code: config + ≥3 components (5) | n/a (it IS the repo in an IDE) | ❌ (no code yet) | S4 |
| 3.1 | Trained model file + algorithm + params (5) | ◑ S10 (model card, static) | ❌ | S5 |
| 3.2 | Health/PTTF vary across ≥2 datasets (5) | ◑ S10 (two-dataset card, static) | ❌ | S5 |
| 3.3 | Health<threshold → twin change ≤30s (5) | ◑ S10+S4 (static) | ❌ | S6+S4 |
| 3.4 | Feedback API via Swagger, persists (5) | ◑ S10 (Swagger-style panel, not real) | ❌ | S6 |
| 3.5 | Prioritized Worklist (5) | ◑ S10 (worklist table, static) | ❌ | S6 |
| 3.6 | Root Cause Analysis (5) | ◑ S10 (RCA bars, static) | ❌ | S5+S6 |

**Design coverage:** 15/16 have a mockup (2.5 needs none — it's the repo).
**Behavior coverage (what scores): 0/16.** All 16 require the runnable build; none exists yet.

> This is not a gap in the design work — it is inherent. The demo scores *behavior over time*
> (reconnect timing, live transitions, real API calls). Static mockups cannot express any of it.
> The score comes only from `g2-coding` building the DREP.

---

## Clickability / destinations

The 10 mockups are **not clickable** (static HTML/PNG). Interaction destinations:

| Flow | Status |
|---|---|
| Exec → Regional → Branch drill-down | ◑ each destination exists as a *separate static mockup*, not wired |
| KPI-tile click, "ดู Data Lineage →", export→PDF | ❌ no destination |
| Admin sub-tabs (4 of 5), add-user modal | ❌ |
| Report schedule / create-new modals | ❌ |
| Alert acknowledge / detail | ❌ |
| Twin: click device / DLQ row / worklist item → detail | ❌ |
| Loading / empty / error / offline states (every screen) | ❌ drawn (specified in `design/INTERACTIONS.md`) |

---

## Non-scored POC modules (proposal narrative)

| Module | Design | Behavior |
|---|---|---|
| Executive / Regional / Branch dashboards (S1–S3) | ✅ | ❌ (not required for the scored demo) |
| Admin / Reports / Alerts / AI chat (S5–S7, S9) | ✅ | ❌ |

These score in the **written 80% technical proposal**, not the live demo.

---

## Bottom line

- **Clickable app:** ❌ not yet — mockups only.
- **All scored behaviors shown fully & correctly:** ❌ not yet — 0/16 until the DREP is built.
- **Design targets for the scored items:** ◑ 15/16 exist to build against.
- **Path to "yes":** implement `g2-coding` slices S0 → S1 → S2 → S3 → S5 → S4 → S6 → **S-D** → S7.
  Slice **S-D** (the demo director + runbook) is the one that makes each item *visibly, repeatably*
  demonstrable to a judge — per Codex finding 1 & 14.

**When is it demo-ready?** When every row in the scored table reads ✅ under *Behavior demonstrable*,
verified by the S-D end-to-end rehearsal. Not before.
