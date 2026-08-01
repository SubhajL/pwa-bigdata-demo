# Coding Log — PR-15 · Alert Center (Stitch S7)

Baseline `main` @ 99a0c2f. Branch `feat/pr15-alert-center`. Lifecycle: g-coding (Path B, screen 3 of
4). Non-scoring proposal screen.

## Scope
The `alerts` screen (`/alerts`, Stitch S7): a SIMULATED alert center. The live/scored alerting story
lives on the Pipeline & Predictive demo screens; this is the proposal-narrative surface.

## What shipped
- **Summary tiles** — วิกฤต / เฝ้าระวัง / แจ้งข้อมูล / รับทราบแล้ว, each icon + Thai label + count
  (status colour never alone), derived live from acknowledge state.
- **Alert Feed** — a `role="radiogroup"` severity filter that drives the list; alert cards with a
  severity accent + tag, title/detail, source·time·tags, and a real **รับทราบ** action that removes
  the alert AND moves the counts (pure `deriveCounts`/`activeAlerts` in `alertsModel.ts`).
- **Rules** — two `role="switch"` toggles (real state); **Channels** — Email/LINE/SMS status display
  (icon + Thai label); an AI-triage note.
- Honesty: `SimulatedBadge` at the heading + footer disclaimer. Wired via nav `built:true` +
  `SCREENS.alerts`.

## Files
New: `web/src/features/alerts/{alerts.config.ts,alertsModel.ts,AlertSummary.tsx,AlertFeed.tsx,AlertSidebar.tsx}`,
`web/src/screens/AlertCenterScreen.tsx`; tests `alerts.test.ts`, `AlertCenterScreen.test.tsx`,
`features/alerts/alertsWiring.test.tsx`. Edited: `routes.tsx`, `nav.ts`.

## Gates
`pnpm typecheck` clean · `pnpm lint` clean · `pnpm test` 445 pass (3× no-flake) · `pnpm build` green.
Pure derivations unit-tested; screen behaviour (acknowledge→counts coupling, filter, empty state,
toggle) tested; `alertsWiring.test.tsx` guards the real-screen-vs-placeholder gap. h1 carries the nav
labelTh "ศูนย์แจ้งเตือน" (NOT S7's own "ศูนย์การแจ้งเตือน") so router T4 matches.

## Stitch S7 vs live
Faithful + thin, interactive where the mock is static (acknowledge / severity filter / rule toggles;
counts react to acknowledgement). Screenshot in scratchpad.

## QCHECK (Tier-1 adversarial, general-purpose agent)
VERDICT **SHIP** first pass. No CRITICAL/HIGH/MEDIUM/LOW. The PR-14-style misleading-affordance trap
was explicitly checked and clean: acknowledge/filter/toggle are all real, the acknowledge→counts
coupling is asserted (not just row removal), and there is no dead chrome (no gear button; channel rows
are plain status display, not styled clickable). NITs (accepted): `info` severity reuses `text-primary`
(no `--color-status-info` token exists — still a token, paired with icon+label); the info tile is a
static aggregate; the filter radiogroup lacks APG arrow-key nav (matches the repo chip pattern). Tier-2
Codex not run: static presentational screen, no domain/security/contract semantics.
