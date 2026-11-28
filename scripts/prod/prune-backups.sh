#!/bin/sh
# Delete old backups of ONE database. Two windows:
#   normal backups        ezh-<db>-<time>.dump               keep the newest <keep>
#   pre-update backups    ezh-<db>-<time>-pre-update.dump    keep the newest 5
# -pre-restore backups are NEVER deleted here: they may be the only copy of the data from just before a restore.
# The file named by <protect> (the backup just made) is never deleted, whatever the order of the names says
# (clock behind, time zone change): it is simply never on the delete list (so with a confused clock a few more than <keep> files may stay).
# Names start with a UTC time stamp, so name order = age order.
# Usage: prune-backups.sh <dir> <db name> <keep> [<protect: file name or path>]
set -eu
dir="$1"; db="$2"; keep="$3"; protect=$(basename -- "${4:-}")
case "$db" in ''|*[!a-z0-9_]*) echo "ERROR: odd database name '$db'" >&2; exit 1 ;; esac
printf %s "$keep" | grep -Eq '^[1-9][0-9]*$' || { echo "ERROR: keep must be a whole number >= 1, got '$keep'" >&2; exit 1; }

window() { # <regex> <keep>
  ls -1 "$dir" 2>/dev/null | grep -E "$1" | sort | head -n -"$2" | { grep -v -x -F -- "$protect" || true; } | while IFS= read -r f; do rm -f -- "$dir/$f"; done
}
window "^ezh-$db-[0-9]{8}-[0-9]{6}\.dump\$" "$keep"
window "^ezh-$db-[0-9]{8}-[0-9]{6}-pre-update\.dump\$" 5
