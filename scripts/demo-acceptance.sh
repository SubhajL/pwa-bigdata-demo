#!/usr/bin/env bash
# Gate A1 acceptance runner (PR-F remediation): consecutive score-gate runs, exact source
# identity, one Compose identity, and a v2 evidence manifest. Production cold mode performs
# its confirmed reset inside this same execution immediately before the gate.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
source "$ROOT/scripts/lib/demo-compose.sh"

RUNS="${RUNS:-3}"
MODE="${ACCEPTANCE_MODE:-warm}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${TMPDIR:-/tmp}/pwa-demo-evidence}"
TEST_MODE="${ACCEPTANCE_TEST_MODE:-}"
API="${API_BASE:-http://localhost:8000}"
WEB="${WEB_BASE:-http://localhost:5173}"
TRUSTED_GIT=/usr/bin/git
TRUSTED_MAKE=/usr/bin/make
EXPECTED_ORIGIN_HTTPS="https://github.com/SubhajL/pwa-bigdata-demo.git"
EXPECTED_ORIGIN_SSH="git@github.com:SubhajL/pwa-bigdata-demo.git"

die() { echo "REFUSED: $*" >&2; exit 2; }

[ -x "$TRUSTED_GIT" ] || die "trusted Git executable is unavailable: $TRUSTED_GIT"

# Git's repository-selection variables override `-C`. Use a minimal environment and an absolute
# system executable so a clean decoy repository cannot vouch for the scripts under $ROOT.
candidate_git() {
  env -i PATH=/usr/bin:/bin "$TRUSTED_GIT" -C "$ROOT" "$@"
}

if [ -n "$TEST_MODE" ] && [ "$TEST_MODE" != "1" ]; then
  die "ACCEPTANCE_TEST_MODE must be exactly '1' when set, got '${TEST_MODE}'"
fi

[[ "$RUNS" =~ ^[1-9][0-9]*$ ]] \
  || die "RUNS must be a positive integer, got '${RUNS}' (a zero-run acceptance is not an acceptance)"

case "$MODE" in
  warm) ;;
  cold)
    if [ -z "$TEST_MODE" ] && [ "${CONFIRM_VOLUME_RESET:-}" != "1" ]; then
      die "ACCEPTANCE_MODE=cold requires CONFIRM_VOLUME_RESET=1; the reset and gate run in one execution"
    fi
    ;;
  *) die "ACCEPTANCE_MODE must be warm or cold, got '${MODE}'" ;;
esac

if [ -z "$TEST_MODE" ] && [ -n "${DEMO_E2E_CMD:-}" ]; then
  die "DEMO_E2E_CMD overrides the score gate; it is a contract-test seam only"
fi

if [ -n "${DEMO_E2E_CMD:-}" ]; then
  GATE_CMD="$DEMO_E2E_CMD"
  gate_is_override=true
else
  GATE_CMD="make -C \"$ROOT\" demo-e2e"
  gate_is_override=false
fi
if [ "$gate_is_override" = true ] || [ -n "$TEST_MODE" ]; then
  gate_argv0=${GATE_CMD%% *}
  gate_resolved=$(command -v "$gate_argv0" 2>/dev/null || echo "")
  [ -n "$gate_resolved" ] || die "gate executable is unavailable: $gate_argv0"
else
  [ -x "$TRUSTED_MAKE" ] || die "trusted make executable is unavailable: $TRUSTED_MAKE"
  gate_resolved="$TRUSTED_MAKE"
fi

# Resolve before creating anything. Existing symlink ancestors are followed, so a path that
# appears external but lands inside the checkout is still refused.
EVIDENCE_DIR=$(python3 - "$EVIDENCE_DIR" <<'PY'
import os
import sys
print(os.path.realpath(os.path.abspath(sys.argv[1])))
PY
)
if [ -z "$TEST_MODE" ]; then
  [ "$COMPOSE_FILE_PATH" = "$ROOT/infra/docker-compose.yml" ] \
    || die "production acceptance requires the candidate Compose file: $ROOT/infra/docker-compose.yml"
  [ "$COMPOSE_PROJECT_NAME" = "pwa-demo" ] \
    || die "production acceptance requires COMPOSE_PROJECT_NAME=pwa-demo"
  [ "$API" = "http://localhost:8000" ] \
    || die "production acceptance requires API_BASE=http://localhost:8000"
  [ "$WEB" = "http://localhost:5173" ] \
    || die "production acceptance requires WEB_BASE=http://localhost:5173"
  case "$EVIDENCE_DIR/" in
    "$ROOT/"*) die "EVIDENCE_DIR must resolve outside the worktree: $EVIDENCE_DIR" ;;
  esac
fi

origin_url=$(candidate_git remote get-url origin 2>/dev/null || echo "")
if [ -z "$TEST_MODE" ]; then
  case "$origin_url" in
    "$EXPECTED_ORIGIN_HTTPS"|"$EXPECTED_ORIGIN_SSH") ;;
    *) die "production acceptance requires the canonical GitHub origin; got '${origin_url:-<missing>}'" ;;
  esac
  candidate_git fetch --quiet origin main \
    || die "cannot refresh origin/main; production acceptance requires current remote truth"
fi
sha=$(candidate_git rev-parse HEAD 2>/dev/null) || die "cannot resolve HEAD"
origin_main=$(candidate_git rev-parse refs/remotes/origin/main 2>/dev/null) \
  || die "cannot resolve origin/main"
branch=$(candidate_git rev-parse --abbrev-ref HEAD 2>/dev/null) || die "cannot resolve branch"
status_before=$(candidate_git status --porcelain --untracked-files=normal 2>/dev/null) \
  || die "cannot inspect worktree status"
clean_before=true
[ -n "$status_before" ] && clean_before=false

if [ -z "$TEST_MODE" ]; then
  [ "$clean_before" = true ] || die "production acceptance requires a clean worktree"
  [ "$sha" = "$origin_main" ] \
    || die "production acceptance requires HEAD == origin/main ($sha != $origin_main)"
fi

# Production cold evidence is inseparable from the reset: no file or caller-controlled token
# can authorize the label. Test mode skips destruction and is stamped as non-Gate-A1 evidence.
if [ "$MODE" = cold ] && [ -z "$TEST_MODE" ]; then
  "$ROOT/scripts/lib/volume-reset.sh"
fi

mkdir -p "$EVIDENCE_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
schema="demo-acceptance/v2"
[ -n "$TEST_MODE" ] && schema="demo-acceptance/v2-test"
manifest="$EVIDENCE_DIR/acceptance-${stamp}-${sha:0:12}-${MODE}-$$.json"
[ ! -e "$manifest" ] || die "refusing to overwrite an existing manifest at $manifest"
runs_json="[]"
result="passed"
failure_reason=""

if [ -n "$TEST_MODE" ]; then
  echo "═══ Acceptance contract test — $RUNS run(s), mode=$MODE, sha=${sha:0:12} ═══"
  echo "  (ACCEPTANCE_TEST_MODE — TEST-class manifest, NOT Gate A1 evidence)"
else
  echo "═══ Gate A1 acceptance — $RUNS consecutive §7 run(s), mode=$MODE, sha=${sha:0:12} ═══"
fi
for n in $(seq 1 "$RUNS"); do
  echo "→ run $n/$RUNS …"
  start=$(date +%s)
  set +e
  if [ "$gate_is_override" = true ]; then
    env -u MAKEFLAGS -u MFLAGS -u MAKELEVEL -u MAKEOVERRIDES bash -c "$GATE_CMD"
  else
    env -u MAKEFLAGS -u MFLAGS -u MAKELEVEL -u MAKEOVERRIDES \
      "$gate_resolved" -C "$ROOT" demo-e2e
  fi
  run_exit=$?
  set -e
  duration=$(( $(date +%s) - start ))
  runs_json=$(python3 - "$runs_json" "$n" "$run_exit" "$duration" <<'PY'
import json
import sys
runs = json.loads(sys.argv[1])
runs.append({"run": int(sys.argv[2]), "exit": int(sys.argv[3]), "duration_s": int(sys.argv[4])})
print(json.dumps(runs))
PY
)
  if [ "$run_exit" -ne 0 ]; then
    result="failed"
    failure_reason="score gate run $n failed with exit $run_exit"
    echo "✗ run $n failed (exit $run_exit) — aborting: Gate A1 demands CONSECUTIVE passes."
    break
  fi
done

# Sample runtime provenance after the candidate gate, then re-check source before writing any
# verdict. A source mutation invalidates even an otherwise green run.
artifact_sha=$(curl -sf --connect-timeout 2 --max-time 5 "$API/api/model" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['artifact_sha256'])" 2>/dev/null) \
  || artifact_sha=""
[[ "$artifact_sha" =~ ^[0-9a-f]{64}$ ]] || artifact_sha=""
chunks=$("${DEMO_COMPOSE[@]}" exec -T timescaledb timeout 8 psql -U pwa -d pwa -tA \
  -c "SELECT num_chunks FROM timescaledb_information.hypertables WHERE hypertable_name='telemetry'" \
  2>/dev/null) || chunks=""
[[ "$chunks" =~ ^[0-9]+$ ]] || chunks=""

after_origin_url=$(candidate_git remote get-url origin 2>/dev/null || echo "")
remote_after_failure=""
if [ -z "$TEST_MODE" ]; then
  if [ "$after_origin_url" != "$origin_url" ]; then
    remote_after_failure="origin URL changed during acceptance"
  elif ! candidate_git fetch --quiet origin main; then
    remote_after_failure="cannot refresh origin/main after acceptance"
  fi
fi
after_sha=$(candidate_git rev-parse HEAD 2>/dev/null || echo "")
after_origin_main=$(candidate_git rev-parse refs/remotes/origin/main 2>/dev/null || echo "")
clean_after=true
if ! status_after=$(candidate_git status --porcelain --untracked-files=normal 2>/dev/null); then
  status_after="source status unavailable"
  clean_after=false
fi
[ -n "$status_after" ] && clean_after=false

if [ -z "$TEST_MODE" ]; then
  source_failure="$remote_after_failure"
  [ "$after_sha" = "$sha" ] \
    || source_failure="${source_failure:+$source_failure; }HEAD changed during acceptance"
  [ "$after_origin_main" = "$origin_main" ] \
    || source_failure="${source_failure:+$source_failure; }origin/main changed during acceptance"
  [ "$clean_after" = true ] \
    || source_failure="${source_failure:+$source_failure; }worktree became dirty during acceptance"
  if [ -n "$source_failure" ]; then
    result="invalid"
    failure_reason="$source_failure"
  fi
fi

python3 - "$manifest" "$schema" "$sha" "$origin_main" "$branch" "$clean_before" \
  "$after_sha" "$after_origin_main" "$clean_after" "$MODE" "$stamp" "$RUNS" \
  "$artifact_sha" "$chunks" "$runs_json" "$result" "$failure_reason" "${TEST_MODE:+1}" \
  "$GATE_CMD" "$gate_resolved" "$COMPOSE_FILE_PATH" "$COMPOSE_PROJECT_NAME" "$API" "$WEB" \
  "$TRUSTED_GIT" "$origin_url" "$after_origin_url" <<'PY'
import json
import sys

(
    _, path, schema, sha, origin_main, branch, clean_before, after_sha,
    after_origin_main, clean_after, mode, stamp, runs_requested, artifact_sha,
    chunks, runs_json, result, failure_reason, test_mode, gate_command,
    gate_command_resolved, compose_file, compose_project, api_base, web_base,
    git_command_resolved, origin_url, after_origin_url,
) = sys.argv
manifest = {
    "schema": schema,
    "test_mode": bool(test_mode),
    "sha": sha,
    "origin_main": origin_main,
    "branch": branch,
    "dirty": clean_before != "true",
    "source_before": {
        "sha": sha,
        "origin_main": origin_main,
        "origin_url": origin_url or None,
        "clean": clean_before == "true",
    },
    "source_after": {
        "sha": after_sha or None,
        "origin_main": after_origin_main or None,
        "origin_url": after_origin_url or None,
        "clean": clean_after == "true",
    },
    "source_tool": {
        "git_command_resolved": git_command_resolved,
        "remote_verified": not bool(test_mode),
    },
    "compose": {"file": compose_file, "project": compose_project},
    "endpoints": {"api": api_base, "web": web_base},
    "mode": mode,
    "captured_at_utc": stamp,
    "runs_requested": int(runs_requested),
    "gate_command": gate_command,
    "gate_command_resolved": gate_command_resolved,
    "artifact_sha256": artifact_sha or None,
    "hypertable_chunks": int(chunks) if chunks else None,
    "runs": json.loads(runs_json),
    "result": result,
    "failure_reason": failure_reason or None,
}
with open(path, "x", encoding="utf-8") as fh:
    json.dump(manifest, fh, indent=2, ensure_ascii=False)
    fh.write("\n")
PY

echo "evidence manifest: $manifest"
if [ "$result" = invalid ]; then
  echo "✗ INVALID — source identity changed during acceptance: $failure_reason" >&2
  exit 2
fi
if [ "$result" != passed ]; then
  exit 1
fi
if [ -n "$TEST_MODE" ]; then
  echo "✓ TEST HARNESS PASSED — $RUNS run(s) at $sha ($MODE); not Gate A1 evidence."
  exit 0
fi
echo "✓ ACCEPTED — $RUNS consecutive run(s) passed at $sha ($MODE)."
