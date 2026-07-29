# DREP — PR-6 · Frontend foundation from Stitch (Phase B)

Delegation-Ready Execution Plan. Produced by `g2-planning`; consumed by `g2-coding` (Lane M /
Mode A) and `g2-qcheck`. Baseline: `origin/main` @ `12a29f9`, branch
`feat/pr6-frontend-foundation`.

Adversarial pass: Codex `gpt-5.6-sol` @ `xhigh`, read-only over the real repo. Every finding is
dispositioned in **§11**; three were factual corrections to the draft and are folded in below
rather than merely noted.

---

## §0 Repo Profile

| Field | Value |
|---|---|
| Languages | Python 3.13 (`api/`, `simulator/`, `ml/`) · TypeScript 5.7 + React 18.3 (`web/`) |
| Backend test | `cd api && pytest` (`asyncio_mode=auto`, `testpaths=tests`, marker `integration`) |
| Backend lint | `cd api && ruff check .` (line-length 100; select E,F,I,UP,B) |
| Backend typecheck | `cd api && mypy .` (**strict**, `mypy_path=../ml`) |
| Frontend test | `cd web && pnpm test` (vitest 2.1.8, jsdom, globals, setup `./src/test-setup.ts`) |
| Frontend lint | `cd web && pnpm lint` (`eslint src`, eslint 9 flat config) |
| Frontend typecheck | `cd web && pnpm typecheck` (`tsc --noEmit`) |
| Frontend build | `cd web && pnpm build` (`tsc -b && vite build`) |
| Package manager | pnpm 9.15.4 **locally**; the repo does **not** pin it — `package.json` has no `packageManager` field and `web/Dockerfile` just runs `corepack enable && pnpm install`. This PR adds the pin. |
| Migration policy | `infra/db/NNN_*.sql` applied by `scripts/migrate.py`. **001–005 are taken** (`005_row_provenance.sql` exists and `scripts/backfill_history.py` depends on it); next free is **006**. **This PR adds none.** |
| Coding log | `.codex/coding-log.current` → `coding-logs/2026-07-28-2050 Coding Log (demo-poc).md` (489 lines, non-empty ✅). Appended, not replaced. |
| Repo ownership | **ours** |
| Runtime ownership | **ours** — local / on-prem Docker Compose; explicitly *not* a Vercel/serverless target |
| Disposition | **may-become-production** ⇒ a runtime-owning builder (v0 / Lovable / Replit / Bolt) is disqualified. Stitch supplies design context only, and we keep repo + runtime. ✅ compliant |

**Baseline gates — measured 2026-07-29, all green before any change.**
`web`: typecheck 0 · lint 0 · test 1 passed · build ok (143.45 kB).
`main` per SESSION-HANDOFF: api 100 · simulator 42 · ml 45 + 3 skipped · ruff clean · mypy strict clean.

### Ground truth measured from the real data (not remembered)

`data/curated/water_sold_by_branch.csv` — header
`region,branch_code,province,branch,month,water_sold_m3`:

| Fact | Value |
|---|---|
| data rows | 9 126 |
| distinct `branch_code` | **234** |
| distinct `branch` labels | **235** ← one branch was renamed (`5551014`: `บ้านนาสาร` → `เวียงสระ`) |
| distinct months | 39 (`2022-10-01` … `2025-12-01`) |
| month column format | a **full date** `YYYY-MM-01`, *not* `YYYY-MM` |
| regions | 1…10 |
| codes present in `2025-12-01` | 234 |
| total `water_sold_m3` in `2025-12-01` | **120 999 833.55** |

That last number is the headline KPI printed in the Stitch mockup (`120,999,834`), so it is an
**external** anchor for T13 rather than a self-consistency check.

### Design profile (UI slice — required)

`design/manifest.json`: `projectId 16433260128763898652` · `sourceUpdateTime **null**` ·
`designFrozen **false**` · `designMdSha256` is of `DESIGN.source.md` (what we *uploaded*).
`design/tokens.map.md` ✅ · `design/INTERACTIONS.md` ✅ · `design/screens/S1..S10.{png,html}` ✅ ·
`git status design/` clean ✅.

> **Freshness deviation, accepted deliberately.** `g2-coding` Phase 0f wants `sourceUpdateTime`
> compared against a live `get_project`, and `shasum design/DESIGN.md`. Neither is possible:
> `sourceUpdateTime` is `null` by design (manifest note: "Populate on the next sync") and
> `design/DESIGN.md` does not exist — only `DESIGN.source.md`. **We do not re-sync.**
> `tokens.map.md` is explicitly the authority over anything Stitch returns, the design tree is
> committed and clean, and re-pulling would risk re-importing the very drift `tokens.map.md`
> exists to reject. Recorded as a known deviation, not an oversight.
>
> `designFrozen: false` ⇒ **no pixel-baseline assertions** (`toHaveScreenshot` /
> `toMatchSnapshot`) anywhere in this PR.

### Repo MUST NOT list (verbatim from `CLAUDE.md` — reaches reviewer and implementer)

- Hardcode a KPI/telemetry value in a component — values come from the API/DB.
- Present a synthetic value without a visible `SIMULATED` marker.
- Use a second y-axis, a rainbow categorical ramp for magnitude, or colour-only status.
- Block the ingest loop on a bad message (must DLQ and continue).
- Commit secrets; `.env` is git-ignored.
- `@ts-ignore` / bare `except:` to pass a gate.

Plus `design/tokens.map.md` §"Rules for implementation": raw hex in `src/` is a build failure ·
violet is reserved for `SIMULATED` · status is never colour alone · one y-axis per chart · never
read colours out of `DESIGN.md` or the Stitch HTML.

---

## §1 Goal / Non-Goals

**Goal.** Replace the PR-0 placeholder `App.tsx` with the frontend foundation every Phase-C
screen builds on: the `tokens.map.md` contract expressed as OKLCH custom properties selected by
`light-dark()`, self-hosted IBM Plex Sans Thai, a shadcn/ui-compatible primitive layer bound to
those tokens, the shared app shell + sidebar + router covering all 10 designed screens, the
content-extremes fixtures, and the browser↔API connection that **does not currently exist**
(CORS middleware + a Vite dev proxy). Plus a read API over `data/curated/` so the role dashboards
(PR-10–12) have real data to bind to.

**The question this POC answers.** Can the ผนวก ๑๓ scored behaviours be presented in a cohesive
Thai-language product UI — real PWA branch data where it exists, clearly-marked simulation where
it does not? Disposition is `may-become-production`, so this foundation is built to keep.

**Non-Goals (explicit).**

- Any Phase-C screen's real content. The 10 routes render an honest labelled placeholder; PR-7 fills S4.
- The SVG digital twin, the WebSocket subscription UI, charts, or maps (PR-7/8/9).
- Storybook. The `g-ui-component` showcase obligation is met by the primitives' own tests plus an axe pass; a Storybook install is its own PR.
- A user-facing dark-mode **toggle**. `light-dark()` + `prefers-color-scheme` only.
- **Browser-rendered assertions** — real contrast, focus-ring visibility, 60-char truncation, skeleton geometry, FOUT, font glyph coverage, responsive breakpoints. jsdom cannot see any of them. These need Playwright, which **PR-17 already owns**. Stated as a limitation in §9-R9, not pretended away.
- Pixel-baseline visual regression (`designFrozen: false` forbids it).
- Any database migration. The curated API reads CSV and touches no table. **No `006_*.sql` in this PR.**
- Auth, roles, or per-user state. CI (still unowned — SESSION-HANDOFF §3).

---

## §2 Requirements — R1..R16

| ID | Requirement (testable) |
|---|---|
| **R1** | Every colour token in `design/tokens.map.md` (13 colour + 5 sequential, light **and** dark) exists in `globals.css` as an OKLCH value whose Oklab round-trip is within ΔE-OK ≤ 0.02 of the documented hex, in both directions (no token in the CSS absent from the doc, none in the doc absent from the CSS). |
| **R2** | `:root` sets `color-scheme: light dark`, every dual-valued token is expressed with `light-dark()`, and **no `@media (prefers-color-scheme: …)` block redefines a colour token** — one definition site, so light and dark cannot drift apart. |
| **R3** | No colour literal in any form (`#hex`, `rgb()`, `hsl()`, bare `oklch()`), no raw duration (`\d+ms`, `\d+s`), and no raw `box-shadow` — in CSS **or** in a JSX inline `style` — appears anywhere under `web/src/**` except `globals.css`. |
| **R4** | IBM Plex Sans Thai is served from `node_modules` (`@fontsource`), imported by `globals.css`, and mapped onto `font-family`. `globals.css` contains no `http` URL. |
| **R5** | Every transition/animation duration references an `--anim-*` token, and a `prefers-reduced-motion: reduce` block zeroes both `transition-duration` and `animation-duration`. |
| **R6** | One nav registry drives both the sidebar and the router. Registry paths are unique, `matchRoutes()` succeeds for every one, and the router exposes no navigable leaf route absent from the registry. |
| **R7** | The shell renders `banner`/`navigation`/`main`/`contentinfo` landmarks; **exactly one** link carries `aria-current="page"`; and the current item renders a dedicated non-colour marker element that no other item renders. |
| **R8** | `SimulatedBadge` renders visible `SIMULATED` text plus `aria-label` `ข้อมูลจำลอง ไม่ใช่ข้อมูลจริงของ กปภ.`, and is the **only** production module referencing the simulated token — by custom property *or* by Tailwind utility. |
| **R9** | `StatusChip` renders a visible Thai label and a status-distinct icon for each of `normal`/`warning`/`critical`/`nodata`; no two statuses share a label or an icon. |
| **R10** | `null`/`undefined`/`NaN`/`±Infinity` render `—`; a real `0` renders `0`. Every numeral is rendered through the `Num` primitive, which carries `font-variant-numeric: tabular-nums`. |
| **R11** | `axe-core` reports zero violations against the **whole document** (not a detached container), and `index.html` keeps `lang="th"`. |
| **R12** | With `VITE_API_BASE` unset the client issues **relative** `/api/...` requests; `wsUrl` derives the socket URL from `window.location` with the scheme matched (`https:`→`wss:`); and an insecure absolute base on an https page **throws** rather than silently emitting a mixed-content `ws:` URL. |
| **R13** | A genuine CORS preflight (`OPTIONS` + `Access-Control-Request-Method`) from a configured origin is allowed and the matching `GET` carries `Access-Control-Allow-Origin`; an unlisted origin receives neither. `allow_origins` is never `["*"]` together with credentials. |
| **R14** | `GET /api/curated/*` serves months, the national roll-up, a region's branch league table and one branch's monthly series, computed from the real CSV, each declared with a Pydantic `response_model`. |
| **R15** | Curated identity follows `simulator/app/roster.py`: a branch **is its `branch_code`**. A complete month reports `branch_count == 234`, never 235. MoM/YoY are `None` — never `0.0` — when the comparison month is absent or its baseline is `0`. |
| **R16** | The curated store is constructed in the FastAPI **lifespan**, not at import time, so `/healthz` keeps its dependency-free contract and a missing CSV degrades the curated routes to 503 instead of crashing the process. |

---

## §3 Change Contract

### Frontend — `web/`

| ID | Path | Action | Anchor | New exports | Purpose |
|---|---|---|---|---|---|
| F1 | `web/package.json` | MODIFY | `dependencies`, `devDependencies`, root | — | add `tailwindcss@4`, `@tailwindcss/vite`, `@fontsource/ibm-plex-sans-thai`, `react-router-dom@7`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`; dev: `culori`, `@types/culori`, `vitest-axe`, `axe-core`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `@types/node`; **add `"packageManager": "pnpm@9.15.4"`** |
| F2 | `web/pnpm-lock.yaml` | MODIFY | — | — | regenerated by `pnpm install`; the Docker build consumes it |
| F3 | `web/vite.config.ts` | MODIFY | whole file | — | `tailwindcss()` plugin **before** `react()`; **absolute** `resolve.alias['@']` via `fileURLToPath`; `server.proxy` `/api` + `/ws` (`ws:true`, `changeOrigin:true`) from `VITE_PROXY_TARGET` (default `http://localhost:8000`) |
| F4 | `web/tsconfig.json` | MODIFY | `compilerOptions` | — | `baseUrl:"."`, `paths:{"@/*":["./src/*"]}` |
| F5 | `web/index.html` | MODIFY | `<head>` | — | add `<meta name="color-scheme" content="light dark">`. **`lang="th"` must survive** (R11) |
| F6 | `web/components.json` | CREATE | — | — | shadcn CLI config (aliases + `cssVariables`) so `shadcn add <x>` works later against our tokens |
| **F7** | `web/src/styles/globals.css` | CREATE | — | — | **the token contract.** `@import` lines first, then `@theme`, then rules. OKLCH + `light-dark()`, fonts, radius/shadow/motion, reduced-motion. **Claude-authored (SL-3).** |
| F8 | `web/src/lib/utils.ts` | CREATE | — | `cn()` | clsx + tailwind-merge (shadcn idiom) |
| F9 | `web/src/lib/format.ts` | CREATE | — | `formatInt`, `formatM3`, `formatPercent`, `formatMonthTh`, `DASH` | th-TH formatting; missing → `—`; `0` stays `0` |
| F10 | `web/src/components/ui/num.tsx` | CREATE | — | `Num` | **the** numeric renderer; carries `tabular-nums`. Satisfies "every numeral" in the type contract |
| F11 | `web/src/components/ui/button.tsx` | CREATE | — | `Button`, `buttonVariants` | shadcn Button on our tokens |
| F12 | `web/src/components/ui/card.tsx` | CREATE | — | `Card`,`CardHeader`,`CardTitle`,`CardContent`,`CardFooter` | |
| F13 | `web/src/components/ui/badge.tsx` | CREATE | — | `Badge`, `badgeVariants` | |
| F14 | `web/src/components/ui/alert.tsx` | CREATE | — | `Alert`,`AlertTitle`,`AlertDescription` | host for the INTERACTIONS 3-part error formula |
| F15 | `web/src/components/ui/skeleton.tsx` | CREATE | — | `Skeleton` | loading state that preserves geometry |
| F16 | `web/src/components/SimulatedBadge.tsx` | CREATE | — | `SimulatedBadge` | the P0 marker; sole consumer of the simulated token |
| F17 | `web/src/components/StatusChip.tsx` | CREATE | — | `StatusChip`, `type StatusKind`, `STATUS_LABEL_TH` | icon + Thai label; never colour-alone |
| F18 | `web/src/routes/nav.ts` | CREATE | — | `NAV_SECTIONS`, `NAV_ITEMS`, `type NavItem` | single source of truth for sidebar **and** router |
| F19 | `web/src/components/Sidebar.tsx` | CREATE | — | `Sidebar` | brand + grouped nav from F18 |
| F20 | `web/src/components/AppShell.tsx` | CREATE | — | `AppShell` | banner / navigation / main / contentinfo + `<Outlet/>` |
| F21 | `web/src/screens/PlaceholderScreen.tsx` | CREATE | — | `PlaceholderScreen` | one component driven by F18; renders `StatusChip kind="nodata"` + the honest "ยังไม่ได้พัฒนา" state |
| F22 | `web/src/routes/routes.tsx` | CREATE | — | `buildRoutes()` | **pure route objects** — no router instance (see FN8) |
| F23 | `web/src/routes/router.tsx` | CREATE | — | `createAppRouter()` | `createBrowserRouter(buildRoutes())`; tests use `createMemoryRouter` instead |
| F24 | `web/src/api/client.ts` | CREATE | — | `apiUrl`, `wsUrl`, `getJson<T>`, `ApiError` | relative-by-default URLs; protocol-matched WS |
| F25 | `web/src/config/app.config.ts` | MODIFY | whole file (**6** lines) | `APP_CONFIG` widened | `apiBase` defaults to `""` (relative); keep `wsTwin`; add `brandSub` |
| F26 | `web/src/mocks/extremes.ts` | CREATE | — | `EXTREMES` + named fixtures | 0 / 1 / 235-row overflow, 60-char name, null customers, Thai+Latin, legitimate 0 m³ |
| F27 | `web/src/App.tsx` | MODIFY | whole file | `App` | `<RouterProvider router={createAppRouter()}/>` |
| F28 | `web/src/main.tsx` | MODIFY | imports | — | `import "./styles/globals.css"` |
| F29 | `web/src/test-setup.ts` | MODIFY | whole file | — | register `vitest-axe` matchers; stub `matchMedia` for jsdom |
| F30 | `web/src/App.test.tsx` | DELETE | — | — | superseded; its "renders the brand" assertion moves into T5 |
| F31 | `web/eslint.config.js` | MODIFY | config array | — | `react-hooks` + `jsx-a11y` plugins; `no-restricted-syntax` banning colour/duration literals in `src` |
| F32 | `web/Dockerfile` | MODIFY | L3–5 | — | `corepack prepare --activate` from `packageManager`; `pnpm install --frozen-lockfile` |

### Backend — `api/`, `infra/`, repo root

| ID | Path | Action | Anchor | New exports | Purpose |
|---|---|---|---|---|---|
| F33 | `api/app/curated.py` | CREATE | — | `load_curated`, `CuratedStore` | CSV → immutable in-memory store; identity rules mirror `simulator/app/roster.py` |
| F34 | `api/app/models.py` | MODIFY | end of file | `CuratedMonths`, `RegionRollup`, `RegionTotal`, `BranchRow`, `SeriesPoint`, `BranchSeries` | Pydantic response models (repo convention: routes declare `response_model`) |
| F35 | `api/app/routes/curated.py` | CREATE | — | `router` | 4 GET routes under `/api/curated`, each with `response_model` |
| F36 | `api/app/config.py` | MODIFY | `Settings` body | — | `curated_path: str = ""`, `cors_origins: str = "http://localhost:5173"` + a comma-split parser property. Both defaulted, so existing `Settings()` call sites keep working |
| F37 | `api/app/main.py` | MODIFY | after `app = FastAPI(...)` **and** inside `lifespan` | — | `CORSMiddleware`; `include_router(curated_routes.router)`; build the store in **lifespan** → `app.state.curated` (R16) |
| F38 | `infra/docker-compose.yml` | MODIFY | `api:` and `web:` services | — | bind-mount `../data/curated:/srv/data/curated:ro` into `api`; `CURATED_PATH`, `CORS_ORIGINS`; web gets `VITE_API_BASE: ""` + `VITE_PROXY_TARGET: http://api:8000`; **remove `profiles: ["ui"]`** so the proxy-bearing frontend actually starts |
| F39 | `infra/env.sample` | MODIFY | whole file | — | replace `VITE_API_BASE=http://localhost:8000` with the relative posture; document `VITE_PROXY_TARGET` and `CORS_ORIGINS` |
| F40 | `.dockerignore` | CREATE | — | — | **root** ignore file. The api/migrate/seed build context is the repo root; once `web/node_modules` exists every one of those builds would upload it. Pre-existing LOW (PR-5 log) that this PR would turn into a real regression |

### Tests — Claude-authored, never delegated

| ID | Path |
|---|---|
| F41 | `web/src/styles/tokens.test.ts` |
| F42 | `web/src/components/AppShell.test.tsx` |
| F43 | `web/src/routes/router.test.tsx` |
| F44 | `web/src/components/markers.test.tsx` |
| F45 | `web/src/components/ui/primitives.test.tsx` |
| F46 | `web/src/lib/format.test.ts` |
| F47 | `web/src/api/client.test.ts` |
| F48 | `web/src/a11y.test.tsx` |
| F49 | `api/tests/test_curated.py` |
| F50 | `api/tests/test_cors.py` |

---

## §4 Function Contracts

```
FN1  cn(...inputs: ClassValue[]) -> string                                   File: F8
     Does:   clsx then tailwind-merge so later utilities win.
     Pre/Post: pure; no conflicting duplicate tailwind classes. Errors: none.

FN2  formatInt(value: number | null | undefined, locale = "th-TH") -> string  File: F9
     Does:   grouped integer via Intl.NumberFormat, maximumFractionDigits 0.
     Post:   null | undefined | NaN | ±Infinity -> DASH ("—"); 0 -> "0".
             Non-integers are ROUNDED half-up-away-from-zero (1.4->1, -1.5->-2);
             |value| > Number.MAX_SAFE_INTEGER -> DASH (we will not print a number
             we cannot represent).
     Invariant: never returns "NaN", and never returns "0" for a missing value.
     Note:   this returns a STRING; `tabular-nums` is a rendering property and is
             the job of FN-Num (F10), not of this function.

FN3  formatM3(value: number | null | undefined) -> string                     File: F9
     Post:   formatInt(value) + " ลบ.ม."; a missing value -> DASH with NO unit
             suffix (a bare "—" reads as unknown; "— ลบ.ม." reads as a measurement).

FN4  formatPercent(value: number | null | undefined, digits = 1) -> string    File: F9
     Unit:   `value` is ALREADY in percent (-2.0 means -2.0%), matching the API's
             mom_pct / yoy_pct. It is NOT a 0..1 ratio.
     Post:   sign is shown for non-zero (+0.8% / -2.0%); exact zero renders "0.0%"
             with NO sign; missing/non-finite -> DASH; -0 is treated as 0.
     Errors: throws RangeError if digits is not an integer in 0..4.

FN5  wsUrl(path: string,
           base: string = APP_CONFIG.apiBase,
           loc: Pick<Location,"protocol"|"host"> = window.location) -> string  File: F24
     Does:   Resolve an absolute WebSocket URL.
             base === ""      -> `${loc.protocol==="https:"?"wss:":"ws:"}//${loc.host}${path}`
             base is absolute -> swap http:->ws:, https:->wss:, keep host AND any
                                 path prefix, then append `path`.
     Pre:    `path` starts with "/".
     Post:   always absolute with a ws:/wss: scheme.
     Errors: TypeError when `path` lacks a leading "/".
             TypeError when loc.protocol === "https:" AND the resolved scheme would
             be `ws:` (i.e. an insecure absolute base on a secure page). We FAIL
             LOUDLY rather than emit a URL the browser will block as mixed content
             — a silently dead twin socket is the worst outcome for scored item 2.2.
     Invariant: an https page never yields ws:.  [Codex #2 — the draft asserted this
             invariant while permitting the case that breaks it.]

FN6  apiUrl(path: string, base: string = APP_CONFIG.apiBase) -> string        File: F24
     Pre:    `path` starts with "/". Errors: TypeError otherwise.
     Post:   base ""        -> `path` unchanged (relative; the Vite proxy handles it)
             base absolute  -> origin + base's own path prefix + `path`, with exactly
                               one "/" at each join. `https://h/root` + `/api/x`
                               -> `https://h/root/api/x` (the prefix is PRESERVED).
     Errors: TypeError at call time (not module load) if base is neither "" nor a
             parseable absolute http(s) URL. Credentials/query/fragment in base are
             rejected, not silently dropped.

FN7  getJson<T>(path: string, init?: RequestInit) -> Promise<T>               File: F24
     Post:   resolves the parsed body on 2xx.
     Errors: ApiError(status, detail) on !res.ok, where `detail` is normalised to a
             string from FastAPI's three shapes (string | {detail} | validation
             array).  ApiError(0, message) on a network failure. Re-throws
             DOMException "AbortError" untouched so callers can distinguish a
             cancellation from a failure.
             204 / empty body -> resolves `undefined as T` and the CALLER must type
             it `Promise<void>`; a non-JSON 2xx body raises ApiError(status,
             "malformed JSON").
     Note:   a JSON `null` body is returned as-is; T is a caller assertion, not a
             runtime guarantee. Stated so nobody mistakes it for validation.

FN8  buildRoutes(items: readonly NavItem[] = NAV_ITEMS) -> RouteObject[]      File: F22
     Does:   pure route-object tree: AppShell root, one child per item, an index
             redirect to items[0].path, and a catch-all NotFound.
     Post:   one child route per item; no router instance is created.
     Why split: `createBrowserRouter` returns a data router bound to the DOM
             History. Tests need `createMemoryRouter(buildRoutes(), {initialEntries})`.
             A module-level singleton router would also leak history between test
             cases.  [Codex #2/#4]

FN9  createAppRouter(items = NAV_ITEMS) -> DataRouter                         File: F23
     Post:   createBrowserRouter(buildRoutes(items)). Called from F27 only.

FN10 load_curated(path: str | Path) -> CuratedStore                           File: F33
     Does:   Parse water_sold_by_branch.csv ONCE into an immutable store indexed by
             month, by (region, month), and by branch_code.
     Purity: this function performs I/O (it reads a file). The STORE it returns is
             immutable and pure thereafter. [Codex #2 — the draft called the loader
             pure.] There is no internal cache: the single instance is owned by the
             FastAPI lifespan (R16), so cache invalidation is process lifetime.
     Pre:    header contains region,branch_code,province,branch,month,water_sold_m3.
     Post:   months normalised from `YYYY-MM-01` to **`YYYY-MM`** (the URL format
             INTERACTIONS.md mandates: ?month=2025-12); sorted ascending, unique.
     Errors: FileNotFoundError if absent; ValueError on a missing column, a blank
             identity field, a non-integer or out-of-range (1..10) region, an
             unparseable month, or CONFLICTING geography for one branch_code in one
             month — mirroring simulator/app/roster.py:68-95 exactly. Identity
             defects are structural: failing loudly is right, because the
             alternative is silently changing a roll-up.
             A row whose `water_sold_m3` will not parse is SKIPPED and counted in
             `store.skipped_rows`. Volume is data, not identity; the committed file
             has none, and the count makes any future one visible instead of fatal.
             A duplicate (branch_code, month) with an IDENTICAL volume is collapsed;
             with a DIFFERING volume it raises (the `_defects.csv` record shows
             byte-identical duplicates were already removed upstream).

FN11 CuratedStore.months() -> list[str]                                       File: F33
     Post:   ascending "YYYY-MM", unique. 39 entries for the committed CSV.

FN12 CuratedStore.national(month: str) -> RegionRollup                        File: F33
     Post:   total_m3 == sum of region totals; regions sorted by m3 desc;
             branch_count is COUNT DISTINCT branch_code (234 for a complete month,
             never 235 — labels are not identity).  [Codex #5]
     Errors: unknown but well-formed month -> empty rollup (total 0.0, regions []),
             never raises. Malformed month -> ValueError. The ROUTE maps the empty
             rollup to 404 and the ValueError to 422.

FN13 CuratedStore.region(region: int, month: str) -> list[BranchRow]           File: F33
     Post:   sorted by water_sold_m3 desc (the documented default sort). `rank` is
             1-based over THAT ordering and is STORED on the row, so a client
             re-sort does not renumber it (INTERACTIONS.md §Sorting).
             `branch` is the label recorded in THAT month's row — a per-month table
             shows the name in use that month. No cross-month reconciliation is
             performed or needed here.  [Codex #2 — renamed-branch behaviour was
             undefined in the draft.]
             mom_pct / yoy_pct are None (never 0.0) when the prior month or the
             year-ago month has no row for that branch_code.
     Invariant: a branch legitimately reporting 0.0 m³ is listed with 0.0 and a rank;
             an absent branch is simply not listed. The two are distinguishable.
     Errors: region outside 1..10 -> ValueError (route -> 404); malformed month ->
             ValueError (route -> 422).

FN14 CuratedStore.branch(branch_code: str) -> BranchSeries                     File: F33
     Post:   `.points` ascending by month; gaps are NOT filled (a missing month is
             absent, not zero — the chart layer decides how to draw a gap).
             `.branch` / `.province` / `.region` are resolved AS-OF THE LATEST month
             for that code, matching roster.py's "describes the current network"
             rule, so a renamed branch shows its current name at the header while
             each historical point keeps its own month's value.
     Errors: unknown code -> KeyError (route -> 404).

FN15 _pct_change(current: float, prior: float | None) -> float | None          File: F33
     Post:   None when prior is None OR prior == 0.0 (a zero baseline has no defined
             percentage change); otherwise (current-prior)/prior*100, in PERCENT
             units to match FN4.
```

---

## §5 Test Plan

Each test lists Covers / Type / Arrange / Act / Assert / RED-proof / Fixtures + edges.
`[C#n]` marks an assertion added or hardened because of Codex finding *n*.

```
T1   token contract round-trips to the documented hex, in Oklab
     File:      F41 web/src/styles/tokens.test.ts
     Covers:    R1, R2
     Type:      unit over two REAL files (design/tokens.map.md and
                web/src/styles/globals.css). No mocks — the drift this guards is
                between two real artifacts, and a fixture would guard nothing.
     Arrange:   parse the colour + sequential tables from tokens.map.md; extract
                `--token: light-dark(<a>, <b>)` from globals.css with a
                BALANCED-PAREN scanner, not a naive regex — the operands themselves
                contain parentheses (`oklch(48.89% 0.1334 250.59)`).   [C#6]
     Act:       culori converts each extracted operand and each doc hex to Oklab.
     Assert:    (a) every doc token present in the CSS and vice versa;
                (b) differenceEuclidean("**oklab**")(docHex, cssValue) <= 0.02 for
                    light AND dark. ΔE-OK is Euclidean distance in Oklab, NOT in
                    OKLCH — comparing in OKLCH compares hue ANGLES, which are
                    undefined for #FFFFFF (--surface-container-lowest, light).   [C#6]
                (c) :root declares `color-scheme: light dark`;
                (d) NO @media (prefers-color-scheme: …) block in globals.css
                    redefines any colour token — one definition site, so the two
                    schemes cannot drift.   [C#3-T1]
     RED-proof: fails ENOENT on web/src/styles/globals.css before F7 exists — NOT a
                parse error on the .md, which already exists today. After a naive
                globals.css that pastes hexes verbatim it fails on
                "expected oklch(...) got #0F62A8".
     Edge:      #FFFFFF light — hue undefined; the Oklab comparison must not NaN.
                Asserted explicitly with its own case.

T2   no colour / duration / shadow literal escapes globals.css
     File:      F41
     Covers:    R3
     Type:      unit (fs walk of web/src/**, excluding styles/globals.css)
     Act:       scan .ts/.tsx/.css for  /#[0-9a-fA-F]{3,8}\b/ , /\brgba?\(/ ,
                /\bhsla?\(/ , /\boklch\(/ , /\b\d+(\.\d+)?m?s\b/ , /box-shadow\s*:/ ,
                and JSX inline style keys boxShadow|color|background(Color)?.   [C#3-T2]
     Assert:    zero matches; the failure message names file:line:match.
     RED-proof: this test PASSES on the current tree (no such literals exist today),
                so it has NO RED signal and is **mutation-verified instead**:
                inject `color: #ff0000` into button.tsx -> THIS test must fail ->
                revert -> green. Recorded in the coding log as mutation-verified,
                not as TDD.   [Phase 2c-bis]
     Edge:      must not flag a hex-looking substring inside a URL, an svg path `d`,
                or a git sha in a comment. Those exclusions are themselves asserted.

T3   registry and router cannot drift
     File:      F43 web/src/routes/router.test.tsx
     Covers:    R6
     Type:      unit over the real registry + real route objects
     Assert:    (a) NAV_ITEMS paths are UNIQUE (a duplicate must fail loudly, not
                    silently win — set equality alone would hide it);   [C#3-T3]
                (b) matchRoutes(buildRoutes(), path) returns a match for EVERY
                    registry path — proves real matching, not string equality;
                (c) every navigable LEAF route in buildRoutes() (excluding the index
                    redirect and the catch-all) appears in the registry.
     RED-proof: module-not-found on './nav' before F18 exists.

T4   each nav path renders its screen, at that URL, inside the shell
     File:      F43
     Covers:    R6, R7
     Type:      integration — real react-router createMemoryRouter over the real
                buildRoutes() and the real AppShell. Nothing mocked: mocking the
                router would assert only what we BELIEVE react-router does.
     Arrange:   per NAV_ITEM: createMemoryRouter(buildRoutes(), {initialEntries:[path]})
     Assert:    router.state.location.pathname === path;   [C#3-T4]
                the item's Thai label appears in a heading INSIDE role="main";
                the link carrying aria-current="page" has href === path;
                cleanup() between cases so no history leaks.   [C#4]
     RED-proof: "Unable to find role heading" before F20/F21 exist.
     Edge:      /operations (the PR-7 twin route) is included and must render the
                placeholder, not blank.

T5   shell landmarks + exactly one current item, marked by more than colour
     File:      F42 web/src/components/AppShell.test.tsx
     Covers:    R7, and absorbs the deleted App.test.tsx brand assertion
     Type:      integration (real render at "/")
     Assert:    getByRole('banner'|'navigation'|'main'|'contentinfo') all present;
                the brand "PWA Analytics" renders;
                queryAllByRole('link', {current:'page'}) has length EXACTLY 1 — this
                is the guard against the classic prefix-match bug where "/" matches
                every route;
                the current link contains a dedicated marker ELEMENT
                ([data-current-marker]) and NO other nav link contains one. A class
                name would prove nothing (it can be colour-only or display:none), so
                we assert a distinct rendered node instead.   [C#3-T5]
     Limitation: jsdom cannot prove the marker is VISIBLE. Real-browser visibility is
                PR-17's Playwright pass. Stated, not pretended away.
     RED-proof: "Unable to find role banner" before F20.

T6   SIMULATED marker present, Thai-labelled, and violet is reserved
     File:      F44 web/src/components/markers.test.tsx
     Covers:    R8
     Type:      integration (render) + fs scan
     Assert:    visible text "SIMULATED"; aria-label exactly
                "ข้อมูลจำลอง ไม่ใช่ข้อมูลจริงของ กปภ.";
                across web/src, the ONLY production module matching
                /--simulated|bg-simulated|text-simulated|violet/ is
                SimulatedBadge.tsx (plus globals.css). Grepping the custom property
                alone would miss a component using the Tailwind UTILITY.   [C#3-T6]
     RED-proof: module-not-found before F16.
     Edge:      the aria-label must survive rendering inside a <th> (INTERACTIONS:
                on a table column the pill goes in the th, not per cell).

T7   StatusChip never encodes status by colour alone
     File:      F44
     Covers:    R9
     Type:      integration (render), parameterised over all four StatusKind
     Assert:    per kind: the exact Thai label renders and is non-empty
                (ปกติ / เฝ้าระวัง / วิกฤต / ไม่มีข้อมูล);
                an icon node renders carrying a per-kind [data-icon] value;
                across the four kinds, labels are pairwise DISTINCT and icons are
                pairwise DISTINCT — an identical icon for every state would satisfy
                a naive "an svg exists" assertion while encoding nothing.   [C#3-T7]
                'nodata' is asserted independently so it cannot collapse into 'normal'.
     RED-proof: module-not-found before F17.

T8   missing vs zero, and every numeral is tabular
     File:      F46 web/src/lib/format.test.ts (+ F45 for Num)
     Covers:    R10
     Type:      unit, table-driven
     Assert:    formatInt(null|undefined|NaN|Infinity|-Infinity) === "—";
                formatInt(0) === "0";
                formatInt(120999834) groups per th-TH;
                formatInt(1.4)==="1", formatInt(-1.5)==="-2" (documented rounding);
                formatInt(Number.MAX_SAFE_INTEGER+2) === "—";
                formatPercent(-2.0)==="-2.0%", formatPercent(0.8)==="+0.8%",
                formatPercent(0)==="0.0%" (no sign), formatPercent(-0)==="0.0%";
                formatPercent(1, 9) throws RangeError;
                formatM3(null)==="—" with NO " ลบ.ม." suffix.
     RED-proof: module-not-found before F9.
     Companion (F45): <Num value={1234}/> renders the grouped string AND its element
                carries the tabular-nums class. A string-only assertion proves nothing
                about rendered glyph width.   [C#3-T8]

T9   relative API base, protocol-matched WS, and the real fetch path
     File:      F47 web/src/api/client.test.ts
     Covers:    R12
     Type:      unit; `loc` is a parameter (FN5) precisely so this needs no jsdom
                global surgery. fetch is stubbed ONLY to observe the request — the
                one legitimate mock use: injecting responses otherwise unreachable.
     Assert:    apiUrl("/api/x") with the DEFAULT base === "/api/x" — called with no
                base argument, so a regression that restores an absolute default is
                caught. The draft always passed base="" and would not have.   [C#3-T9]
                apiUrl("/api/x","http://h:8000") === "http://h:8000/api/x";
                apiUrl("/api/x","https://h/root") === "https://h/root/api/x";
                apiUrl("api/x") throws TypeError;
                wsUrl("/ws/twin","",{protocol:"http:",host:"localhost:5173"})
                  === "ws://localhost:5173/ws/twin";
                wsUrl("/ws/twin","",{protocol:"https:",host:"x.th"})
                  === "wss://x.th/ws/twin";
                wsUrl("/ws/twin","http://api:8000",{protocol:"https:",host:"x.th"})
                  THROWS TypeError (insecure base on a secure page);
                getJson: 200 JSON resolves; 404 {detail:"..."} -> ApiError with the
                  string; 422 validation ARRAY -> ApiError with a joined string;
                  network reject -> ApiError(0); AbortError re-thrown as-is;
                  non-JSON 200 -> ApiError(200,"malformed JSON").
     RED-proof: module-not-found before F24.
     Edge:      the https->wss case IS the point — an https page emitting ws: is
                blocked as mixed content and the twin dies silently.

T10  axe finds nothing, on the document
     File:      F48 web/src/a11y.test.tsx
     Covers:    R11
     Type:      integration (real render + real axe-core)
     Assert:    axe run against document.documentElement — NOT a detached container,
                which cannot see document-level `lang`;   [C#3-T10]
                index.html still carries lang="th" (asserted by reading the file, so
                F5's <head> edit cannot silently drop it);
                zero violations.
     RED-proof: fails to resolve AppShell before F20.
     Limitation: axe in jsdom is STRUCTURAL. It does not evaluate colour contrast,
                the CSS-selected scheme, font fallback, or focus-ring visibility.
                Contrast is covered by T1 plus the CVD-validated palette in
                tokens.map.md; the rest is PR-17's browser pass. Recorded here so
                "axe clean" is not read as more than it is.

T11  fonts are local AND actually applied
     File:      F41
     Covers:    R4
     Type:      unit (fs)
     Assert:    globals.css contains an @import of the @fontsource Thai subset;
                globals.css maps that family onto --font-sans / font-family — an
                installed-but-unimported font would otherwise pass;   [C#3-T11]
                globals.css contains NO "http" URL;
                the imported @fontsource file resolves on disk;
                the @import appears BEFORE the first @theme/rule (CSS requires it).  [C#4]
     RED-proof: ENOENT on globals.css before F7.

T12  motion is tokenised and reduced-motion actually zeroes it
     File:      F41
     Covers:    R5
     Type:      unit (CSS text)
     Assert:    an @media (prefers-reduced-motion: reduce) block exists AND sets both
                transition-duration and animation-duration to 0 (a block that only
                names one leaves half the motion alive);   [C#3-T12]
                every transition/animation duration outside the --anim-* definitions
                references var(--anim-*) — no bare 150ms/0.2s anywhere.
     RED-proof: ENOENT before F7.

T13  curated store matches independently-computed ground truth
     File:      F49 api/tests/test_curated.py
     Covers:    R14, R15
     Type:      integration against the REAL data/curated/water_sold_by_branch.csv.
                The repo's honesty rule makes a synthetic fixture the wrong oracle
                for "does this read the real dataset correctly".
     Assert:    len(store.months()) == 39; all match ^\d{4}-\d{2}$;
                months()[0]=="2022-10" and months()[-1]=="2025-12";
                national("2025-12").branch_count == 234 (NOT 235 — labels are not
                  identity);
                national("2025-12").total_m3 == approx(120_999_833.55, rel=1e-9);
                len(national("2025-12").regions) == 10;
                store.skipped_rows == 0 for the committed file.
                These are EXTERNAL values measured from the file, not
                total==sum(regions), which stays green if 90% of rows are
                dropped.   [C#3-T13]
     RED-proof: ImportError: cannot import name 'load_curated' before F33.
     Edge:      national("1999-01") -> empty rollup, no exception.
                national("nonsense") -> ValueError.

T14  curated identity agrees with the simulator's roster (drift test)
     File:      F49
     Covers:    R15
     Type:      integration; obtains the roster OUT OF PROCESS via the existing
                `simulator_roster` conftest pattern. api/app and simulator/app are
                both top-level `app` packages and must never share an interpreter
                (conftest.py:pytest_sessionstart).
     Assert:    {code for PWA-{code}-P1 in simulator_roster} ==
                set(store.branch_codes()) — the API and the simulator derive the same
                234 branches from the same file. This is the oracle that justifies
                re-implementing the CSV read in api/ instead of importing it.
     RED-proof: ImportError before F33.

T15  MoM/YoY are None (never 0.0); 0 m³ is not "missing"
     File:      F49
     Covers:    R15
     Type:      unit over a 6-row CSV written to tmp_path — a real file through the
                real parser, not a mock.
     Arrange:   branch A present only in 2023-01; branch B in 2022-01, 2022-12,
                2023-01; branch C present in 2022-12 with 0.0 and in 2023-01.
     Assert:    A.mom_pct is None and A.yoy_pct is None (NOT 0.0);
                B.mom_pct == approx(expected) and B.yoy_pct == approx(expected);
                C.mom_pct is None (zero baseline -> undefined, FN15);
                a 0.0-volume row IS returned with water_sold_m3 == 0.0 and a rank,
                while a branch absent that month is simply not listed.
     RED-proof: ImportError before F33. Against a naive impl defaulting to 0.0 it
                fails "assert 0.0 is None".

T16  the four routes answer with the declared schema
     File:      F49
     Covers:    R14, R16
     Type:      integration via fastapi TestClient over the real app
     Assert:    /api/curated/months -> 200, 39 entries;
                /api/curated/national?month=2025-12 -> 200, total_m3 ==
                  approx(120_999_833.55), branch_count == 234;
                /api/curated/regions/2?month=2025-12 -> 200, rows sorted desc,
                  rank strictly 1..n, every row's keys match the BranchRow schema
                  exactly (no extra, no missing);
                /api/curated/branches/<a real code> -> 200, months ascending;
                the OpenAPI document exposes each route's response_model — the repo
                already treats OpenAPI shape as acceptance evidence
                (api/tests/test_routes.py);   [C#3-T16]
                unknown month -> 404; malformed month -> 422;
                region "abc" -> 422 (FastAPI path validation); region 99 -> 404;
                unknown branch code -> 404.
     RED-proof: 404 on /api/curated/months before F35+F37 register the router — which
                is exactly the orphan §7 exists to prevent.

T17  CORS: a genuine preflight, and the GET that follows
     File:      F50 api/tests/test_cors.py
     Covers:    R13
     Type:      integration. Builds a FRESH app inside the test with CORS_ORIGINS set
                BEFORE import, because middleware is attached to the module-level
                singleton at import time and cannot be reconfigured afterwards.  [C#4]
     Act/Assert: OPTIONS /api/curated/months with Origin: http://localhost:5173 AND
                  Access-Control-Request-Method: GET — without that header it is not
                  a preflight at all and Starlette will not answer it as one;  [C#3-T17]
                  -> 200 and access-control-allow-origin == "http://localhost:5173";
                the subsequent GET with that Origin also carries the header — a
                  preflight alone does not prove the actual response does;
                the same pair with Origin: http://evil.example -> header ABSENT;
                settings.cors_origin_list is never ["*"] while credentials are on.
     RED-proof: the first assertion fails (header absent) before F37 adds the
                middleware — precisely the defect SESSION-HANDOFF §3 records.

T18  the Vite dev proxy is configured to route /api and /ws away from Vite
     File:      F41
     Covers:    R12
     Type:      unit — imports the vite config object and asserts its shape.
     Assert:    server.proxy has "/api" and "/ws"; the /ws entry sets ws:true; both
                set changeOrigin:true; target reads VITE_PROXY_TARGET with a
                http://localhost:8000 default; resolve.alias["@"] is ABSOLUTE.
     RED-proof: `server` is undefined on the current config -> TypeError before F3.
     Limitation — stated, not hidden: this asserts CONFIGURATION, not behaviour. A
                correct-looking config still fails against an unreachable target or a
                broken WS upgrade. Live proof is a Claude-run compose check
                (§Verification below) recorded in the coding log, and an automated
                end-to-end version belongs to PR-17, which owns Playwright.   [C#3-T18]
```

**Claude-run live verification (not a unit test; recorded in the coding log).**
`docker compose up` from a clean volume, then: `curl` `/api/curated/national?month=2025-12`
**through port 5173** (proving the proxy, not the API port), and open `/ws/twin` through the same
origin. This is the honest answer to Codex's T18 objection — the assertion moves to a real stack
under Claude's hand instead of pretending a config test covers it.

---

## §6 Traceability Matrix

| Req | Tests | Files | Slice |
|---|---|---|---|
| R1 | T1 | F7 | S-F1 |
| R2 | T1 | F7 | S-F1 |
| R3 | T2 (mutation-verified) | all of `web/src`, F31 | S-F1 |
| R4 | T11 | F1, F7 | S-F1 |
| R5 | T12 | F7 | S-F1 |
| R6 | T3, T4 | F18, F22, F23 | S-F2 |
| R7 | T4, T5 | F19, F20 | S-F2 |
| R8 | T6 | F16 | S-F1 |
| R9 | T7 | F17 | S-F1 |
| R10 | T8 | F9, F10 | S-F1 |
| R11 | T10 | F5, F11–F21 | S-F2 |
| R12 | T9, T18 | F3, F24, F25 | S-F2 |
| R13 | T17 | F36, F37 | S-F3 |
| R14 | T13, T16 | F33, F34, F35, F37 | S-F3 |
| R15 | T13, T14, T15 | F33 | S-F3 |
| R16 | T16 | F37 | S-F3 |

Every R has ≥1 T ✅. Every T maps to ≥1 R ✅ — T1→R1,R2; T2→R3; T3,T4→R6; T4,T5→R7; T6→R8;
T7→R9; T8→R10; T9,T18→R12; T10→R11; T11→R4; T12→R5; T13→R14,R15; T14,T15→R15; T16→R14,R16;
T17→R13.

---

## §7 Wiring Verification

| New component | Entry point (runtime caller) | Registration site | Schema / data |
|---|---|---|---|
| `globals.css` (F7) | browser stylesheet | `import "./styles/globals.css"` in F28 `main.tsx` | — |
| `@fontsource/ibm-plex-sans-thai` | `@import` at the top of F7 | F1 dependency | — |
| `cn()` (F8) | every `ui/*` component | direct import | — |
| `format*` (F9) | F10 `Num`; F21 placeholder | direct import | — |
| `Num` (F10) | F21 `PlaceholderScreen`; the mandated numeral renderer for PR-7+ | direct import | — |
| `Button/Card/Badge/Alert/Skeleton` (F11–F15) | F20 header (Button); F21 (Card, Alert, Skeleton) | direct import | — |
| `SimulatedBadge` (F16) | F21 `PlaceholderScreen` header | direct import | — |
| `StatusChip` (F17) | F21 `PlaceholderScreen`, rendering `kind="nodata"` — **literally true** for an unbuilt screen. It is deliberately **not** wired into the footer: a live "System Status" chip with no data source would be a fabricated telemetry value, which `CLAUDE.md` forbids. The footer keeps the Stitch design's static link. | direct import | — |
| `NAV_ITEMS` (F18) | F19 `Sidebar` **and** F22 `buildRoutes` | direct import — the single source that makes R6 unfalsifiable | — |
| `Sidebar` (F19) | F20 `AppShell` | direct import | — |
| `AppShell` (F20) | F22 root route `element` | route tree | — |
| `PlaceholderScreen` (F21) | F22 per-item route `element` | route tree | — |
| `buildRoutes` (F22) | F23 `createAppRouter`, and every router test | direct import | — |
| `createAppRouter` (F23) | F27 `App.tsx` `<RouterProvider/>` | — | — |
| `apiUrl` / `wsUrl` / `getJson` (F24) | **`getJson` has no runtime caller in PR-6 — declared, not hidden.** It is the seam PR-7's twin and PR-8's monitor consume on day one. `apiUrl`/`wsUrl` are exercised by T9. See §9-R5. | direct import | — |
| `extremes.ts` (F26) | tests only — a **fixture**, intentionally exempt from the no-orphan rule (which targets components and routes) | — | — |
| `load_curated` / `CuratedStore` (F33) | F37 lifespan builds it → `app.state.curated`; F35 handlers read it off `request.app.state` | `api/app/main.py` lifespan | reads `data/curated/water_sold_by_branch.csv`, header **grep-verified**: `region,branch_code,province,branch,month,water_sold_m3` |
| curated response models (F34) | F35 `response_model=` | `api/app/models.py` | — |
| curated `router` (F35) | HTTP `GET /api/curated/*` | F37 `app.include_router(curated_routes.router)` | as above |
| `CORSMiddleware` | every HTTP response | F37 `app.add_middleware(...)` at import time | — |
| `curated_path`, `cors_origins` (F36) | F37 reads them off `Settings` | F38 compose env `CURATED_PATH`, `CORS_ORIGINS`; F39 documents them | — |
| compose `api` bind-mount (F38) | container path `/srv/data/curated` | `infra/docker-compose.yml` → `api.volumes` | **closes a real gap: the `api` service has no `volumes:` key today** — only `seed` and `simulator` mount data |
| root `.dockerignore` (F40) | every `docker build` using the repo-root context (api, migrate, seed, backfill) | repo root | — |

**Grep-verified, not remembered:**
CSV header ✅ · `api` service has no `volumes:` today ✅ · no `CORSMiddleware` anywhere in `api/`
today ✅ · no `server:` key in `web/vite.config.ts` today ✅ · `infra/db/005_row_provenance.sql`
**exists** and `scripts/backfill_history.py` depends on it, so the next free prefix is **006** and
this PR uses none ✅ · `web/.dockerignore` exists but there is **no root `.dockerignore`** ✅ ·
`infra/env.sample` currently sets `VITE_API_BASE=http://localhost:8000`, which this PR must
change ✅ · `web` service is behind `profiles: ["ui"]` today ✅.

---

## §8 Slice Plan

| ID | Scope (F / T ids) | Owner | Stop line | Oracle | Done when |
|---|---|---|---|---|---|
| **S-F1** | F1–F17, F26, F29, F31, F32 · T1,T2,T6,T7,T8,T11,T12 | **Claude authors F7**; delegate fills F8–F17, F26 | **SL-3** | T1,T2,T6,T7,T8,T11,T12 + `pnpm typecheck` + `pnpm lint` | token drift test green, zero colour literals, primitives render |
| **S-F2** | F18–F25, F27, F28, F30 · T3,T4,T5,T9,T10,T18 | delegate | SL-3 (seams from S-F1) | T3,T4,T5,T9,T10,T18 + axe | shell renders, all 10 routes reachable at their URLs, axe clean |
| **S-F3** | F33–F40 · T13–T17 | delegate (**F38/F39/F40 Claude** — infrastructure) | SL-3 | T13–T17 + `ruff` + `mypy --strict` | 4 routes answer with declared schemas, CORS correct, compose mounts data |

All three land in **one PR (PR-6)**: the foundation is not independently useful in halves, and the
directive is one PR per plan item. Sequenced S-F1 → S-F2 → S-F3 inside the branch.

### Stop line — the Q0–Q3 walk, recorded rather than eyeballed

- **Q0 gate.** Security/auth or claim trust? No. Tenant isolation / row scoping? No — single-tenant
  demo. Migration or irreversible data change? **No** — CSV is read-only and this PR adds no
  `006_*.sql`. Payment/webhook signatures? No. Secrets? No. Spec fuzzy? No. Any slice without an
  oracle? No. → **NO. Delegation is permitted.**
- **Q1 — one genuinely hard part surrounded by plumbing?** **YES.** `globals.css` (F7) is the token
  contract: hex→OKLCH plus `light-dark()` is exacting colour math where a silent error invalidates
  the CVD-validated palette `tokens.map.md` certifies (worst adjacent ΔE 17.4; a documented
  dark-warning exception at L 0.734 — a value this plan independently reproduced at **0.7336**,
  confirming the conversion). Everything around it — primitives, shell, router, CSV loader — is
  plumbing. → **SL-3.**
- Q2 would also be YES (new routes, new exports, ≥2 files, crosses the Python↔TS boundary, §4 lists
  15 functions). Q1 ∧ Q2 is still **SL-3**, which strictly includes the SL-2 seams.
- **Adaptation evidence.** SESSION-HANDOFF §2: S1 SL-2 (3 fix rounds) → S3 SL-3 → S5 SL-3, and
  "S6 should start at SL-3". This is additionally the delegate's **first frontend slice** — a new
  domain, new idioms, a brand-new Tailwind major. Torn → take the higher. **SL-3 confirmed.**

**Claude implements personally, beyond the seams:** F7 (`globals.css`), F38/F39/F40
(infrastructure), and all of F41–F50 (the acceptance tests). Everything in Phase 7 and Phase 8.

---

## §9 Risks, Rollout, Rollback

| # | Risk | Trigger | Blast radius | Gate / mitigation | Rollback |
|---|---|---|---|---|---|
| R1 | Tailwind v4 is CSS-first; `@theme` semantics differ from v3 and most shadcn docs show v3 | build / typecheck | `web` only | `pnpm build` is in the gate set; tokens live in `@theme` under the `--color-*` namespace with `@theme inline` where a value references another var | pin v4 exactly; fall back to plain CSS custom properties with no Tailwind — the **tokens** are the contract, Tailwind is a convenience |
| R2 | `shadcn init` rewrites `globals.css` with **its own** oklch palette, silently destroying the token contract | running the CLI | the whole colour system | **We never run `shadcn init`.** We hand-author `components.json` + `cn()` + the primitives, so `shadcn add` still works later. T1 would catch an overwrite | `git checkout web/src/styles/globals.css` |
| R3 | `react-router-dom` v7 API drift vs v6 | typecheck | routing | pinned 7.x; the registry (F18) confines a downgrade to F22/F23 | — |
| R4 | The Vite proxy exists only in **dev**; `pnpm build` output has no proxy, so a static bundle 404s on `/api` | demo served from `dist/` | the whole UI | Documented: the demo runs `pnpm dev` — the compose `web` service already does, and F38 removes the `ui` profile so it actually starts. Recorded in T18's note and the coding log | set `VITE_API_BASE` at build time |
| R5 | `getJson` ships with no runtime caller | wiring audit | none functional | **Declared in §7, not hidden.** It is the seam PR-7 consumes immediately. Codex correctly notes `CLAUDE.md`'s orphan rule covers routes and components, not every helper — so this is weak wiring, not a violation | delete `getJson`; let PR-7 add it |
| R6 | The authored 10-item sidebar diverges from every Stitch mockup's 5–7-item nav | design review | visual fidelity | **Deliberate and unavoidable.** The Stitch navs are mutually inconsistent — S6 alone lists Report Center, S7 alone lists Alert Center, S9 has an entirely different Thai nav, and **none** list Operations, Pipeline or Predictive. There is no single mockup nav to transcribe; the union is the only coherent shell. Recorded here and in the coding log | — |
| R7 | Tests read the real 9 126-row CSV, coupling the suite to a data file | test run | `api` suite | Acceptable: the file is committed and read-only, and its shape **is** the contract. T15 uses `tmp_path` CSVs for the logic edges | — |
| R8 | Installing `web/node_modules` inflates the repo-root Docker build context for api/migrate/seed/backfill | any `docker build` | build time, image size | **F40 adds the root `.dockerignore`.** A pre-existing LOW (recorded in the PR-5 log) that this PR would otherwise turn into a real regression | — |
| R9 | jsdom cannot see contrast, focus rings, truncation, skeleton geometry, FOUT, or glyph coverage — all explicit requirements | any visual defect | demo fidelity | **Stated as a Non-Goal, not covered by a test that pretends to.** Contrast rests on T1 + the CVD-validated palette; the rest belongs to PR-17's Playwright pass, which already owns browser E2E | — |
| R10 | `--admin` merge bypasses CI | merge | `main` | **No CI exists** (SESSION-HANDOFF §3), so nothing is actually bypassed; the user explicitly directed `--admin`. Every gate is run locally by Claude and recorded | `git revert` the squash commit |

**Rollout.** Single PR, no feature flag. The foundation is inert until a screen uses it: the 10
routes render honest placeholders, so a half-finished Phase C cannot present fabricated data.

---

## §10 Do-Not-Touch List (verbatim — consumed by the diff audit)

```
web/src/styles/tokens.test.ts
web/src/components/AppShell.test.tsx
web/src/routes/router.test.tsx
web/src/components/markers.test.tsx
web/src/components/ui/primitives.test.tsx
web/src/lib/format.test.ts
web/src/api/client.test.ts
web/src/a11y.test.tsx
api/tests/test_curated.py
api/tests/test_cors.py
api/tests/                      (every other existing test file)
simulator/                      (read-only reference — roster.py is the identity authority)
ml/
scripts/
web/src/styles/globals.css      (Claude-authored token contract, SL-3)
infra/docker-compose.yml        (Claude-authored infrastructure)
infra/env.sample
infra/db/
.dockerignore
design/                         (read-only reference)
data/                           (read-only seed)
docs/
CLAUDE.md
POC_SPEC.md
.codex/
coding-logs/
```

Also forbidden to the implementer: any `git`/`gh` command · any new migration · `@ts-ignore` ·
`# type: ignore` · bare `except:` · weakening, skipping or `xfail`ing any test · `--no-verify`.

---

## §11 Codex adversarial pass — every finding dispositioned

Reviewer: `gpt-5.6-sol` @ `xhigh`, read-only over the real repo. **Three findings were factual
corrections to my draft** and are folded into §0/§4/§5 above rather than merely acknowledged.

### Accepted — factual corrections (the draft was wrong)

| # | Finding | Disposition |
|---|---|---|
| C1 | "Next free migration is 005" is **false** — `005_row_provenance.sql` exists and `backfill_history.py` depends on it | **ACCEPTED.** §0 now says 001–005 taken, next free **006**, and this PR adds none. Verified: `ls infra/db/`. |
| C2 | ΔE-OK is Euclidean in **Oklab**, not raw OKLCH; comparing in OKLCH compares hue angles, undefined for `#FFFFFF` | **ACCEPTED — this was a real bug in T1.** T1 now uses `differenceEuclidean("oklab")` and asserts the white edge case explicitly. |
| C3 | "235 branches" conflates labels with identity: there are **234** `branch_code`s and 235 labels because one branch was renamed | **ACCEPTED.** Verified from the CSV. R15 + T13 now assert `branch_count == 234`. The 235-row overflow *fixture* stays (it is a stress case, not a data claim). |
| C4 | culori is not a CSS parser; `light-dark()` needs a balanced-paren scan, not a naive regex | **ACCEPTED.** T1 specifies a balanced-paren scanner. |
| C5 | `app.config.ts` is 6 lines, not 7 | **ACCEPTED.** F25 corrected. |
| C6 | The repo does not pin pnpm 9.15.4 | **ACCEPTED.** §0 corrected; F1 adds `packageManager`, F32 uses `--frozen-lockfile`. |
| C7 | `getJson` is not an orphan "by CLAUDE.md's letter" — the rule covers routes and components | **ACCEPTED.** §9-R5 reworded: weak wiring, declared, not a rule violation. |

### Accepted — missing files and under-scoped changes

| # | Finding | Disposition |
|---|---|---|
| C8 | `web/pnpm-lock.yaml` must change; Docker consumes it | **ACCEPTED** → F2. |
| C9 | `infra/env.sample` still tells users to bypass Vite | **ACCEPTED** → F39. |
| C10 | No root `.dockerignore`; the repo-root build context would upload `web/node_modules` | **ACCEPTED** → F40. Stronger than stated: this PR *creates* the harm by installing node_modules. |
| C11 | eslint plugins referenced by F28 were absent from the dependency list | **ACCEPTED** → F1. |
| C12 | Curated responses should be Pydantic `response_model`s per repo convention | **ACCEPTED** → F34, asserted by T16 via OpenAPI. |
| C13 | The store must be owned by lifespan, not import time, or `/healthz` loses its dependency-free contract | **ACCEPTED** → R16, F37, T16. |
| C14 | `web` is behind `profiles: ["ui"]`, so `docker compose up` starts no proxy-bearing frontend | **ACCEPTED** → F38 removes the profile. |
| C15 | No test file for the primitives, though §1 claimed they had one | **ACCEPTED** → F45. |
| C16 | `cors_origins` needs a parser and a safe default so existing `Settings()` call sites keep working | **ACCEPTED** → F36, both fields defaulted. |
| C17 | A footer `StatusChip` would need a live status source or it fabricates telemetry | **ACCEPTED, resolved differently.** The footer keeps Stitch's static link; `StatusChip` gets a *truthful* runtime home rendering `kind="nodata"` on `PlaceholderScreen`. |
| C18 | `.gitignore` needs no change | **ACCEPTED (no action).** |

### Accepted — function contracts tightened

C19 FN5 was self-contradictory (promised no `ws:` under https while permitting an http base) → now
**throws**. · C20 FN5 `loc` typed `Pick<Location,"protocol"|"host">`. · C21 FN6 gained leading-slash
and base-validity rules, and defines path-prefix preservation. · C22 FN7 gained network/abort/204/
non-JSON/`detail`-shape rules, and states plainly that `T` is a caller assertion, not validation. ·
C23 FN8 split into pure `buildRoutes()` + `createAppRouter()` so tests use `createMemoryRouter`. ·
C24 FN2 rounding and unsafe-integer behaviour specified. · C25 FN4 unit fixed (already percent) plus
`digits` bounds. · C26 FN10 no longer claims purity. · C27 FN10 identity-defect behaviour now mirrors
`roster.py` exactly. · C28 FN13/FN14 define renamed-branch behaviour (per-month label in the table,
as-of-latest at the series header). · C29 FN12–FN14 define unknown-region / malformed-month / 404 /
422 policy.

### Accepted — vacuity fixes

T1 (+`color-scheme`, forbid scheme-specific colour overrides) · T2 (widened to `rgb()`/`hsl()`/
`oklch()`/seconds/JSX inline style) · T3 (+path uniqueness, `matchRoutes`, no extra leaf routes) ·
T4 (+asserts location and link `href`, unmounts between cases) · T5 (asserts a distinct marker
**element**, not a class) · T6 (greps the Tailwind utility as well as the custom property) ·
T7 (labels and icons pairwise distinct) · T8 (+the `Num` primitive's `tabular-nums`) ·
T9 (calls `apiUrl()` with the **default** base; adds the full `getJson` error matrix) ·
T10 (document-scoped axe; asserts `lang="th"` survives) · T11 (asserts the CSS actually imports and
maps the family) · T12 (reduce block must zero **both** transition and animation) ·
T13 (**external** ground truth — 39 months / 234 codes / 10 regions / 120 999 833.55 — replacing a
self-consistency check) · T16 (exact schema + OpenAPI) · T17 (real preflight headers; fresh app
before middleware freezes; asserts the GET too).

Plus **T14, a new drift test** not suggested by Codex: the API's 234 branch codes must equal the
simulator's roster, obtained out-of-process. This is what justifies re-implementing the CSV read in
`api/` rather than importing `simulator/app` (which SESSION-HANDOFF §4 forbids: both are top-level
`app` packages).

### Accepted — ordering hazards, folded into §3/§8

Install and lock deps before touching configs or tests (S-F1 runs first). · Tailwind needs
`--color-*` semantic mappings, with `@theme inline` where a value references another variable. ·
CSS `@import` must precede `@theme` and all rules (asserted by T11). · The `@` alias needs three
aligned consumers — tsconfig `paths`, an **absolute** Vite alias, and `components.json` (F3/F4/F6). ·
Resolve browser-vs-memory router before exporting anything (C23). · Parse CORS settings before
constructing middleware (T17). · Build the curated store in lifespan (C13). · `http://api:8000`
resolves only inside compose; the host default stays `localhost:8000` (F3).

### Rejected / deferred — with reasons

| # | Finding | Disposition |
|---|---|---|
| C30 | "Verify selected computed values **in a browser**" (T1), real-browser visibility (T5), `document.fonts.check()` after `fonts.ready` (T11), browser media emulation (T12), computed contrast in both schemes (T10), Compose+WS live proof (T18) | **DEFERRED to PR-17**, which already owns Playwright and browser E2E. Every one of these needs a real rendering engine; jsdom cannot do them. Adding Playwright here would roughly double the PR and duplicate PR-17's setup. **Recorded as an explicit Non-Goal (§1) and a stated limitation on T5/T10/T18 — not silently dropped.** The one exception: the compose proxy/WS check is promoted to a **Claude-run live verification** recorded in the coding log, because it validates this PR's central claim. |
| C31 | "Assert the December-2025 reference **YoY**" in T13 | **PARTIALLY ACCEPTED.** The reference *total* (120 999 833.55) and the counts are asserted. A YoY reference number is asserted in T15 against a controlled `tmp_path` fixture instead, where the expected value is derivable by hand rather than by re-implementing the aggregation inside the test — a test that recomputes the thing it is testing is the vacuity C31 is trying to prevent. |
| C32 | Introduce a shared curated-CSV package so `api/` and `simulator/` cannot diverge | **REJECTED for this PR.** It is the architecturally clean answer, but it would touch `simulator/`, `scripts/seed_db.py`, two Dockerfiles and compose — well outside a frontend-foundation PR, and `api/app` importing `simulator/app` is explicitly forbidden (both are top-level `app`). **Mitigated instead by T14**, which makes divergence fail a test. Logged as a follow-up owner: whichever PR next needs curated data server-side. |
| C33 | `tabular-nums` may not affect **Thai** numeral glyphs; decide Latin digits vs `u-nu-thai` | **ACCEPTED as a decision, not a test.** Decision: **Latin digits** (`th-TH` default, no `-u-nu-thai`), matching every Stitch mockup (`120,999,834`) and the tabular-nums requirement. Recorded in FN2. Measuring glyph widths needs a browser → PR-17. |
