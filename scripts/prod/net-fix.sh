#!/bin/sh
# Move an existing project network to its dedicated subnet without losing anything.
# Usage (through make): COMPOSE_CMD='<compose command>' net-fix.sh <network> <prefix> [check]
#   (no 3rd argument)  move the network if needed; (check) only look: exit 1 when the move would clash, change nothing
# When compose recreates a network that has another subnet it restarts postgres WITHOUT its DNS alias ("getaddrinfo ENOTFOUND
# postgres" in the migration; found on stage). Stopping the containers first avoids it. Only `down` is used: never
# volumes, so the database survives. Before stopping anything it makes sure the new subnet <prefix>.0/24 overlaps no other
# docker network; if it does, it stops with a message and leaves the app running on its old network.
# Does nothing when the network does not exist yet or already has the right subnet.
set -eu
net="${1:?network name}"
prefix="${2:?subnet prefix, e.g. 172.30.10}"
mode="${3:-move}"
: "${COMPOSE_CMD:?}"
subnets() { docker network inspect "$1" -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' 2>/dev/null | tr -d '\n' || true; }
current=$(subnets "$net")
current=$(printf '%s' "$current" | tr -d ' ')
if [ -z "$current" ] || [ "$current" = "$prefix.0/24" ]; then exit 0; fi

# overlap check against every OTHER network (IPv4 subnets only)
clash=$(docker network ls --format '{{.Name}}' 2>/dev/null | while read -r other; do
  [ "$other" = "$net" ] && continue
  for sub in $(subnets "$other"); do
    case "$sub" in */*.*|*.*/*) ;; *) continue ;; esac
    echo "$other $sub"
  done
done | awk -v want="$prefix.0" '
  function num(s,  p) { split(s, p, "."); return ((p[1] * 256 + p[2]) * 256 + p[3]) * 256 + p[4] }
  BEGIN { lo = num(want); hi = lo + 255 }
  { split($2, a, "/"); if (a[1] !~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) next
    size = 1; for (k = 0; k < 32 - a[2]; k++) size *= 2
    start = int(num(a[1]) / size) * size; end = start + size - 1
    if (start <= hi && end >= lo) { print; exit } }')
if [ -n "$clash" ]; then
  other="${clash% *}"; sub="${clash#* }"
  {
    echo "ERROR: the subnet $prefix.0/24 that network $net needs overlaps the docker network '$other' ($sub). Nothing was stopped: the app is still running on its old network. Send this message to the developer."
    echo "ข้อผิดพลาด: วงเลข $prefix.0/24 ชนกับเครือข่าย docker ชื่อ '$other' ($sub) ยังไม่ได้หยุดอะไร แอปยังทำงานอยู่ด้วยเครือข่ายเดิม ส่งข้อความนี้ให้ผม"
  } >&2
  exit 1
fi
[ "$mode" = check ] && exit 0
echo "network $net uses $current; moving it to $prefix.0/24 (one-time: containers are stopped and recreated, the database volume is kept)"
$COMPOSE_CMD down
