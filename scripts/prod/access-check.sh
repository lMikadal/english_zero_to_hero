#!/bin/sh
# Self-check of the device allow-list on a RUNNING stack (make prod-status / stage-status, and the CI job).
#   access-check.sh <base url> <ALLOWED_IPS value>   checks that the app really enforces the list
#   access-check.sh --note <ALLOWED_IPS value>       only prints the list (or the "everyone can use it" reminder)
# Read-only: it only GETs. With an empty list it makes no request. Exit 1 on any failed check.
# Checks (all through the real network path, host curl -> published port):
#   no X-Forwarded-For (= the host itself)             -> 200   (the owner can never lock himself out)
#   first listed address as X-Forwarded-For            -> 200
#   TEST-NET 192.0.2.1 (unlisted) on /, /api/health and a /_next/static path -> 403
#   unlisted address + forged X-Ezh-Peer: 127.0.0.1    -> 403   (the app must not believe a header from outside)
#   PROBE_EXEC (optional, e.g. "docker compose ... exec -T postgres"): another container on the same network forging an allowed
#   X-Forwarded-For must get 403 (it is judged by its own address, not by the header)
set -eu

note() {
  if [ -z "$(printf '%s' "$1" | tr -d ' ,')" ]; then
    echo "access: ALLOWED_IPS is empty, so EVERY device on your tailnet can use the app. To allow only your own devices see docs/DEPLOYMENT.md (ALLOWED_IPS ว่างอยู่: ทุกอุปกรณ์ใน tailnet ใช้แอปได้ ตั้งให้เฉพาะเครื่องของคุณได้ตาม docs/DEPLOYMENT.md)"
  else
    echo "access: only these devices (plus this machine itself) may use the app: $1"
  fi
}

if [ "${1:-}" = "--note" ]; then note "${2:-}"; exit 0; fi

base="${1:?usage: access-check.sh <base url> <ALLOWED_IPS>}"
allowed="${2:-}"
if [ -z "$(printf '%s' "$allowed" | tr -d ' ,')" ]; then note "$allowed"; exit 0; fi
note "$allowed"

failed=0
fail() { echo "access FAIL: $*" >&2; failed=1; }
code() { # <path> [curl -H args...]
  p="$1"; shift
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" "$base$p" 2>/dev/null || printf 000
}
expect() { # <expected> <what> <path> [-H ...]
  want="$1"; what="$2"; shift 2
  got=$(code "$@")
  [ "$got" = "$want" ] || fail "$what: expected $want, got $got"
}

first=$(printf '%s' "$allowed" | tr ',' ' ' | awk '{print $1}')
first="${first%%/*}"
unlisted=192.0.2.1

expect 200 "the host itself (no X-Forwarded-For) must be allowed" /api/health
expect 200 "listed address $first must be allowed" /api/health -H "X-Forwarded-For: $first"
# does an IPv4 entry of the list (address or a.b.c.d/n) cover the test address? (the list was validated by check-env.sh)
covered=$(printf '%s' "$allowed" | tr ',' ' ' | awk -v t="$unlisted" '
  function num(s,  p) { split(s, p, "."); return ((p[1] * 256 + p[2]) * 256 + p[3]) * 256 + p[4] }
  { for (i = 1; i <= NF; i++) if ($i !~ /:/) {
      split($i, e, "/"); n = (e[2] == "" ? 32 : e[2]); size = 1; for (k = 0; k < 32 - n; k++) size *= 2
      if (int(num(t) / size) == int(num(e[1]) / size)) print "yes" } }')
if [ -n "$covered" ]; then
  echo "access: skipped the unlisted-address checks: your list contains the test address $unlisted"
else
  for p in / /api/health /_next/static/chunks/access-check.js; do
    expect 403 "unlisted address $unlisted on $p must be refused" "$p" -H "X-Forwarded-For: $unlisted"
  done
  expect 403 "a forged X-Ezh-Peer header must not be believed" /api/health -H "X-Forwarded-For: $unlisted" -H "X-Ezh-Peer: 127.0.0.1"
fi

if [ -n "${PROBE_EXEC:-}" ]; then
  # shellcheck disable=SC2086
  out=$($PROBE_EXEC wget -S -O /dev/null --header="X-Forwarded-For: $first" "${PROBE_URL:-http://app:3000/api/health}" 2>&1 || true)
  case "$out" in
    *403*) echo "access: another container forging X-Forwarded-For $first was refused (403)" ;;
    *) fail "another container on the network forging X-Forwarded-For $first was not refused: $out" ;;
  esac
fi

if [ "$failed" = 0 ]; then echo "access ok: the allow-list is enforced ($base)"; else exit 1; fi
