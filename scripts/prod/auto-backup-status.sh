#!/bin/sh
# What is the state of the backups? Used by `make prod-status` (--brief: no systemd, fast) and by
# `make prod-backup-auto-status` (full). Read-only.
# Environment: BACKUP_DIR, DB_NAME, STATE_FILE, UNIT (e.g. ezh-prod-backup), SYSTEMCTL (default systemctl), WARN_DAYS (default 3)
set -eu
dir="${BACKUP_DIR:-backups}"
db="${DB_NAME:?DB_NAME is not set}"
state="${STATE_FILE:-}"
unit="${UNIT:-ezh-prod-backup}"
sc="${SYSTEMCTL:-systemctl}"
warn_days="${WARN_DAYS:-3}"
brief=0; [ "${1:-}" = "--brief" ] && brief=1

state_get() { [ -n "$state" ] && [ -r "$state" ] && sed -n "s/^$1=//p" "$state" | tail -n 1 || true; }

age_text() { # hours
  if [ "$1" -lt 48 ]; then echo "$1 hours"; else echo "$(($1 / 24)) days"; fi
}

if [ "$brief" = 0 ]; then
  if "$sc" --user is-enabled "$unit.timer" > /dev/null 2>&1; then
    echo "automatic daily backup: installed (timer $unit.timer)"
    nxt=$("$sc" --user show "$unit.timer" -p NextElapseUSecRealtime 2> /dev/null | sed 's/^NextElapseUSecRealtime=//' || true)
    echo "next run: ${nxt:-unknown (timer not active?)}"
  else
    echo "automatic daily backup: NOT installed. Turn it on with: make prod-backup-auto-install (ยังไม่ได้เปิด backup อัตโนมัติ)"
  fi
  res=$(state_get result); at=$(state_get at)
  if [ -n "$res" ]; then
    echo "last automatic backup: $res at $at"
    [ "$res" = ok ] || echo "  reason: $(state_get message)"
  else
    echo "last automatic backup: none yet (or only skipped runs: see data/backup-auto.log)"
  fi
  if "$sc" --user is-enabled "$unit.timer" > /dev/null 2>&1; then
    svc=$("$sc" --user show "$unit.service" -p Result,ExecMainStatus 2> /dev/null | tr '\n' ' ' || true)
    [ -z "$svc" ] || echo "systemd: $svc"
  fi
fi

# newest backup of any kind, by the UTC time stamp in its name
newest=$(ls -1 "$dir" 2> /dev/null | grep -E "^ezh-$db-[0-9]{8}-[0-9]{6}(-[a-z-]+)?\.dump\$" | sort -t- -k3,4 | tail -n 1 || true)
now=$(date -u +%s)
if [ -z "$newest" ]; then
  echo "backups: none in $dir"
  echo "WARNING: there is no backup at all. Take one now: make prod-backup (คำเตือน: ยังไม่มี backup เลย)"
else
  t=$(printf '%s' "$newest" | sed -n "s/^ezh-$db-\([0-9]\{8\}\)-\([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\).*/\1 \2:\3:\4/p")
  e=$(date -u -d "$t" +%s 2> /dev/null || echo "$now")
  hours=$(((now - e) / 3600)); [ "$hours" -ge 0 ] || hours=0
  echo "backups: newest is $newest ($(age_text "$hours") old) in $dir"
  if [ "$hours" -gt $((warn_days * 24)) ]; then
    echo "WARNING: the newest backup is older than $warn_days days. Check make prod-backup-auto-status, or take one now: make prod-backup (คำเตือน: backup ล่าสุดเก่ากว่า $warn_days วัน ตรวจด้วย make prod-backup-auto-status หรือสั่ง make prod-backup เดี๋ยวนี้)"
  fi
fi
if [ "$(state_get result)" = FAILED ]; then
  echo "WARNING: last automatic backup FAILED at $(state_get at): $(state_get message) (backup อัตโนมัติครั้งล่าสุดล้มเหลว ดู data/backup-auto.log)"
fi
