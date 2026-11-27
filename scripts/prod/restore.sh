#!/bin/sh
# Restore a backup made by backup.sh into the production database.
# Usage: restore.sh <file> <confirm>   (confirm must equal the database name)
# Order: validate everything -> stop the app -> take a fresh safety backup -> restore in ONE transaction -> start the app.
# If anything fails before the restore, the database is untouched; the restore itself is all-or-nothing.
set -eu

: "${COMPOSE_CMD:?COMPOSE_CMD is not set}" "${DB_NAME:?DB_NAME is not set}" "${DB_USER:?DB_USER is not set}"
file="${1:-}"
confirm="${2:-}"
here=$(dirname "$0")

[ -n "$file" ] || { echo "ERROR: say which file. Example: make prod-restore FILE=backups/<name>.dump CONFIRM=$DB_NAME" >&2; exit 1; }
[ -s "$file" ] || { echo "ERROR: $file does not exist or is empty" >&2; exit 1; }
if [ "$confirm" != "$DB_NAME" ]; then
  echo "ERROR: restoring REPLACES everything in database \"$DB_NAME\" with the contents of $file." >&2
  echo "To confirm, run: make prod-restore FILE=$file CONFIRM=$DB_NAME" >&2
  exit 1
fi

# is it really a pg_dump custom-format file?
# shellcheck disable=SC2086
$COMPOSE_CMD exec -T postgres pg_restore -l < "$file" > /dev/null || { echo "ERROR: $file is not a valid backup file" >&2; exit 1; }

# no writes while we work; the app is started again at the end (also on failure, so the user is not left with it off)
# shellcheck disable=SC2086
$COMPOSE_CMD stop app
trap '$COMPOSE_CMD start app' EXIT

echo "Taking a safety backup of the current data first ..."
LABEL=pre-restore sh "$here/backup.sh"

echo "Restoring $file into $DB_NAME ..."
# shellcheck disable=SC2086
$COMPOSE_CMD exec -T postgres pg_restore --clean --if-exists --no-owner --single-transaction -U "$DB_USER" -d "$DB_NAME" < "$file"
echo "Restore finished."
