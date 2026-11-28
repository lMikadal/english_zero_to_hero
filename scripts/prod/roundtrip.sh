#!/bin/sh
# Real backup -> change -> restore round trip against a RUNNING throwaway stack, using the make targets, so the real
# pg_dump / pg_restore / psql commands run with the real flags (a fake compose cannot tell whether they are valid).
#   1. marker: a user with streaks.current = 42
#   2. backup #1 (marker 42), then the marker becomes 7
#   3. refusal: a migration row from the "future" is added, backup #2 is taken (marker 7), the row is removed again;
#      restoring backup #2 must FAIL with "NEWER" and leave the data as it is (marker still 7)
#   4. restore backup #1 must succeed: marker 42 again, migrations intact, app healthy
#
# SAFE BY CONSTRUCTION: it only accepts the target `stage` or `ci`. It writes a marker user and a fake migration row, and
# the last restore replaces the data, so it must never run against the real app. There is no switch to allow that: the
# compose command and the database name (which `make stage-roundtrip` / `make ci-roundtrip` take from the same env file
# the restore uses) must belong to project ezh_<target> and database english_zero_to_hero_<target>, or nothing is touched.
# Usage (through make only): make stage-roundtrip | make ci-roundtrip
# Environment (set by make): COMPOSE_CMD, DB_NAME, DB_USER, APP_PORT, APP_BIND
set -eu
target="${1:-}"
case "$target" in
  stage|ci) ;;
  *) echo "ROUNDTRIP REFUSED: target must be 'stage' or 'ci', got '$target'. It must never run against the real app (ห้ามรันกับแอปจริง)" >&2; exit 1 ;;
esac
: "${COMPOSE_CMD:?}" "${DB_NAME:?}" "${DB_USER:?}"
case " $COMPOSE_CMD " in
  *" -p ezh_$target "*) ;;
  *) echo "ROUNDTRIP REFUSED: the compose command is not for project ezh_$target" >&2; exit 1 ;;
esac
[ "$DB_NAME" = "english_zero_to_hero_$target" ] || { echo "ROUNDTRIP REFUSED: database must be english_zero_to_hero_$target, got '$DB_NAME'" >&2; exit 1; }

BASE_URL="http://${APP_BIND:-127.0.0.1}:${APP_PORT:?}"
dir="backups-$target"
fail() { echo "ROUNDTRIP FAIL: $*" >&2; exit 1; }
q() { $COMPOSE_CMD exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1"; }
marker() { q "select current from streaks where user_id = 'roundtrip-marker'"; }
work=$(mktemp -d "${TMPDIR:-/tmp}/ezh-roundtrip.XXXXXX")

cleanup() {
  rc=$?
  trap - EXIT INT TERM
  # whatever happened above, the fake migration row and the marker user must not stay in the database
  q "delete from drizzle.__drizzle_migrations where hash = 'future'" > /dev/null 2>&1 || echo "WARNING: could not delete the fake migration row 'future'; delete it by hand" >&2
  q "delete from \"user\" where id = 'roundtrip-marker'" > /dev/null 2>&1 || true
  rm -rf "$work"
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# run a backup; stops the script when it fails (no pipe: a pipe would hide the exit status); prints the file name
make_backup() {
  make -s "$target-backup" > "$work/out" || fail "make $target-backup failed"
  f=$(tail -n 1 "$work/out")
  [ -s "$f" ] || fail "backup file missing or empty: $f"
  printf '%s\n' "$f"
}

q "insert into \"user\" (id, name, email) values ('roundtrip-marker', 'marker', 'marker@example.invalid') on conflict do nothing" > /dev/null
q "insert into streaks (user_id, current) values ('roundtrip-marker', 42) on conflict (user_id) do update set current = 42" > /dev/null
[ "$(marker)" = 42 ] || fail "could not write the marker"
migrations=$(q "select count(*) from drizzle.__drizzle_migrations")

good=$(make_backup)
echo "backup #1: $good (marker 42)"
make -s "$target-backup-verify" FILE="$good" || fail "backup #1 is not restorable"

q "update streaks set current = 7 where user_id = 'roundtrip-marker'" > /dev/null
q "insert into drizzle.__drizzle_migrations (hash, created_at) values ('future', 99999999999999)" > /dev/null
sleep 1
future=$(make_backup)
q "delete from drizzle.__drizzle_migrations where hash = 'future'" > /dev/null
[ "$future" != "$good" ] || fail "backup #2 is the same file as backup #1"

echo "restore of a backup from a NEWER version must be refused ..."
if make -s "$target-restore" FILE="$future" CONFIRM="$DB_NAME" > "$work/refusal" 2>&1; then
  fail "the restore of a newer dump was NOT refused"
fi
grep -q "NEWER" "$work/refusal" || { cat "$work/refusal" >&2; fail "the restore failed, but not with the 'NEWER' refusal"; }
[ "$(marker)" = 7 ] || fail "the refused restore changed the data (marker is $(marker), expected 7)"
echo "refused with NEWER, data unchanged (marker 7)"

echo "restore of backup #1 ..."
make -s "$target-restore" FILE="$good" CONFIRM="$DB_NAME" || fail "restore of backup #1 failed"
[ "$(marker)" = 42 ] || fail "after the restore the marker is $(marker), expected 42 (the restore did nothing)"
[ "$(q 'select count(*) from drizzle.__drizzle_migrations')" = "$migrations" ] || fail "migrations are not intact after the restore"
sh "$(dirname "$0")/smoke.sh" "$BASE_URL"
echo "ROUNDTRIP OK: marker 7 -> 42 after restore, newer dump refused (NEWER), migrations intact, app healthy ($dir)"
