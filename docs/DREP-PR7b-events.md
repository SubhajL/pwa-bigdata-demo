# DREP — PR-7b · digital-twin event chain (slice S4b)

Baseline `origin/main` @ `9586e90` (PR-7a landed). Branch `feat/pr7b-twin-events`.
Middle layer of the three-way PR-7 split. Scored items 2.2 / 2.3 / 2.4 (triggers).

Adversarial pass: Codex `gpt-5.6-sol` @ xhigh, read-only over the real repo. **The review
reshaped this plan by REMOVING risk** — see §11. The headline: the draft's hub-coalescing
change is **dropped**, because it weakened a deliberate capacity guarantee to fix a problem
that belongs in the frontend (7c).

---

## §0 Repo Profile

As `docs/DREP-PR6-foundation.md` §0, with: backend gates `cd api && pytest · ruff check . ·
mypy .`; simulator gates `cd simulator && pytest · ruff · mypy`; **no migration this slice**;
coding log `.codex/coding-log.current` ✅.

**MUST NOT (load-bearing):** never block/raise on the ingest loop (`TwinHub.broadcast` is
synchronous, total, non-raising); every telemetry/status value is SIMULATED; DLQ-not-crash;
no hardcoded thresholds in a component (bands are server-side); no `@ts-ignore` / bare `except:`.

---

## §1 Goal / Non-Goals

**Goal.** Make the twin's live channel carry the truth: ingest emits each accepted reading's
real `signal`/`value` and a band-classified `status` (today it hardcodes `normal` and drops
the reading), a `pressure_drop` fault mode gives item 2.4 a reproducible trigger, the bands
are exposed read-only so the frontend can tell a *drop* from a *spike*, and topology reports a
device's persisted health status on load instead of a permanent `nodata`.

**Non-Goals.**
- The SVG screen and any `web/` change — **PR-7c**. Deliverable here is a correct event stream
  visible on `WS /ws/twin` and in Swagger, not a rendered twin.
- **Modifying `TwinHub`/coalescing.** The draft proposed a composite `(asset,kind,signal)`
  key; Codex showed it weakens the hub's per-asset capacity guarantee (one pump would occupy
  6 slots, so 64-capacity no longer means 64 assets, and a noisy device could evict another's
  `critical`). For the demo's single prompt-draining client the hub barely coalesces at all —
  frames are delivered individually — so **per-signal persistence and never-mask-critical are
  a FRONTEND concern (7c state model), not a hub concern.** The hub is left untouched. (§11-C1)
- **Widening `TwinEvent`.** It already carries `signal`/`value`/`status`. Instead of stamping
  `pipe_id` (non-unique, and a hot-path topology lookup), the frontend maps `asset →
  device.node → the node's outgoing pipe(s) → GET /api/twin/impact`. Drop-vs-spike is resolved
  by exposing the bands (new `GET /api/twin/bands`), not by an event field. (§11-C5)
- Any migration; demo pacing / reconnect drill / browser latency (**PR-17**); persisting
  per-reading band status (live-only, by design).

---

## §2 Requirements — R1..R8

| ID | Requirement (testable) | Item |
|---|---|---|
| **R1** | `_emit_twin_event` publishes `TwinEvent(kind="status")` with the accepted reading's real `signal`, `value`, `observed_at` (its `ts`) and a band-classified `status` — never a hardcoded `normal`. It obtains these from the **already-validated `Reading`** (no second decode), and is **total**: a classify/serialize error is swallowed and logged, never raised into the (post-ACK) consumer. | 2.2, 2.3 |
| **R2** | `classify_signal(signal, value)` → `normal` inside `SIGNAL_BANDS[signal]`; `warning` outside by ≤ one band-width; `critical` further; `nodata` for a non-finite value. Boundaries (`low`, `high`, exactly ±one width) are deterministic. | 2.3 |
| **R3** | `api.app.bands.SIGNAL_BANDS` equals **both** the simulator's `SIGNAL_BANDS` (obtained out-of-process) **and** ingest's accepted-signal set (`ingest.VALID_SIGNALS`) — so ingest can never accept a signal that classification has no band for (a post-ACK `KeyError`). | 2.3 honesty |
| **R4** | `GET /api/twin/bands` returns `SIGNAL_BANDS` read-only, so the frontend can classify a pressure **drop** (`value < low`) distinctly from a spike (`value > high`) without hardcoding thresholds. | 2.4 |
| **R5** | The simulator gains `FAULT_MODE=pressure_drop`, driving `pressure_bar` **below** its band (the `anomaly` mode drives *above* and cannot express a drop) on devices whose repertoire includes `pressure_bar`; every other signal stays in band. It works **through settings/env**, not only the generator function. | 2.4 |
| **R6** | `pressure_drop` is advertised in `infra/docker-compose.yml` and added to `infra/env.sample` (which has no `FAULT_MODE` today). | 2.4 demo |
| **R7** | `GET /api/twin/topology` populates each device's `status` from the latest **persisted health** status (`health_store.latest_statuses`, using scoring's own `WARNING_BELOW`/`CRITICAL_BELOW`), or `nodata` when none. The lookup runs **outside** `load_topology`'s DB connection block (a one-connection pool would otherwise deadlock). | 2.1 |
| **R8** (regression) | Conservation, DLQ, latency (index-seek), and **every existing twin/ws/scoring test stays green verbatim** — the hub is untouched, so `test_twin_ws.py` remains the valid oracle it was. | — |

---

## §3 Change Contract

| ID | Path | Action | Anchor | Purpose |
|----|------|--------|--------|---------|
| F1 | `api/app/bands.py` | CREATE | — | `SIGNAL_BANDS`, `classify_signal` (R2) |
| F2 | `api/app/service.py` | MODIFY | `dispose_message` L139–156; `_emit_twin_event` L159–181; `consume_once` L206–225 | R1 — internal `_dispose` returns `(Disposition, Reading\|None)`; `dispose_message` wraps it (public enum return unchanged); emitter takes the `Reading`, classifies, is total |
| F3 | `api/app/routes/twin.py` | MODIFY | after `twin_impact` | R4 — `GET /api/twin/bands` |
| F4 | `api/app/models.py` | MODIFY | end | `SignalBand`/`BandsResponse` response model for F3 |
| F5 | `api/app/topology.py` | MODIFY | `load_topology` device section | R7 — status from `latest_statuses`, outside the connection block |
| F6 | `simulator/app/models.py` | MODIFY | `FaultMode` | R5 — add `PRESSURE_DROP` |
| F7 | `simulator/app/publish.py` | MODIFY | **`make_signal()` L32–59** (NOT `value()` — Codex §7) | R5 — below-band pressure injection |
| F8 | `infra/docker-compose.yml` | MODIFY | `simulator.FAULT_MODE` comment | R6 |
| F9 | `infra/env.sample` | MODIFY | add `FAULT_MODE` | R6 |

**Tests (Claude-authored, all NEW files):** `api/tests/test_bands.py` (R2/R3),
`api/tests/test_twin_status_emit.py` (R1), `api/tests/test_bands_route.py` (R4),
`api/tests/test_topology_status.py` (R7), `simulator/tests/test_pressure_drop.py` (R5),
`simulator/tests/test_pressure_drop_config.py` (R5-through-settings).

---

## §4 Function Contracts

```
FN1  classify_signal(signal: Signal, value: float) -> TwinStatus            File: F1
     low, high = SIGNAL_BANDS[signal]; width = high - low.
     Post:  non-finite -> "nodata"; low<=v<=high -> "normal";
            within `width` beyond an edge -> "warning"; further -> "critical".
            Boundary: v == low-width -> "warning"; v < low-width -> "critical" (and
            symmetric at the high edge).
     Total over (KNOWN Signal, finite value). Raises KeyError only for an unknown signal —
            which ingest CANNOT produce (R3 pins VALID_SIGNALS == band keys), so the ingest
            path never hits it. The `nodata` branch is defensive; validation already rejects
            non-finite, so ingest never hits it either. [Codex §2.1: totality reworded.]

FN2  dispose_message(deps, raw) -> Disposition                              File: F2
     UNCHANGED public contract (enum return, pinned by test_twin_emission). Internally
     delegates to `_dispose(deps, raw) -> tuple[Disposition, Reading | None]` and returns
     only the enum. [Codex §2.3: retain the Reading internally, don't re-decode.]

FN2b _dispose(deps, raw) -> tuple[Disposition, Reading | None]              File: F2 (new, private)
     Does:  today's dispose_message body, but also returns the `Reading` from
            `Accepted(reading)` on a newly-ACCEPTED delivery (None otherwise).
     Post:  (Disposition.ACCEPTED, reading) iff newly accepted; (<other>, None) else.

FN2c _emit_twin_event(deps, reading: Reading) -> None                       File: F2 (signature CHANGED)
     Does:  classify reading.signal/value; broadcast TwinEvent(kind="status",
            asset_id=reading.asset_id, status=<classified>, signal=reading.signal,
            value=reading.value, observed_at=reading.ts, published_at=now).
     Total: wrapped so a classify/Pydantic/hub error is logged and swallowed — it runs
            AFTER ack, inside the consumer's containment, and must never propagate.
            [Codex §2.4: emitter made explicitly total.]
     Called from consume_once: `disp, reading = _dispose(...); if disp is ACCEPTED and
            reading is not None: _emit_twin_event(deps, reading)`.

FN3  GET /api/twin/bands -> BandsResponse                                   File: F3
     Returns SIGNAL_BANDS as {signal: {low, high}}. Synchronous `def` (no DB). No 503 —
            bands are static constants, always available.

FN4  load_topology(pool) -> TwinTopology  (status)                          File: F5
     Change: build nodes/pipes/devices as today; AFTER releasing the query connection, call
            latest_statuses(pool, [placed asset_ids], warning_below=WARNING_BELOW,
            critical_below=CRITICAL_BELOW) and set device.status accordingly, default nodata.
     Invariant: the status lookup MUST NOT run while the device-query connection is held —
            latest_statuses acquires its own connection and a min-size-1 pool would deadlock.
            [Codex §2.5.]

FN5  make_signal(dev, tick, mode) -> tuple[Signal, float]                   File: F7
     Change: add PRESSURE_DROP. When mode is PRESSURE_DROP and the tick's signal is
            "pressure_bar": value = rng.uniform(low - width*0.5, low - margin) (below band).
            Any other signal under PRESSURE_DROP behaves as NORMAL. The signal is still drawn
            from KIND_SIGNALS[dev.kind], so a motor (no pressure_bar) is unaffected.
```

---

## §5 Test Plan (RED-proofs abbreviated where identical in shape to PR-7a)

```
T1 (R2) classify_signal boundaries — table-driven, exact.
   pressure band (2,6) width 4: classify(2)=classify(6)=classify(4)=normal;
   classify(1.99)=classify(6.01)=warning; classify(-2.0)=warning AND classify(-2.01)=critical
   (the low-width boundary, both sides); classify(10.0)=warning, classify(10.01)=critical;
   classify(nan)=classify(inf)=nodata. RED: ImportError before F1.

T2 (R3) drift — TWO equalities, out-of-process:
   api SIGNAL_BANDS == simulator SIGNAL_BANDS (subprocess, like conftest.simulator_roster);
   AND set(SIGNAL_BANDS) == ingest.VALID_SIGNALS. The second closes the "ingest accepts a
   signal with no band -> classify KeyError AFTER ack" gap. [Codex §1 contracts]

T3 (R1) accepted reading emits REAL signal/value/status — integration, real DB + hub sub.
   Case A: pressure_bar value 1.0 -> exactly status=="warning" (NOT "warning or critical" —
     an all-critical classifier must fail), signal=="pressure_bar", value==1.0, observed_at==ts.
   Case B: flow_m3h value 100.0 (in band) -> signal=="flow_m3h", status=="normal" — proves the
     emitter reads the reading's signal, not a hardcoded "pressure_bar". [Codex §3]
   Drain each emission INDEPENDENTLY (same-key coalescing would otherwise drop the first).
   RED: before F2 the frame is hardcoded normal with no signal/value -> assertions fail.

T4 (R4) GET /api/twin/bands returns every band; {signal:{low,high}} shape; matches
   classify's constants. RED: 404 before F3.

T5 (R5) make_signal under PRESSURE_DROP: every pressure_bar reading < low; every other signal
   in band; a motor unaffected. Value finite, 4dp. RED: AttributeError (mode absent) before F6.

T5b (R5) pressure_drop THROUGH settings: SimSettings parses FAULT_MODE=pressure_drop and the
   publisher emits below-band pressure — proves the env path, not just the enum. [Codex §3 T5]

T6 (R7) topology status from persisted health: seed a critical-health row for the demo pump,
   leave another placed device with none -> pump status=="critical", other=="nodata", never
   "normal". Runs against a min-size-1 pool to catch the deadlock. RED: all "nodata" before F5.

T7 (R8) full existing suite green 3x (api + simulator), incl. test_latency, conservation/DLQ,
   and test_twin_ws.py / test_twin_emission.py / test_scoring_cycle.py verbatim.
```

Every R has ≥1 T; every T maps to ≥1 R. R6 (advertisement) is grep-verified in §7, its
behaviour proven by T5b.

---

## §6 Traceability

R1→T3 · R2→T1 · R3→T2 · R4→T4 · R5→T5,T5b · R6→(grep §7)+T5b · R7→T6 · R8→T7.

---

## §7 Wiring Verification

| New/changed | Runtime caller | Registration | Data |
|---|---|---|---|
| `classify_signal` (F1) | `_emit_twin_event` (F2) | direct import | `SIGNAL_BANDS`; drift-verified vs `simulator/app/models.py:32` **and** `ingest.VALID_SIGNALS` (`ingest.py:46`) |
| `_dispose`/`_emit_twin_event` (F2) | `consume_once` L214 (call site adjusted to pass the Reading) | in-place | reading from `Accepted(reading)` (`service.py:117`) — no re-decode |
| `GET /api/twin/bands` (F3) | HTTP | already-registered `twin_routes.router` | — |
| `load_topology` status (F4/F5) | `GET /api/twin/topology` | in-place | `latest_statuses` (`health_store.py:209`), thresholds from scoring |
| `PRESSURE_DROP` (F6/F7) | `make_signal` → `make_envelope` → publish loop | `FAULT_MODE` env (F8), `env.sample` (F9) | — |

**Grep-verified:** `make_signal` is the real fn (`publish.py:32`), NOT `value`. Two and only
two `broadcast` producers (ingest, scoring) — the hub is untouched so both are unaffected.
`env.sample` has no `FAULT_MODE` today → F9 adds it. `latest_statuses` acquires its own
connection → F5 must call it outside `load_topology`'s block.

---

## §8 Slice Plan

| ID | Scope | Owner | Stop line | Oracle |
|----|-------|-------|-----------|--------|
| S1 | F1,F3,F4 · T1,T2,T4 | **Claude** | — | T1,T2,T4 + full suite |
| S2 | F2 · T3 | **Claude** | — | T3 + verbatim twin/scoring tests |
| S3 | F5 · T6 | **Claude** | — | T6 (min-size-1 pool) |
| S4 | F6,F7,F8,F9 · T5,T5b | **DeepSeek** | **SL-1** | T5,T5b + simulator suite |

**Q0–Q3.** S1/S2/S3 — **Q0 fires (never-delegate):** S2 is the **ingest hot path** (emitter
totality, ack-ordering); S3 touches a live read whose connection ordering can deadlock the
pool; S1's band thresholds are a judgment the drift test cannot make. Claude implements,
test→RED→implement per unit (Phase 2c-ter). S4 — **Q0 clear, Q3: single mechanical concern,
oracle is an unambiguous below-band assertion → SL-1, delegate to DeepSeek.**
Adaptation: PR-6/7a ran SL-3 with ≤1 round; S4 is strictly smaller with a tighter oracle → SL-1.

Land order S1→S2→S3→S4 in one branch (PR-7b).

---

## §9 Risks

| # | Risk | Mitigation | Rollback |
|---|---|---|---|
| 1 | Emitter change slows/blocks ingest | Fire-and-forget, post-ack, off the DB path; explicitly total (try/except); T7 runs conservation/latency | revert F2 |
| 2 | Hot-path re-decode (draft's mistake) | **Removed** — thread the Reading internally; no second decode | — |
| 3 | Topology status deadlocks a 1-conn pool | latest_statuses called OUTSIDE the query connection; T6 uses min-size 1 | revert F5 |
| 4 | Bands drift from simulator or from ingest's accepted signals | T2 asserts BOTH equalities out-of-process | fix the constant |
| 5 | Ingest band status never reaches `critical` (anomaly/pressure_drop cap at ±0.5 width) | **Accepted & documented:** rubric wants a visible state change, not red; `critical` comes from the scoring/health path (`kind="health"`). PR-17 must not claim these modes show `critical` | n/a |
| 6 | Frontend can't tell drop from spike | `GET /api/twin/bands` (R4) lets 7c test `value < low`; 7c highlights ALL outgoing pipes of the dropping node (impact route already handles a non-unique pipe_id) | n/a |

**Rollout.** One PR, no flag; changes inert until a client subscribes. `pressure_drop` opt-in.

---

## §10 Do-Not-Touch (delegate — S4 only, DeepSeek)

Delegate may modify ONLY `simulator/app/models.py` (FaultMode) and `simulator/app/publish.py`
(`make_signal`). Everything else is Claude: all of `api/**`, every test file, `infra/**`,
`web/** design/** data/** docs/** ml/** scripts/**`, `.codex/ coding-logs/`, `infra/db/**`
(no migration). No git. No `# type: ignore`/bare `except:`. Never weaken/skip a test.

---

## §11 Codex adversarial pass — dispositions

**Accepted — reshaped the plan:**
- **C1 (drop the hub change).** Composite `(asset,kind,signal)` key weakens the per-asset
  capacity guarantee (a pump takes 6 slots; a noisy device could evict another's `critical`;
  "prefer normal" could drop a recovery frame). The demo's client drains promptly, so the hub
  barely coalesces — per-signal persistence belongs in **7c's frontend state**. **F3/R4 of the
  draft removed; hub untouched; `test_twin_ws.py` stays a valid verbatim oracle.**
- **C2 (FN2 re-decode was wrong).** Acceptance already decoded into `Accepted(reading)`.
  **Thread the Reading via a private `_dispose`; `dispose_message` keeps its pinned enum
  return; no second decode.**
- **C3 (emitter not total).** Emission is post-ACK; a classify/hub raise would leave a reading
  acked-but-absent, and `broadcast` propagates `_offer` failures. **Emitter wrapped total.**
- **C4 (topology deadlock).** `latest_statuses` acquires its own connection → a 1-conn pool
  deadlocks if called inside `load_topology`'s block. **Called outside; T6 uses min-size 1.**
- **C5 (topology threshold provenance).** Use scoring's `WARNING_BELOW`/`CRITICAL_BELOW`, not
  literals, or topology-on-load disagrees with live scoring. **Accepted.**
- **C6 (drift also vs ingest signals).** Ingest could accept a signal with no band → post-ack
  `KeyError`. **T2 also asserts `set(SIGNAL_BANDS) == VALID_SIGNALS`.**
- **C7 (T3 vacuity ×3).** Add a non-pressure case; assert exactly `warning`; drain each
  emission independently. **Accepted.**
- **C8 (T5 through settings).** A direct enum call passes while `FAULT_MODE=pressure_drop`
  fails through settings. **Added T5b + config coverage; env.sample gains FAULT_MODE.**
- **C9 (`make_signal`, not `value`).** **F7 corrected.**
- **C10 (drop-vs-spike).** A non-normal `pressure_bar` event can't distinguish a drop from a
  spike without the band. **Added `GET /api/twin/bands` (R4) so 7c tests `value < low`;** far
  cheaper and lower-risk than a `TwinEvent` field, and it makes the contract defensible beyond
  the scripted seed.
- **C11 (update DREP-PR7-twin.md).** That doc assigned `pipe_id`/pressure-kind to 7b. **This
  DREP supersedes it for 7b; the parent doc's §PR-7b note is now "no widening — see
  DREP-PR7b-events.md §11-C1/C10." (documentation edit, F-none, done at land time.)**

**Accepted — noted, not changed:**
- Band `critical` unreachable from ingest for the simulator's modes → §9-R5, acceptable.
- Pre-existing hub "prefer-normal could drop a recovery frame" (C1's 4.4) → pre-existing S3
  behaviour, out of scope now that the hub is untouched; only bites a saturated slow client;
  owner PR-17 (demo has one prompt client).

**Rejected — with reason:**
- "Widen `TwinEvent` with `pipe_id`/pressure kind" (parent DREP's earlier promise). `pipe_id`
  is non-unique and would need a hot-path topology lookup; the drop-vs-spike need is met by
  `/api/twin/bands` + frontend derivation, and the impact route already handles a non-unique
  pipe_id and multiple outgoing edges. Frontend derivation over the topology is the correct
  contract for a schematic twin; a device off the diagram simply isn't rendered. **Rejected in
  favour of C10.**
