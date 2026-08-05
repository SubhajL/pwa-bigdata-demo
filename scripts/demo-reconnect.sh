#!/usr/bin/env bash
# Scored item 1.2 — auto-reconnect ≤ 30s. Restarts the MQTT broker and measures the time from
# the restart until the subscriber is reconnected AND a post-restart reading has been COMMITTED
# (conservation.telemetry advancing — rows the DB accepted, not the pre-validation `received`
# callback counter), read from the live GET /api/pipeline/status. Fails (non-zero) beyond 30s.
#
# Usage: scripts/demo-reconnect.sh          (API_BASE overrides the default http://localhost:8000)
set -euo pipefail

API="${API_BASE:-http://localhost:8000}"
BUDGET_S="${DEMO_RECONNECT_BUDGET_S:-30}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/demo-compose.sh"

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

if ! is_int "$BUDGET_S" || [ "$BUDGET_S" -le 0 ]; then
  echo "✗ DEMO_RECONNECT_BUDGET_S must be a positive integer" >&2
  exit 2
fi

restart_broker() {
  # Python is already a runtime dependency of this script's JSON readers. Its subprocess
  # timeout actively terminates a stuck Compose client instead of checking only after return.
  python3 - "$BUDGET_S" "${DEMO_COMPOSE[@]}" restart mosquitto <<'PY'
import subprocess
import sys

budget_s = int(sys.argv[1])
command = sys.argv[2:]
try:
    result = subprocess.run(command, stdout=subprocess.DEVNULL, timeout=budget_s, check=False)
except subprocess.TimeoutExpired:
    raise SystemExit(124) from None
raise SystemExit(result.returncode)
PY
}

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
start=$(date +%s)
restart_status=0
restart_broker || restart_status=$?
elapsed=$(( $(date +%s) - start ))
if [ "$restart_status" -eq 124 ] || [ "$elapsed" -gt "$BUDGET_S" ]; then
  echo "✗ restart command exceeded the ${BUDGET_S}s budget (${elapsed}s elapsed)" >&2
  exit 1
fi
if [ "$restart_status" -ne 0 ]; then
  echo "✗ docker compose restart mosquitto failed (status=$restart_status)" >&2
  exit "$restart_status"
fi

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
  if [ $(( $(date +%s) - start )) -ge "$BUDGET_S" ]; then
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
    if [ "$elapsed" -le "$BUDGET_S" ]; then exit 0; fi
    echo "✗ but that exceeded the ${BUDGET_S}s budget for item 1.2" >&2
    exit 1
  fi
  if [ "$elapsed" -ge "$BUDGET_S" ]; then
    echo "✗ did NOT reconnect+commit within ${BUDGET_S}s (state=$state received=$recv committed=$comm)" >&2
    exit 1
  fi
  sleep 1
done
