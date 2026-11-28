#!/bin/sh
# Restore a backup made by backup.sh into the production database: a TRUE REPLACE, all or nothing.
# Usage: restore.sh <file> <confirm>   (confirm must equal the database name)
# Environment (set by the Makefile): COMPOSE_CMD, DB_NAME, DB_USER, BACKUP_DIR, KEEP.
# Optional: ALLOW_OTHER_DB=1 (dump of another database), ALLOW_NEWER=1 (dump newer than this code).
#
# Order: check everything (nothing is touched) -> copy the dump aside -> stop the app -> safety backup (never pruning)
#        -> ONE transaction: drop the app schemas, load the dump -> run the normal `up` (migrations, app).
# If anything fails the data is unchanged (the transaction is rolled back) and the app is started again.
set -eu
umask 077

: "${COMPOSE_CMD:?COMPOSE_CMD is not set}" "${DB_NAME:?DB_NAME is not set}" "${DB_USER:?DB_USER is not set}"
file="${1:-}"
confirm="${2:-}"
here=$(dirname "$0")
fail() { echo "ERROR: $*" >&2; exit 1; }

[ -n "$file" ] || fail "say which file. Example: make prod-restore FILE=backups/<name>.dump CONFIRM=$DB_NAME"
[ -s "$file" ] || fail "$file does not exist or is empty"
if [ "$confirm" != "$DB_NAME" ]; then
  echo "ERROR: restoring REPLACES everything in database \"$DB_NAME\" with the contents of $file." >&2
  echo "To confirm, run: make prod-restore FILE=$file CONFIRM=$DB_NAME" >&2
  exit 1
fi
case "$(basename "$file")" in
  "ezh-$DB_NAME-"*) ;;
  *) [ "${ALLOW_OTHER_DB:-}" = 1 ] || fail "$file is not named like a backup of \"$DB_NAME\" (ezh-$DB_NAME-...). ไฟล์นี้ไม่ใช่ backup ของฐานข้อมูล $DB_NAME. If you are sure, add ALLOW_OTHER_DB=1" ;;
esac

# shellcheck disable=SC2086
$COMPOSE_CMD exec -T postgres pg_isready -U "$DB_USER" > /dev/null 2>&1 \
  || fail "postgres is not running. Start the stack first: make prod-up  (ฐานข้อมูลไม่ได้รันอยู่ ให้สั่ง make prod-up ก่อน)"

work=$(mktemp -d "${TMPDIR:-/tmp}/ezh-restore.XXXXXX")
stopped=""
cleanup() {
  rc=$?
  trap - EXIT
  if [ -n "$stopped" ]; then
    # the normal start path: postgres, then migrations, then the app
    # shellcheck disable=SC2086
    $COMPOSE_CMD up -d --wait || echo "WARNING: could not start the app again. Run: make prod-up" >&2
  fi
  rm -rf "$work"
  exit "$rc"
}
trap cleanup EXIT

# a private copy: nothing that happens to backups/ (pruning, a mistake) can pull the file away from under us
cp "$file" "$work/in.dump"

# shellcheck disable=SC2086
listing=$($COMPOSE_CMD exec -T postgres pg_restore -l < "$work/in.dump") || fail "$file is not a valid backup file (pg_restore cannot read it)"
dumpdb=$(printf '%s\n' "$listing" | sed -n 's/^; *dbname: *//p' | head -n 1)
if [ "$dumpdb" != "$DB_NAME" ] && [ "${ALLOW_OTHER_DB:-}" != 1 ]; then
  fail "this dump comes from database \"${dumpdb:-unknown}\", not \"$DB_NAME\". ไฟล์นี้เป็นของฐานข้อมูลอื่น. If you are sure, add ALLOW_OTHER_DB=1"
fi

# a dump from a NEWER version of the app has tables this code does not know: refuse unless told otherwise
# shellcheck disable=SC2086
dumpmax=$($COMPOSE_CMD exec -T postgres pg_restore --data-only -n drizzle -t __drizzle_migrations < "$work/in.dump" \
  | awk '/^COPY /{c=1;next} /^\\\.$/{c=0} c{ if ($3+0>m) m=$3+0 } END{printf "%.0f", m}') || dumpmax=0
# shellcheck disable=SC2086
journalmax=$($COMPOSE_CMD run --rm --no-deps -T --entrypoint cat migrate /app/migrations/meta/_journal.json \
  | grep -o '"when": *[0-9]*' | grep -o '[0-9]*$' | sort -n | tail -n 1) || journalmax=""
[ -n "$journalmax" ] || fail "cannot read the migration list of the app image. Build it first: make prod-build"
if [ "${dumpmax:-0}" -gt "$journalmax" ] && [ "${ALLOW_NEWER:-}" != 1 ]; then
  fail "this backup was made by a NEWER version of the app (it has migrations this version does not know). Update first: git pull && make prod-update. backup นี้มาจากแอปเวอร์ชันที่ใหม่กว่า ให้อัปเดตแอปก่อน. To restore anyway: ALLOW_NEWER=1"
fi

# shellcheck disable=SC2086
$COMPOSE_CMD stop app
stopped=1

echo "Taking a safety backup of the current data first ..."
out=$(LABEL=pre-restore PRUNE=0 sh "$here/backup.sh") || fail "the safety backup failed, so nothing was restored and the data is unchanged"
safety=$(printf '%s\n' "$out" | tail -n 1)
echo "Safety backup: $safety"

echo "Restoring $file into $DB_NAME ..."
# shellcheck disable=SC2086
$COMPOSE_CMD exec -T postgres pg_restore --no-owner -f - --no-acl < "$work/in.dump" > "$work/body.sql" \
  || fail "pg_restore could not read the dump. The data is unchanged. Safety backup: $safety (ข้อมูลเดิมไม่เปลี่ยน)"

# DROP + CREATE + the dump in ONE transaction: objects that only a newer migration made cannot survive an older dump,
# and a failure anywhere rolls everything back
# shellcheck disable=SC2086
{ printf 'DROP SCHEMA IF EXISTS public CASCADE;\nDROP SCHEMA IF EXISTS drizzle CASCADE;\nCREATE SCHEMA public;\n'; cat "$work/body.sql"; } \
  | $COMPOSE_CMD exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" --single-transaction -v ON_ERROR_STOP=1 -q > /dev/null \
  || fail "the restore failed and was rolled back: the data is unchanged (ข้อมูลเดิมไม่เปลี่ยน). Safety backup: $safety"

echo "Restore finished. Starting the app (pending migrations run first) ..."
