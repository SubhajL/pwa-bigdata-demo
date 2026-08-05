# Demo operator targets (PR-17 / slice S-D). Thin wrappers over the compose stack + demo scripts,
# so a second operator can run the scored demo without knowing the internals.
COMPOSE := docker compose -f infra/docker-compose.yml

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

# ONE recipe line, and the confirmation guard lives INSIDE volume-reset.sh: a guard in a
# separate recipe line is bypassable by `make -i` / MAKEFLAGS=-i, which ignores a failed
# line and runs the next one. `&&` also stops the acceptance run when the reset refuses.
demo-e2e-cold: ## TRUE cold acceptance: DESTROYS Docker volumes first — refuses without CONFIRM_VOLUME_RESET=1
	scripts/lib/volume-reset.sh && RUNS=1 ACCEPTANCE_MODE=cold scripts/demo-acceptance.sh
