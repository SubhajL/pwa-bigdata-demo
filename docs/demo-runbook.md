# Demo Runbook — the scored ผนวก ๑๓ demonstration (slice S-D)

A second operator can run the whole scored demo from this page, with no developer present. Every
row maps a scored item to **how to trigger it → where to look → what to expect → how to reset**.

**URLs** (compose defaults): frontend `http://localhost:5173` · API `http://localhost:8000` ·
Swagger `http://localhost:8000/docs`.

---

## 0. Cold start (once, ~2–3 min)

```bash
make demo-preflight          # brings the stack up, waits healthy, checks every scored surface
```
It must end with **`✓ DEMO READY`**. If not, it prints which surface failed. To run the whole
automated gate instead (all 16 items in a real browser): `make demo-e2e`.

Reset the fault mode any time with `make demo-scenario MODE=normal`.

---

## Topic ๑ — Real-time Data Pipeline (35 pts) · screen: **คุณภาพข้อมูล** (`/pipeline`)

| # | Trigger | Where to look | Expect | Reset |
|---|---|---|---|---|
| 1.1 (5) | (always on) | `/pipeline` → connection pill + throughput KPI | pill **CONNECTED**, msg/s > 0 and rising | — |
| 1.2 (5) | `make demo-reconnect` (restarts broker) | terminal + `/pipeline` connection pill | script prints **reconnected … ≤ 30s** (typically ~1–2s); pill drops then returns CONNECTED | auto |
| 1.3 (5) | open DevTools → **Network**, filter `latest`, reload `/pipeline` | the `/api/telemetry/P-2/latest` row → **Timing** + `Server-Timing: db;dur=…`; on-screen Response-Time table | round-trip **< 500 ms**, a row marked *under budget* | — |
| 1.4 (10) | — | `scripts/show-hypertable.sql` (below) + `/pipeline` retrieval panel | hypertable confirmed; 15-min range returns ordered rows | — |
| 1.5 (10) | `make demo-scenario MODE=bad_asset` | `/pipeline` → DLQ table + conservation | **DLQ total grows**, ingest keeps rising (loop not stalled) | `make demo-scenario MODE=normal` |

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
| 2.4 (10) | click **P-2** while a drop is active | the **ผู้ใช้น้ำที่ได้รับผลกระทบ** card | affected pipes highlighted + a real, non-zero customer list | `make demo-scenario MODE=normal` |
| 2.5 (5) | open the repo in the IDE | `web/src/features/twin/twin.config.ts` + `DeviceSymbol.tsx`, `PipeEdge.tsx`, `ProcessSchematic.tsx` | one config file + ≥ 3 components | — |

> **⚠ Demo-data note (2.2 / 2.4), owned by PR-7.** The seeded pump **P-2 currently reads
> `warning` from its health score (≈ 64, just below the 65 threshold)**, and the simulator's
> `pressure_drop` value (~2.9 bar) stays **inside** the twin's pressure band (low 2.0) — so a clean
> `normal → critical` transition is not visible with today's seed. The socket update (2.2) and the
> impact panel (2.4) are wired and unit/integration-tested; to make the *live transition* pop for a
> judge, PR-7 should lower the demo pump's baseline health and drive `pressure_drop` below 2.0 bar.
> This is exactly the kind of gap the score gate exists to surface.

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
(`e2e/tests/topic{1,2,3}-*.spec.ts`). See `e2e/README.md`.
