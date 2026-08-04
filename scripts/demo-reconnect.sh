#!/usr/bin/env bash
# Scored item 1.2 — auto-reconnect ≤ 30s. Restarts the MQTT broker and measures the time from
# the restart until the subscriber is reconnected AND a post-restart reading has been COMMITTED
# (conservation.telemetry advancing — rows the DB accepted, not the pre-validation `received`
# callback counter), read from the live GET /api/pipeline/status. Fails (non-zero) beyond 30s.
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

committed() { # conservation.telemetry — validated rows the hypertable accepted
  curl -sf "$API/api/pipeline/status" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('conservation',{}).get('telemetry',''))" \
    2>/dev/null || true
}

is_int() { [[ "$1" =~ ^[0-9]+$ ]]; }

# The baseline must be EVIDENCE, not a default: an unreadable API converted to 0 would let
# the first healthy poll "prove" growth that never happened post-restart. Fail closed.
pre_state="$(field state)"
before="$(field received)"
if [ "$pre_state" != "connected" ] || ! is_int "$before"; then
  echo "✗ cannot take a valid baseline (state=${pre_state:-?} received=${before:-?}) — API not healthy; aborting drill" >&2
  exit 1
fi
echo "→ baseline: state=$pre_state received=$before"
echo "→ restarting the broker (docker compose restart mosquitto) …"
"${COMPOSE[@]}" restart mosquitto >/dev/null
start=$(date +%s)

# Committed watermark is taken AFTER the restart command returns: messages delivered and
# queued BEFORE the outage drain in the bounce window and must not count as "resumed
# persistence". (Residual: a disposition retry in ≤~3.75s backoff can still land after this
# watermark; the state=connected conjunct keeps that from passing alone.)
committed_before="$(committed)"
if ! is_int "$committed_before"; then committed_before=""; fi
while [ -z "$committed_before" ]; do
  sleep 1
  committed_before="$(committed)"
  is_int "$committed_before" || committed_before=""
  if [ $(( $(date +%s) - start )) -ge 15 ]; then
    echo "✗ could not read a committed-rows watermark after restart (API unhealthy)" >&2
    exit 1
  fi
done
echo "→ post-restart committed watermark: $committed_before"

while true; do
  state="$(field state)"
  recv="$(field received)"
  comm="$(committed)"
  is_int "$recv" || recv="$before"
  is_int "$comm" || comm="$committed_before"
  elapsed=$(( $(date +%s) - start ))
  if [ "$state" = "connected" ] && [ "$recv" -gt "$before" ] && [ "$comm" -gt "$committed_before" ]; then
    echo "✓ reconnected AND committed ingest resumed in ${elapsed}s  (state=connected, received ${before}→${recv}, committed ${committed_before}→${comm})"
    if [ "$elapsed" -le 30 ]; then exit 0; fi
    echo "✗ but that exceeded the 30s budget for item 1.2" >&2
    exit 1
  fi
  if [ "$elapsed" -ge 30 ]; then
    echo "✗ did NOT reconnect+commit within 30s (state=$state received=$recv committed=$comm)" >&2
    exit 1
  fi
  sleep 1
done
