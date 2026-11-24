.DEFAULT_GOAL := help
COMPOSE := docker compose
# reuse the running app container when there is one, otherwise start a throwaway one
RUN = $(if $(shell $(COMPOSE) ps --status running -q app 2>/dev/null),$(COMPOSE) exec -T app,$(COMPOSE) run --rm --no-deps app)

.PHONY: help up down logs sh test e2e lint typecheck check validate db-generate db-migrate db-studio db-reset audio prod

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

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
