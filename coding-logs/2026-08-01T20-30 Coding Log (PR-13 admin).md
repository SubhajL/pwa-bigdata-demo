# Coding Log — PR-13 · System Admin (Stitch S5)

Baseline `main` @ 9d99b2c. Branch `feat/pr13-system-admin`. Lifecycle: g-coding (Path B, first of
the four proposal screens PR-13–16). Non-scoring — scores in the written 80% technical proposal, not
the live demo.

## Scope
The `admin` screen (`/admin`, Stitch S5), built on the established `features/<screen>` +
`screens/<Name>Screen` + nav-registry pattern (PR-10–12). No backend — the whole screen is a
proposal-narrative surface with SIMULATED data (there is no real user roster / SSO directory in
`data/curated`).

## What shipped
- **Users & Roles (RBAC)** card: a 5-user SIMULATED roster (Executive / Regional Director / Branch
  Manager / Analyst / System Admin), each with a token-safe role pill (`Badge` variants), a relative
  Thai last-login, and an account-status cell rendered as **icon + Thai label** (`ใช้งาน` /
  `ปิดใช้งาน`) — two states, never colour alone.
- **SSO / Active Directory** capability chip (proposal claim), under the card-header `SimulatedBadge`.
- A real **`role="tablist"`** of the five S5 sections (`aria-selected`, `aria-controls`); the
  `ผู้ใช้และสิทธิ์` tab is realized, the other four honestly render "ยังไม่เปิดใช้งานในการสาธิต".
- Honesty: one `SimulatedBadge` in the roster-card header (whole-card marker per INTERACTIONS.md) +
  a footer badge/sentence stating the data is illustrative, not real PWA data.
- Wired: nav `admin.built:true` (`nav.ts`), `SCREENS.admin` (`routes.tsx`). `+ เพิ่มผู้ใช้` is inert
  proposal chrome.

## Files
New: `web/src/features/admin/{admin.ts,UsersRolesTable.tsx,AdminTabs.tsx}`,
`web/src/screens/SystemAdminScreen.tsx`; tests `admin.test.ts`, `SystemAdminScreen.test.tsx`,
`features/admin/adminWiring.test.tsx`. Edited: `routes.tsx`, `nav.ts`.

## Gates
`pnpm typecheck` clean · `pnpm lint` clean · `pnpm test` 408 pass (3× no-flake) · `pnpm build` green.
Wiring verified — every new export has a non-test consumer; `adminWiring.test.tsx` asserts `/admin`
renders the REAL screen (unique `data-testid`) not the placeholder — the gap `router.test` T4 cannot
see, because `PlaceholderScreen` renders the same `<h1>ผู้ดูแลระบบ`.

## Stitch S5 vs live (objective)
Faithful + thin. Live improves on the static mock where the contract requires: accessible status
(icon+text, two states vs the mock's bare check), a real keyboard/SR tab interaction, and the
SIMULATED honesty markers the mock omits. The shared AppShell supplies the footer links the mock
drew in-page. Minor drift: `+ เพิ่มผู้ใช้` sits top-right by the title (mock: under the tabs); role
pills use solid token fills (mock: softer container tints — not in the app's token set). Screenshots
in scratchpad (`admin-live.png`, `admin-live-proposal-tab.png`).

## QCHECK (Tier-1 adversarial, general-purpose agent)
VERDICT **SHIP**. No CRITICAL/HIGH/MEDIUM. LOW/NIT: (1) inert primary button relies on a hover
tooltip — accepted; the screen is comprehensively marked a proposal (footer + per-tab notes). (2)
honesty-marker test was mutation-weak (count-only) — **FIXED**: now scopes one assertion to the
roster card so deleting the header badge fails. (3) tab strip omits APG roving-tabindex/arrow keys —
beyond the stated contract. (4) `text-status-nodata` for a disabled account — grey reads correctly
and status is not colour-alone; left as-is. Tier-2 Codex not run: no domain/physics/security/contract
semantics in a static presentational screen (per g-coding's split rule).
