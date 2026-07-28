# Coding Log — PWA Technical-Demonstration POC (ผนวก ๑๓)

Scored demo build: real-time data pipeline · SVG digital twin · AI predictive maintenance.
See POC_SPEC.md §4A for the 100-point checklist and docs/DREP-demo-poc.md for the plan.

## 2026-07-28 — Planning (g2-planning)
- Repo profiled greenfield; stack chosen (Python/FastAPI + TimescaleDB + Mosquitto + React/Vite + scikit-learn).
- DREP authored → docs/DREP-demo-poc.md.

## 2026-07-28 — PR-0 (slice S0): infra & scaffold [Claude, never-delegate]
Stop line: Q0 (no oracle until stack runs; irreversible infra) → Claude implements. No delegation.
Delivered: docker-compose (mosquitto 2.0.20, timescaledb 2.17.2-pg16, api, simulator[sim], web[ui]);
  001_init.sql (device, telemetry HYPERTABLE, ingress_ledger[Codex#2], dead_letter, pipe_edge,
  customer_service_point, health HYPERTABLE); FastAPI skeleton with paho-thread→asyncio.Queue
  bridge + single worker [Codex#11]; shared contracts (models.py); pinned requirements [Codex#12];
  Vite+React+TS scaffold + app.config.ts [begins 2.5]; scripts/seed_db.py [seeds in S0, Codex#10].
Verified: compose config valid; TimescaleDB healthy; 7 tables + 2 hypertables registered (catalog
  assertion, Codex#12); seed loaded 239 devices/4 pipes/5 customers incl. demo P-1/P-2/M-3/V-9;
  api gates green (pytest 2, mypy --strict, ruff); web gates green (tsc, eslint, vitest).
RED-proof: test_health.py fails at import without app/main.py (verified), passes with it.
Env note: OrbStack squats host 5432 (local Postgres) and leaks 5433 proxy on up/down churn;
  compose uses 5433; seed verified via no-port container IP. Local-env quirk, not a defect.
QCHECK: deferred to logic-bearing PRs (PR-2 DLQ, PR-4 model, PR-6 predictive) with rationale —
  PR-0 is pure scaffold, no algorithms; DREP already passed Codex adversarial review.
