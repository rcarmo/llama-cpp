#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-long-agentic-v2-20260914
id=${1:?};arm=${2:?}
[[ "$id" =~ ^long2-(cpu|copy|share)-[01]$ && "$id" == long2-$arm-* ]] || exit 2
[[ ! -e "$root/evidence/unit-$id.log" ]] || exit 2
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
systemd-run --user --wait --collect --unit="xe-$id" --property=RuntimeMaxSec=1200 --property=TimeoutStopSec=3 --property=KillMode=control-group --property=MemoryMax=16G --property=MemorySwapMax=0 --property=TasksMax=256 --property="ExecStopPost=/bin/bash $root/stop.sh $root/runs/$id/containers.txt" --working-directory=/var/home/agent/workspace /usr/bin/env -i PATH=/usr/bin:/bin HOME="$HOME" XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus /opt/piclaw/current/bun/bin/bun "$root/runner.ts" "$id" "$arm" > "$root/evidence/unit-$id.log" 2>&1
cat "$root/evidence/unit-$id.log"
