.DEFAULT_GOAL := help
COMPOSE := docker compose
# Reuse the running app container when there is one, otherwise start a throwaway one.
# Both paths go through dev-entrypoint.sh, so node_modules is re-synced if the lockfile changed.
# Targets that need the database (`test`, `db-*`) depend on `postgres-up`, which starts postgres
# and waits until it is healthy, so neither path needs `make up` first.
# Only the long-running `app` service container from THIS checkout counts: `compose ps` also lists
# one-off `run` containers (e.g. another agent's test run from a git worktree using the same project
# name), and exec-ing into one of those runs the wrong code and dies with it (exit 137).
APP_UP = $(shell docker ps -q --filter status=running --filter label=com.docker.compose.service=app \
	--filter label=com.docker.compose.oneoff=False \
	--filter "label=com.docker.compose.project.working_dir=$(CURDIR)" 2>/dev/null)
RUN = $(if $(APP_UP),$(COMPOSE) exec -T app dev-entrypoint.sh,$(COMPOSE) run --rm --no-deps app)

.PHONY: help postgres-up up down logs sh test test-unit e2e lint typecheck check validate db-generate db-migrate db-studio db-reset clean-cache audio prod prod-init prod-check prod-build prod-up prod-down prod-logs prod-status prod-migrate prod-backup prod-restore

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

# The dev database must exist and be migrated before the app is used, so `e2e` migrates it first (db-migrate
# creates it when missing). The lesson test expects a CLEAN learner (day 1, streak 0): CI is always fresh; locally run
# `make db-reset CONFIRM=english_zero_to_hero_dev` first.
e2e: db-migrate ## Playwright E2E at 360px (migrates the dev DB; needs a clean learner, see db-reset)
	$(COMPOSE) --profile e2e run --rm --build e2e

lint: ## ESLint
	$(RUN) pnpm lint

typecheck: ## tsc --noEmit
	$(RUN) pnpm typecheck

check: lint typecheck test validate ## lint + typecheck + test + content validation

# For agents working in a git worktree: same compose project (so same postgres/volumes) but a throwaway container with
# its own anonymous /app/.next volume, so generated types from another checkout cannot break tsc. No database needed.
worktree-check: ## lint + typecheck + unit tests in a one-off container (use this in git worktrees, not `check`)
	$(COMPOSE) -p english_zero_to_hero run --rm --no-deps -T -v /app/.next app sh -c "pnpm lint && pnpm typecheck && pnpm test:unit"

validate: ## Validate everything under content/ (schema + cross-file rules)
	$(RUN) pnpm content:validate

db-generate: ## Generate a SQL migration from src/db/schema.ts
	$(RUN) pnpm db:generate

db-migrate: postgres-up ## Create the dev database if missing, apply pending migrations
	$(RUN) pnpm db:migrate

db-studio: postgres-up ## Drizzle Studio at https://local.drizzle.studio (port 4983, localhost only)
	$(COMPOSE) run --rm --no-deps -p 127.0.0.1:4983:4983 app dev-entrypoint.sh pnpm db:studio

clean-cache: ## Empty the Next.js dev cache (.next). Use after moving/renaming files under src/app if the browser reloads in a loop
	$(COMPOSE) stop app
	$(COMPOSE) run --rm --no-deps -T app sh -c 'rm -rf /app/.next/* /app/.next/.[!.]* 2>/dev/null; true'

db-reset: ## DEV ONLY: drop + recreate the *_dev database, then migrate (needs CONFIRM=<database name>)
	@# guard first, before postgres is even started; the script refuses any database not ending in _dev
	$(RUN) env CONFIRM='$(CONFIRM)' pnpm db:reset --check
	@$(MAKE) --no-print-directory postgres-up
	$(RUN) env CONFIRM='$(CONFIRM)' pnpm db:reset

# Not implemented yet: fail loudly instead of faking success.
audio:       ; @echo "make $@: not implemented yet (PR 7: audio-tts)" >&2; exit 1

# ---- Production (the real app on this machine; see docs/DEPLOYMENT.md) --------------------------------------------
# A separate compose file and project (ezh_prod) with its own database volume: it never shares anything with the
# dev stack above and can run at the same time (dev: 127.0.0.1:3000, prod: 127.0.0.1:3100). PROD_ENV / PROD_PROJECT
# can be overridden to run a throwaway copy, e.g. for testing: make prod-up PROD_ENV=.env.stage PROD_PROJECT=ezh_stage
PROD_ENV ?= .env.prod
PROD_PROJECT ?= ezh_prod
PROD := $(COMPOSE) -p $(PROD_PROJECT) -f docker-compose.prod.yml --env-file $(PROD_ENV)
prod_var = $(or $(shell sed -n 's/^$(1)=//p' $(PROD_ENV) 2>/dev/null | tail -n 1),$(2))
PROD_DB = $(call prod_var,POSTGRES_DB,english_zero_to_hero)
PROD_USER = $(call prod_var,POSTGRES_USER,ezh)
PROD_PORT = $(call prod_var,APP_PORT,3100)
PROD_BIND = $(call prod_var,APP_BIND,127.0.0.1)
PROD_KEEP = $(call prod_var,BACKUP_KEEP,14)
PROD_SCRIPT_ENV = COMPOSE_CMD='$(PROD)' DB_NAME='$(PROD_DB)' DB_USER='$(PROD_USER)' BACKUP_DIR=backups KEEP='$(PROD_KEEP)'

prod: prod-init prod-build prod-up ## Production, one command: create .env.prod if missing, build the image, start it

prod-init: ## Create .env.prod with a random database password (does nothing if it already exists)
	@if [ -f '$(PROD_ENV)' ]; then echo "$(PROD_ENV) already exists, leaving it alone"; else \
	  pw=$$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32); \
	  sed "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$$pw/" .env.prod.example > '$(PROD_ENV)' && chmod 600 '$(PROD_ENV)' \
	  && echo "created $(PROD_ENV) with a random database password"; fi

prod-check:
	@sh scripts/prod/check-env.sh '$(PROD_ENV)'

prod-build: prod-check ## Build the production image (run after git pull)
	$(PROD) build

prod-up: prod-check ## Start production (postgres + migrations + app); open http://127.0.0.1:3100
	$(PROD) up -d --wait
	@echo "production is up: http://$(PROD_BIND):$(PROD_PORT)"

prod-down: ## Stop production (containers are removed, the database volume is kept)
	$(PROD) down

prod-logs: ## Follow production logs
	$(PROD) logs -f --tail=100

prod-status: ## Is production running and healthy?
	$(PROD) ps -a
	@curl -fsS --max-time 5 http://127.0.0.1:$(PROD_PORT)/api/health && echo " <- /api/health" || echo "app did not answer on port $(PROD_PORT)"

prod-migrate: prod-check ## Apply pending database migrations by hand (prod-up already does this)
	$(PROD) up -d --wait postgres
	$(PROD) run --rm migrate

prod-backup: prod-check ## Dump the production database to backups/ (keeps the newest BACKUP_KEEP)
	@$(PROD_SCRIPT_ENV) sh scripts/prod/backup.sh

prod-restore: prod-check ## Restore backups/<file> (needs FILE=... CONFIRM=<database name>); takes a safety backup first
	@$(PROD_SCRIPT_ENV) sh scripts/prod/restore.sh '$(FILE)' '$(CONFIRM)'
