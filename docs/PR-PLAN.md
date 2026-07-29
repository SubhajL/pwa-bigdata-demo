# Phased PR Plan → scored demo (100%) **and** full product

Revised 2026-07-29 to cover two goals, not one:
1. **Scored demo** (ผนวก ๑๓, 100 pts) — the runnable behaviours the committee marks.
2. **Full product** — all 10 designed screens as a cohesive working app, so the demo
   walks the whole system (role dashboards + admin/reports/alerts/AI), not just 3 topics.

**Every frontend PR starts from its committed Stitch design** — `design/screens/S*.png`
+ `design/tokens.map.md` + `design/INTERACTIONS.md` — built via the `g-ui-component`
workflow (shadcn primitives, all states, axe, tokens only). Stitch is the visual source
of truth; no component invents layout or colour.

Built from `docs/DREP-demo-poc.md`, hardened by the Codex adversarial pass. One branch per
PR, each green + `g2-qcheck` before squash-merge to `main`. No GitHub remote yet → "PR" =
feature branch + local squash-merge (wire a remote for real GitHub PRs anytime).

**"100%" = 100% demonstrable coverage** of the 16 scored items, verified by the PR-17
rehearsal. The committee's pen is theirs; demonstrability is ours.

---

## Phases & dependency order

```
Phase A  backend + scored behaviours     PR-1 → PR-2 → PR-3 → PR-4 → PR-5
Phase B  frontend foundation (Stitch)    PR-6   (design system: tokens, fonts, shadcn, shell)
Phase C  screens from Stitch             demo:  PR-7  PR-8  PR-9
                                         role:  PR-10 PR-11 PR-12   ← non-POC, REAL data
                                         prop:  PR-13 PR-14 PR-15 PR-16  ← non-POC, designed
Phase D  demo director + E2E             PR-17  (the score gate)
```
PR-6 gates all of Phase C. Role dashboards (PR-10–12) need only a read API over curated
data, so they can proceed in parallel with the demo backend.

---

## Phase A — backend & scored behaviours

| PR | Slice | Scope | Scored items unlocked |
|---|---|---|---|
| **PR-0 ✅** | S0 | infra, schema (hypertables), FastAPI concurrency, seeds, scaffolds | — (foundation; begins 2.5) |
| PR-1 | S1 | telemetry simulator (roster + injectable anomaly/bad-id/lifecycle) | feeds 1.1 |
| PR-2 | S2 | ingest → validate → **DLQ** → TSDB; reconnect ≤30s; conservation | **1.1, 1.2, 1.4, 1.5** (25) |
| PR-3 | S3 | retrieval + latency (<500ms) + `WS /ws/twin` | **1.3** (5) |
| PR-4 | S5 | trained model, Health/**PTTF**/RCA, lifecycle datasets | **3.1, 3.2, 3.6** (15) |
| PR-5 | S6 | predictive API (`/worklist`, `/feedback` Swagger, `/rca`), score→twin ≤30s | **3.3, 3.4, 3.5** (15) |

## Phase B — frontend foundation **from Stitch** (meets Hope 1)

| PR | Scope | Why |
|---|---|---|
| **PR-6** | `design/tokens.map.md` → `globals.css` (OKLCH, `light-dark()`, shadow/motion tokens); **IBM Plex Sans Thai**; shadcn/ui init; the **shared app shell + sidebar** common to every Stitch screen; React Router; `src/mocks/extremes.ts`; a small **read API/loader over `data/curated`** for the role dashboards. Replaces the PR-0 placeholder `App.tsx`. | This is the literal "start from Stitch" foundation. Every screen PR builds on it. Per `g-ui-component`. |

## Phase C — screens from Stitch (demo + **non-POC**, meets Hopes 1 & 2)

Each PR: start from the named Stitch mockup, implement via `g-ui-component` (shadcn, 7 states,
tokens only, axe, Storybook/showcase, no raw hex).

**Demo screens — wired to the live backend:**

| PR | Screen | Stitch | Shows |
|---|---|---|---|
| PR-7 | Operations/SCADA **digital twin** | S4 | items 2.1–2.5 (35) live |
| PR-8 | Data **Pipeline & Quality** monitor | S8 | items 1.x live (status, DLQ, latency) |
| PR-9 | **Predictive** panel | S10 | items 3.x live (worklist, RCA, feedback) |

**Role dashboards — non-POC, on REAL curated data + drill-down:**

| PR | Screen | Stitch | Data |
|---|---|---|---|
| PR-10 | **Executive** national | S1 | real water-sold roll-up; map; NRW `SIMULATED` |
| PR-11 | **Regional** | S2 | real branch league table; drill from S1 |
| PR-12 | **Branch** | S3 | real branch trend vs medians; drill from S2 |

**Proposal screens — non-POC, designed (representative/mock data, labelled):**

| PR | Screen | Stitch |
|---|---|---|
| PR-13 | **System Admin** | S5 |
| PR-14 | **Report Center** | S6 |
| PR-15 | **Alert Center** | S7 |
| PR-16 | **AI Assistant** (scripted) | S9 |

## Phase D — demo director (the score gate)

| PR | Slice | Scope |
|---|---|---|
| PR-17 | S-D | `demo-runbook.md`, `demo/scenarios/*.json`, preflight/reconnect scripts, run-ID scenario API, **Playwright E2E over all 16 items**, cold-start rehearsal. Makes every scored item judge-visible. |

---

## Coverage check

- **Scored (100 pts):** every item routed — PR-2/3 (topic ๑), PR-7 (topic ๒), PR-4/5 (topic ๓); made judge-visible by PR-17.
- **Stitch as starting point:** PR-6 wires the design system; PR-7–16 each start from a committed Stitch mockup via `g-ui-component`. **10/10 screens built.**
- **Non-POC items:** role dashboards (PR-10–12, real data) + admin/reports/alerts/AI (PR-13–16) — the full ผนวก ๕–๑๑ surface, not just the 3 scored topics.

## Recommended build order (secures the score first, then breadth)

1. **Scored path:** PR-1 → PR-2 → PR-3 → PR-4 → PR-5 (backend behaviours = 60 pts of logic).
2. **Foundation:** PR-6 (unblocks all UI).
3. **Demo screens:** PR-7 → PR-9 → PR-8 (twin + predictive + monitor = the 3 topics on screen).
4. **Score gate:** PR-17 (all 16 demonstrable — the 80% is now defensible).
5. **Product breadth:** PR-10 → PR-11 → PR-12 (real-data dashboards), then PR-13–16.

Rationale: land the 100-point demo first (it wins/loses the bid), then complete the product
walkthrough. If time is short, steps 1–4 are the non-negotiable core; steps 5 are the
"deliver the rest of the product" the client also wants.

## Per-PR definition of done (all PRs)

Acceptance tests first (RED-proven / mutation-verified) · gates green (test·lint·typecheck·build)
· wiring verified · 3× no-flake · `g2-qcheck` passed · squash-merge on green · coding log.
Frontend PRs additionally: tokens only (no raw hex), all applicable states, axe clean,
Thai renders correctly, matches the Stitch design by eye (no pixel baselines pre-freeze).
