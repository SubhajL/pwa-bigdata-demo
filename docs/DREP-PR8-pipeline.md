# DREP — PR-8 · Data Pipeline & Quality monitor (topic ๑ on screen)

Delegation-Ready Execution Plan. Makes scored **topic ๑ (items 1.1–1.5, 35 pts)** legible on a
judge-facing screen at `/pipeline`, wired to the live backend verified this session (full compose
stack up; twin already live E2E). Authored by `g2-planning` 2026-07-30, hardened by a Codex
`gpt-5.6-sol` xhigh adversarial pass (dispositions in §11). Companion: `docs/PR-PLAN.md` (PR-8),
`POC_SPEC.md` §4A, Stitch `design/screens/S8-pipeline-quality.png`.

---

## §0 Repo Profile

| Field | Value |
|---|---|
| Repo root | `/Users/subhajlimanond/dev/pwa-bigdata-demo` |
| Slice language | TypeScript/React 18 (`web/`) — frontend-only PR |
| web test | `pnpm test` (vitest + jsdom + @testing-library/react) |
| web lint | `pnpm lint` (eslint 9 flat; `jsx-a11y`, `react-hooks`, `@typescript-eslint`) |
| web typecheck | `pnpm typecheck` (`tsc --noEmit`) |
| web build | `pnpm build` (vite) |
| **Gate baseline** | **`pnpm lint` was BROKEN on host** (`eslint-plugin-jsx-a11y` present in `package.json`+lockfile but absent from stale host `node_modules`). Repaired by `pnpm install --frozen-lockfile` (P0 pre-req, S0 below). Container build was unaffected (`--frozen-lockfile`). |
| Charting libs | **NONE** (only lucide-react, tailwind v4, radix-slot). Charts are hand-rolled SVG. |
| Migration policy | N/A — no DB change; read-only over existing endpoints |
| Coding log | `coding-logs/2026-07-28-2050 Coding Log (demo-poc).md`; pointer `.codex/coding-log.current` (valid) |
| Repo / runtime ownership | ours / ours · Disposition **may-become-production** |
| Design profile | `design/manifest.json` `designFrozen:false`; `tokens.map.md` + `INTERACTIONS.md` committed |

**Repo MUST NOT (CLAUDE.md):** no hardcoded KPI/telemetry in a component; no synthetic value
without a visible `SIMULATED` marker; **no second y-axis / rainbow-for-magnitude / colour-only
status**; no secrets; no `@ts-ignore`/bare `except`; Thai UI in IBM Plex Sans Thai; tokens only
(raw hex **and raw duration strings** are lint failures — durations are plain numbers in config,
CSS transitions use `var(--anim-*)`); typed signatures, **no `any`**; functions ≤ 50 lines (CLAUDE
policy, **not** eslint-enforced → review checkpoint); every new component imported by a non-test
module (no orphans, CLAUDE.md:42).

**Verified backend contract (this session, live stack):**
- `GET /api/pipeline/status` → **discriminated**: enabled →
  `{state,granted_qos,connected_count,disconnect_count,received,overflowed,unstored,last_error,
  queue_depth,subscriber_run_id,twin_subscribers,twin_frames_dropped,conservation{ledger,telemetry,
  dead_letter,holds}}`; disabled → `{state:"disabled",detail}` (no counters/conservation). `state` ∈
  `disconnected|connecting|subscribing|connected` (`ingest.py:178`). **`received` is per-API-process**
  and resets on restart; `subscriber_run_id` identifies the process (`pipeline.py:31`). **conservation
  totals are DB-wide across ALL runs** (`pipeline.py:44`, `db.py:285`).
- `GET /api/dlq?limit&offset` → `{count,limit,offset,items[{message_id,run_id,asset_id,reason,raw}]}`.
  **`count` = current page length only** (`dlq.py:29`); DLQ *total* comes from
  `conservation.dead_letter`. **`raw` is an OBJECT** (`models.py:44` `dict[str,Any]`; `db.py:270`
  wraps scalars as `{"value":…}`). `asset_id`/`run_id` may be null.
- `GET /api/telemetry/{asset}/latest` → sets `Server-Timing: db;dur=N` header; the latency probe target.
- `GET /api/telemetry/{asset}/range?minutes=N` → `{asset_id,window_minutes,count,readings[{ts,signal,
  value,run_id}]}` ordered oldest-first — **item 1.4 retrieval evidence**.

---

## §1 Goal / Non-Goals

**Goal.** Replace the `/pipeline` placeholder with a live Data Pipeline & Quality monitor built from
the S8 Stitch design (via the `g-ui-component` idiom: semantic HTML/shadcn, all five INTERACTIONS
states, tokens only, axe-clean) that makes topic ๑ visible without a terminal: MQTT connection +
reconnect **state** (1.1/1.2), in-browser response-time table (1.3), **time-series range-retrieval
evidence** (1.4), and the dead-letter queue with reasons (1.5).

**Scope honesty (Codex §5).** PR-8 makes topic ๑ *legible*; it does **not** own the two scored
artifacts that are inherently rehearsal/DevTools:
- **1.2 ≤30s reconnect TIMING** — PR-8 shows `connected_count`/`disconnect_count`/`last_error`
  (the state and that recovery happened); the *timed* ≤30s demonstration is **PR-17 (S-D)**.
- **1.3 DevTools/Network** — PR-8's in-browser Response-Time table *complements* the official
  DevTools artifact; the DevTools screencast is **PR-17**.
This is stated so the demo-coverage matrix is not over-claimed.

**Non-Goals.** No new backend endpoints (if a metric isn't derivable from the four routes, it is cut,
not faked). No charting-library dependency. Not the predictive panel (PR-9) or role dashboards. No
full-hypertable zoomable history — a bounded range window only.

---

## §2 Requirements — R1..R12

- **R1** Poll `GET /api/pipeline/status`; render an **MQTT connection pill** whose state (incl. the
  distinct `disabled`) shows as **icon + Thai label + colour** (never colour alone). *T1,T10.*
- **R2** Show **reconnect evidence** (item 1.2 state): `connected_count`, `disconnect_count`, and
  `last_error` when non-null; a disconnect→connected sequence is legible. *T10.*
- **R3** An **ingest-rate chart** (msg/s over a rolling window) is a **single-y-axis** SVG polyline
  (`stroke-secondary`), plotted from a pure geometry function; the rate is derived by differencing
  `received` **within one `subscriber_run_id`** — a run-id change or first sample yields no rate
  (null), never a negative or cross-process delta. *T2,T3,T11.*
- **R4** A **Response-Time table** (item 1.3) measures, in-browser, each probe endpoint's round-trip
  over N successful calls and shows the **mean ms** + the `Server-Timing db;dur` portion; the ≤500 ms
  budget verdict is derived by the table from raw results (failed/non-2xx calls excluded from the
  mean and surfaced separately), labelled by **text+icon**, not colour alone. *T4,T5,T6,T12.*
- **R5** A **DLQ table** (item 1.5) renders `GET /api/dlq` rows: asset_id (nullable), reason, and a
  deterministically-serialised, truncated `raw` **object**; implements **pagination/overflow** (page
  size from config, total from `conservation.dead_letter`). *T13.*
- **R6** The DLQ table has an **Export CSV** control (client Blob; `URL.createObjectURL` +
  `download`), escaping commas/quotes/newlines and guarding CSV formula-injection (`=+-@` → `'`
  prefix); no network write. *T7,T14.*
- **R7** A **data-lineage diagram** (SVG) shows MQTT→Validate→TimescaleDB→API with a DLQ branch
  **edge**, annotated with live conservation counts, and recomputes the holds invariant
  (`ledger === telemetry + dead_letter`) client-side as an explicit ✓/✗ (text). *T8,T15.*
- **R8** A **retrieval-evidence panel** (item 1.4): fetch `…/range`, render the returned readings in
  **ascending ts order** with the count, proving time-range retrieval (not just a row total). *T16.*
- **R9** A **KPI row**: throughput msg/s (**this-session** scope), mean response ms, **rows written
  (conservation.telemetry, all-runs)**, **DLQ total (conservation.dead_letter, all-runs)** — every
  number derived from live endpoints, no literal in a tile; **per-scope labels** distinguish
  this-session counters from all-runs totals (Codex §4 mixed-scope). *T9,T17.*
- **R10** All **five** INTERACTIONS states (Loading skeleton / Empty / Error alert / Offline-stale
  keeping last values **with the data timestamp** / Overflow pagination). A failed poll must **not**
  blank the page nor throw; the screen renders its `<h1>` synchronously regardless of fetch. *T18,T19.*
- **R11 (honesty).** Every data card carrying simulated-feed data shows a **SimulatedBadge in its card
  header / KPI tile / table `<th>`** (the sole sanctioned violet placements). The latency card adds a
  caption: environment + call count/window + success count + "ไม่ใช่ SLA production". The RTT number
  itself is **not** violet-badged (it is genuinely measured). Footer restates the feed is simulated.
  *T17,T18 (badge presence), review checkpoint.*
- **R12 (wiring).** `/pipeline` nav item → `built:true`; `PipelineMonitorScreen` registered in the
  route `SCREENS` map; a wiring test asserts the **real** screen renders (placeholder sentence absent)
  — the existing `router.test.tsx` heading check is **insufficient** (placeholder shares the heading,
  Codex §3/§5). A **loaded-state** axe test (data mocked, awaited) passes; the existing skeleton-state
  axe loop stays clean. *T20,T21.*

---

## §3 Change Contract — F1..F30

CREATE unless noted. Feature folder `web/src/features/pipeline/`.

| ID | Path | Action | Exports / anchor | Purpose |
|----|------|--------|------------------|---------|
| F1 | `…/types.ts` | CREATE | `PipelineStatus` (discriminated: `EnabledStatus\|DisabledStatus`), `Conservation`, `DlqItem`(raw:`unknown`), `DlqResponse`, `IngestSample`, `LatencyResult`, `LatencySummary`, `ConnectionKind`, `RangeResponse`,`RangeReading` | typed contracts mirroring verified JSON |
| F2 | `…/pipeline.config.ts` | CREATE | `PIPELINE_CONFIG` (statusPollMs, rateWindowSamples, probeEndpoints:readonly[], probeCallsPerRound, probeRoundMs, latencyBudgetMs=500, dlqPageSize, rangeAsset, rangeMinutes) | the config file; stable module constant (Codex §4 identity) |
| F3 | `…/pipelineClient.ts` | CREATE | `fetchPipelineStatus`,`fetchDlq(limit,offset,signal)`,`fetchRange(asset,minutes,signal)`, `probeLatency(path,{now,fetchImpl,signal})`; pure: `computeIngestRate`,`latencySummary`,`connectionKind`,`conservationHolds`,`toCsv`,`buildChartPath` | HTTP seams + pure reducers/geometry |
| F4 | `…/usePipelineStatus.ts` | CREATE | `usePipelineStatus()` → `{status,samples,error,stale,lastAt}` | status polling + rolling ingest samples (owns status channel) |
| F5 | `…/useDlq.ts` | CREATE | `useDlq()` → `{page,total,loading,error,stale,setOffset,reload}` | DLQ load/paginate/refresh/abort/partial-fail (Codex §1) |
| F6 | `…/useLatencyProbe.ts` | CREATE | `useLatencyProbe()` → `{results,summaries,lastAt}` | probe loop; **sole** probe owner |
| F7 | `…/useRange.ts` | CREATE | `useRange()` → `{data,loading,error}` | item 1.4 range fetch |
| F8 | `…/ConnectionPill.tsx` | CREATE | `<ConnectionPill>` | R1/R2 |
| F9 | `…/IngestRateChart.tsx` | CREATE | `<IngestRateChart>` | R3 (uses `buildChartPath`) |
| F10 | `…/ResponseTimeTable.tsx` | CREATE | `<ResponseTimeTable>` | R4 (derives verdict from `LatencyResult[]`) |
| F11 | `…/DlqTable.tsx` | CREATE | `<DlqTable>` | R5/R6 |
| F12 | `…/LineageDiagram.tsx` | CREATE | `<LineageDiagram>` | R7 |
| F13 | `…/RetrievalEvidence.tsx` | CREATE | `<RetrievalEvidence>` | R8 |
| F14 | `…/KpiRow.tsx` | CREATE | `<KpiRow>` | R9 |
| F15 | `web/src/screens/PipelineMonitorScreen.tsx` | CREATE | `<PipelineMonitorScreen>` | composes F8–F14; owns R10 states + R11 badges + `<h1>` |
| F16 | `web/src/lib/format.ts` | MODIFY | add `formatDecimal(value,digits)` (missing-vs-zero rule) | decimals for ms / msg/s |
| F17 | `web/src/components/ui/num.tsx` | MODIFY | add `NumKind "decimal"` (+digits) using F16 | keep the tabular-nums invariant (Codex §1 num gap) |
| F18 | `web/src/routes/nav.ts` | MODIFY | pipeline item `built:false`→`true` | wiring flip |
| F19 | `web/src/routes/routes.tsx` | MODIFY | `SCREENS` map add `pipeline: PipelineMonitorScreen` | route registration |
| F20 | `…/pipelineClient.test.ts` | CREATE (Claude) | T1–T9 | pure reducers + probe |
| F21 | `…/usePipelineStatus.test.tsx` | CREATE (Claude) | T11 (subset), StrictMode | polling/generation |
| F22 | `…/useDlq.test.tsx` | CREATE (Claude) | T13 (hook part) | dlq lifecycle |
| F23 | `…/useLatencyProbe.test.tsx` | CREATE (Claude) | T12 (hook part), concurrency | probe scheduling |
| F24 | `…/ConnectionPill.test.tsx` | CREATE (Claude) | T10 | |
| F25 | `…/IngestRateChart.test.tsx` | CREATE (Claude) | T11 | single axis + geometry |
| F26 | `…/ResponseTimeTable.test.tsx` | CREATE (Claude) | T12 | verdict derivation |
| F27 | `…/DlqTable.test.tsx` | CREATE (Claude) | T13,T14 | rows/empty/paginate/export |
| F28 | `…/LineageDiagram.test.tsx` | CREATE (Claude) | T15 | |
| F29 | `…/{KpiRow,RetrievalEvidence,PipelineMonitorScreen}.test.tsx` | CREATE (Claude) | T16,T17,T18,T19,T21 | incl. loaded-state axe |
| F30 | `web/src/routes/router.test.tsx`, `web/src/components/ui/primitives.test.tsx` | MODIFY (Claude) | add T20 real-screen case; extend Num `decimal` case | wiring + num |

---

## §4 Function Contracts — FN1..FN9 (load-bearing; in F3 unless noted)

```
FN1  computeIngestRate(prev: IngestSample | null, curr: IngestSample) -> number | null
     IngestSample = { received: number; runId: string; t: number /* performance.now() ms */ }
     Post: null when prev==null OR prev.runId!==curr.runId (process restart — cross-run delta is
           meaningless) OR (curr.t-prev.t)<=0 OR curr.received<prev.received (defensive). Else
           (curr.received-prev.received)/((curr.t-prev.t)/1000) >= 0. Pure; ≤50 lines.

FN2  latencySummary(results: LatencyResult[]) -> LatencySummary
     LatencyResult = { path:string; roundTripMs:number; dbMs:number|null; ok:boolean; status:number }
     LatencySummary = { path:string; meanMs:number; count:number; failures:number;
                        dbMs:number|null; underBudget:boolean }
     Post: mean over ok results ONLY; count=#ok; failures=#(!ok). dbMs = latest ok dbMs (null if none).
           underBudget = count>0 && meanMs <= PIPELINE_CONFIG.latencyBudgetMs (500, INCLUSIVE — R4).
           No ok results -> {meanMs:0,count:0,underBudget:false} (unknown != under). Pure.

FN3  connectionKind(state: string) -> ConnectionKind   // 'ok'|'pending'|'down'|'disabled'|'unknown'
     Post: connected->ok; connecting|subscribing->pending; disconnected->down; disabled->disabled;
           else unknown. Total; never throws. Visual layer maps kind->{icon,ThaiLabel,statusToken},
           distinct per kind (never colour-alone).

FN4  conservationHolds(c: Pick<Conservation,'ledger'|'telemetry'|'dead_letter'>) -> boolean
     Post: c.ledger === c.telemetry + c.dead_letter. Recomputed client-side (proves, not trusts). Pure.

FN5  probeLatency(path, { now: ()=>number, fetchImpl?: typeof fetch, signal?: AbortSignal })
       -> Promise<LatencyResult>
     Does: t0=now(); await fetchImpl(apiUrl(path),{signal}); CONSUME body (await res.text()); t1=now().
     Post: { path, roundTripMs: t1-t0 (>=0), dbMs: parsed from Server-Timing 'db' metric (multi-entry
           header split on ',', match name 'db', read ;dur=; null if absent), ok: res.ok, status:
           res.status }. A non-2xx -> ok:false (roundTripMs still measured). A transport throw ->
           {ok:false,status:0,roundTripMs:t1-t0,dbMs:null} — NEVER throws EXCEPT re-raise AbortError
           (cancellation must stay distinguishable). Uses fetch DIRECTLY, not getJson (getJson discards
           status/headers and throws — Codex §1/§5). now/fetchImpl injected for deterministic tests.

FN6  toCsv(rows: DlqItem[]) -> string
     Post: header 'message_id,run_id,asset_id,reason,raw' + one line/row. `raw` serialised
           JSON.stringify with SORTED keys (deterministic). Every field CSV-escaped (wrap in "" and
           double internal "). Formula-injection guard: a field starting with = + - @ is prefixed
           with a single quote. Null asset_id/run_id -> empty field. [] -> header only. Pure.

FN7  buildChartPath(samples: number[], dims: { w:number; h:number; pad:number })
       -> { d: string; axis: { x:number; y0:number; y1:number }; max:number }
     Does: map samples to an SVG polyline `d`, y scaled to [0,max] (max = Math.max(...samples,1)),
           x evenly spaced; ONE y-axis only. Post: d has exactly samples.length vertices; deterministic
           for a fixture (T11 asserts exact coordinates — kills the vacuous "a path exists" oracle).
           [] -> { d:'', ... } and the component renders the empty state. Pure; ≤50 lines.

FN8  usePipelineStatus() -> { status, samples, error, stale, lastAt }        // File F4
     Does: schedule with RECURSIVE setTimeout (next round only AFTER the previous resolves — no
           setInterval overlap, Codex §4), one in-flight, AbortController per round, generation-owned
           (mirror useTwinSocket.ts:99/174) so a StrictMode double-mount's late result cannot setState.
     Post: on each ok poll append an IngestSample (cap rateWindowSamples); on failure set stale=true
           and KEEP last status (never blanks). Cleanup aborts in-flight and invalidates the generation.

FN9  useLatencyProbe() -> { results, summaries, lastAt }                     // File F6
     Does: each round probe PIPELINE_CONFIG.probeEndpoints × probeCallsPerRound SEQUENTIALLY (not
           concurrently — concurrent probes bias the very latency measured, Codex §4); schedule next
           round after completion; generation-owned; endpoints from the stable config constant.
     Post: summaries = per-endpoint latencySummary(results). Sole owner of the probe loop (Codex §4).
```

`useDlq` (F5) / `useRange` (F7): load on mount + on demand; AbortController; on failure set
`stale/error` and keep last page; pagination via `setOffset` (limit/offset passed through). DLQ total
displayed comes from `conservation.dead_letter` (status), not `dlq.count` (page length).

---

## §5 Test Plan — T1..T21 (RED-proof mandatory; fetch injected at the `fetchImpl`/`getJson` seam)

```
T1  connectionKind maps all 5 states     Covers R1  unit
    Assert: connected→ok, connecting→pending, subscribing→pending, disconnected→down,
            disabled→disabled, 'zzz'→unknown.
    RED: FN3 absent→ImportError; a map missing 'subscribing' or collapsing 'disabled'→AssertionError.

T2  ingest rate: delta, first, dt        Covers R3  unit
    Assert: prev{received:100,runId:'a',t:1000}/curr{110,'a',2000}→10; prev null→null;
            dt<=0→null; a SECOND pair {110→170 over 3s}→20 (proves derivation, not constant 10).
    RED: constant impl→fails the 20 case; absent→ImportError.

T3  ingest rate: run-id reset            Covers R3  unit
    Assert: prev{received:900,runId:'a'}/curr{received:12,runId:'b'}→null (new process, NOT negative);
            same run smaller value {900→12,runId:'a'}→null (defensive), never negative.
    RED: a counter-only impl ignoring runId→returns a negative/garbage rate→AssertionError. (Kills the
         original per-process bug Codex flagged CRITICAL.)

T4  latencySummary mean, budget, boundary Covers R4  unit
    Assert: [100,200,600 ok]→mean 300 (median would be 200 — distinguishes); underBudget true;
            exactly [500 ok]→underBudget TRUE (≤ inclusive); [600,700 ok]→false; []→{0,0,false}.
    RED: a median impl→300≠200 AssertionError; a `<500` impl→fails the exactly-500 case.

T5  latencySummary excludes failures      Covers R4  unit
    Assert: [{200,ok},{5,ok:false status 404}] → mean 200 (the fast 404 NOT counted), failures 1,
            underBudget true. All-failed → count 0, underBudget false.
    RED: an impl averaging all results→(200+5)/2=102.5 AssertionError; proves fast-error exclusion.

T6  probeLatency measures + never throws  Covers R4  unit (injected now+fetch)
    Assert: fetchImpl→200 w/ 'Server-Timing: cache;dur=2, db;dur=1.36'; now ticks 0→12 →
            {roundTripMs:12, dbMs:1.36, ok:true, status:200}; the requested URL == apiUrl(path).
            A 500 response→ok:false,status:500,roundTripMs measured. A rejecting fetchImpl→ok:false,
            status:0, no throw. An AbortError→RE-THROWN.
    RED: no-timing impl→roundTripMs 0; getJson-based impl→throws on 500 (no LatencyResult); a
         single-entry header parse→dbMs null on the multi-entry header→AssertionError.

T7  toCsv escapes + formula-guard + object raw  Covers R6  unit
    Assert: a DlqItem{raw:{msg:'x',n:1}, reason:'a,b"c\n', asset_id:null} → raw column is
            deterministic JSON (sorted keys), reason wrapped+escaped, asset_id empty; a reason
            '=cmd()'→prefixed with '. []→header only.
    RED: naive join(',')→column count breaks; JSON.stringify w/o sorted keys→nondeterministic
         AssertionError; no formula guard→'=cmd()' unprefixed→AssertionError.

T8  conservationHolds                     Covers R7  unit
    Assert: {5,5,0}→true; {5,4,0}→false. Fixture uses Pick (no `holds`) → compiles.
    RED: `return true` stub→fails false case; a type needing `holds`→typecheck failure (Codex §2 FN4).

T9  buildChartPath geometry               Covers R3  unit
    Assert: samples [0,5,10], dims{w:100,h:50,pad:5} → d has 3 vertices at EXACT computed coords
            (x:5,50,95; y mapped so 10→top, 0→bottom); axis present once; []→d:''.
    RED: a hardcoded 5-point path→vertex count/coords AssertionError; two-axis geometry→axis!=1.

T10 ConnectionPill icon+label+reconnect   Covers R1,R2 component
    Assert: status connected,connected_count:2,disconnect_count:1,last_error:null → renders ok
            icon(data-icon) + distinct Thai label + the two counts; re-render disconnected,
            last_error:'x',disconnect_count:2 → DISTINCT icon+label + shows last_error + count 2;
            disabled → 'ปิดการรับข้อมูล' distinct. (No colour-only; counts not hardcoded — they change.)
    RED: colour-only pill→label/icon query fails; identical icon→distinctness fails; hardcoded 2/1→
         second render still shows 1→AssertionError.

T11 IngestRateChart single-axis + derived Covers R3 component
    Assert: exactly one <svg>; exactly ONE element[data-testid='y-axis'] (count==1); the <polyline>
            `points` equals buildChartPath(fixture).d vertices; empty samples→explicit empty state;
            SimulatedBadge present in the card header.
    RED: two-axis→count 2; a static path→points≠computed; before F9→import error.

T12 ResponseTimeTable derives verdict     Covers R4 component
    Arrange: raw LatencyResult[] (NOT precomputed summaries): one endpoint 3 ok calls ~3ms, one 2 ok
             calls ~640ms, one all-failed.  Assert: a row per endpoint; the fast row shows an
             under-budget marker (text+icon) + dbMs; the slow row a DISTINCT over-budget marker; the
             failed row shows failures, not "under budget"; the 500ms threshold is shown as text.
    RED: passing precomputed underBudget→doesn't prove derivation; colour-only marker→text query fails;
         an impl calling a failed row "under budget"→AssertionError.

T13 DlqTable rows/empty/paginate          Covers R5 component
    Arrange: page {count:2,offset:0,items:[{asset_id:'BOGUS',reason:'unknown asset_id',raw:{a:1}},
             {asset_id:null,reason:'malformed',raw:{value:'…50+ chars…'}}]}, total (from conservation)
             = 58.  Assert: 2 rows w/ asset_id (null shows '—'), reason, TRUNCATED serialised raw; total
             58 shown; a next-page control present (total>page); then {count:0,items:[]}→explicit empty
             state (not spinner, not silent zero); SimulatedBadge in a <th>.
    RED: raw rendered as [object Object]→AssertionError; no truncation (full 50+ chars)→AssertionError;
         empty→nothing→empty-state text query fails.

T14 DlqTable export CSV                    Covers R6 component
    Arrange: shim URL.createObjectURL/revokeObjectURL + Blob.text in the test; spy anchor click.
    Assert: click Export → a text/csv Blob whose text starts with the header and contains 'BOGUS' and
            the serialised raw; download filename set; revokeObjectURL called; NO fetch issued.
    RED: no handler→createObjectURL never called; missing shim caught in the test itself (not a
         harness death — Codex §3 T11).

T15 LineageDiagram nodes+edge+holds        Covers R7 component
    Arrange: conservation {1935,1935,0} then {1935,1930,0}.  Assert: four stage labels + a DLQ branch
             SVG edge (line/path element, not just a label); the three counts rendered; holds ✓ for the
             first, ✗ for the second (recomputed).  RED: static diagram (no counts)→query fails;
             hardcoded ✓→fails the ✗ case; label-only DLQ (no edge element)→edge query fails.

T16 RetrievalEvidence ordered readings     Covers R8 component
    Arrange: range {count:3, readings:[t,t+1,t+2 shuffled in the mock response]}.  Assert: renders 3
             rows in ASCENDING ts order (component/where backend already orders — assert order held),
             the count, and a SimulatedBadge.  RED: an impl reversing/ignoring order→AssertionError;
             count omitted→fails.

T17 KpiRow derived + scope-labelled        Covers R9,R11 component
    Assert: inputs (rate≈10 session, mean≈3ms, telemetry 1935 all-runs, dead_letter 58 all-runs) →
            each tile shows the DERIVED value; re-render w/ different inputs changes EVERY tile; the
            session tiles carry a 'เซสชันนี้' scope label and the all-runs tiles a 'สะสมทุกรอบ' label;
            SimulatedBadge on the tiles.  RED: a hardcoded tile→2nd render unchanged→AssertionError;
            missing scope label→query fails (Codex §4 mixed-scope).

T18 Screen loading + error, heading always Covers R10,R12 component
    Assert: before first resolve → skeleton AND the <h1> 'คุณภาพข้อมูล' present; a rejected status
            fetch → an Alert (3-part) AND the <h1> still present (page not blanked, no unhandled
            rejection). Footer discloses simulated feed.
    RED: a screen that needs a successful fetch to show its heading→heading query fails in error state
         (this is exactly what the existing router/a11y suites will hit — Codex §3 T16/T17).

T19 Screen offline keeps last + timestamp  Covers R10 component (fake timers + deferred promises)
    Assert: first poll ok (values shown, lastAt rendered); later polls reject → last values remain,
            dimmed, with a 'ข้อมูลไม่เป็นปัจจุบัน' marker AND the timestamp of the shown data
            (INTERACTIONS.md:31); never blanked.  RED: a screen clearing on failure→prior value gone.

T20 Router renders the REAL screen         Covers R12 component (MODIFY router.test.tsx)
    Assert: at /pipeline, an element unique to PipelineMonitorScreen (data-testid='pipeline-monitor')
            is present AND the placeholder sentence 'หน้าจอนี้ยังไม่ได้พัฒนา' is ABSENT.
    RED: built:true but SCREENS.pipeline missing → placeholder still renders (shares the heading) →
         the testid is absent / placeholder text present → AssertionError. (Fixes Codex CRITICAL:
         the labelLabelTh heading check alone is vacuous.)

T21 Loaded-state axe clean                 Covers R12 component (in F29, data mocked + awaited)
    Assert: mount PipelineMonitorScreen with fetch mocked to resolve; await the loaded table/SVG/export;
            axe.run(document) (color-contrast disabled per jsdom) → 0 violations.
    RED: a <table> without <th scope>/an icon-only export without a label → axe violation. (Fixes Codex
         CRITICAL: the existing a11y loop only audits the skeleton.)
```

Existing suites that MUST stay green with the built screen (no edit needed beyond T20): `a11y.test.tsx`
skeleton loop over `/pipeline` (skeleton must be axe-clean AND not throw on the unmocked failed fetch);
`router.test.tsx` T4 heading/`current`-link over all paths.

---

## §6 Traceability Matrix

| Req | Tests | Files |
|-----|-------|-------|
| R1 | T1,T10 | F3,F8 |
| R2 | T10 | F8 |
| R3 | T2,T3,T9,T11 | F3,F9 |
| R4 | T4,T5,T6,T12 | F3,F6,F10 |
| R5 | T13 | F5,F11 |
| R6 | T7,T14 | F3,F11 |
| R7 | T8,T15 | F3,F12 |
| R8 | T16 | F7,F13 |
| R9 | T17 | F14 |
| R10 | T18,T19 | F4,F15 |
| R11 | T17,T18 | F14,F15 |
| R12 | T20,T21 | F15,F18,F19,F30 |

Every R ≥1 T; every T ≥1 R (T1–T21 above).

---

## §7 Wiring Verification

| New unit | Runtime caller | Registration | Data source |
|---|---|---|---|
| `PipelineMonitorScreen` (F15) | route `/pipeline` | `SCREENS.pipeline` (F19) + `built:true` (F18) | — |
| `usePipelineStatus` (F4) | F15 | import in F15 | `GET /api/pipeline/status` |
| `useDlq` (F5) | F15→`DlqTable` | import in F15 | `GET /api/dlq?limit&offset` |
| `useLatencyProbe` (F6) | F15→`ResponseTimeTable` | import in F15 (SOLE owner) | `GET` probeEndpoints |
| `useRange` (F7) | F15→`RetrievalEvidence` | import in F15 | `GET /api/telemetry/{asset}/range` |
| `ConnectionPill/IngestRateChart/ResponseTimeTable/DlqTable/LineageDiagram/RetrievalEvidence/KpiRow` (F8–F14) | F15 | import in F15 (props) | via hooks/F3 |
| `pipelineClient` fns (F3) | F4–F7,F15,tests | import where used | `fetch(apiUrl())` / `getJson` |
| `pipeline.config.ts` (F2) | F3–F7 | import (stable const) | — |
| `formatDecimal` (F16) / `Num decimal` (F17) | F10,F14 | import | — |

Every §3 CREATE component has a runtime caller — no orphans (CLAUDE.md:42). F18/F19 are the two-line
flip that turns the placeholder into the real screen (same mechanism PR-7 used for `operations`).

---

## §8 Slice Plan

One PR (PR-8). **S0 is a P0 pre-req**, then three internal slices by oracle strength.

| ID | Scope | Owner | Stop line | Oracle | Done when |
|----|-------|-------|-----------|--------|-----------|
| **S0** | repair host gate (`pnpm install --frozen-lockfile`); confirm `pnpm lint/typecheck/test/build` green on baseline | **Claude** | — | 4 gates green | lint no longer errors on jsx-a11y |
| **S1** | F1,F2,F3,F16 + T1–T9 | DeepSeek | SL-2 (Q2: new module of pure logic + fetch seam; strong unit oracles) | T1–T9 green | reducers/probe/geometry/config typed & unit-green |
| **S2** | F4–F7 (hooks) + F21,F22,F23 | DeepSeek | SL-3 (Q1: StrictMode/generation/abort/scheduler concurrency is the hard part — Claude seeds the generation-ownership pattern from useTwinSocket) | hook tests + StrictMode | hooks own their channels, no overlap/leak |
| **S3** | F8–F15,F17,F18,F19 + T10–T21,F30 | DeepSeek | SL-1 (Q3: single-surface UI pinned by S1/S2 contracts + verified API; Claude authors ALL component tests, the honesty R11 decision, the chart/lineage geometry seams) | T10–T21 + axe + router + build | screen live, 5 states, wired, gates green |

**Claude owns (never delegated):** all acceptance tests T1–T21; the R11 honesty decision (per-card
badge vs footer); the `buildChartPath` one-axis geometry + lineage/conservation semantics; `Num`
extension (F17) + its test (F30); every git/gh action; the 2-tier QCHECK. DeepSeek writes
component/reducer/hook bodies against Claude's tests. Land order S0→S1→S2→S3, one PR.

---

## §9 Risks, Rollout, Rollback

| Risk | Trigger | Blast radius | Gate / rollback |
|---|---|---|---|
| Host gate stays red | jsx-a11y still missing | can't RED-prove | S0 `pnpm install`; verify all 4 gates before S1 |
| Two-y-axis / rainbow chart | dual axis reach | dataviz rule | T11 asserts one y-axis; **load `dataviz` skill before F9**; review |
| Vacuous latency/chart test | precomputed inputs | AI-theatre pass | T4 median-trap, T9 exact coords, T12 raw-results, T20 real-screen, T21 loaded-axe |
| Per-process rate mislabelled | `received` resets | R3/R9 correctness | FN1 run-id keyed (T3); KPI scope labels (T17) |
| getJson misused for latency | throws/discards headers | R4 | FN5 direct `fetch(apiUrl)`; T6 |
| `raw` treated as string | it's an object | R5/R6 | FN6 object serialisation; T7,T13 |
| Scheduler overlap / probe bias | setInterval(async) | latency integrity | recursive setTimeout, sequential probes, one-in-flight (FN8/FN9); T12/T23-concurrency |
| StrictMode late setState / leak | double-mount | React warnings/flake | generation ownership + abort (mirror useTwinSocket); T21-strict |
| Screen blanks/throws on poll fail | error uncaught | breaks existing router+a11y suites | R10; T18 heading-always; T19 keep-last |
| Over-claiming 1.2/1.3 | scope drift | credibility | §1 scope-honesty; demo-coverage updates to cite PR-17 for timing/DevTools |
| Honesty: unlabelled simulated feed | footer cropped | misrepresentation | R11 per-card SimulatedBadge + latency caption (Codex §6) |

Lands behind its own route; reachable only once `built:true`. Rollback = revert F18.

---

## §10 Do-Not-Touch List

Implementer (DeepSeek) must NOT modify:
- Any acceptance-test file (F20–F29) and the F30 MODIFYs — **Claude authors all tests**.
- `api/**` (backend contract fixed + verified).
- `web/src/api/client.ts`, `web/src/config/app.config.ts`, `web/src/features/twin/**`,
  `web/src/components/ui/**` **except `num.tsx` (F17, Claude-owned)**, `web/src/components/StatusChip.tsx`,
  `web/src/components/SimulatedBadge.tsx` (reuse only).
- `design/**`, `data/**`, `POC_SPEC.md`, `docs/DREP-*.md`, `CLAUDE.md`, `.codex/coding-log.current`,
  `pnpm-lock.yaml`, `web/eslint.config.js`, `web/vite.config.ts`.
- The two Dockerfiles modified this session (pip resilience) — leave as-is; they ride PR-8.

---

## §11 Codex Adversarial Pass — dispositions (2026-07-30, gpt-5.6-sol xhigh)

Verdict was "not delegation-ready"; **all findings accepted**, plan revised above. Full output:
`scratchpad/codex-plan-attack.md`.

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | CRIT | item 1.4 range-retrieval UI missing | **ACCEPT** → R8, F7,F13,T16 |
| 2 | CRIT | test files absent from change contract | **ACCEPT** → F20–F30 explicit |
| 3 | HIGH | no `useDlq` lifecycle owner | **ACCEPT** → F5 |
| 4 | HIGH | missing `LatencySummary`/aggregation | **ACCEPT** → FN2, F1 |
| 5 | HIGH | `ui/table.tsx` doesn't exist | **ACCEPT** → semantic HTML `<table>` w/ `<th scope>` (no new primitive) |
| 6 | MED | `<Num>` lacks decimals; num.tsx do-not-touch | **ACCEPT** → F16 `formatDecimal` + F17 extend `Num` (Claude-owned) |
| 7 | HIGH | FN5 "over getJson" impossible | **ACCEPT** → FN5 direct `fetch(apiUrl)` |
| 8 | CRIT | FN1 reset wrong — `received` per-process | **ACCEPT** → FN1 run-id keyed; T3 |
| 9 | CRIT | FN2 `<500` vs `≤500`; fast-404 under budget | **ACCEPT** → FN2 inclusive, ok-only; T4,T5 |
| 10 | MED | FN3 `disabled` distinct | **ACCEPT** → 5-way `connectionKind`; discriminated status |
| 11 | MED | FN4 `holds` typecheck | **ACCEPT** → `Pick<>`; T8 |
| 12 | CRIT | FN5 header/status/abort underspecified | **ACCEPT** → full FN5 contract; T6 |
| 13 | HIGH | FN6 `raw` is object; formula-injection | **ACCEPT** → FN6; T7 |
| 14 | CRIT | T3 median passes; no 500 boundary | **ACCEPT** → T4 median-trap + inclusive-500 |
| 15 | CRIT | T6/T10 string raw; no truncation | **ACCEPT** → T7,T13 object raw + truncation |
| 16 | CRIT | T16 vacuous — placeholder shares heading | **ACCEPT** → T20 asserts real screen (testid) + placeholder absent |
| 17 | CRIT | T17 axe audits skeleton not loaded | **ACCEPT** → T21 loaded-state axe (mocked+awaited) |
| 18 | CRIT | two unsynchronised schedulers | **ACCEPT** → recursive setTimeout, one-in-flight, sequential probes |
| 19 | CRIT | mixed counter scopes (session vs all-runs) | **ACCEPT** → KPI scope labels; DLQ total from conservation; T17 |
| 20 | HIGH | StrictMode cleanup insufficient | **ACCEPT** → generation ownership + abort; StrictMode tests |
| 21 | HIGH | out-of-order responses look like resets | **ACCEPT** → AbortController + generation checks |
| 22 | HIGH | endpoint-array identity restarts effect | **ACCEPT** → endpoints from stable `PIPELINE_CONFIG` |
| 23 | HIGH | **host lint broken** (jsx-a11y absent) | **ACCEPT** → S0 `pnpm install` pre-req |
| 24 | — | `--secondary` is a doc name | **ACCEPT** → `stroke-secondary` / `var(--color-secondary)` |
| 25 | — | 5 INTERACTIONS states incl overflow | **ACCEPT** → R10 five states + DLQ pagination |
| 26 | HIGH | over-claims 1.2 timing / 1.3 DevTools | **ACCEPT** → §1 scope-honesty; PR-17 owns timing/DevTools |
| 27 | HIGH | honesty: footer-only too weak | **ACCEPT** → R11 per-card SimulatedBadge + latency caption |

### Net
Codex converted a plan that would have gone green while vacuous (a median latency impl passing, the
router/axe tests passing with the screen unwired, a per-process counter mislabelled as a reset, `raw`
mis-typed) into one whose oracles bite. The single most valuable catch: **the wiring + axe tests were
both vacuous** — `built:true` alone passes the existing suites — so T20/T21 now assert the *real*
screen and its *loaded* accessibility. Item 1.4 evidence, absent entirely, is restored.
