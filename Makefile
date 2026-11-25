.DEFAULT_GOAL := help
COMPOSE := docker compose
# Reuse the running app container when there is one, otherwise start a throwaway one.
# Both paths go through dev-entrypoint.sh, so node_modules is re-synced if the lockfile changed.
# Targets that need the database (`test`, `db-*`) depend on `postgres-up`, which starts postgres
# and waits until it is healthy, so neither path needs `make up` first.
RUN = $(if $(shell $(COMPOSE) ps --status running -q app 2>/dev/null),$(COMPOSE) exec -T app dev-entrypoint.sh,$(COMPOSE) run --rm --no-deps app)

.PHONY: help postgres-up up down logs sh test test-unit e2e lint typecheck check validate db-generate db-migrate db-studio db-reset audio prod

help: ## List targets
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

postgres-up:
	$(COMPOSE) up -d --wait postgres

up: postgres-up ## Start app (dev, hot reload) + postgres at http://localhost:3000
	$(COMPOSE) run --rm --no-deps app pnpm db:ensure
	$(COMPOSE) up -d --build --wait app

down: ## Stop and remove containers (volumes are kept)
	$(COMPOSE) --profile e2e down

logs: ## Follow app logs
	$(COMPOSE) logs -f app

sh: ## Shell inside the app container
	$(COMPOSE) run --rm app sh

test: postgres-up ## Unit + component + integration tests (Vitest, real Postgres)
	$(RUN) pnpm test

test-unit: ## Unit + component tests only (no database needed)
	$(RUN) pnpm test:unit

e2e: ## Playwright E2E at 360px (starts app if needed)
	$(COMPOSE) --profile e2e run --rm --build e2e

lint: ## ESLint
	$(RUN) pnpm lint

typecheck: ## tsc --noEmit
	$(RUN) pnpm typecheck

check: lint typecheck test validate ## lint + typecheck + test + content validation

validate: ## Validate everything under content/ (schema + cross-file rules)
	$(RUN) pnpm content:validate

db-generate: ## Generate a SQL migration from src/db/schema.ts
	$(RUN) pnpm db:generate

db-migrate: postgres-up ## Create the dev database if missing, apply pending migrations
	$(RUN) pnpm db:migrate

db-studio: postgres-up ## Drizzle Studio at https://local.drizzle.studio (port 4983, localhost only)
	$(COMPOSE) run --rm --no-deps -p 127.0.0.1:4983:4983 app dev-entrypoint.sh pnpm db:studio

db-reset: ## DEV ONLY: drop + recreate the *_dev database, then migrate (needs CONFIRM=<database name>)
	@# guard first, before postgres is even started; the script refuses any database not ending in _dev
	$(RUN) env CONFIRM='$(CONFIRM)' pnpm db:reset --check
	@$(MAKE) --no-print-directory postgres-up
	$(RUN) env CONFIRM='$(CONFIRM)' pnpm db:reset

# Not implemented yet: fail loudly instead of faking success.
audio:       ; @echo "make $@: not implemented yet (PR 7: audio-tts)" >&2; exit 1
prod:        ; @echo "make $@: not implemented yet (PR 13: selfhost-deploy)" >&2; exit 1
