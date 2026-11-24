.DEFAULT_GOAL := help
COMPOSE := docker compose
# Reuse the running app container when there is one, otherwise start a throwaway one.
# Both paths go through dev-entrypoint.sh, so node_modules is re-synced if the lockfile changed.
# TODO(PR 3): integration tests need postgres; drop --no-deps for `test` then.
RUN = $(if $(shell $(COMPOSE) ps --status running -q app 2>/dev/null),$(COMPOSE) exec -T app dev-entrypoint.sh,$(COMPOSE) run --rm --no-deps app)

.PHONY: help up down logs sh test e2e lint typecheck check validate db-generate db-migrate db-studio db-reset audio prod

help: ## List targets
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

up: ## Start app (dev, hot reload) + postgres at http://localhost:3000
	$(COMPOSE) up -d --build --wait app

down: ## Stop and remove containers (volumes are kept)
	$(COMPOSE) --profile e2e down

logs: ## Follow app logs
	$(COMPOSE) logs -f app

sh: ## Shell inside the app container
	$(COMPOSE) run --rm app sh

test: ## Unit + component tests (Vitest)
	$(RUN) pnpm test

e2e: ## Playwright E2E at 360px (starts app if needed)
	$(COMPOSE) --profile e2e run --rm --build e2e

lint: ## ESLint
	$(RUN) pnpm lint

typecheck: ## tsc --noEmit
	$(RUN) pnpm typecheck

check: lint typecheck test ## lint + typecheck + test (content:validate joins in PR 2)

# Not implemented yet: fail loudly instead of faking success.
validate:    ; @echo "make $@: not implemented yet (PR 2: content schema)" >&2; exit 1
db-generate: ; @echo "make $@: not implemented yet (PR 3: db schema)" >&2; exit 1
db-migrate:  ; @echo "make $@: not implemented yet (PR 3: db schema)" >&2; exit 1
db-studio:   ; @echo "make $@: not implemented yet (PR 3: db schema)" >&2; exit 1
db-reset:    ; @echo "make $@: not implemented yet (PR 3: db schema)" >&2; exit 1
audio:       ; @echo "make $@: not implemented yet (PR 7: audio-tts)" >&2; exit 1
prod:        ; @echo "make $@: not implemented yet (PR 13: selfhost-deploy)" >&2; exit 1
