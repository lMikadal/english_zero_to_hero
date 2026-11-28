#!/bin/sh
# The automatic daily backup. Run by the systemd user timer, by `make prod-up` / `prod-down` (only when the newest backup
# is old) and by hand (make prod-backup-auto-run / stage-backup-auto-run). It NEVER starts Docker or the stack: when either
# is not running it logs one SKIP line and exits 0 (a skip is not a failure).
# Rules: at most one automatic backup per MIN_AGE_HOURS (22): it is skipped when the newest backup of ANY kind is younger.
# The new file is labelled -auto, verified by restoring it into a scratch database (verify.sh; the data is small, a few
# seconds), and only then are old automatic backups pruned (own window KEEP_AUTO, manual ones are never touched).
# A failure exits 1 (systemd shows it), is written to the log and to STATE_FILE (make prod-status shows "FAILED at ...").
# Environment (set by the Makefile): COMPOSE_CMD, DB_NAME, DB_USER, BACKUP_DIR, KEEP_AUTO (default 14), LOG_FILE, STATE_FILE;
# optional: MIN_AGE_HOURS (22), DOCKER_CMD (docker), VERIFY (full | list | none; default full).
set -eu
umask 077
: "${COMPOSE_CMD:?COMPOSE_CMD is not set}" "${DB_NAME:?DB_NAME is not set}" "${DB_USER:?DB_USER is not set}"
here=$(dirname "$0")
dir="${BACKUP_DIR:-backups}"
keep="${KEEP_AUTO:-14}"
minh="${MIN_AGE_HOURS:-22}"
log_file="${LOG_FILE:-}"
state_file="${STATE_FILE:-}"
docker_cmd="${DOCKER_CMD:-docker}"
verify="${VERIFY:-full}"

printf %s "$keep" | grep -Eq '^[1-9][0-9]*$' || { echo "ERROR: KEEP_AUTO (BACKUP_KEEP_AUTO) must be a whole number of at least 1 (no leading zero), got '$keep'" >&2; exit 1; }
printf %s "$minh" | grep -Eq '^[0-9]+$' || { echo "ERROR: MIN_AGE_HOURS must be a whole number, got '$minh'" >&2; exit 1; }

log() {
  line="[$(date '+%F %T')] auto-backup: $*"
  echo "$line"
  [ -n "$log_file" ] || return 0
  mkdir -p "$(dirname "$log_file")"
  echo "$line" >> "$log_file"
  # keep the latest ~1000 lines only
  if [ "$(wc -l < "$log_file")" -gt 1000 ]; then
    tail -n 1000 "$log_file" > "$log_file.tmp" && mv "$log_file.tmp" "$log_file"
  fi
}
write_state() { # <result> <key=value>...
  [ -n "$state_file" ] || return 0
  mkdir -p "$(dirname "$state_file")"
  res="$1"; shift
  { printf 'result=%s\nat=%s\n' "$res" "$(date '+%F %T')"; for kv in "$@"; do printf '%s\n' "$kv"; done; } > "$state_file.tmp"
  mv "$state_file.tmp" "$state_file"
}
fail() {
  log "FAILED: $*"
  echo "auto-backup FAILED: $*" >&2
  write_state FAILED "message=$(printf '%s' "$*" | tr '\n' ' ' | cut -c1-300)"
  exit 1
}
skip() { log "SKIP: $*"; exit 0; }

# one run at a time (timer + prod-up could meet)
if [ -n "$log_file" ]; then
  mkdir -p "$(dirname "$log_file")"
  exec 9> "${log_file%.log}.lock"
  flock -n 9 || skip "another automatic backup is already running"
fi

"$docker_cmd" info > /dev/null 2>&1 || skip "Docker is not running, nothing to back up (Docker ไม่ได้เปิดอยู่ ข้ามไปก่อน)"
# shellcheck disable=SC2086
running=$($COMPOSE_CMD ps --status running -q postgres 2>&1) || fail "cannot ask docker compose about the stack: $running"
[ -n "$running" ] || skip "the production stack is not running (make prod-up), nothing to back up (ยังไม่ได้ make prod-up ข้ามไปก่อน)"
# shellcheck disable=SC2086
has=$($COMPOSE_CMD exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc "select to_regclass('drizzle.__drizzle_migrations')" 2>&1) || fail "cannot read the database: $has"
[ -n "$has" ] || skip "no data yet (first install), nothing to back up"

# newest backup of any kind (names carry a UTC time stamp); stamps in the future are ignored (wrong clock)
now=$(date -u +%s)
newest=""; newest_epoch=0
for f in $(ls -1 "$dir" 2>/dev/null | grep -E "^ezh-$DB_NAME-[0-9]{8}-[0-9]{6}(-[a-z-]+)?\.dump\$" | sort); do
  t=$(printf '%s' "$f" | sed -n "s/^ezh-$DB_NAME-\([0-9]\{8\}\)-\([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\).*/\1 \2:\3:\4/p")
  e=$(date -u -d "$t" +%s 2>/dev/null) || continue
  [ "$e" -le $((now + 300)) ] || continue
  if [ "$e" -ge "$newest_epoch" ]; then newest="$f"; newest_epoch="$e"; fi
done
if [ -n "$newest" ]; then
  age=$(((now - newest_epoch) / 3600))
  [ "$age" -ge "$minh" ] || skip "the newest backup ($newest) is $age hours old; a new automatic one is taken after $minh hours"
fi

out=$(LABEL=auto KEEP="$keep" PRUNE=0 BACKUP_DIR="$dir" sh "$here/backup.sh" 2>&1) || fail "the backup itself failed: $out"
file=$(printf '%s\n' "$out" | tail -n 1)
[ -s "$file" ] || fail "no backup file was written: $out"

case "$verify" in
  full)
    vout=$(sh "$here/verify.sh" "$file" 2>&1) || { mv "$file" "$file.verify-failed"; fail "the new backup could not be restored, it was set aside as $file.verify-failed: $vout"; }
    how="verified by restoring it into a scratch database" ;;
  list)
    # shellcheck disable=SC2086
    $COMPOSE_CMD exec -T postgres pg_restore -l < "$file" > /dev/null 2>&1 || { mv "$file" "$file.verify-failed"; fail "pg_restore cannot read the new backup, it was set aside as $file.verify-failed"; }
    how="readable by pg_restore" ;;
  none) how="not verified" ;;
  *) fail "VERIFY must be full, list or none, got '$verify'" ;;
esac

sh "$here/prune-backups.sh" "$dir" "$DB_NAME" "$keep" "$file" auto || log "WARNING: pruning old automatic backups failed"
write_state ok "file=$file"
log "backup ok: $file ($how)"
