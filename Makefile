# Demo operator targets (PR-17 / slice S-D). Thin wrappers over the compose stack + demo scripts,
# so a second operator can run the scored demo without knowing the internals.
COMPOSE_FILE_PATH ?= $(CURDIR)/infra/docker-compose.yml
override COMPOSE_FILE_PATH := $(abspath $(COMPOSE_FILE_PATH))
COMPOSE_PROJECT_NAME ?= pwa-demo
export COMPOSE_FILE_PATH COMPOSE_PROJECT_NAME
COMPOSE := docker compose --file $(COMPOSE_FILE_PATH) --project-name $(COMPOSE_PROJECT_NAME)

.PHONY: help demo-up demo-down demo-preflight demo-reconnect demo-scenario e2e-setup demo-e2e demo-acceptance-3x demo-e2e-cold

help: ## list the demo targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-16s %s\n", $$1, $$2}'

demo-up: ## bring the full stack up (build if needed)
	$(COMPOSE) up -d --build

demo-down: ## stop the stack and REMOVE volumes — refuses without CONFIRM_VOLUME_RESET=1
	scripts/lib/volume-reset.sh

demo-preflight: ## stack-readiness gate (up + wait healthy + every scored surface live; volumes preserved)
	scripts/demo-preflight.sh

demo-reconnect: ## item 1.2 — restart the broker and time the reconnect (fails if > 30s)
	scripts/demo-reconnect.sh

demo-scenario: ## inject a fault: make demo-scenario MODE=anomaly|pressure_drop|bad_asset|normal
	scripts/demo-scenario.sh $(MODE)

e2e-setup: ## one-time: install Playwright + its chromium browser
	pnpm --dir e2e install --frozen-lockfile
	pnpm --dir e2e exec playwright install --with-deps chromium

demo-e2e: ## the score gate: preflight, then run the 16-item Playwright E2E; resets the sim on exit
	@set -e; \
	trap 'FAULT_MODE=normal $(COMPOSE) up -d simulator >/dev/null 2>&1 || true' EXIT; \
	scripts/demo-preflight.sh; \
	pnpm --dir e2e test

demo-acceptance-3x: ## Gate A1: THREE consecutive score-gate runs + exact-SHA evidence manifest (warm; volumes preserved)
	RUNS=3 scripts/demo-acceptance.sh

# The acceptance runner owns the confirmed reset and the gate in ONE execution. There is no
# caller-minted capability between them, and its internal guard remains immune to `make -i`.
demo-e2e-cold: ## TRUE cold acceptance: DESTROYS Docker volumes first — refuses without CONFIRM_VOLUME_RESET=1
	RUNS=1 ACCEPTANCE_MODE=cold scripts/demo-acceptance.sh
