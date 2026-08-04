# Demo Runbook — the scored ผนวก ๑๓ demonstration (slice S-D)

A second operator can run the whole scored demo from this page, with no developer present. Every
row maps a scored item to **how to trigger it → where to look → what to expect → how to reset**.

**URLs** (compose defaults): frontend `http://localhost:5173` · API `http://localhost:8000` ·
Swagger `http://localhost:8000/docs`.

---

## 0. Stack readiness (once, ~2–3 min)

```bash
make demo-preflight          # brings the stack up, waits healthy, checks every scored surface
```
It must end with **`✓ DEMO READY`**. If not, it prints which surface failed. Preflight warms
the **existing** stack — volumes are preserved, so it is not a cold start by itself. A **true
cold start** (fresh volumes → re-seed → re-backfill) is `make demo-down` **then**
`make demo-preflight`. To run the whole automated gate instead (all 16 items in a real
browser): `make demo-e2e`.

Reset the fault mode any time with `make demo-scenario MODE=normal`.

---

## 0b. The demo director — สาธิตเหตุการณ์ (P0, landed 2026-08-03)

The simulator round-robins all 238 devices (~48 s per device), so a fault used to take up to
a minute to become visible. The **demo-scenario API** injects it for **P-2 on command**
instead — from the twin screen or curl — and the transitions land in seconds:

* On **ศูนย์ควบคุม SCADA** (`/operations`), the **สาธิตเหตุการณ์** card (SIMULATED-badged,
  right column) has four buttons: **จำลองแรงดันตก** (pressure drop → items 2.2/2.3/2.4/3.3
  from one click), **จำลองอุปกรณ์เสื่อมสภาพ** (vibration anomaly), **จำลองข้อมูลเสีย (DLQ)**
  (a direct demo DLQ insert — a fast visual, **not** the scored item-1.5 proof; see the
  honesty note below), **คืนสู่สภาวะปกติ** (recovery). The card shows the active **run_id**;
  every injected row in the database carries it (`source='DEMO'` for telemetry scenarios,
  `'DEMO_DLQ'` for the dead-letter pair's ledger row).
* Same thing over HTTP:
  `curl -X POST localhost:8000/api/demo/scenario -H 'content-type: application/json' -d '{"mode":"pressure_drop","target":"P-2"}'`
* What a fault does: one below-band reading flips P-2's symbol to **เฝ้าระวัง instantly**
  (band path, at most `warning` by design), and the 24-h feature window is steered onto a
  worn trajectory so the **real model** scores P-2 **critical (health ≈ 32) within one
  scoring cycle** — red symbol ≤ 30 s, the honest item-3.3 chain. **คืนสู่สภาวะปกติ**
  steers the window healthy again: recovery is likewise model-driven, ≤ 30 s.
* Gated by `DEMO_CONTROLS=1` (set only in `infra/docker-compose.yml`); anywhere else the
  endpoint answers 403 and the card does not render. Injections preserve the conservation
  invariant (paired ledger rows) and never touch MQTT/BACKFILL rows.
  **Honesty note — what the director actually does:** its rows are inserted directly into
  the database (`api/app/demo.py`); they do **not** traverse the MQTT consumer. Telemetry
  scenarios steer the same tables the real model scores (pairs stamped `source='DEMO'`,
  swept by **คืนสู่สภาวะปกติ**), and **จำลองข้อมูลเสีย** writes one dead-letter row as a
  visual (its ledger row is `source='DEMO_DLQ'`, deliberately permanent). The scored
  item-1.5 validation proof therefore stays `make demo-scenario MODE=bad_asset` — a real
  publish through the broker that the consumer rejects into the DLQ while ingest continues.
  **Accepted exposure:** on the demo stack the API port (8000) is host-published and the
  control is unauthenticated, like every other write surface of this local demo
  (feedback, DLQ browsing). Do not enable `DEMO_CONTROLS` on anything network-shared.

This retires the cold-start timing constraint below: on a warm stack, press
**คืนสู่สภาวะปกติ** then **จำลองแรงดันตก** and demonstrate the whole twin arc on cue.

---

## Topic ๑ — Real-time Data Pipeline (35 pts) · screen: **คุณภาพข้อมูล** (`/pipeline`)

| # | Trigger | Where to look | Expect | Reset |
|---|---|---|---|---|
| 1.1 (5) | (always on) | `/pipeline` → connection pill + throughput KPI | pill **CONNECTED**, msg/s > 0 and rising | — |
| 1.2 (5) | `make demo-reconnect` (restarts broker) | terminal + `/pipeline` connection pill | script prints **reconnected AND committed ingest resumed … ≤ 30s** (typically ~1–2s); pill drops then returns CONNECTED | auto |
| 1.3 (5) | open DevTools → **Network**, filter `latest`, reload `/pipeline` | the `/api/telemetry/P-2/latest` row → **Timing** + `Server-Timing: db;dur=…`; on-screen Response-Time table | round-trip **< 500 ms**; **all three** endpoint rows complete 5/5 calls, zero failures, means ≤ 500 ms, each marked *under budget* | — |
| 1.4 (10) | — | `scripts/show-hypertable.sql` (below) + `/pipeline` retrieval panel; `make demo-preflight` prints the catalog line | hypertable confirmed from the TimescaleDB catalog; 15-min range returns ordered rows | — |
| 1.5 (10) | `make demo-scenario MODE=bad_asset` | `/pipeline` → DLQ table + conservation | **DLQ total grows** and the unknown-ID row appears in the table **without a refresh** (in this mode every simulated envelope is bad, so committed rows pause); after `MODE=normal`, committed rows rise again — the loop was never stalled | `make demo-scenario MODE=normal` |

**Item 1.4 SQL** (run in a second terminal):
```bash
docker compose -f infra/docker-compose.yml exec -T timescaledb psql -U pwa -d pwa -f - < scripts/show-hypertable.sql
```
Shows `telemetry` is a TimescaleDB hypertable (with chunks) and a bounded time-range read returns
ordered rows.

---

## Topic ๒ — Real-time Digital Twin (35 pts) · screen: **ศูนย์ควบคุม SCADA** (`/operations`)

| # | Trigger | Where to look | Expect | Reset |
|---|---|---|---|---|
| 2.1 (5) | click the **ขยายเข้า / ออก** zoom buttons | the SVG schematic | it scales crisply (vector, `viewBox` changes; never blurs) | reset-view button |
| 2.2 (5) | (live) | device symbols update from the socket | statuses match the live model, no page refresh needed | — |
| 2.3 (10) | click pump **P-2** | its symbol shape + the SEC card | shape-coded status (not colour alone); **SEC in kWh/m³** with a SIMULATED marker | — |
| 2.4 (10) | click **P-2** while a drop is active | the **ผู้ใช้น้ำที่ได้รับผลกระทบ** card | affected pipes highlighted + a non-empty seeded customer list (SIMULATED-badged) | `make demo-scenario MODE=normal` |
| 2.5 (5) | open the repo in the IDE | `web/src/features/twin/twin.config.ts` + `DeviceSymbol.tsx`, `PipeEdge.tsx`, `ProcessSchematic.tsx` | one config file + ≥ 3 components | — |

> **✔ Demo-data tuning (2.2 / 2.4), PR-7 — landed 2026-08-01.** Pump **P-2 now backfills to
> `critical`** (health ≈ 32, still declining and PRE-failure — a "predicted to fail" case, not an
> already-failed one; `scripts/backfill_history.py::DEMO_WEAR_OVERRIDE`), so the twin colours it
> **red** and it ranks #1 on the worklist — a clean red device for items 2.2 / 2.3 / 3.3. And
> `pressure_drop` measurably drives pressure **below the 2.0 low band**
> (`simulator/tests/test_pressure_drop.py`), so `make demo-scenario MODE=pressure_drop` highlights
> `PIPE-P2-TANK` and lists affected customers (2.4). A single below-band reading classifies at most as
> `warning` by design (`api/app/bands.py`); the red symbol is the health path, not the band path.
>
> **⚠ Cold-start matters — unless you use the demo director (§0b).** The live scoring window
> averages every reading in a clock-hour, so the *backfilled* P-2 reads red only near a true cold
> start. On a warm stack, either run **`make demo-down`** then **`make demo-preflight`**, or simply
> press **จำลองแรงดันตก** on the twin (§0b) — it steers the window deterministically at any stack age.

---

## Topic ๓ — AI Predictive Maintenance (30 pts) · screen: **การพยากรณ์** (`/predictive`)

| # | Trigger | Where to look | Expect | Reset |
|---|---|---|---|---|
| 3.1 (5) | — | Trained-Model card | **Ridge**, `alpha`, StandardScaler, MAE **≪** baseline (real, not the mockup's Random Forest) | — |
| 3.2 (5) | — | Health Score บนชุดข้อมูล 2 ชุด | Dataset A (healthy) **≫** Dataset B (degraded) — e.g. 99.5 vs 30.1 | — |
| 3.3 (5) | — | a device's health status ↔ its twin symbol | the twin reflects the model's health (bound ≤ 30s, measured in `api/tests/test_scoring_cycle.py`) | — |
| 3.4 (5) | Swagger `/docs` → `POST /api/feedback` → **Try it out**, or the on-screen form → **ส่งผลการตรวจสอบ** | the ack | **200** with `stored: true` + an `id` (proof it persisted) | — |
| 3.5 (5) | — | Health & PTTF worklist | ranked worst-health first, rank 1..n | — |
| 3.6 (5) | click a worklist device | Root-Cause bars | named signals, largest \|contribution\| first | — |

---

## Automated verification (the gate)

```bash
make demo-e2e     # runs all 16 items in a real browser against the live stack (~1 min)
```
Green = every scored behaviour is demonstrable. Spec ids map 1:1 to the rows above
(`e2e/tests/topic{1,2,3}-*.spec.ts`); the demo-director transition arc of §0b is verified by
`e2e/tests/scenario-transitions.spec.ts`. See `e2e/README.md`.
