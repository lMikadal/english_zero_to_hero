#!/bin/sh
# What the systemd unit runs: `make <project>-backup-auto-run`, plus a record of failures that happen BEFORE the backup
# script could write its own state (unreadable .env.prod, the repo folder was moved, make is broken...). Without this a
# run that dies early would only be visible in the journal. Usage: auto-backup-run.sh prod   (or: stage, for tests)
# Environment (tests): MAKE, STATE_FILE.
project="${1:?usage: auto-backup-run.sh prod|stage}"
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
tag=""; [ "$project" = prod ] || tag="-$project"
STATE_FILE="${STATE_FILE:-$repo/data/backup-auto$tag.state}"
export STATE_FILE
. "$here/auto-backup-state.sh"

before=$(cksum < "$STATE_FILE" 2> /dev/null || echo none)
"${MAKE:-make}" -C "$repo" --no-print-directory "$project-backup-auto-run" && exit 0
rc=$?
after=$(cksum < "$STATE_FILE" 2> /dev/null || echo none)
if [ "$before" = "$after" ]; then
  now=$(date '+%F %T')
  state_set "result=FAILED" "at=$now" "message=the automatic backup run failed before it could record a result (exit $rc). See: journalctl --user -u ezh-$project-backup.service. Usual causes: .env.prod unreadable, the project folder was moved" "attempt=FAILED" "attempt_at=$now"
fi
exit "$rc"
