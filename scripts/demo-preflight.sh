#!/usr/bin/env bash
# One-command cold-start + readiness gate for the scored demo (PR-17 / slice S-D).
# Brings the whole stack up (building if needed), waits for the API to be healthy, then checks
# every judge-facing surface is live and that at least one device has actually been scored.
# Exits non-zero (and says what failed) if the stack is not demo-ready.
#
# Usage: scripts/demo-preflight.sh
set -euo pipefail

API="${API_BASE:-http://localhost:8000}"
WEB="${WEB_BASE:-http://localhost:5173}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/infra/docker-compose.yml")

echo "═══ PWA big-data demo — preflight ═══"
echo "→ bringing the stack up (build if needed) …"
"${COMPOSE[@]}" up -d --build

printf '→ waiting for API %s/healthz ' "$API"
for i in $(seq 1 60); do
  if curl -sf "$API/healthz" >/dev/null 2>&1; then echo "OK"; break; fi
  printf '.'; sleep 2
  if [ "$i" = 60 ]; then echo " TIMEOUT"; exit 1; fi
done

FAILED=0
check() { # label url
  if curl -sf "$2" >/dev/null 2>&1; then
    printf '  ✓ %-34s %s\n' "$1" "$2"
  else
    printf '  ✗ %-34s %s  (FAIL)\n' "$1" "$2"; FAILED=1
  fi
}

echo "→ judge-facing surfaces:"
check "topic ๑ · pipeline status"   "$API/api/pipeline/status"
check "topic ๑ · TSDB range (P-2)"  "$API/api/telemetry/P-2/range?minutes=15"
check "topic ๑ · latest (1.3 probe)" "$API/api/telemetry/P-2/latest"
check "topic ๑ · DLQ browse"        "$API/api/dlq?limit=1"
check "topic ๒ · twin topology"     "$API/api/twin/topology"
check "topic ๒ · SEC (P-2)"         "$API/api/twin/sec/P-2"
check "topic ๓ · worklist"          "$API/api/worklist?limit=1"
check "topic ๓ · model card"        "$API/api/model"
check "Swagger UI (item 3.4)"       "$API/docs"
check "frontend"                    "$WEB/"

# Deeper readiness: the model must have produced at least one score (else topic ๓ is blank).
scored=$(curl -sf "$API/api/worklist?limit=50" 2>/dev/null \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
if [ "${scored:-0}" -gt 0 ]; then
  printf '  ✓ %-34s %s device(s) scored\n' "topic ๓ · scoring produced output" "$scored"
else
  printf '  ✗ %-34s (worklist empty — scoring has not run)\n' "topic ๓ · scoring produced output"; FAILED=1
fi

echo "────────────────────────────────────────"
if [ "$FAILED" = 0 ]; then
  echo "✓ DEMO READY — every scored surface is live."
else
  echo "✗ NOT demo-ready — see the ✗ lines above." >&2
  exit 1
fi
