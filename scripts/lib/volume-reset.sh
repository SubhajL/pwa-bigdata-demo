#!/usr/bin/env bash
# The one place demo Docker volumes are destroyed. The exact confirmation and destructive
# command stay in this same process so make error-handling flags cannot step past the guard.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
source "$ROOT/scripts/lib/demo-compose.sh"

if [ "${CONFIRM_VOLUME_RESET:-}" != "1" ]; then
  echo "REFUSED: this removes the Docker volumes (database reset — data is lost)."
  echo "Nothing was touched. To proceed deliberately, re-run with:"
  echo "  CONFIRM_VOLUME_RESET=1"
  exit 2
fi

"${DEMO_COMPOSE[@]}" down --volumes
echo "volumes removed for Compose project $COMPOSE_PROJECT_NAME"
