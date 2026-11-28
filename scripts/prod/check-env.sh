#!/bin/sh
# Refuse to start production with a missing or weak env file.
# Usage: check-env.sh <env file>      (the file is read as text, never executed)
set -eu

file="${1:-.env.prod}"
here=$(dirname "$0")
fail() { echo "ERROR: $*" >&2; exit 1; }
get() { sh "$here/env-get.sh" "$file" "$@"; }

[ -f "$file" ] || fail "$file does not exist. Create it with: make prod-init  (ยังไม่มีไฟล์ $file ให้สั่ง make prod-init)"

# compose and the make/sh parser must read the file the same way: no `export KEY=...` (make would ignore the line,
# compose would honour it) and no `KEY=value # comment` (compose strips the comment, the shell parser would not)
if tr -d '\r' < "$file" | grep -Eq '^[[:space:]]*export[[:space:]]'; then
  fail "$file contains a line starting with 'export'. Write plain KEY=value lines (บรรทัดที่ขึ้นต้นด้วย export ไม่รองรับ)"
fi
if tr -d '\r' < "$file" | grep -Eq '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=.*[[:space:]]#'; then
  fail "$file has a value followed by an inline '# comment'. Put comments on their own line (ห้ามเขียน comment ต่อท้ายค่า)"
fi

pw=$(get POSTGRES_PASSWORD)
[ -n "$pw" ] || fail "POSTGRES_PASSWORD is not set in $file (make prod-init writes a random one)"
case "$pw" in
  *[!A-Za-z0-9_-]*) fail "POSTGRES_PASSWORD in $file may only contain letters, digits, '_' and '-' (it is placed in a connection URL)" ;;
esac
[ "${#pw}" -ge 16 ] || fail "POSTGRES_PASSWORD in $file is too short (need at least 16 characters)"
case "$(printf '%s' "$pw" | tr 'A-Z' 'a-z')" in
  *change*|*password*|*example*|*secret*) fail "POSTGRES_PASSWORD in $file is still a placeholder. Set a random value (make prod-init does it)" ;;
esac
distinct=$(printf '%s' "$pw" | fold -w1 | sort -u | wc -l)
[ "$distinct" -ge 6 ] || fail "POSTGRES_PASSWORD in $file is too repetitive; use a random value"

# these go into the connection URL, file names and a grep pattern: only plain names
ident() { # <KEY> <default>
  v=$(get "$1" "$2")
  case "$v" in
    ''|[!a-z_]*|*[!a-z0-9_]*) fail "$1=$v in $file must be lower-case letters, digits and '_' only (starting with a letter or '_')" ;;
  esac
  [ "${#v}" -le 50 ] || fail "$1 in $file is too long"
}
ident POSTGRES_USER ezh
ident POSTGRES_DB english_zero_to_hero
case "$(get POSTGRES_DB english_zero_to_hero)" in
  *_dev|*_dev_test) fail "POSTGRES_DB=$(get POSTGRES_DB) looks like a development database; production must not use it" ;;
esac

port=$(get APP_PORT 3100)
case "$port" in ''|*[!0-9]*) fail "APP_PORT=$port in $file must be a number" ;; esac
bind=$(get APP_BIND 127.0.0.1)
case "$bind" in 0.0.0.0) fail "APP_BIND=0.0.0.0 opens the app (which has no login) to every network the machine is on. Use 127.0.0.1 or your Tailscale address 100.x.y.z (ห้ามเปิดให้ทุกเครือข่าย)" ;; esac
case "$bind" in ''|*[!0-9.]*) fail "APP_BIND=$bind in $file must be an IPv4 address such as 127.0.0.1" ;; esac

keep=$(get BACKUP_KEEP 14)
printf %s "$keep" | grep -Eq '^[1-9][0-9]*$' || fail "BACKUP_KEEP=$keep in $file must be a whole number of at least 1 (no leading zero)"

# who may use the app: validated here, before anything starts, with the same rules as the app itself
# (an invalid value would otherwise show up as "every page answers 500"). Empty = feature off.
sh "$here/allowed-ips.sh" "$(get ALLOWED_IPS)" ALLOWED_IPS || fail "ALLOWED_IPS in $file is not valid (see above). Example: ALLOWED_IPS=100.101.102.103, 100.88.5.7  (ค่า ALLOWED_IPS ไม่ถูกต้อง)"
sh "$here/allowed-ips.sh" "$(get TRUSTED_PROXIES)" TRUSTED_PROXIES || fail "TRUSTED_PROXIES in $file is not valid (see above)"

# docker's userland proxy opens the connection to the app from the network gateway, which the app must trust (that is where the
# published port arrives from with tailscale serve). With any other APP_BIND that hides the real client: every other machine
# would look like "this machine". So the allow-list is only allowed together with the loopback bind.
if [ -n "$(printf '%s' "$(get ALLOWED_IPS)" | tr -d ' ,')" ] && [ "$bind" != "127.0.0.1" ]; then
  fail "ALLOWED_IPS works only with APP_BIND=127.0.0.1 + tailscale serve (found APP_BIND=$bind in $file): with another bind other machines would be treated as this machine (ใช้ ALLOWED_IPS ได้เฉพาะกับ tailscale serve)"
fi
