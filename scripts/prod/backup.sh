#!/bin/sh
# Write a compressed pg_dump of the production database to $BACKUP_DIR (folder 700, file 600: it holds all the learner's data).
# Environment (set by the Makefile): COMPOSE_CMD (the docker compose command for the prod stack), DB_NAME, DB_USER,
# BACKUP_DIR (default backups), KEEP (default 14, whole number >= 1), LABEL (optional: pre-restore, pre-update),
# PRUNE=0 to delete nothing (restore uses it: the safety backup must never remove the file being restored).
# The file is written by THIS shell (the host user), so it is owned by the user, not root.
set -eu
umask 077

: "${COMPOSE_CMD:?COMPOSE_CMD is not set}" "${DB_NAME:?DB_NAME is not set}" "${DB_USER:?DB_USER is not set}"
dir="${BACKUP_DIR:-backups}"
keep="${KEEP:-14}"
printf %s "$keep" | grep -Eq '^[1-9][0-9]*$' || keep=""
[ -n "$keep" ] || { echo "ERROR: KEEP must be a whole number of at least 1 (no leading zero), got '${KEEP:-}'" >&2; exit 1; }

mkdir -p "$dir"
chmod 700 "$dir"
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

[ "${PRUNE:-1}" = 0 ] || sh "$(dirname "$0")/prune-backups.sh" "$dir" "$DB_NAME" "$keep"
echo "$file"
