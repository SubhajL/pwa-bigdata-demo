#!/usr/bin/env bash
# Scored item 1.2 — auto-reconnect ≤ 30s. Restarts the MQTT broker and measures the time from
# the restart until the subscriber is BOTH reconnected AND ingesting again (received advancing),
# read from the live GET /api/pipeline/status. Fails (non-zero) if it exceeds 30s.
#
# Usage: scripts/demo-reconnect.sh          (API_BASE overrides the default http://localhost:8000)
set -euo pipefail

API="${API_BASE:-http://localhost:8000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/infra/docker-compose.yml")

field() { # field-name : print a top-level field of the status JSON, or empty on error
  curl -sf "$API/api/pipeline/status" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))" 2>/dev/null || true
}

before="$(field received)"; before="${before:-0}"
echo "→ baseline: state=$(field state) received=$before"
echo "→ restarting the broker (docker compose restart mosquitto) …"
"${COMPOSE[@]}" restart mosquitto >/dev/null

start=$(date +%s)
while true; do
  state="$(field state)"
  recv="$(field received)"; recv="${recv:-0}"
  elapsed=$(( $(date +%s) - start ))
  if [ "$state" = "connected" ] && [ "$recv" -gt "$before" ]; then
    echo "✓ reconnected AND ingest resumed in ${elapsed}s  (state=connected, received ${before}→${recv})"
    if [ "$elapsed" -le 30 ]; then exit 0; fi
    echo "✗ but that exceeded the 30s budget for item 1.2" >&2
    exit 1
  fi
  if [ "$elapsed" -ge 30 ]; then
    echo "✗ did NOT reconnect+resume within 30s (state=$state received=$recv)" >&2
    exit 1
  fi
  sleep 1
done
