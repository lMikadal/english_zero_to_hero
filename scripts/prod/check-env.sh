#!/bin/sh
# Refuse to start production with a missing or weak env file.
# Usage: check-env.sh <env file>      (the file is read as text, never executed)
set -eu

file="${1:-.env.prod}"
fail() { echo "ERROR: $*" >&2; exit 1; }

[ -f "$file" ] || fail "$file does not exist. Create it with: make prod-init"

# last assignment wins, like a shell would; strips surrounding quotes
get() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$file" | tail -n 1 | sed -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

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

db=$(get POSTGRES_DB)
case "$db" in
  *_dev|*_dev_test) fail "POSTGRES_DB=$db looks like a development database; production must not use it" ;;
esac
