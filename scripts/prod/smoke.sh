#!/bin/sh
# Smoke test for a running production stack. Usage: smoke.sh [base url]   (default http://127.0.0.1:3100)
# Read-only: it only GETs pages. Used by CI and by hand (docs/FEATURE_MAP.md).
set -eu
base="${1:-http://127.0.0.1:3100}"
fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

# wait up to 60 s for the app to answer
i=0
until curl -fsS --max-time 5 "$base/api/health" > /dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -lt 30 ] || fail "$base/api/health did not answer in 60 s"
  sleep 2
done

[ "$(curl -fsS "$base/api/health")" = '{"ok":true}' ] || fail "/api/health body is not {\"ok\":true}"
curl -fsS "$base/" | grep -q "English Zero to Hero" || fail "/ does not contain the app name"
curl -fsS "$base/day/1" | grep -q "ข้อ" || fail "/day/1 does not show the lesson player"
for p in /practice /review /settings; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$base$p")
  [ "$code" = 200 ] || fail "$p returned $code"
done
# production build = no dev hot-reload client
curl -fsS "$base/" | grep -q "hot-reloader" && fail "page contains the dev hot reloader (not a production build)"
echo "smoke ok: $base"
