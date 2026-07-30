# DREP — PR-7c · Operations/SCADA SVG twin screen (slice S4c)

Baseline `origin/main` @ `c257fa3` (7a+7b landed). Branch `feat/pr7c-twin-screen`. Stitch S4.
The final layer of the PR-7 split: 7a data, 7b events, **7c the screen**. Scored items
2.1–2.5 (35 pts) become visible.

## §0 Repo Profile
Web: React 18.3 · Vite 6 · vitest 2.1.8 (jsdom) · pnpm 9.15.4. Gates: `cd web && pnpm
{test,typecheck,lint,build}`. Design: `design/manifest.json` `designFrozen:false` → **no
pixel baselines**; `design/tokens.map.md` + `design/INTERACTIONS.md` committed; Stitch S4 at
`design/screens/S4-operations-twin.png`. MUST NOT: raw hex/rgb/hsl/oklch/duration/box-shadow
or built-in Tailwind palette utility under `web/src` (PR-6's tokens.test enforces); violet
reserved for `SimulatedBadge`; status never colour-alone; every synthetic value marked
SIMULATED; no hardcoded telemetry/coords in a component.

**Foundation available (PR-6):** `StatusChip` (StatusKind = normal/warning/critical/nodata),
`Num`, `SimulatedBadge`, `apiUrl/wsUrl/getJson`, `Card/Button/Alert/Skeleton`, nav registry,
`mocks/extremes.ts`, the tokens contract. **API (7a/7b):** `GET /api/twin/{topology,bands,
sec/{id},impact/{id}}`; `WS /ws/twin` frames `{event_version,kind,asset_id,status,signal,
value,observed_at,health_score,pttf_hours}`.

## §1 Goal / Non-Goals
**Goal.** Render the operations twin from live data: an SVG process schematic that zooms via
`viewBox` without resolution loss, device symbols that change shape (not colour) on status and
update over the WS with no refresh, a pump's SEC on selection, and — on a pressure drop — the
affected pipe highlighted with its downstream customers listed. Flip `nav.operations.built`.

**Non-Goals.** Backend changes (all shapes exist). GIS accuracy (process schematic).
Browser-measured latency / the reconnect drill / cold-start (**PR-17**). Pixel baselines
(`designFrozen:false`). Screens other than S4.

## §2 Requirements
- **R1 (2.1)** The schematic is inline `<svg>` with a `viewBox`; zoom in/out/reset change ONLY
  the `viewBox` (all four numbers scale about the centre; reset restores them; min/max clamp),
  never `width`/`height`. No `<img>`/background-image.
- **R2 (2.1)** Every node/pipe/device position/label comes from `GET /api/twin/topology`; two
  different topology fixtures produce two different DOMs (no baked-in geometry).
- **R3 (2.2)** A `TwinEvent` on `WS /ws/twin` updates that device's symbol with NO refetch and
  NO user action; the correct asset changes and others do not.
- **R4 (2.2)** The socket reconnects with capped exponential backoff after an unclean close and
  exposes a Thai connection state (`เชื่อมต่อแล้ว`/`กำลังเชื่อมต่อใหม่`/`ไม่ได้เชื่อมต่อ`);
  unmount closes the socket and cancels any pending retry (no timer leak, StrictMode-safe).
- **R5 (2.2/2.3)** A device's rendered status = **max severity across its live per-signal
  `status` frames AND its `health` frame** (7b's contract). A pressure `warning` persists until
  a newer pressure frame, independent of flow/power frames.
- **R6 (2.3)** A device whose status is warning/critical renders a **distinct symbol** (shape/
  icon/stroke), plus an `aria-label` carrying the Thai status word; not colour-alone.
- **R7 (2.3)** Selecting a pump shows its **SEC in kWh/m³** from `GET /api/twin/sec/{id}`,
  rendering `—` (never `0`, never `NaN`) when `sec_kwh_per_m3` is null.
- **R8 (2.4)** A pressure-**drop** event (`signal==pressure_bar` AND `value < bands.pressure_bar.low`
  from `GET /api/twin/bands`) highlights the dropping device's outgoing pipe(s) and lists the
  customers from `GET /api/twin/impact/{pipe_id}`, with a count. Highlight is not colour-alone
  (stroke dash/width + aria). A pressure **spike** (`value > high`) does NOT trigger the impact.
- **R9 (2.5)** The screen is a **config file (`twin.config.ts`) + ≥3 distinct components**, each
  importable and separately tested; asserted structurally.
- **R10 (honesty)** Every synthetic value (statuses, SEC, counts, customer ids) carries a
  `SimulatedBadge`; real branch/geography labels do not. The affected-customer count is the
  REAL value from the API (5 for the seed), never the mockup's "1,204".
- **R11 (states)** loading / empty / error / offline-stale per INTERACTIONS.md (keep last-known
  values, dim, stale badge — never blank on disconnect).
- **R12 (a11y)** axe clean on `/operations` (document-scoped); the SVG has an accessible name;
  each device has an accessible name carrying its status word.

## §3 Change Contract (all `web/src/`)
| ID | Path | Purpose |
|----|------|---------|
| F1 | `features/twin/twin.config.ts` | **the item-2.5 config**: WS path, zoom bounds/step, reconnect backoff (base/cap), poll fallback ms, layout viewBox |
| F2 | `features/twin/types.ts` | TS types mirroring the 4 API shapes + the WS frame + a `DeviceLiveState` |
| F3 | `features/twin/twinClient.ts` | `fetchTopology/fetchBands/fetchSec/fetchImpact` over `getJson` (retires PR-6's `getJson` orphan); `deriveStatus(perSignal, health)`; `isPressureDrop(frame, bands)`; `outgoingPipes(node, topology)` |
| F4 | `features/twin/useTwinSocket.ts` | WS subscription + backoff reconnect + connection state + per-asset `DeviceLiveState` map |
| F5 | `features/twin/DeviceSymbol.tsx` | **component 1** — per-device SVG symbol; shape by status; aria |
| F6 | `features/twin/PipeEdge.tsx` | **component 2** — an SVG pipe; `data-affected` highlight |
| F7 | `features/twin/ProcessSchematic.tsx` | **component 3** — the `<svg viewBox>`, zoom controls, composes F5/F6 |
| F8 | `features/twin/ImpactPanel.tsx` | **component 4** — affected-customer list + count + SimulatedBadge |
| F9 | `features/twin/SecTooltip.tsx` | **component 5** — kWh/m³ readout, `—` when null |
| F10 | `features/twin/StatusCounters.tsx` | KPI row (total/normal/warning/critical) from device statuses |
| F11 | `screens/OperationsTwinScreen.tsx` | composes F1–F10; loading/empty/error/stale |
| F12 | `routes/nav.ts` | `operations.built = true` |
| F13 | `routes/routes.tsx` | `/operations` → `OperationsTwinScreen` (replace placeholder) |

**Tests (Claude):** `features/twin/schematic.test.tsx` (R1,R2,R6), `socket.test.tsx` (R3,R4,R5),
`impact.test.tsx` (R8,R10), `sec.test.tsx` (R7), `structure.test.ts` (R9), `a11y.test.tsx` (R12
— extend PR-6's or new), `states.test.tsx` (R11).

## §4 Function Contracts (the load-bearing ones)
```
FN1 deriveStatus(live: DeviceLiveState) -> TwinStatus            F3
    max severity over live.perSignal[*].status and live.health?.status;
    order nodata<normal<warning<critical. Empty -> "nodata" (NOT normal).
FN2 isPressureDrop(frame, bands) -> boolean                       F3
    frame.kind=="status" && frame.signal=="pressure_bar" && frame.status!="normal"
    && frame.value != null && frame.value < bands.pressure_bar.low.  (spike: value>high -> false)
FN3 outgoingPipes(node, topology) -> TwinPipe[]                    F3
    every pipe with from_node==node (may be >1; the impact route handles a non-unique id).
FN4 useTwinSocket(opts) -> {connection, byAsset, lastDrop}         F4
    connection: "connecting"|"open"|"reconnecting"|"closed". byAsset: Map<asset,DeviceLiveState>.
    Reconnect: capped exponential backoff from twin.config; reset on open. Unmount: close socket,
    clear timer. Ignore a stale socket's late onclose (StrictMode double-mount). A malformed or
    unknown-event_version frame is ignored, not thrown.
FN5 zoom(viewBox, factor) -> viewBox                              F7
    scale w,h by factor about the centre; clamp to [minScale,maxScale]*base; x,y recomputed to
    keep centre fixed. reset() returns the base viewBox.
```

## §5 Test Plan (jsdom; browser-only aspects deferred to PR-17, stated in-file)
- **T1 (R1)** schematic root is `<svg>` with a viewBox; after zoomIn the viewBox w AND h shrink
  by the step and the centre is invariant; width/height attrs unchanged; reset restores; clamp
  at min/max. No `<img>`/`background-image`. RED: module-not-found before F7.
- **T2 (R2)** render against fixture A then fixture B (different coords/ids/statuses/cardinality);
  assert an exact DOM bijection to the data both times — no baked-in nodes.
- **T3 (R3)** fake WS; `fetch` stubbed and asserted called ONCE (topology+bands load), then a
  pushed frame flips that device's `data-status` and aria; other devices unchanged; no refetch.
- **T4 (R4)** unclean close → connection "reconnecting", a retry scheduled with backoff; after
  unmount, advancing fake timers past the cap opens NO new socket; a late onclose from the first
  socket is ignored.
- **T5 (R5)** push pressure_bar:warning then flow_m3h:normal for one device → symbol stays
  warning (per-signal max), not cleared by the flow frame; then health:critical → critical.
- **T6 (R6)** the four statuses render pairwise-distinct symbols (distinct `data-symbol` + markup)
  and each aria-label contains its Thai word; nodata ≠ normal.
- **T7 (R7)** select a pump → fetchSec called with its id; kWh/m³ shown; a null `sec_kwh_per_m3`
  renders `—` (not 0/NaN).
- **T8 (R8)** inject a pressure-drop frame → fetchImpact called with the outgoing pipe id; the
  pipe gains `data-affected` (+ non-colour affordance); ImpactPanel shows the count and rows; a
  pressure-SPIKE frame does NOT call fetchImpact. Two racing drops: only the latest wins.
- **T9 (R9)** `twin.config.ts` imported by the screen; ≥3 twin components imported by it; asserted.
- **T10 (R10)** SimulatedBadge present on the SEC readout, the counters, and the impact count;
  the affected count equals the API's (fixture value), not a literal 1204.
- **T11 (R11)** loading→skeleton; empty topology→Thai empty message; fetch error→Alert (3-part);
  socket "closed"→dim + stale badge, last-known values retained (not blanked).
- **T12 (R12)** axe clean on the mounted `/operations`; svg has role/aria-label; device aria.

## §6 Traceability: R1→T1 R2→T2 R3→T3 R4→T4 R5→T5 R6→T6 R7→T7 R8→T8 R9→T9 R10→T10 R11→T11 R12→T12.

## §7 Wiring
`twinClient` fns → screen/hook (retires `getJson`/`wsUrl` orphans from PR-6). `OperationsTwinScreen`
→ `routes.tsx` `/operations` element; `nav.operations.built=true`. F5–F10 imported by F11.
Verified: PR-6 exports (StatusChip/Num/SimulatedBadge/apiUrl/wsUrl/getJson) exist; API routes
exist on main.

## §8 Slice Plan
| ID | Scope | Owner | SL | Oracle |
|----|-------|-------|----|--------|
| S1 | F1–F4 (config, types, client, socket) + T3,T4,T5,T9 | Claude authors seams/tests; **DeepSeek** fills client/hook bodies | SL-3 | those tests + typecheck |
| S2 | F5–F10 components + T1,T2,T6,T7,T8,T10 | DeepSeek | SL-3 | those tests + axe |
| S3 | F11–F13 screen+wiring + T11,T12 | Claude writes wiring; DeepSeek fills screen | SL-3 | router tests + axe |

**Q0–Q3:** no security/migration/ingest-path. Q1: the WS lifecycle (StrictMode, timer leak,
stale-socket onclose) is the one genuinely subtle piece → Claude authors its acceptance tests
and the reconnect logic if the delegate struggles; the viewBox zoom math (FN5) is also
Claude-pinned. Else SL-3 seams, delegate fills. **Adaptation:** PR-6 (frontend) ran SL-3 with 1
fix round → SL-3 here.

## §9 Risks
- jsdom renders nothing: contrast, focus-ring, real zoom sharpness, truncation, FOUT unobservable
  → **PR-17 Playwright**; tests assert structure/attributes and say so.
- WS reconnect timer leak / StrictMode double-mount → T4 pins it explicitly with fake timers.
- Node 26 + jsdom `Request`/`AbortSignal` realm (PR-6's `test-setup.ts` shim) — already handled;
  no router navigation here but keep the shim.
- Two racing impact fetches → keep only the latest response (guard by a request token); T8.
- Affected count must be the API's, never the mockup's 1204 → T10.

## §10 Do-Not-Touch (delegate): every `*.test.*` in `web/src`, `web/src/styles/globals.css`,
`web/src/routes/nav.ts`+`routes.tsx` (Claude wires), all PR-6 components under
`web/src/components/`, `design/`, `docs/`, `api/**`, `.codex/`, `coding-logs/`. No git.

---
## §11 Codex adversarial dispositions (all accepted; folded into the build)
- API shapes matched EXACTLY: BandsResponse is NESTED (`.bands[signal].{low,high}`); SecResponse
  fields `sec_kwh_per_m3,power_kw,flow_m3h,...`; TwinEvent has `published_at,model_version`.
- WS control frames `{kind:"disabled"|"busy",detail}` handled explicitly (not "malformed").
- getJson gives no validation → the socket parser guards each frame defensively (drop unknown).
- `twin.config` references `APP_CONFIG.wsTwin`, never a second literal.
- SEC needs a DECIMAL formatter (Num does only int/m3/percent, 0.25→0) → add `formatDecimal` to
  `lib/format.ts` + test; render kWh/m³ through a `.tabular` span.
- Reuse `StatusKind` + `STATUS_LABEL_TH` (== TwinStatus); DeviceSymbol is SVG (StatusChip is
  HTML → used only in the counters/legend, not inside <svg>).
- routes.tsx maps BUILT items to their real screen (a `SCREENS` registry), not just built=true;
  OperationsTwinScreen renders an `<h1>` = labelTh so router.test T4 stays green; screen is
  defensive so the un-mocked router/a11y tests don't break (fetch+WS failures → error/closed).
- StatusCounters includes `nodata` so total == sum.
- Live reducer SEEDS `health` from topology.status (persisted baseline) so a first flow:normal
  can't clear a topology-loaded critical; per-signal frames rejected if OLDER by observed_at.
- isPressureDrop: `bands.bands.pressure_bar.low`, status ∈ {warning,critical}, finite value<low.
- Bands race: retain RAW per-signal frames; re-derive drop when bands resolve (never lose a drop).
- outgoingPipes: distinct pipe_ids → fetch each, DEDUPE merged customers (demo has 1 edge/node;
  branched test is synthetic).
- useTwinSocket: GENERATION ownership rejects stale onopen/onmessage/onerror/onclose; onerror &
  onclose don't double-schedule; reconnect on any non-intentional close (only cleanup is
  intentional); **on reopen REFETCH topology to resync** (backend has no resync protocol, so a
  recovery frame missed while disconnected would otherwise leave the UI critical forever).
- lastDrop cleared by a newer pressure normal/spike, not masked by flow frames.
- zoom(base, current, factor): positive finite factor; uniform scale clamped to [min,max]·base;
  centre invariant; reset → base.
- Honesty: mark synthetic by the API `simulated` flags (schematic statuses, SEC, counts, the
  customer table). Customers are "API-derived" SIMULATED, not "REAL"; the count is the API's
  (5 upstream / 2 for PIPE-N1-N2), never the mockup's 1204.
- Item 2.5: 7c provides the STRUCTURE (config + ≥3 components, T9); the judge-facing "repo in the
  IDE" demonstration is PR-17. Items 2.1–2.4: jsdom proves reducer/structure; the live
  browser→proxy→FastAPI flow is PR-17's Playwright. Stated in-file, not pretended.
