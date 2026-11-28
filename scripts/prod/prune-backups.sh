#!/bin/sh
# Delete old backups of ONE database. Two independent windows, so safety backups never push normal ones out:
#   normal backups        ezh-<db>-<time>.dump               keep the newest <keep>
#   safety backups        ezh-<db>-<time>-pre-restore.dump   keep the newest 5 of each label (pre-restore, pre-update)
# Names start with a timestamp, so name order = age order.
# Usage: prune-backups.sh <dir> <db name> <keep>
set -eu
dir="$1"; db="$2"; keep="$3"
case "$db" in ''|*[!a-z0-9_]*) echo "ERROR: odd database name '$db'" >&2; exit 1 ;; esac
printf %s "$keep" | grep -Eq '^[1-9][0-9]*$' || { echo "ERROR: keep must be a whole number >= 1, got '$keep'" >&2; exit 1; }

window() { # <regex> <keep>
  ls -1 "$dir" 2>/dev/null | grep -E "$1" | sort | head -n -"$2" | while IFS= read -r f; do rm -f -- "$dir/$f"; done
}
window "^ezh-$db-[0-9]{8}-[0-9]{6}\.dump\$" "$keep"
window "^ezh-$db-[0-9]{8}-[0-9]{6}-pre-restore\.dump\$" 5
window "^ezh-$db-[0-9]{8}-[0-9]{6}-pre-update\.dump\$" 5
