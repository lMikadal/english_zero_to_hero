#!/bin/sh
# Write a compressed pg_dump of the production database to $BACKUP_DIR and keep the newest $KEEP.
# Environment (set by the Makefile): COMPOSE_CMD (the docker compose command for the prod stack),
# DB_NAME, DB_USER, BACKUP_DIR (default backups), KEEP (default 14), LABEL (optional suffix in the file name).
# The file is written by THIS shell (the host user), so it is owned by the user, not root.
set -eu

: "${COMPOSE_CMD:?COMPOSE_CMD is not set}" "${DB_NAME:?DB_NAME is not set}" "${DB_USER:?DB_USER is not set}"
dir="${BACKUP_DIR:-backups}"
keep="${KEEP:-14}"
case "$keep" in
  ''|*[!0-9]*|0) echo "ERROR: KEEP must be a positive number, got '$keep'" >&2; exit 1 ;;
esac

mkdir -p "$dir"
stamp=$(date +%Y%m%d-%H%M%S)
suffix=""
[ -z "${LABEL:-}" ] || suffix="-$LABEL"
file="$dir/ezh-$DB_NAME-$stamp$suffix.dump"
tmp="$file.partial"
trap 'rm -f "$tmp"' EXIT

# custom format is compressed and lets pg_restore restore it safely in one transaction
# shellcheck disable=SC2086
$COMPOSE_CMD exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --compress=9 > "$tmp"
[ -s "$tmp" ] || { echo "ERROR: pg_dump produced an empty file" >&2; exit 1; }
mv "$tmp" "$file"
trap - EXIT

sh "$(dirname "$0")/prune-backups.sh" "$dir" "$DB_NAME" "$keep"
echo "$file"
