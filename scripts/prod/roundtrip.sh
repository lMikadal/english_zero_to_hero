#!/bin/sh
# Real backup -> change -> restore round trip against a RUNNING prod-shaped stack (CI's throwaway stack, or `stage`).
# It uses the make targets, so the real pg_dump / pg_restore / psql commands run with the real flags (a fake cannot tell
# whether those flags are valid for the PostgreSQL version in use).
#   1. marker: a user with streaks.current = 42
#   2. backup #1 (marker = 42), then change the marker to 7
#   3. refusal: a migration row from the "future" is added, backup #2 is taken (marker 7, future row inside),
#      the row is deleted again; restoring backup #2 must FAIL and leave the data exactly as it is (marker still 7)
#   4. restore backup #1 must succeed: marker is 42 again, the migrations are intact, the app is healthy
# Usage: roundtrip.sh <prod|stage>   Environment: COMPOSE_CMD, DB_NAME, DB_USER, BASE_URL (for the smoke test)
# Only ever run it against a throwaway stack: it writes a marker user to the database it is pointed at.
set -eu
prefix="${1:?usage: roundtrip.sh <prod|stage>}"
: "${COMPOSE_CMD:?}" "${DB_NAME:?}" "${DB_USER:?}" "${BASE_URL:?}"
case "$DB_NAME" in *_dev|english_zero_to_hero) [ "${I_AM_THROWAWAY:-}" = 1 ] || { echo "refusing: $DB_NAME may be a real database (set I_AM_THROWAWAY=1 in CI)" >&2; exit 1; } ;; esac
dir=backups; [ "$prefix" = prod ] || dir="backups-$prefix"
fail() { echo "ROUNDTRIP FAIL: $*" >&2; exit 1; }
q() { $COMPOSE_CMD exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1"; }
marker() { q "select current from streaks where user_id = 'roundtrip-marker'"; }
make_backup() { make -s "$prefix-backup" | tail -n 1; }

q "insert into \"user\" (id, name, email) values ('roundtrip-marker', 'marker', 'marker@example.invalid') on conflict do nothing" > /dev/null
q "insert into streaks (user_id, current) values ('roundtrip-marker', 42) on conflict (user_id) do update set current = 42" > /dev/null
[ "$(marker)" = 42 ] || fail "could not write the marker"
migrations=$(q "select count(*) from drizzle.__drizzle_migrations")

good=$(make_backup)
[ -s "$good" ] || fail "backup #1 missing: $good"
echo "backup #1: $good (marker 42)"
make -s "$prefix-backup-verify" FILE="$good"

q "update streaks set current = 7 where user_id = 'roundtrip-marker'" > /dev/null
q "insert into drizzle.__drizzle_migrations (hash, created_at) values ('future', 99999999999999)" > /dev/null
sleep 1
future=$(make_backup)
[ "$future" != "$good" ] && [ -s "$future" ] || fail "backup #2 missing"
q "delete from drizzle.__drizzle_migrations where hash = 'future'" > /dev/null

echo "restore of a backup from a NEWER version must be refused ..."
if make -s "$prefix-restore" FILE="$future" CONFIRM="$DB_NAME"; then fail "the restore of a newer dump was NOT refused"; fi
[ "$(marker)" = 7 ] || fail "the refused restore changed the data (marker is $(marker), expected 7)"
echo "refused, data unchanged (marker 7)"

echo "restore of backup #1 ..."
make -s "$prefix-restore" FILE="$good" CONFIRM="$DB_NAME" || fail "restore of backup #1 failed"
[ "$(marker)" = 42 ] || fail "after the restore the marker is $(marker), expected 42 (the restore did nothing)"
[ "$(q 'select count(*) from drizzle.__drizzle_migrations')" = "$migrations" ] || fail "migrations are not intact after the restore"
sh "$(dirname "$0")/smoke.sh" "$BASE_URL"
echo "ROUNDTRIP OK: marker 7 -> 42 after restore, newer dump refused, migrations intact, app healthy ($dir)"
