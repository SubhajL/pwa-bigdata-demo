#!/usr/bin/env bash
# Item 3.1 provenance probe (PR-D, extracted in PR-F so it is BEHAVIORALLY testable):
# the artifact hash the API serves must BE the hash of the model file inside the running
# image — one hash across API, UI card, preflight, and the acceptance manifest.
#
# Usage: artifact-provenance-probe.sh <API_BASE>
# Exit:  0 = digests match · 1 = two REAL digests differ (a provenance mismatch) ·
#        2 = probe failure (curl/exec error or malformed output) — NEVER a verdict.
#
# A curl/exec FAILURE (non-zero status) clears the value, and anything that is not a
# whole-string 64-hex digest is treated the same way — a noisy producer whose output
# merely CONTAINS a digest line must read as a probe failure. The container path honors
# the same MODEL_PATH override the API's resolver does, so an honest custom artifact
# never reads as a mismatch. Read-only and bounded; `curl`/`docker` come from PATH so the
# five-case harness (api/tests/test_acceptance_harness.py) can stub them.
set -euo pipefail

API="${1:?usage: artifact-provenance-probe.sh <API_BASE>}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE_PATH:-$ROOT/infra/docker-compose.yml}"
LABEL="topic ๓ · artifact provenance"

api_sha=$(curl -sf --connect-timeout 2 --max-time 5 "$API/api/model" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['artifact_sha256'])" 2>/dev/null) \
  || api_sha=""
img_sha=$(docker compose -f "$COMPOSE_FILE" exec -T api timeout 8 python3 -c \
  "import hashlib,os; p=(os.environ.get('MODEL_PATH') or '').strip() or '/srv/artifacts/model.pkl'; print(hashlib.sha256(open(p,'rb').read()).hexdigest())" \
  2>/dev/null) || img_sha=""
[[ "$api_sha" =~ ^[0-9a-f]{64}$ ]] || api_sha=""
[[ "$img_sha" =~ ^[0-9a-f]{64}$ ]] || img_sha=""

if [ -z "$api_sha" ] || [ -z "$img_sha" ]; then
  printf '  ✗ %-34s (hash probe failed — API/exec error or malformed digest, not a mismatch verdict)\n' \
    "$LABEL"
  exit 2
elif [ "$api_sha" = "$img_sha" ]; then
  printf '  ✓ %-34s artifact_sha256 %.12s… matches the running image\n' "$LABEL" "$api_sha"
  exit 0
else
  printf '  ✗ %-34s (served artifact_sha256 %.12s… != image file %.12s…)\n' \
    "$LABEL" "$api_sha" "$img_sha"
  exit 1
fi
