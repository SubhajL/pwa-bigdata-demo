#!/usr/bin/env bash
# One-command stack-readiness gate for the scored demo (PR-17 / slice S-D).
# Brings the whole stack up (building if needed), waits for the API to be healthy, then checks
# every judge-facing surface is live and that at least one device has actually been scored.
# Exits non-zero (and says what failed) if the stack is not demo-ready.
# NOTE: volumes are preserved — this warms the existing stack, it is NOT a fresh-volume start.
# For a true fresh-volume start (re-seed + re-backfill) run `make demo-down` first.
#
# Usage: scripts/demo-preflight.sh
set -euo pipefail

API="${API_BASE:-http://localhost:8000}"
WEB="${WEB_BASE:-http://localhost:5173}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/demo-compose.sh"

# Bound every probe: a socket that accepts the connection but never answers (a hung Vite dev
# server, a blackholed port) would otherwise wedge a curl — and the whole gate — indefinitely,
# right past the nominal wait budget. --connect-timeout caps the TCP handshake, --max-time the
# whole request; on timeout curl exits non-zero, which reads exactly like "not ready yet".
CURL=(curl -sf --connect-timeout 2 --max-time 5)

echo "═══ PWA big-data demo — preflight ═══"
echo "→ bringing the stack up (build if needed) …"
"${DEMO_COMPOSE[@]}" up -d --build

printf '→ waiting for API %s/healthz ' "$API"
for i in $(seq 1 60); do
  if "${CURL[@]}" "$API/healthz" >/dev/null 2>&1; then echo "OK"; break; fi
  printf '.'; sleep 2
  if [ "$i" = 60 ]; then echo " TIMEOUT"; exit 1; fi
done

# The web container's Vite dev server can take several seconds past API-healthy to answer,
# so a one-shot probe in the surface list below false-fails on a fresh `up`. Wait for it the
# same way we wait for the API. On genuine timeout we don't exit here: the frontend is one of
# many surfaces, so we fall through and let the aggregated `check` below own the ✗ verdict.
printf '→ waiting for frontend %s ' "$WEB"
for i in $(seq 1 30); do
  if "${CURL[@]}" "$WEB/" >/dev/null 2>&1; then echo "OK"; break; fi
  printf '.'; sleep 2
  if [ "$i" = 30 ]; then echo " TIMEOUT (still down — surface check will report it)"; fi
done

FAILED=0
check() { # label url
  if "${CURL[@]}" "$2" >/dev/null 2>&1; then
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

# Item 1.4 catalog evidence: telemetry must live in a REAL TimescaleDB hypertable, proven
# from the catalog (timescaledb_information), not inferred from API behavior. Read-only.
# Bounded like every other probe (in-container busybox `timeout`): a wedged Postgres must
# not hang the whole gate. An exec/psql FAILURE is reported as exactly that — only a real
# empty catalog result may claim "not a hypertable".
if chunks=$("${DEMO_COMPOSE[@]}" exec -T timescaledb timeout 8 psql -U pwa -d pwa -tA \
  -c "SELECT num_chunks FROM timescaledb_information.hypertables WHERE hypertable_name='telemetry'" \
  2>/dev/null); then
  if [ -n "${chunks:-}" ]; then
    printf '  ✓ %-34s hypertable, %s chunk(s)\n' "topic ๑ · TimescaleDB catalog" "$chunks"
  else
    printf '  ✗ %-34s (telemetry is NOT a hypertable per the catalog)\n' "topic ๑ · TimescaleDB catalog"
    FAILED=1
  fi
else
  printf '  ✗ %-34s (catalog probe failed — container/psql error, not a schema verdict)\n' \
    "topic ๑ · TimescaleDB catalog"
  FAILED=1
fi

# Item 3.1 provenance — delegated to the EXTRACTED probe so the gate runs exactly the
# code the five-case behavioral harness proves (equal / unequal / curl failure / exec
# failure / malformed output; api/tests/test_acceptance_harness.py, PR-F). Any non-zero
# exit — mismatch (1) or probe failure (2) — fails this gate; the probe prints its own
# distinct ✓/✗ verdict line.
"$ROOT/scripts/lib/artifact-provenance-probe.sh" "$API" || FAILED=1

# Deeper readiness: the model must have produced at least one score (else topic ๓ is blank).
scored=$("${CURL[@]}" "$API/api/worklist?limit=50" 2>/dev/null \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
if [ "${scored:-0}" -gt 0 ]; then
  printf '  ✓ %-34s %s device(s) scored\n' "topic ๓ · scoring produced output" "$scored"
else
  printf '  ✗ %-34s (worklist empty — scoring has not run)\n' "topic ๓ · scoring produced output"; FAILED=1
fi

# PR-I: the Map Ta Phut customer dataset. Flag-INDEPENDENT — the seed always lands exactly 200
# profiles / 2,400 readings / 140-35-25, whatever MTP_CUSTOMER_IMPACT_ENABLED is. A drift
# (199/201, wrong type mix, incomplete readings) fails the gate before a judge ever sees it.
if mtp=$("${DEMO_COMPOSE[@]}" exec -T timescaledb timeout 8 psql -U pwa -d pwa -tA -F' ' \
  -c "SELECT (SELECT count(*) FROM demo_customer_profile WHERE profile_version='mtp-low-pressure-200-v1'), (SELECT count(*) FROM demo_customer_meter_reading), (SELECT count(*) FROM demo_customer_profile WHERE type_code=1 AND profile_version='mtp-low-pressure-200-v1'), (SELECT count(*) FROM demo_customer_profile WHERE type_code=2 AND profile_version='mtp-low-pressure-200-v1'), (SELECT count(*) FROM demo_customer_profile WHERE type_code=3 AND profile_version='mtp-low-pressure-200-v1')" \
  2>/dev/null | tr -s ' \n' ' ' | sed 's/ *$//'); then
  if [ "$mtp" = "200 2400 140 35 25" ]; then
    printf '  ✓ %-34s 200 profiles · 2400 readings · 140/35/25\n' "topic ๒ · Map Ta Phut customers"
  else
    printf '  ✗ %-34s (got: %s; want 200 2400 140 35 25)\n' "topic ๒ · Map Ta Phut customers" "$mtp"
    FAILED=1
  fi
else
  printf '  ✗ %-34s (customer-count probe failed — container/psql error)\n' \
    "topic ๒ · Map Ta Phut customers"
  FAILED=1
fi

echo "────────────────────────────────────────"
if [ "$FAILED" = 0 ]; then
  echo "✓ DEMO READY — every scored surface is live."
else
  echo "✗ NOT demo-ready — see the ✗ lines above." >&2
  exit 1
fi
