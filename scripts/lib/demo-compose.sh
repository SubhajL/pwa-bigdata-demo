#!/usr/bin/env bash
# One Compose identity for every demo operator, acceptance, and E2E entry point.
# Callers source this file after enabling their own shell safety options.

DEMO_COMPOSE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
demo_compose_requested="${COMPOSE_FILE_PATH:-$DEMO_COMPOSE_ROOT/infra/docker-compose.yml}"
if [[ "$demo_compose_requested" != /* ]]; then
  demo_compose_requested="$PWD/$demo_compose_requested"
fi
demo_compose_dir="$(cd "$(dirname "$demo_compose_requested")" 2>/dev/null && pwd -P)" || {
  echo "REFUSED: Compose file directory does not exist: $demo_compose_requested" >&2
  return 2 2>/dev/null || exit 2
}
COMPOSE_FILE_PATH="$demo_compose_dir/$(basename "$demo_compose_requested")"
[ -f "$COMPOSE_FILE_PATH" ] || {
  echo "REFUSED: Compose file does not exist: $COMPOSE_FILE_PATH" >&2
  return 2 2>/dev/null || exit 2
}

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-pwa-demo}"
[[ "$COMPOSE_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || {
  echo "REFUSED: invalid COMPOSE_PROJECT_NAME: $COMPOSE_PROJECT_NAME" >&2
  return 2 2>/dev/null || exit 2
}

export COMPOSE_FILE_PATH COMPOSE_PROJECT_NAME
DEMO_COMPOSE=(docker compose --file "$COMPOSE_FILE_PATH" --project-name "$COMPOSE_PROJECT_NAME")
