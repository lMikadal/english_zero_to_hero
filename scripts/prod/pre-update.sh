#!/bin/sh
# Take a labelled backup before migrations can change the real data.
# Environment: COMPOSE_CMD, DB_NAME, DB_USER, BACKUP_DIR, KEEP, and
#   MODE=always      back up whenever the database already has data (used by make prod-update)
#   MODE=if-pending  back up only when the image has a migration the database lacks (used by make prod-up)
#   SKIP=1           do nothing
# First install (no data yet) never needs a backup. A failing backup stops the update (non-zero exit).
set -eu
: "${COMPOSE_CMD:?COMPOSE_CMD is not set}" "${DB_NAME:?DB_NAME is not set}" "${DB_USER:?DB_USER is not set}"
mode="${MODE:-always}"
[ "${SKIP:-}" != 1 ] || exit 0
here=$(dirname "$0")

# shellcheck disable=SC2086
$COMPOSE_CMD up -d --wait postgres
# shellcheck disable=SC2086
has=$($COMPOSE_CMD exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc "select to_regclass('drizzle.__drizzle_migrations')")
if [ -z "$has" ]; then
  echo "No data yet (first install): no backup needed."
  exit 0
fi

if [ "$mode" = if-pending ]; then
  # drizzle applies every migration whose timestamp is newer than the newest one stored in the database: same test here
  # shellcheck disable=SC2086
  dbmax=$($COMPOSE_CMD exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc "select coalesce(max(created_at),0) from drizzle.__drizzle_migrations")
  jf=$(mktemp "${TMPDIR:-/tmp}/ezh-journal.XXXXXX")
  trap 'rm -f "$jf"' EXIT
  # written to a file first: a pipeline would only report the status of its last command
  # shellcheck disable=SC2086
  $COMPOSE_CMD run --rm --no-deps -T --entrypoint cat migrate /app/migrations/meta/_journal.json > "$jf" \
    || { echo "ERROR: cannot read the migration list of the app image (make prod-build first)" >&2; exit 1; }
  journalmax=$(grep -o '"when": *[0-9]*' "$jf" | grep -o '[0-9]*$' | sort -n | tail -n 1)
  [ -n "$journalmax" ] || { echo "ERROR: cannot read the migration list of the app image (make prod-build first)" >&2; exit 1; }
  if [ "$journalmax" -le "${dbmax:-0}" ]; then
    echo "No pending migrations: no backup needed."
    exit 0
  fi
  echo "Pending migrations found: taking a backup first."
fi

LABEL=pre-update sh "$here/backup.sh"
