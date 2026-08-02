# Coding Log — feat: light/dark theme toggle

Baseline `main` @ 0ca7c90. Branch `feat/theme-toggle`. Landed as #28 (`6914021`). Lifecycle: g-coding.
Context: the app had no in-app theme control — it followed the OS via `light-dark()` + `color-scheme:
light dark` on `:root`. On a dark-mode machine the light-designed Stitch mocks read as "drift". This
is Phase 2 of the audit→toggle→realign session (Phase 1 audit found the drift was ~entirely the OS
scheme; 9/10 screens are faithful/richer than their mocks in light mode).

## What
A per-user override that beats the OS without touching the palette:
- `components/ThemeToggle.tsx` — header button (left of ส่งออกรายงาน). Sun = "currently dark → switch
  to light", moon = the reverse. Icon-only `Button` (ghost/icon) with an accessible Thai `aria-label`.
- `lib/theme.ts` — pure logic: `readStoredTheme`/`storeTheme`/`resolveTheme`/`applyTheme`/`osPrefersDark`,
  key `"pwa-theme"`, type `"light"|"dark"`.
- Mechanism: stamp `data-theme` on `<html>`; `globals.css` maps `:root[data-theme="…"] { color-scheme }`,
  which re-resolves every existing `light-dark()` token to that branch. **No `--color-*` token is
  redefined and no `@media (prefers-color-scheme)` block is added** — so `tokens.test.ts` T1 stays
  green (the first `:root{}` keeps `color-scheme: light dark`; overrides are attribute selectors).
- Default = follow the OS (nothing stamped); the icon tracks live OS changes via a matchMedia listener.
- `index.html` inline pre-hydration script applies a stored choice before first paint (no FOUC),
  degrading silently when storage is unavailable.

## Files
New: `web/src/lib/theme.ts` (+ `theme.test.ts`), `web/src/components/ThemeToggle.tsx` (+ test).
Edited: `web/src/styles/globals.css` (two `:root[data-theme=…]` color-scheme blocks), `web/index.html`
(pre-hydration script), `web/src/components/AppShell.tsx` (renders `<ThemeToggle/>`), `web/src/test-setup.ts`
(in-memory `localStorage` shim — this jsdom/Node 26 toolchain ships none; same rationale as the
existing `matchMedia` stub, without which the persistence assertions throw).

## Gates
`pnpm typecheck` · `pnpm lint` clean · `pnpm test` **514 pass (3× no-flake)** · `pnpm build` green.
New tests: `theme.test.ts` (storage round-trip, corrupt-value rejection, resolve precedence, applyTheme
stamp, osPrefersDark, + an index.html/THEME_STORAGE_KEY coupling guard); `ThemeToggle.test.tsx`
(default follows OS + stamps nothing, click stamps+persists, persisted choice restored on mount,
toggles back). Live Playwright E2E proof (host Vite :5174): `data-theme null → dark (stamped +
localStorage "dark") → dark after reload`; light/dark screenshots in scratchpad.

## QCHECK (Tier-1 adversarial, general-purpose agent)
VERDICT **no CRITICAL/HIGH/MEDIUM**. The reviewer verified the T1/T2 token contract holds by reasoning
about the exact regexes AND by executing `tokens.test.ts`; confirmed the OS-follow default, matchMedia
listener (no stale closure, cleaned up), FOUC script, a11y (icon-only button has aria-label; icons
aria-hidden; axe green), and that the localStorage shim masks no production bug (no other module reads
storage). Two LOWs: (1) the `"pwa-theme"` literal was duplicated in `theme.ts`+`index.html` with nothing
locking them → **fixed**, added a test asserting index.html reads `THEME_STORAGE_KEY` (mirrors
a11y.test.tsx's index.html read); (2) `addEventListener("change")` unsupported on Safari ≤13 — left as
a documented non-issue for a 2026 on-prem target. Tier-2 Codex not needed (presentational/infra, no
domain/security/contract-semantics risk beyond the token contract, which Tier-1 executed).
