#!/usr/bin/env bash
# Gate A1 acceptance runner (PR-F): run the §7 score gate N consecutive times and write
# an exact-SHA evidence manifest — reproducible acceptance, not a vibe.
#
#   RUNS=3 (default)            CONSECUTIVE gate runs required; must be a positive integer
#   ACCEPTANCE_MODE=warm|cold   manifest label; `cold` REQUIRES a fresh reset receipt
#   EVIDENCE_DIR=evidence       where the manifest lands
#   ACCEPTANCE_TEST_MODE=1      contract-test seam (api/tests/test_acceptance_harness.py):
#                               permits DEMO_E2E_CMD and a cold label without a receipt,
#                               and STAMPS THE MANIFEST as test-class so it can never be
#                               read as Gate A1 evidence. Operators never set this.
#   DEMO_E2E_CMD                the gate command — REFUSED unless test mode is on.
#
# Fail-closed by construction (QCHECK HIGH ×3, both tiers, each reproduced live): an
# unvalidated RUNS once printed "ACCEPTED — 0 consecutive run(s) passed"; an inherited
# DEMO_E2E_CMD wrote a production-looking passed manifest in which the §7 suite never
# ran; a cold label could be claimed on a warm stack. Each is now refused BEFORE any
# evidence exists.
#
# The manifest records: schema class, exact commit SHA + dirty flag + branch, mode label,
# the gate command actually executed, and the served artifact_sha256 + TimescaleDB chunk
# count SAMPLED AFTER the accepted run (so provenance describes the runtime that actually
# passed, not a pre-gate snapshot the preflight's rebuild replaced), plus per-run exit
# codes and durations. A FAILED run still writes its manifest — evidence of a failed
# acceptance is still evidence. Nothing here is destructive; volume removal lives behind
# `scripts/lib/volume-reset.sh`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNS="${RUNS:-3}"
MODE="${ACCEPTANCE_MODE:-warm}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/evidence}"
TEST_MODE="${ACCEPTANCE_TEST_MODE:-}"
#: Exactly "1" enables the seam; a stray "0"/"true" must REFUSE, never silently enable it.
API="${API_BASE:-http://localhost:8000}"
COMPOSE_FILE="${COMPOSE_FILE_PATH:-$ROOT/infra/docker-compose.yml}"
STATE_DIR="${ACCEPTANCE_STATE_DIR:-${TMPDIR:-/tmp}/pwa-demo-acceptance}"
RECEIPT="$STATE_DIR/volume-reset-receipt"
#: A reset older than this cannot vouch for the current stack's coldness.
RECEIPT_MAX_AGE_S=3600

die() { echo "REFUSED: $*" >&2; exit 2; }

# ── refuse before any evidence exists ──────────────────────────────────────────────────

if [ -n "$TEST_MODE" ] && [ "$TEST_MODE" != "1" ]; then
  die "ACCEPTANCE_TEST_MODE must be exactly '1' when set, got '${TEST_MODE}'"
fi

[[ "$RUNS" =~ ^[1-9][0-9]*$ ]] \
  || die "RUNS must be a positive integer, got '${RUNS}' (a zero-run acceptance is not an acceptance)"

if [ -z "$TEST_MODE" ] && [ -n "${DEMO_E2E_CMD:-}" ]; then
  die "DEMO_E2E_CMD overrides the score gate; it is a contract-test seam only.
  A manifest written from an overridden command would be indistinguishable from Gate A1
  evidence. Set ACCEPTANCE_TEST_MODE=1 to run the harness's own tests."
fi
GATE_CMD="${DEMO_E2E_CMD:-make -C "$ROOT" demo-e2e}"
# `bash -c` resolves the first word through PATH, so the command STRING alone is not a
# truthful record of what ran (QCHECK HIGH: a shadowing `make` produced a production-class
# passed manifest). Resolve it and record the absolute path the run actually executed.
gate_argv0=${GATE_CMD%% *}
gate_resolved=$(command -v "$gate_argv0" 2>/dev/null || echo "")

case "$MODE" in
  warm) ;;
  cold)
    if [ -z "$TEST_MODE" ]; then
      # CLAIM the capability atomically BEFORE the gate runs: `mv` on the same filesystem
      # is atomic, so of two concurrent cold runners exactly one wins and the loser has no
      # receipt to read (the old read-then-delete-later check let both proceed).
      [ -f "$RECEIPT" ] || die "ACCEPTANCE_MODE=cold requires a volume reset first.
  Run: make demo-e2e-cold CONFIRM_VOLUME_RESET=1 — the guarded reset mints the single-use
  capability this label is bound to. A warm stack must never be labelled cold."
      claimed="$STATE_DIR/claimed.$$"
      mv "$RECEIPT" "$claimed" 2>/dev/null \
        || die "another cold acceptance already claimed the reset capability"
      trap 'rm -f "$claimed"' EXIT
      receipt_epoch=$(sed -n 's/^epoch=//p' "$claimed")
      receipt_compose=$(sed -n 's/^compose_file=//p' "$claimed")
      [[ "$receipt_epoch" =~ ^[0-9]+$ ]] \
        || die "the reset capability is malformed (no epoch) — run the guarded reset again"
      now_epoch=$(date -u +%s)
      age=$(( now_epoch - receipt_epoch ))
      [ "$age" -ge 0 ] \
        || die "the reset capability is dated in the future (${age}s) — refusing to trust it"
      [ "$age" -le "$RECEIPT_MAX_AGE_S" ] \
        || die "the reset capability is ${age}s old (max ${RECEIPT_MAX_AGE_S}s) — reset again"
      [ "$receipt_compose" = "$COMPOSE_FILE" ] \
        || die "the reset capability was minted for '${receipt_compose}', not '${COMPOSE_FILE}'"
    fi
    ;;
  *) die "ACCEPTANCE_MODE must be warm or cold, got '${MODE}'" ;;
esac

sha=$(git -C "$ROOT" rev-parse HEAD)
branch=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)
dirty=false
[ -n "$(git -C "$ROOT" status --porcelain)" ] && dirty=true
stamp=$(date -u +%Y%m%dT%H%M%SZ)
schema="demo-acceptance/v1"
[ -n "$TEST_MODE" ] && schema="demo-acceptance/v1-test"

mkdir -p "$EVIDENCE_DIR"
# Unique per PROCESS, not per second: two runners started in the same second must leave
# two attributable records, never silently overwrite one another.
manifest="$EVIDENCE_DIR/acceptance-${stamp}-${sha:0:12}-${MODE}-$$.json"
[ -e "$manifest" ] && die "refusing to overwrite an existing manifest at $manifest"
runs_json="[]"
result="passed"

echo "═══ Gate A1 acceptance — $RUNS consecutive §7 run(s), mode=$MODE, sha=${sha:0:12} ═══"
[ -n "$TEST_MODE" ] && echo "  (ACCEPTANCE_TEST_MODE — TEST-class manifest, NOT Gate A1 evidence)"
for n in $(seq 1 "$RUNS"); do
  echo "→ run $n/$RUNS …"
  start=$(date +%s)
  set +e
  # Sanitize make's control variables before the gate: GNU make honours MAKEFLAGS from
  # the environment, so an inherited `-i` turns a FAILING §7 recipe into exit 0 and `-n`
  # prints it without running it — either one forges a production-class "ACCEPTED"
  # manifest (QCHECK HIGH, reproduced live). The gate's own exit status is the sole
  # pass/fail oracle, so it must not be something the caller's environment can dictate.
  env -u MAKEFLAGS -u MFLAGS -u MAKELEVEL -u MAKEOVERRIDES bash -c "$GATE_CMD"
  run_exit=$?
  set -e
  duration=$(( $(date +%s) - start ))
  runs_json=$(python3 - "$runs_json" "$n" "$run_exit" "$duration" << 'PY'
import json, sys
runs = json.loads(sys.argv[1])
runs.append({"run": int(sys.argv[2]), "exit": int(sys.argv[3]), "duration_s": int(sys.argv[4])})
print(json.dumps(runs))
PY
)
  if [ "$run_exit" -ne 0 ]; then
    result="failed"
    echo "✗ run $n failed (exit $run_exit) — aborting: Gate A1 demands CONSECUTIVE passes."
    break
  fi
done

# Provenance is sampled HERE — after the accepted run — so the manifest describes the
# runtime that actually passed. Empty means unavailable at evidence time and is recorded
# as null, never faked.
artifact_sha=$(curl -sf --connect-timeout 2 --max-time 5 "$API/api/model" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['artifact_sha256'])" 2>/dev/null) \
  || artifact_sha=""
[[ "$artifact_sha" =~ ^[0-9a-f]{64}$ ]] || artifact_sha=""
chunks=$(docker compose -f "$COMPOSE_FILE" exec -T timescaledb timeout 8 psql -U pwa -d pwa -tA \
  -c "SELECT num_chunks FROM timescaledb_information.hypertables WHERE hypertable_name='telemetry'" \
  2>/dev/null) || chunks=""
[[ "$chunks" =~ ^[0-9]+$ ]] || chunks=""

# Values travel as argv, never shell-interpolated into code — an empty probe result
# becomes an honest null, and no quoting accident can corrupt the evidence.
python3 - "$manifest" "$schema" "$sha" "$branch" "$dirty" "$MODE" "$stamp" "$RUNS" \
  "$artifact_sha" "$chunks" "$runs_json" "$result" "${TEST_MODE:+1}" "$GATE_CMD" \
  "$gate_resolved" << 'PY'
import json
import sys

(_, path, schema, sha, branch, dirty, mode, stamp, runs_requested,
 artifact_sha, chunks, runs_json, result, test_mode, gate_command,
 gate_command_resolved) = sys.argv
manifest = {
    "schema": schema,
    "test_mode": bool(test_mode),
    "sha": sha,
    "branch": branch,
    "dirty": dirty == "true",
    "mode": mode,
    "captured_at_utc": stamp,
    "runs_requested": int(runs_requested),
    # The command that actually ran: a manifest must never leave a reader guessing
    # whether the §7 suite executed.
    "gate_command": gate_command,
    # The absolute executable that actually ran (PATH-resolved): evidence must never read
    # like `make` while a shadowing binary did the work.
    "gate_command_resolved": gate_command_resolved or None,
    "artifact_sha256": artifact_sha or None,
    "hypertable_chunks": int(chunks) if chunks else None,
    "runs": json.loads(runs_json),
    "result": result,
}
with open(path, "w", encoding="utf-8") as fh:
    json.dump(manifest, fh, indent=2, ensure_ascii=False)
    fh.write("\n")
PY

echo "evidence manifest: $manifest"
if [ "$result" != "passed" ]; then
  exit 1
fi
echo "✓ ACCEPTED — $RUNS consecutive run(s) passed at $sha ($MODE)."
