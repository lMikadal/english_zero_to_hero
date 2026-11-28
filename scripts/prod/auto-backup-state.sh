# Sourced by auto-backup.sh and auto-backup-run.sh: the state file of the automatic backup (key=value lines, under the
# git-ignored data/). Keys: result (ok|FAILED) + at + file|message = the last REAL result; ok_at = last success;
# attempt + attempt_at = the last attempt of any kind, including skips ("SKIP: <reason>").
# state_set key=value ... keeps every key that is not named and replaces the named ones.
state_set() {
  [ -n "${STATE_FILE:-}" ] || return 0
  mkdir -p "$(dirname "$STATE_FILE")"
  tmp="$STATE_FILE.tmp.$$"
  : > "$tmp"
  pat=""
  for kv in "$@"; do pat="$pat|${kv%%=*}"; done
  [ ! -r "$STATE_FILE" ] || grep -v -E "^(${pat#|})=" "$STATE_FILE" >> "$tmp" || true
  for kv in "$@"; do printf '%s\n' "$kv" >> "$tmp"; done
  mv "$tmp" "$STATE_FILE"
}
