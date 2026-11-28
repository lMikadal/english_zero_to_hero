#!/bin/sh
# Refuse to start production with a missing or weak env file.
# Usage: check-env.sh <env file>      (the file is read as text, never executed)
set -eu

file="${1:-.env.prod}"
here=$(dirname "$0")
fail() { echo "ERROR: $*" >&2; exit 1; }
get() { sh "$here/env-get.sh" "$file" "$@"; }

[ -f "$file" ] || fail "$file does not exist. Create it with: make prod-init  (ยังไม่มีไฟล์ $file ให้สั่ง make prod-init)"

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
case "$bind" in ''|*[!0-9.]*) fail "APP_BIND=$bind in $file must be an IPv4 address such as 127.0.0.1" ;; esac

keep=$(get BACKUP_KEEP 14)
printf %s "$keep" | grep -Eq '^[1-9][0-9]*$' || fail "BACKUP_KEEP=$keep in $file must be a whole number of at least 1 (no leading zero)"
