#!/usr/bin/env bash
# Switch the telemetry simulator's fault mode for a scored-demo scenario (PR-17 / slice S-D).
#
# The simulator reads FAULT_MODE at container start (infra/docker-compose.yml), so a scenario
# is a one-command recreate of just the `simulator` service — no scenario API, no code change.
#   normal        — healthy telemetry (reset)
#   anomaly       — pump anomaly (item 2.3: symbol turns critical, SEC tooltip)
#   pressure_drop — pressure below band on a pump (item 2.4: pipe highlight + affected customers)
#   bad_asset     — unknown Asset ID → DLQ, main flow continues (item 1.5)
#   malformed     — non-JSON payload → DLQ (item 1.5)
#
# Usage: scripts/demo-scenario.sh <mode>    (scripts/demo-scenario.sh normal resets)
set -euo pipefail

MODE="${1:-}"
case "$MODE" in
  normal | anomaly | pressure_drop | bad_asset | malformed) ;;
  *)
    echo "usage: $0 <normal|anomaly|pressure_drop|bad_asset|malformed>" >&2
    exit 2
    ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/infra/docker-compose.yml")

echo "→ switching simulator to FAULT_MODE=$MODE …"
FAULT_MODE="$MODE" "${COMPOSE[@]}" up -d simulator >/dev/null
echo "✓ simulator recreated with FAULT_MODE=$MODE"
echo "  (allow ~10-15s for the new run's telemetry to reach the twin / pipeline before asserting)"
