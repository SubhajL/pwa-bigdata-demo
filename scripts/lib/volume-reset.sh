#!/usr/bin/env bash
# The ONE place Docker volumes are destroyed (PR-F, QCHECK HIGH ×2).
#
# The guard and the destructive command live in the SAME process on purpose: a guard in a
# separate Make recipe line is no guard at all, because `make -i` / `MAKEFLAGS=-i` ignores
# a recipe's exit status and runs the next line anyway. Here, a missing confirmation exits
# before `down -v` is ever reached, whatever the caller's error policy. Every
# volume-removing target routes through this script — `demo-down` and `demo-e2e-cold`
# alike — so "nothing is reset implicitly" is a property of the code, not a promise in a
# document.
#
# On success it mints a single-use COLD CAPABILITY: `demo-acceptance.sh` may only label a
# run `cold` by atomically CLAIMING this file (rename), which proves a guarded reset ran,
# binds the label to THIS compose project, and cannot be shared by two runners. It carries
# a nonce and the compose file it reset, is written atomically via `mktemp`+`mv` (so a
# planted symlink at the destination is replaced, never followed — a confirmed reset must
# not destroy anything beyond the volumes it named), and lives OUTSIDE the worktree so a
# clean checkout still reports `dirty: false`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE_PATH:-$ROOT/infra/docker-compose.yml}"
STATE_DIR="${ACCEPTANCE_STATE_DIR:-${TMPDIR:-/tmp}/pwa-demo-acceptance}"
RECEIPT="$STATE_DIR/volume-reset-receipt"

if [ "${CONFIRM_VOLUME_RESET:-}" != "1" ]; then
  echo "REFUSED: this removes the Docker volumes (database reset — data is lost)."
  echo "Nothing was touched. To proceed deliberately, re-run with:"
  echo "  CONFIRM_VOLUME_RESET=1"
  exit 2
fi

docker compose -f "$COMPOSE_FILE" down -v

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR" 2>/dev/null || true
tmp=$(mktemp "$STATE_DIR/receipt.XXXXXX")
{
  echo "epoch=$(date -u +%s)"
  echo "compose_file=$COMPOSE_FILE"
  echo "nonce=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
} > "$tmp"
chmod 600 "$tmp"
mv -f "$tmp" "$RECEIPT"   # atomic replace; never follows a symlink at the destination
echo "volumes removed; single-use cold capability minted at $RECEIPT"
