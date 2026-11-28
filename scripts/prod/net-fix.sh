#!/bin/sh
# Move an existing project network to its dedicated subnet without losing anything.
# Usage (through make, before anything else touches the stack): COMPOSE_CMD='<compose command>' net-fix.sh <network> <prefix>
# When compose recreates a network that has another subnet it restarts postgres WITHOUT its DNS alias ("getaddrinfo ENOTFOUND
# postgres" in the migration; found on stage). Stopping the containers first avoids that. Only `down` is used: never
# volumes, so the database survives. Does nothing when the network does not exist yet or already has the right subnet.
set -eu
net="${1:?network name}"
prefix="${2:?subnet prefix, e.g. 172.30.10}"
: "${COMPOSE_CMD:?}"
current=$(docker network inspect "$net" -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' 2>/dev/null | tr -d ' \n' || true)
if [ -z "$current" ] || [ "$current" = "$prefix.0/24" ]; then exit 0; fi
echo "network $net uses $current; moving it to $prefix.0/24 (one-time: containers are stopped and recreated, the database volume is kept)"
$COMPOSE_CMD down
