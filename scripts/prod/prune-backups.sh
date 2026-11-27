#!/bin/sh
# Keep the newest N backups of ONE database, delete the older ones. Names start with a timestamp, so name order = age order.
# Usage: prune-backups.sh <dir> <db name> <keep>
set -eu
dir="$1"; db="$2"; keep="$3"
ls -1 "$dir" 2>/dev/null | grep -E "^ezh-$db-[0-9]{8}-[0-9]{6}.*\.dump\$" | sort | head -n -"$keep" | while IFS= read -r f; do
  rm -f -- "$dir/$f"
done
