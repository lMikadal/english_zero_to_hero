#!/bin/sh
# Install / remove the systemd USER timer for the automatic daily backup (no sudo, nothing outside your home folder).
#   auto-backup-install.sh install   ezh_prod
#   auto-backup-install.sh uninstall ezh_prod
#   auto-backup-install.sh render    <project> <out dir> <unit name>   (only writes the two files; used to test the templates)
# `install` / `uninstall` accept ONLY the real production project: stage and ci never get a timer.
# Environment (tests): UNIT_DIR (default ~/.config/systemd/user), SYSTEMCTL (default systemctl), REPO (default: this checkout), MAKE.
set -eu
mode="${1:-}"; project="${2:-}"
here=$(cd "$(dirname "$0")" && pwd)
repo="${REPO:-$(cd "$here/../.." && pwd)}"
make_bin="${MAKE:-$(command -v make || true)}"
systemctl_bin="${SYSTEMCTL:-systemctl}"
unit_dir="${UNIT_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user}"
fail() { echo "ERROR: $*" >&2; exit 1; }

case "$project" in
  ezh_[a-z]*) ;;
  *) fail "usage: auto-backup-install.sh install|uninstall ezh_prod   (got project '$project')" ;;
esac
what="${project#ezh_}"

render() { # <out dir> <unit name>
  out="$1"; name="$2"
  [ -n "$make_bin" ] || fail "make is not installed"
  mkdir -p "$out"
  target="$what-backup-auto-run"
  plain=$(printf '%s' "$repo" | sed 's/%/%%/g')
  exec_path=$(printf '%s' "$repo" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/%/%%/g' -e 's/\$/$$/g')
  for kind in service timer; do
    WHAT="$what" TARGET="$target" REPO_PLAIN="$plain" REPO_EXEC="$exec_path" MAKE="$make_bin" \
      awk '{ line = $0
             n = split("WHAT TARGET REPO_PLAIN REPO_EXEC MAKE", keys, " ")
             for (i = 1; i <= n; i++) { key = "@" keys[i] "@"; val = ENVIRON[keys[i]]
               while ((p = index(line, key)) > 0) line = substr(line, 1, p - 1) val substr(line, p + length(key)) }
             print line }' "$here/systemd/ezh-backup.$kind.in" > "$out/$name.$kind"
  done
}

case "$mode" in
  render)
    [ -n "${3:-}" ] && [ -n "${4:-}" ] || fail "usage: render <project> <out dir> <unit name>"
    render "$3" "$4" ;;
  install)
    [ "$project" = ezh_prod ] || fail "the automatic backup timer is only for the real production project ezh_prod, not '$project'. To try the mechanism on stage: make stage-backup-auto-run"
    command -v "$systemctl_bin" > /dev/null 2>&1 || fail "systemctl not found: this needs systemd"
    name=ezh-prod-backup
    stage_dir=$(mktemp -d "${TMPDIR:-/tmp}/ezh-units.XXXXXX")
    trap 'rm -rf "$stage_dir"' EXIT
    render "$stage_dir" "$name"
    mkdir -p "$unit_dir"
    changed=0
    for kind in service timer; do
      cmp -s "$stage_dir/$name.$kind" "$unit_dir/$name.$kind" 2> /dev/null || { cp "$stage_dir/$name.$kind" "$unit_dir/$name.$kind"; changed=1; }
    done
    [ "$changed" = 0 ] && echo "units already up to date in $unit_dir" || echo "wrote $unit_dir/$name.service and $name.timer"
    "$systemctl_bin" --user daemon-reload
    "$systemctl_bin" --user enable --now "$name.timer"
    echo "automatic daily backup is ON (timer $name.timer). Check: make prod-backup-auto-status" ;;
  uninstall)
    [ "$project" = ezh_prod ] || fail "only ezh_prod has an automatic backup timer, not '$project'"
    name=ezh-prod-backup
    if command -v "$systemctl_bin" > /dev/null 2>&1; then
      "$systemctl_bin" --user disable --now "$name.timer" 2> /dev/null || true
    fi
    rm -f "$unit_dir/$name.timer" "$unit_dir/$name.service"
    command -v "$systemctl_bin" > /dev/null 2>&1 && "$systemctl_bin" --user daemon-reload || true
    echo "automatic daily backup is OFF (timer removed). Existing backups are kept." ;;
  *) fail "usage: auto-backup-install.sh install|uninstall|render <project> ..." ;;
esac
