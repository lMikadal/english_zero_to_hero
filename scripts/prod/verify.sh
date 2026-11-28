#!/bin/sh
# Is this backup restorable? Restores it into a SCRATCH database inside the prod postgres container (never the real
# one), counts a few tables, and drops the scratch database again. Read-only for the real data.
# Usage: verify.sh <file>   Environment: COMPOSE_CMD, DB_NAME, DB_USER
set -eu
umask 077
: "${COMPOSE_CMD:?COMPOSE_CMD is not set}" "${DB_NAME:?DB_NAME is not set}" "${DB_USER:?DB_USER is not set}"
file="${1:-}"
fail() { echo "ERROR: $*" >&2; exit 1; }
[ -s "$file" ] || fail "$file does not exist or is empty. Example: make prod-backup-verify FILE=backups/<name>.dump"

scratch="ezh_verify_$(date +%s)_$$"
# shellcheck disable=SC2086
$COMPOSE_CMD exec -T postgres psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $scratch" > /dev/null \
  || fail "postgres is not running (make prod-up) (ฐานข้อมูลไม่ได้รันอยู่)"
drop() {
  rc=$?
  trap - EXIT
  # shellcheck disable=SC2086
  $COMPOSE_CMD exec -T postgres psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $scratch WITH (FORCE)" > /dev/null 2>&1 || echo "WARNING: could not drop scratch database $scratch" >&2
  exit "$rc"
}
trap drop EXIT

# shellcheck disable=SC2086
$COMPOSE_CMD exec -T postgres pg_restore --no-owner --no-acl --exit-on-error -U "$DB_USER" -d "$scratch" < "$file" \
  || fail "this backup could NOT be restored (restore กลับไม่ได้)"
for q in "select 'migrations=' || count(*) from drizzle.__drizzle_migrations" "select 'progress=' || count(*) from progress" "select 'srs_cards=' || count(*) from srs_cards" "select 'attempts=' || count(*) from attempts"; do
  # shellcheck disable=SC2086
  $COMPOSE_CMD exec -T postgres psql -U "$DB_USER" -d "$scratch" -tAc "$q" || fail "the restored copy is missing expected tables"
done
echo "backup OK (restorable): $file"
