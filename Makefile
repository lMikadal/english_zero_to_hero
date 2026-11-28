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

.PHONY: help postgres-up up down logs sh test test-unit e2e lint typecheck check validate db-generate db-migrate db-studio db-reset clean-cache audio prod

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

validate: ## Validate everything under content/ (schema + cross-file rules); also writes .content-validate-summary.md for the CI job summary
	@rm -f .content-validate-summary.md
	$(RUN) sh -c 'CONTENT_VALIDATE_SUMMARY=/app/.content-validate-summary.md pnpm content:validate'

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
prod:        ; @echo "make $@: not implemented yet (PR 13: selfhost-deploy)" >&2; exit 1
