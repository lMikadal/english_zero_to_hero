#!/bin/sh
# What is the state of the backups? Used by `make prod-status` (--brief) and by `make prod-backup-auto-status` (full). Read-only.
# Environment: BACKUP_DIR, DB_NAME, STATE_FILE, UNIT (e.g. ezh-prod-backup), LOG_FILE (only for messages), COMPOSE_CMD (to know
# whether the stack is up now), REPO (the checkout you are in), UNIT_DIR, SYSTEMCTL (default systemctl), WARN_DAYS (default 3).
# A broken timer must not look fine: it warns when the timer is installed but has not even attempted a run for ~36 hours while
# the app is up, when nothing has succeeded for ~36 hours and no backup of any kind is newer, and when systemd reports a failure.
set -eu
dir="${BACKUP_DIR:-backups}"
db="${DB_NAME:?DB_NAME is not set}"
state="${STATE_FILE:-}"
unit="${UNIT:-ezh-prod-backup}"
sc="${SYSTEMCTL:-systemctl}"
warn_days="${WARN_DAYS:-3}"
unit_dir="${UNIT_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user}"
log_hint="${LOG_FILE:-data/backup-auto.log}"
repo="${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
compose="${COMPOSE_CMD:-}"
brief=0; [ "${1:-}" = "--brief" ] && brief=1
now=$(date -u +%s)

state_get() { [ -n "$state" ] && [ -r "$state" ] && sed -n "s/^$1=//p" "$state" | tail -n 1 || true; }
epoch() { date -d "$1" +%s 2> /dev/null || echo 0; }
age_text() { if [ "$1" -lt 48 ]; then echo "$1 hours"; else echo "$(($1 / 24)) days"; fi; }

installed=0
[ -e "$unit_dir/$unit.timer" ] && installed=1
if [ "$brief" = 0 ] && "$sc" --user is-enabled "$unit.timer" > /dev/null 2>&1; then installed=1; fi

sysinfo=""
if [ "$installed" = 1 ]; then
  sysinfo=$("$sc" --user show "$unit.service" -p Result,ExecMainStatus 2> /dev/null | tr '\n' ' ' || true)
fi

if [ "$brief" = 0 ]; then
  if [ "$installed" = 1 ]; then
    echo "automatic daily backup: installed (timer $unit.timer, checks every hour)"
    nxt=$("$sc" --user show "$unit.timer" -p NextElapseUSecRealtime 2> /dev/null | sed 's/^NextElapseUSecRealtime=//' || true)
    echo "next run: ${nxt:-unknown (timer not active?)}"
    wd=$("$sc" --user show "$unit.service" -p WorkingDirectory 2> /dev/null | sed 's/^WorkingDirectory=//' || true)
    [ -z "$wd" ] || echo "runs from: $wd"
    if [ -n "$wd" ] && [ "$wd" != "$repo" ]; then
      echo "WARNING: the timer runs from $wd, which differs from this folder ($repo). If you moved or renamed the project, run make prod-backup-auto-install again from the right folder (คำเตือน: ตัวตั้งเวลาชี้ไปโฟลเดอร์อื่น ให้สั่ง make prod-backup-auto-install ใหม่)"
    fi
  else
    echo "automatic daily backup: NOT installed. Turn it on with: make prod-backup-auto-install (ยังไม่ได้เปิด backup อัตโนมัติ)"
  fi
  res=$(state_get result); at=$(state_get at)
  if [ -n "$res" ]; then
    echo "last automatic backup: $res at $at"
    [ "$res" = ok ] || echo "  reason: $(state_get message)"
  else
    echo "last automatic backup: none yet (or only skipped runs: see $log_hint)"
  fi
  att=$(state_get attempt)
  [ -z "$att" ] || echo "last attempt: $(state_get attempt_at) ($att)"
  [ -z "$sysinfo" ] || echo "systemd: $sysinfo"
fi

# newest backup that counts: at least 1 KB, not dated in the future (same rules as auto-backup.sh)
newest=""; newest_epoch=0
for f in $(ls -1 "$dir" 2> /dev/null | grep -E "^ezh-$db-[0-9]{8}-[0-9]{6}(-[a-z-]+)?\.dump\$" | sort -r); do
  size=$(wc -c < "$dir/$f" 2> /dev/null | tr -d ' ' || echo 0)
  [ "${size:-0}" -ge 1024 ] || continue
  t=$(printf '%s' "$f" | sed -n "s/^ezh-$db-\([0-9]\{8\}\)-\([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\).*/\1 \2:\3:\4/p")
  e=$(date -u -d "$t" +%s 2> /dev/null) || continue
  [ "$e" -le $((now + 300)) ] || continue
  newest="$f"; newest_epoch="$e"; break
done
newest_hours=-1
if [ -z "$newest" ]; then
  echo "backups: none in $dir"
  echo "WARNING: there is no backup at all. Take one now: make prod-backup (คำเตือน: ยังไม่มี backup เลย)"
else
  newest_hours=$(((now - newest_epoch) / 3600)); [ "$newest_hours" -ge 0 ] || newest_hours=0
  echo "backups: newest is $newest ($(age_text "$newest_hours") old) in $dir"
  if [ "$newest_hours" -gt $((warn_days * 24)) ]; then
    echo "WARNING: the newest backup is older than $warn_days days. Check make prod-backup-auto-status, or take one now: make prod-backup (คำเตือน: backup ล่าสุดเก่ากว่า $warn_days วัน ตรวจด้วย make prod-backup-auto-status หรือสั่ง make prod-backup เดี๋ยวนี้)"
  fi
fi
if [ "$(state_get result)" = FAILED ]; then
  echo "WARNING: last automatic backup FAILED at $(state_get at): $(state_get message) (backup อัตโนมัติครั้งล่าสุดล้มเหลว ดู $log_hint)"
fi

if [ "$installed" = 1 ]; then
  case "$sysinfo" in
    *Result=success*|"") ;;
    *) echo "WARNING: systemd reports the last run of $unit.service as: $sysinfo (see: journalctl --user -u $unit.service) (systemd รายงานว่าการรันล่าสุดผิดปกติ)" ;;
  esac
  stack_up=0
  if [ -n "$compose" ]; then
    # shellcheck disable=SC2086
    [ -z "$($compose ps --status running -q postgres 2> /dev/null || true)" ] || stack_up=1
  fi
  if [ "$stack_up" = 1 ]; then
    att_at=$(state_get attempt_at); ae=0
    if [ -n "$att_at" ]; then ae=$(epoch "$att_at"); else ae=$(date -r "$unit_dir/$unit.timer" +%s 2> /dev/null || echo 0); fi
    att_h=$(((now - ae) / 3600))
    if [ "$ae" -gt 0 ] && [ "$att_h" -gt 36 ]; then
      echo "WARNING: the automatic backup timer has not run for $(age_text "$att_h") although the app is up: the timer may be broken. Run: make prod-backup-auto-status, then make prod-backup (คำเตือน: ตัวตั้งเวลา backup ไม่ทำงานเลยเกิน 36 ชั่วโมง ทั้งที่เปิดแอปอยู่)"
    else
      ok_at=$(state_get ok_at)
      if [ -n "$ok_at" ] && [ "$newest_hours" -gt 36 ]; then
        ok_h=$(((now - $(epoch "$ok_at")) / 3600))
        if [ "$ok_h" -gt 36 ]; then
          echo "WARNING: no successful automatic backup for $(age_text "$ok_h") although the app is up, and no other backup is newer. Take one now: make prod-backup (คำเตือน: ไม่มี backup อัตโนมัติที่สำเร็จเกิน 36 ชั่วโมง ทั้งที่เปิดแอปอยู่)"
        fi
      fi
    fi
  fi
fi
