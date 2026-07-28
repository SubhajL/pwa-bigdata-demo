# CLAUDE.md — PWA Big Data Demo POC

Repo conventions for the ผนวก ๑๓ scored technical demonstration. Read `POC_SPEC.md` §4A
for the 100-point checklist and `docs/DREP-demo-poc.md` for the execution plan.

## Stack (decided 2026-07-28)

| Layer | Choice | Why |
|---|---|---|
| Backend API | Python 3.13 · FastAPI · uvicorn | FastAPI auto-generates Swagger UI → satisfies demo checklist 3.4 for free |
| MQTT | Eclipse Mosquitto (Docker) + `paho-mqtt` client | The "simulated broker" of demo topic ๑ |
| Time-series DB | TimescaleDB (Postgres 16 + timescaledb ext, Docker) | One DB for hypertable telemetry **and** relational roster/DLQ; clean "time-series database" story (checklist 1.4) |
| Telemetry simulator | Python · `paho-mqtt` | Publishes device signals seeded from the real branch roster (`data/curated/`) |
| Frontend | React 18 · TypeScript · Vite | SVG digital twin (topic ๒), WebSocket live push |
| ML | scikit-learn, model serialized `.pkl` | Health Score + PTTF + RCA (topic ๓) |
| Orchestration | Docker Compose v2 | mosquitto · timescaledb · api · simulator · web |
| Python deps | `venv` + `pip` + `requirements.txt` | uv/poetry not installed |

**Runtime ownership: ours. Repo ownership: ours. Disposition: may-become-production.**
Demo runs locally / on-prem (persistent MQTT subscriber + WebSocket + TSDB) — **not** a
Vercel/serverless target.

## Gate commands

| Gate | Backend (`api/`, `simulator/`) | Frontend (`web/`) |
|---|---|---|
| test | `pytest` | `pnpm test` (vitest) |
| lint | `ruff check .` | `pnpm lint` (eslint) |
| typecheck | `mypy .` | `pnpm typecheck` (`tsc --noEmit`) |
| build | — | `pnpm build` (vite) |

## MUST

- **Honesty of data (inherited from POC_SPEC §3.2):** every simulated/synthetic signal
  (pressure, pump kW, SCADA telemetry, NRW, Health Score, PTTF, RCA) is labelled
  `SIMULATED` in the UI. Real branch roster/geography from `data/curated/` is not.
- **DLQ, not crash:** a malformed / invalid-Asset-ID message is routed to the dead-letter
  table and the main ingest loop continues. Never let one bad message stall the pipeline.
- **One y-axis per chart** (dataviz rule). Validated palette; status never colour-alone.
- Typed signatures; no `any` (TS) / full type hints (Py). Functions ≤ 50 lines.
- Time-series writes go to a **hypertable**; historical reads use a time-range query.
- Every new route registered; every new component imported by a non-test module (no orphans).
- Thai UI text in IBM Plex Sans Thai; tokens from `design/tokens.map.md`, never raw hex.

## MUST NOT

- Hardcode a KPI/telemetry value in a component — values come from the API/DB.
- Present a synthetic value without a visible `SIMULATED` marker.
- Use a second y-axis, a rainbow categorical ramp for magnitude, or colour-only status.
- Block the ingest loop on a bad message (must DLQ and continue).
- Commit secrets; `.env` is git-ignored.
- `@ts-ignore` / bare `except:` to pass a gate.

## Layout

```
api/          FastAPI app — ingest subscriber, DLQ, TSDB access, ML endpoints, Swagger
simulator/    MQTT telemetry generator (seeded from data/curated/)
web/          React + Vite — SVG digital twin, pipeline monitor, predictive panel
infra/        docker-compose.yml, mosquitto.conf, db init SQL
ml/           training script → model artifact (.pkl) + params
data/         real PWA datasets (curated + raw) — read-only seed
design/       Stitch design system, tokens, interactions (committed)
docs/         DREP + design docs
```
