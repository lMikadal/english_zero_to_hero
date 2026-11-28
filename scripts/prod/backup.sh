#!/bin/sh
# Write a compressed pg_dump of the production database to $BACKUP_DIR (folder 700, file 600: it holds all the learner's data).
# Environment (set by the Makefile): COMPOSE_CMD (the docker compose command for the prod stack), DB_NAME, DB_USER,
# BACKUP_DIR (default backups), KEEP (default 14, whole number >= 1), LABEL (optional: pre-restore, pre-update, auto),
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
suffix=""
[ -z "${LABEL:-}" ] || suffix="-$LABEL"
# UTC, so a time zone change cannot reorder the names. A name that exists is never overwritten: wait for the next second.
tries=0
while :; do
  file="$dir/ezh-$DB_NAME-$(date -u +%Y%m%d-%H%M%S)$suffix.dump"
  [ ! -e "$file" ] && break
  tries=$((tries + 1)); [ "$tries" -lt 5 ] || { echo "ERROR: $file already exists" >&2; exit 1; }
  sleep 1
done
tmp="$file.partial"
trap 'rm -f "$tmp"' EXIT

# custom format is compressed and lets pg_restore restore it safely in one transaction
# shellcheck disable=SC2086
$COMPOSE_CMD exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --compress=9 > "$tmp"
[ -s "$tmp" ] || { echo "ERROR: pg_dump produced an empty file" >&2; exit 1; }
mv "$tmp" "$file"
trap - EXIT

# backups whose time stamp is later than now: the clock was behind (or the time zone changed) when they were made, and
# names decide the order, so every new backup would look "older" than them. Tell the operator.
now=$(basename "$file" | sed -n 's/^ezh-.*-\([0-9]\{8\}-[0-9]\{6\}\)\(-[a-z-]*\)\{0,1\}\.dump$/\1/p')
future=$(ls -1 "$dir" 2>/dev/null | grep -E "^ezh-$DB_NAME-[0-9]{8}-[0-9]{6}(-[a-z-]+)?\.dump\$" | while IFS= read -r f; do
  st=$(printf '%s' "$f" | sed -n "s/^ezh-$DB_NAME-\([0-9]\{8\}-[0-9]\{6\}\).*/\1/p")
  [ "$st" \> "$now" ] && echo "$f"
done || true)
if [ -n "$future" ]; then
  {
    echo "WARNING: these backups are dated in the FUTURE (the clock was wrong when they were made):"
    printf '  %s\n' $future
    echo "Check the computer's clock, then move these files out of $dir so they do not confuse pruning."
    echo "คำเตือน: มี backup ที่ลงวันที่ในอนาคต (นาฬิกาเครื่องเคยผิด) ให้ตรวจนาฬิกา แล้วย้ายไฟล์เหล่านี้ออกจาก $dir"
  } >&2
fi

# the new file is passed to the pruner so it can never delete it; nothing is reported unless it is really there
scope=manual; [ "${LABEL:-}" != auto ] || scope=auto # KEEP is then the window of the automatic backups
[ "${PRUNE:-1}" = 0 ] || sh "$(dirname "$0")/prune-backups.sh" "$dir" "$DB_NAME" "$keep" "$file" "$scope"
[ -s "$file" ] || { echo "ERROR: $file is missing or empty after pruning" >&2; exit 1; }
echo "$file"
