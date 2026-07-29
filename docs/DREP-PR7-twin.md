# DREP — PR-7 · Operations / SCADA digital twin (slice S4)

Baseline `origin/main` @ `cf55a81`. Scored items **2.1–2.5, 35 of 100 points** — the largest
unclaimed block, and the only topic with nothing on screen.

Adversarial pass: Codex `gpt-5.6-sol` @ `xhigh`, read-only over the real repo.

> ## The finding that reshaped this plan
>
> My first draft scoped PR-7 as "build the SVG screen". That is wrong, and the review made
> it plain: **the fatal gap is not the SVG, it is a missing runtime identity chain** —
> `telemetry asset → topology node/pipe → WS event → impact query → rendered pipe`.
> Three links of that chain do not exist, verified in the code:
>
> 1. **Devices cannot be located on the schematic.** The roster names the demo pump `P-2`
>    (`simulator/app/roster.py:40`) while the topology seeds the node `P2`
>    (`scripts/seed_db.py:59-65`). No join returns anything. There is also no coordinate
>    anywhere — neither `device` nor `pipe_edge` carries geometry — so **item 2.1 has no
>    ground truth to render**.
> 2. **Ingest cannot report an anomaly.** `_emit_twin_event` (`api/app/service.py:159-178`)
>    hardcodes `status="normal"` and discards `signal` and `value`. A pump going critical
>    is invisible to the twin, so **items 2.2 and 2.3 cannot fire**.
> 3. **A pressure drop cannot identify a pipe.** `TwinEvent` (`api/app/models.py:64-77`)
>    has no `pipe_id` and no pressure kind, and the simulator has no `pressure_drop` fault
>    mode (`simulator/app/models.py:20-26`), so **item 2.4 has no trigger and no subject**.
>
> Additionally `TwinHub._offer` (`api/app/ws.py:61-73`) coalesces by `asset_id` alone, so a
> routine `normal` frame from ingest can replace a pending `critical` from scoring — the
> pump would flash red and immediately revert.
>
> Building the screen first would produce a convincing picture wired to nothing. Under a
> judge's questioning that is worse than no screen.

## Consequence: PR-7 splits into three landable PRs

The original PR-PLAN treats PR-7 as one screen. The review shows it is three layers, and
each lower one must be real before the next can be correct.

| PR | Scope | Why it is a real boundary | Items |
|---|---|---|---|
| **PR-7a — the data chain** (**this DREP; landing now**) | migration `006`, identity + geometry seed, and the three read routes: `/api/twin/topology`, `/api/twin/sec/{asset_id}`, `/api/twin/impact/{pipe_id}` | Independently testable against a real TimescaleDB and independently **demonstrable in Swagger**: a judge can ask "who loses water if this pipe fails?" and get the real five customers. It gives item 2.1 the ground truth it had none of, and closes 2.3's and 2.4's *query* halves. | 2.1 (data), 2.3, 2.4 (query) |
| **PR-7b — the event chain** | `TwinEvent` widening (`pipe_id`, pressure kind), `_emit_twin_event` publishing the reading's real status/signal/value, severity-aware `TwinHub` coalescing, simulator `FAULT_MODE=pressure_drop`, compose/env advertisement | Every one of these changes *live ingest behaviour* and must be regression-tested against the conservation, DLQ and latency suites that PR-2/PR-3 own. Bundling them with a schema change would make a bisect meaningless. | 2.2, 2.3 (trigger), 2.4 (trigger) |
| **PR-7c — the SVG screen** | `ProcessSchematic`, `DeviceSymbol`, `ImpactPanel`, `SecTooltip`, `useTwinSocket`, the screen, `built: true` | Consumes 7a's shapes and 7b's frames. Planning a UI against a contract that does not exist yet is precisely what produced this DREP's first draft. | 2.1 (render), 2.5 (structure) |

**Nothing is dropped — the split is about landing order, not scope.** What would have been
lost by building the screen first is the ability to tell a judge *why* the number on screen
is true.

**This document plans PR-7a.** §2–§10 below cover all three where the requirement is shared;
the requirement table marks which PR owns each.

---

## §0 Repo Profile

As `docs/DREP-PR6-foundation.md` §0, with:

| Field | Value |
|---|---|
| Migration policy | 001–005 taken → **this PR adds `006_twin_topology.sql`**. `scripts/migrate.py` skips already-applied filenames, so existing volumes are upgraded rather than rebuilt. |
| Backend gates | `cd api && pytest` · `ruff check .` · `mypy .` (strict) |
| New dependency | `pytest-timeout` (pinned) — a non-terminating graph traversal must **fail** the suite, not hang it. |
| Coding log | `.codex/coding-log.current` ✅ |

**MUST NOT (unchanged, and load-bearing):** every telemetry value is SIMULATED and carries a
marker · no hardcoded telemetry · **DLQ, not crash** · never block the ingest loop.

---

## §1 Goal / Non-Goals

**Goal.** Build the runtime chain the twin needs: every device has a topology node and
render geometry; ingest publishes the *actual* status, signal and value of an accepted
reading; a pressure drop is a first-class, injectable scenario that names the pipe it
affects; and three read routes expose topology, Specific Energy Consumption, and the
customers downstream of a pipe.

**Non-Goals.** The SVG screen and every component (PR-7b). Browser-measured proof (PR-17).
GIS accuracy — this is a process schematic. Any change to the DLQ, latency or conservation
behaviour of PR-2/PR-3.

---

## §2 Requirements — R1..R10

| ID | Requirement | Item |
|---|---|---|
| **R1** | `006_twin_topology.sql` adds `device.node`, `device.x`, `device.y`; `pipe_edge.x1,y1,x2,y2`; an index on `pipe_edge(from_node)` and on `customer_service_point(node)`; and a `(asset_id, signal, ts DESC)` index on `telemetry`. Forward-applies on an existing volume. | 2.1, 2.4 |
| **R2** | The seed gives every demo device a node that **exists in `pipe_edge`**, resolving the `P-2`/`P2` mismatch, and gives every node and pipe coordinates. A test asserts the join is non-empty for every named device — the defect that made this PR necessary. | 2.1 |
| **R3** | `GET /api/twin/topology` returns nodes, pipes and devices with geometry and current status, all from the database. | 2.1 |
| **R4** | `_emit_twin_event` publishes the reading's **real** `signal`, `value` and `observed_at`, and a status derived from the signal's own band — never a hardcoded `normal`. | 2.2, 2.3 |
| **R5** | `TwinHub` coalescing is **severity-aware**: a pending `critical`/`warning` frame is never replaced by a `normal` one for the same asset. | 2.2 |
| **R6** | `TwinEvent` gains `pipe_id` and a `pressure_drop` kind, additively — `event_version` stays 1 only if every existing field keeps its meaning; otherwise it becomes 2 and the change is recorded. | 2.4 |
| **R7** | The simulator gains `FAULT_MODE=pressure_drop`, which drives `pressure_bar` **below** its band on a named asset (the generic anomaly mode drives signals *above* their band and cannot express this). | 2.4 |
| **R8** | `GET /api/twin/sec/{asset_id}` returns kWh/m³ from `pwa_ml.features.specific_energy_consumption`, computed from the newest `power_kw` and `flow_m3h` **with their own timestamps** and a freshness/skew guard. A known asset with no usable pair returns **200 with `sec_kwh_per_m3: null`** — not 404 — mirroring how `/api/health` reports `nodata`. 404 is reserved for an unknown asset. | 2.3 |
| **R9** | `GET /api/twin/impact/{pipe_id}` returns the customers downstream of that pipe. Traversal terminates on a cyclic topology, deduplicates customers, and is deterministically ordered. `pipe_id` is **not unique** (the PK is the 3-column tuple), so multiple origin edges are handled explicitly. | 2.4 |
| **R10** | Conservation, DLQ behaviour and the item-1.3 latency budget are unchanged: the full existing suite stays green, including the index-seek assertion, which the new per-signal query could otherwise disturb. | regression |

---

## §3 Change Contract

| ID | Path | Action | Purpose |
|----|------|--------|---------|
| F1 | `infra/db/006_twin_topology.sql` | CREATE | R1 — columns + indexes. **Claude-authored (migration = never delegate).** |
| F2 | `scripts/seed_db.py` | MODIFY `_topology`, `device_rows` | R2 — node identity + geometry |
| F3 | `api/app/models.py` | MODIFY | `TwinNode`, `TwinPipe`, `TwinDeviceView`, `TwinTopology`, `ImpactResponse`, `SecResponse`; widen `TwinEvent` |
| F4 | `api/app/topology.py` | CREATE | `load_topology`, `downstream_customers` (BFS + visited set) |
| F5 | `api/app/db.py` | MODIFY | `latest_signal_pair` — per-signal newest, each with its own ts |
| F6 | `api/app/routes/twin.py` | MODIFY | the three GET routes (router already registered — verified `main.py:219-224`) |
| F7 | `api/app/service.py` | MODIFY `_emit_twin_event` | R4 — real status/signal/value |
| F8 | `api/app/ws.py` | MODIFY `_offer` | R5 — severity-aware coalescing |
| F9 | `simulator/app/models.py`, `simulator/app/publish.py` | MODIFY | R7 — `pressure_drop` mode |
| F10 | `infra/docker-compose.yml`, `infra/env.sample` | MODIFY | advertise the new FAULT_MODE |
| F11 | `api/requirements.txt` | MODIFY | pin `pytest-timeout` |

**Tests (Claude-authored):** `api/tests/test_topology.py`, `api/tests/test_twin_routes.py`,
`api/tests/test_twin_emission.py` (extend), `simulator/tests/test_pressure_drop.py`.

---

## §4 Function Contracts (the two that carry risk)

```
FN1  downstream_customers(pool, pipe_id) -> ImpactResponse
     Pre:   pipe_id may match MORE THAN ONE edge — the PK is (pipe_id, from_node, to_node).
            Every matching edge's to_node seeds the frontier.
     Post:  BFS over pipe_edge.from_node; customers are the union over all reached nodes,
            DEDUPLICATED by customer_id and sorted by customer_id; `affected_pipe_ids` is
            every edge traversed, sorted. `count == len(customers)`.
     Errors: KeyError -> 404 for a pipe_id matching no edge.
     Invariant: TERMINATES on a cycle (visited set). The seeded graph is a straight line
            (intake->P2->tank->n1->n2), so a cycle can only be tested with an explicit
            fixture — otherwise the guard ships untested and a future seed hangs a worker.
     Hand-computed oracle for the seeded data: PIPE-TANK-N1 (to_node n1) reaches {n1,n2}
            -> 5 customers; PIPE-N1-N2 (to_node n2) reaches {n2} -> 2 (72-1-00002, -00004).

FN2  latest_signal_pair(pool, asset_id) -> SignalPair
     Post:  (power_kw, power_observed_at, flow_m3h, flow_observed_at). Telemetry stores ONE
            SIGNAL PER ROW and the simulator cycles signals, so the two readings normally
            have DIFFERENT timestamps — a single `as_of` cannot describe both, and pretending
            otherwise computes SEC from unrelated snapshots.
     Post:  `skew_s` = |power_observed_at - flow_observed_at|. The route returns sec=null
            with a `detail` when skew exceeds TWIN_MAX_PAIR_SKEW_S or either side is older
            than MAX_STALENESS_S — a confident number from mismatched snapshots is worse
            than an em dash.
     Perf:  needs the (asset_id, signal, ts DESC) index from F1; the existing
            (asset_id, ts DESC) index does NOT give ordered latest-per-signal. An EXPLAIN
            test pins the new query shape, because `test_latency`'s existing assertion
            covers only LATEST_QUERY and would stay green while this one seq-scans.
```

---

## §5 Test Plan — the assertions that carry the points

```
T1 (R2)  every named demo device joins to a real topology node — the P-2/P2 defect
   Type: integration, real DB, after migrate+seed.
   Assert: for every device with a node, that node appears in pipe_edge (from_node or
           to_node); the demo pump resolves; the join is NON-EMPTY.
   RED:   fails today by construction ("P-2" != "P2").

T2 (R1)  006 forward-applies on a volume that already has 001–005
   Assert: apply 001..005, then 006; every new column and index exists; re-applying is a
           no-op. Rebuilding from scratch would not prove the upgrade path, which is the
           only path an existing demo volume takes.

T3 (R9)  downstream traversal — exact sets, and it terminates on a cycle
   Assert: PIPE-TANK-N1 -> exactly the 5 seeded customer ids; PIPE-N1-N2 -> exactly
           {72-1-00002, 72-1-00004}; unknown pipe -> 404; a DUPLICATE pipe_id across two
           edges seeds both frontiers; an explicit A->B->A fixture RETURNS (pytest-timeout
           bounds it, so a hang fails instead of stalling CI).

T4 (R8)  SEC uses each signal's own timestamp and refuses mismatched pairs
   Assert: seed power at t0 and flow at t0 -> sec == power/flow exactly;
           insert a NEWER power decoy -> the newer one is used;
           flow older than the skew budget -> 200 with sec == null AND a detail, NOT 404,
           NOT 0, NOT NaN;
           zero flow -> sec == null (the pwa_ml guard);
           unknown asset -> 404; known asset with no readings -> 200 + null.

T5 (R4)  ingest emits the READING's real status/signal/value
   Assert: publishing a pressure_bar value below band yields a TwinEvent carrying
           signal="pressure_bar", that value, an observed_at, and status != "normal".
   RED:   fails today — the emitter hardcodes status="normal" and drops signal/value.

T6 (R5)  a normal frame never replaces a pending critical for the same asset
   Assert: offer critical then normal for one asset with no drain between -> the queued
           frame is still critical. This is the flash-red-then-revert bug.

T7 (R7)  FAULT_MODE=pressure_drop drives pressure BELOW band on the named asset
   Assert: published pressure_bar < band minimum, and OTHER signals stay in band —
           the generic anomaly mode drives values ABOVE band and cannot express this.

T8 (R3)  topology route returns geometry and status from the DB, nothing hardcoded
T9 (R10) the full existing suite stays green, incl. the index-seek assertion; plus an
         EXPLAIN test pinning the NEW per-signal query to the new index.
```

Every R has ≥1 T; every T names an R. Scored coverage: 2.1→T1/T2/T8, 2.2→T5/T6,
2.3→T4/T5, 2.4→T3/T7. **Item 2.5 is explicitly NOT closed by this PR** — see §9.

---

## §6 Wiring Verification

| New | Runtime caller | Registration | Schema |
|---|---|---|---|
| `006_twin_topology.sql` | `scripts/migrate.py` | filename order | `device`, `pipe_edge`, `customer_service_point`, `telemetry` |
| `load_topology`, `downstream_customers` | F6 handlers | direct import | `pipe_edge(from_node)` idx, `customer_service_point(node)` idx |
| `latest_signal_pair` | F6 sec handler | direct import | new `(asset_id, signal, ts DESC)` idx |
| three GET routes | HTTP | **already-registered** `twin_routes.router` (`main.py:219-224`) — no new include | — |
| widened `TwinEvent` | `service.py`, `scoring.py`, `/ws/twin` | existing | — |
| `pressure_drop` mode | `simulator/app/publish.py` | `FAULT_MODE` env, advertised in compose | — |

Handlers are synchronous `def`, not `async def`: psycopg is synchronous and an `async def`
handler would block the same event loop that carries the twin socket. The predictive routes
already document this constraint.

---

## §7 Slice Plan

| ID | Scope | Owner | Stop line | Oracle |
|---|---|---|---|---|
| S4a-1 | F1 migration + F2 seed | **Claude** (Q0: migration → never delegate) | — | T1, T2 |
| S4a-2 | F3–F6 models, topology, db, routes | delegate | **SL-3** | T3, T4, T8, T9 |
| S4a-3 | F7–F11 emitter, hub, simulator, infra | delegate | **SL-3** | T5, T6, T7 |

**Q0–Q3.** Q0 fires for F1/F2 — a **migration is never delegated**; Claude writes both, and
the seed with it because the two must agree. For the rest Q0 is clear. **Q1 — YES:**
`downstream_customers` is the one genuinely hard piece (graph traversal that must be correct
*and* provably terminating, and a wrong answer misleads a judge about which customers lose
water). Claude implements FN1 and its cycle test. → **SL-3**, and Q2 (new routes, new
exports, crosses Python↔TS) agrees.

**Adaptation:** PR-6 ran SL-3 and needed one fix round. This slice adds a migration, a wire
format change and a graph algorithm. **Hold at SL-3.**

---

## §8 Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | The new per-signal query flips the planner off the asset_ts index — the exact class `test_latency` caught once before | Dedicated EXPLAIN test on the NEW query (T9) plus the full suite, not just the new tests |
| 2 | Widening `TwinEvent` breaks an existing client | Additive only; `event_version` bumped to 2 if any existing field's meaning changes, and recorded either way |
| 3 | Changing `_emit_twin_event` perturbs conservation or DLQ | Those suites run unchanged; the emitter is fire-and-forget by construction and must stay so |
| 4 | Migration 006 fails on an existing volume | T2 applies 001–005 then 006 on a real container, and asserts re-application is a no-op |
| 5 | Cyclic topology hangs a worker | Visited set + explicit cyclic fixture + `pytest-timeout` |

---

## §9 Honesty notes carried forward

- **The Stitch mockup shows "1,204 ราย" affected customers. The real seeded topology has
  five.** `design/manifest.json` already flags S4 as `fabricated-values`. PR-7b must render
  the real count from `/api/twin/impact`, never the mockup's figure.
- **Item 2.5 is not closed by this PR, and is not closed by PR-7b alone either.** The
  checklist wants the source structure *shown in the IDE* — a demo action. PR-7b guarantees
  the structure (a config file + ≥3 components) and enforces it with a test; **PR-17 owns
  showing it**. Recorded so the score claim is not assumed closed.
- The topology, the five customer ids and every telemetry value are SIMULATED. Only branch
  and province names come from `data/curated/`.

---

## §10 Do-Not-Touch (delegate)

`infra/db/**` (Claude owns the migration) · `scripts/seed_db.py` · every file under
`api/tests/**` and `simulator/tests/**` · `api/app/main.py` · `design/**` · `data/**` ·
`docs/**` · `.codex/` · `coding-logs/` · all of PR-6's `web/` tree.
No git commands. No `@ts-ignore` / `# type: ignore` / bare `except:`. Never weaken a test.
