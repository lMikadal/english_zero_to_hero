.DEFAULT_GOAL := help
COMPOSE := docker compose
# Reuse the running app container when there is one, otherwise start a throwaway one.
# Both paths go through dev-entrypoint.sh, so node_modules is re-synced if the lockfile changed.
# Targets that need the database (`test`, `db-*`) depend on `postgres-up`, which starts postgres
# and waits until it is healthy, so neither path needs `make up` first.
# Only the long-running `app` service container from THIS checkout counts: `compose ps` also lists
# one-off `run` containers (e.g. another agent's test run from a git worktree using the same project
# name), and exec-ing into one of those runs the wrong code and dies with it (exit 137).
# The production and stage stacks run from this same folder (same working_dir label) and also have a service called
# `app`, so the DEV compose project name is part of the filter: a running prod app must never be mistaken for the dev app.
DEV_PROJECT = $(or $(COMPOSE_PROJECT_NAME),$(notdir $(CURDIR)))
APP_UP = $(shell docker ps -q --filter status=running --filter label=com.docker.compose.service=app \
	--filter label=com.docker.compose.oneoff=False \
	--filter "label=com.docker.compose.project=$(DEV_PROJECT)" \
	--filter "label=com.docker.compose.project.working_dir=$(CURDIR)" 2>/dev/null)
RUN = $(if $(APP_UP),$(COMPOSE) exec -T app dev-entrypoint.sh,$(COMPOSE) run --rm --no-deps app)

.PHONY: help postgres-up up down logs sh test test-unit e2e lint typecheck check validate db-generate db-migrate db-studio db-reset clean-cache audio prod prod-init prod-check prod-build prod-up prod-down prod-logs prod-status prod-migrate prod-backup prod-backup-verify prod-backup-auto-install prod-backup-auto-uninstall prod-backup-auto-status prod-backup-auto-run prod-restore prod-update stage-init stage-down

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

# ---- Production (the real app on this machine; see docs/DEPLOYMENT.md) --------------------------------------------
# A separate compose file and project (ezh_prod) with its own database volume: it never shares anything with the
# dev stack above and can run at the same time (dev: 127.0.0.1:3000, prod: 127.0.0.1:3100).
# To try things WITHOUT touching real data use the stage-* targets at the end (project ezh_stage, database
# english_zero_to_hero_stage, port 3190, file .env.stage): make stage-init stage-build stage-up ... stage-down.
# RULE: no target ever passes -v / --volumes to the production project. The only command that removes a volume is
# stage-down, which names the project ezh_stage itself (scripts/prod/prod-scripts.test.ts enforces this).
PROD_ENV ?= .env.prod
PROD_PROJECT ?= ezh_prod
# The image tag and the backup folder come from the project name, so the stage stack can never replace the image that the
# next prod-up runs, nor prune the real backups: ezh_prod -> ezh-prod-app:latest + backups/, ezh_stage -> ezh-stage-app:latest + backups-stage/
PROD_IMAGE = ezh-$(subst _,-,$(patsubst ezh_%,%,$(PROD_PROJECT)))-app:latest
PROD_BACKUPS = backups$(if $(filter ezh_prod,$(PROD_PROJECT)),,-$(patsubst ezh_%,%,$(PROD_PROJECT)))
# Each project gets its own /24 (so the gateway the published port arrives from is known, see docker-compose.prod.yml):
# prod 172.30.10, stage 172.30.20, ci 172.30.30, any other project name a prefix derived from the name.
PROD_NET_PREFIX = $(if $(filter ezh_prod,$(PROD_PROJECT)),172.30.10,$(if $(filter ezh_stage,$(PROD_PROJECT)),172.30.20,$(if $(filter ezh_ci,$(PROD_PROJECT)),172.30.30,172.30.$(shell echo $$((40 + $$(printf %s '$(PROD_PROJECT)' | cksum | cut -d' ' -f1) % 200))))))
PROD := env PROD_IMAGE=$(PROD_IMAGE) PROD_NET_PREFIX=$(PROD_NET_PREFIX) $(COMPOSE) -p $(PROD_PROJECT) -f docker-compose.prod.yml --env-file $(PROD_ENV)
# every value is read by the same parser the scripts use: scripts/prod/env-get.sh
prod_var = $(shell sh scripts/prod/env-get.sh '$(PROD_ENV)' $(1) '$(2)')
PROD_DB = $(call prod_var,POSTGRES_DB,english_zero_to_hero)
PROD_USER = $(call prod_var,POSTGRES_USER,ezh)
PROD_PORT = $(call prod_var,APP_PORT,3100)
PROD_BIND = $(call prod_var,APP_BIND,127.0.0.1)
PROD_KEEP = $(call prod_var,BACKUP_KEEP,14)
PROD_ALLOWED = $(call prod_var,ALLOWED_IPS,)
PROD_KEEP_AUTO = $(call prod_var,BACKUP_KEEP_AUTO,14)
# automatic daily backup (docs/DEPLOYMENT.md): own log/state files under the git-ignored data/ (prod: backup-auto.*, stage: backup-auto-stage.*)
PROD_AUTO_TAG = $(if $(filter ezh_prod,$(PROD_PROJECT)),,-$(patsubst ezh_%,%,$(PROD_PROJECT)))
PROD_AUTO_ENV = KEEP_AUTO='$(PROD_KEEP_AUTO)' STATE_FILE=data/backup-auto$(PROD_AUTO_TAG).state LOG_FILE=data/backup-auto$(PROD_AUTO_TAG).log UNIT=ezh-$(patsubst ezh_%,%,$(PROD_PROJECT))-backup
# prod-up / prod-down take an automatic backup when the newest one is old; only for the real app by default (stage: make stage-up AUTO_ON_UP=1)
AUTO_ON_UP ?= $(if $(filter ezh_prod,$(PROD_PROJECT)),1,0)
PROD_SCRIPT_ENV = COMPOSE_CMD='$(PROD)' DB_NAME='$(PROD_DB)' DB_USER='$(PROD_USER)' BACKUP_DIR=$(PROD_BACKUPS) APP_BIND='$(PROD_BIND)' APP_PORT='$(PROD_PORT)' KEEP='$(PROD_KEEP)'

prod: prod-init prod-build prod-up ## Production, one command: create .env.prod if missing, build the image, start it

prod-init: ## Create .env.prod with a random database password (never overwrites an existing file)
	@if [ -e '$(PROD_ENV)' ]; then echo "$(PROD_ENV) already exists, leaving it alone"; else \
	  pw=$$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32); \
	  ( umask 077; sed "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$$pw/" .env.prod.example > '$(PROD_ENV)' ) \
	  && echo "created $(PROD_ENV) with a random database password"; fi

prod-check:
	@sh scripts/prod/check-env.sh '$(PROD_ENV)'

prod-build: prod-check ## Build the production image (run after git pull)
	$(PROD) build

# Before migrations can change the real data, a backup labelled -pre-update is taken when the image has a migration the
# database lacks (scripts/prod/pre-update.sh). SKIP=1 turns that off (prod-update has already taken one).
prod-up: prod-check ## Start production (backup if migrations are pending, then migrations, then the app)
	@COMPOSE_CMD='$(PROD)' sh scripts/prod/net-fix.sh $(PROD_PROJECT)_default $(PROD_NET_PREFIX)
	@MODE=if-pending $(PROD_SCRIPT_ENV) sh scripts/prod/pre-update.sh
	$(PROD) up -d --wait
	@echo "$(if $(filter ezh_prod,$(PROD_PROJECT)),production,stage ($(PROD_PROJECT))) is up: http://$(PROD_BIND):$(PROD_PORT)"
	@sh scripts/prod/access-check.sh --note '$(PROD_ALLOWED)'
	@if [ '$(AUTO_ON_UP)' = 1 ]; then $(PROD_SCRIPT_ENV) $(PROD_AUTO_ENV) sh scripts/prod/auto-backup.sh || echo "WARNING: the automatic backup failed: make $(PROD_PROJECT:ezh_%=%)-backup-auto-status (backup อัตโนมัติล้มเหลว)"; fi

prod-update: prod-check ## After git pull: backup (if data exists), build, start. THE way to update
	@# only LOOK for a subnet clash first (stops nothing); the one-time network move itself happens inside prod-up, after backup and build
	@COMPOSE_CMD='$(PROD)' sh scripts/prod/net-fix.sh $(PROD_PROJECT)_default $(PROD_NET_PREFIX) check
	@MODE=always $(PROD_SCRIPT_ENV) sh scripts/prod/pre-update.sh
	@$(MAKE) --no-print-directory prod-build PROD_ENV='$(PROD_ENV)' PROD_PROJECT='$(PROD_PROJECT)'
	@$(MAKE) --no-print-directory prod-up SKIP=1 PROD_ENV='$(PROD_ENV)' PROD_PROJECT='$(PROD_PROJECT)'

prod-down: ## Stop production (containers are removed, the database volume is kept); takes an automatic backup first when the newest is old
	@if [ '$(AUTO_ON_UP)' = 1 ]; then $(PROD_SCRIPT_ENV) $(PROD_AUTO_ENV) sh scripts/prod/auto-backup.sh || echo "WARNING: the automatic backup failed: make $(PROD_PROJECT:ezh_%=%)-backup-auto-status (backup อัตโนมัติล้มเหลว)"; fi
	$(PROD) down

prod-logs: ## Follow production logs
	$(PROD) logs -f --tail=100

prod-status: ## Is production running and healthy?
	$(PROD) ps -a
	@curl -fsS --max-time 5 http://$(PROD_BIND):$(PROD_PORT)/api/health && echo " <- /api/health" || echo "app did not answer on $(PROD_BIND):$(PROD_PORT)"
	@PROBE_EXEC='$(PROD) exec -T postgres' PROBE_GATEWAY='$(PROD_NET_PREFIX).1' sh scripts/prod/access-check.sh http://$(PROD_BIND):$(PROD_PORT) '$(PROD_ALLOWED)'
	@$(PROD_SCRIPT_ENV) $(PROD_AUTO_ENV) sh scripts/prod/auto-backup-status.sh --brief

prod-migrate: prod-check ## Apply pending database migrations by hand (prod-up already does this)
	$(PROD) up -d --wait postgres
	$(PROD) run --rm migrate

prod-backup: prod-check ## Dump the production database to backups/ (keeps the newest BACKUP_KEEP)
	@$(PROD_SCRIPT_ENV) sh scripts/prod/backup.sh

prod-restore: prod-check ## Restore backups/<file> (needs FILE=... CONFIRM=<database name>); takes a safety backup first
	@$(PROD_SCRIPT_ENV) sh scripts/prod/restore.sh '$(FILE)' '$(CONFIRM)'

prod-backup-verify: prod-check ## Is a backup restorable? FILE=backups/<file>; tries it in a scratch database, real data untouched
	@$(PROD_SCRIPT_ENV) sh scripts/prod/verify.sh '$(FILE)'

# Automatic daily backup: a systemd USER timer (no sudo) runs `make prod-backup-auto-run`; prod-up / prod-down add a backup when the
# newest one is old. Only the real project gets a timer; `make stage-backup-auto-run` runs the same script against the stage stack.
prod-backup-auto-run: prod-check ## (what the timer runs) automatic backup unless Docker/stack is off or the newest backup is < 22 h old
	@$(PROD_SCRIPT_ENV) $(PROD_AUTO_ENV) sh scripts/prod/auto-backup.sh

prod-backup-auto-install: ## Turn ON the automatic daily backup (systemd user timer, no sudo; production only)
	@sh scripts/prod/auto-backup-install.sh install '$(PROD_PROJECT)'

prod-backup-auto-uninstall: ## Turn OFF the automatic daily backup (existing backups are kept)
	@sh scripts/prod/auto-backup-install.sh uninstall '$(PROD_PROJECT)'

prod-backup-auto-status: ## Is the automatic backup installed? Next run, last result, newest backup and its age
	@$(PROD_SCRIPT_ENV) $(PROD_AUTO_ENV) sh scripts/prod/auto-backup-status.sh

# ---- Stage and ci: throwaway copies of the production stack (never the real data) ---------------------------------
# stage-<anything> / ci-<anything> = prod-<anything> with their own env file, compose project, image and backup folder:
#   stage: .env.stage, project ezh_stage, image ezh-stage-app, backups-stage/, database english_zero_to_hero_stage, port 3190
#   ci:    .env.ci,    project ezh_ci,    image ezh-ci-app,    backups-ci/,    database english_zero_to_hero_ci,    port 3195
# e.g. stage-build, stage-up, stage-status, stage-backup, stage-restore FILE=... CONFIRM=english_zero_to_hero_stage,
# stage-update, stage-logs, stage-roundtrip (a real backup/restore round trip with a marker row).
stage-init: ## Create .env.stage (own password, database english_zero_to_hero_stage, port 3190)
	@$(MAKE) --no-print-directory prod-init PROD_ENV=.env.stage PROD_PROJECT=ezh_stage
	@sed -i -e 's/^POSTGRES_DB=.*/POSTGRES_DB=english_zero_to_hero_stage/' -e 's/^APP_PORT=.*/APP_PORT=3190/' .env.stage

ci-init: ## Create .env.ci for the CI job (database english_zero_to_hero_ci, port 3195)
	@$(MAKE) --no-print-directory prod-init PROD_ENV=.env.ci PROD_PROJECT=ezh_ci
	@sed -i -e 's/^POSTGRES_DB=.*/POSTGRES_DB=english_zero_to_hero_ci/' -e 's/^APP_PORT=.*/APP_PORT=3195/' .env.ci

stage-down: ## Remove the stage stack AND its volume and backups-stage/ (only ever the project ezh_stage)
	$(COMPOSE) -p ezh_stage -f docker-compose.prod.yml --env-file .env.stage down -v --remove-orphans
	@rm -f backups-stage/*.dump backups-stage/*.partial; rmdir backups-stage 2>/dev/null || true

ci-down: ## Remove the ci stack AND its volume and backups-ci/ (only ever the project ezh_ci)
	$(COMPOSE) -p ezh_ci -f docker-compose.prod.yml --env-file .env.ci down -v --remove-orphans
	@rm -f backups-ci/*.dump backups-ci/*.partial; rmdir backups-ci 2>/dev/null || true

stage-%:
	@$(MAKE) --no-print-directory prod-$* PROD_ENV=.env.stage PROD_PROJECT=ezh_stage

ci-%:
	@$(MAKE) --no-print-directory prod-$* PROD_ENV=.env.ci PROD_PROJECT=ezh_ci

# Internal, reached only as stage-roundtrip / ci-roundtrip. For the real app (make prod-roundtrip) the script gets the
# target "prod" and refuses before it touches anything: scripts/prod/roundtrip.sh has no switch to allow it.
prod-roundtrip: prod-check
	@$(PROD_SCRIPT_ENV) sh scripts/prod/roundtrip.sh '$(patsubst ezh_%,%,$(PROD_PROJECT))'
