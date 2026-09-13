#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913
id=${1:?id};fixture=${2:?fixture};arm=${3:?arm};series=${4:-edit-v1}
[[ "$id" =~ ^[a-z0-9-]{1,40}$ ]]
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
systemd-run --user --wait --collect --unit="xe-agentic-$id" --property=RuntimeMaxSec=600 --property=TimeoutStopSec=3 --property=KillMode=control-group --property=MemoryMax=16G --property=MemorySwapMax=16M --property=TasksMax=256 --property="ExecStopPost=/bin/bash $root/agentic-stop.sh $root/agentic-runs/$id/containers.txt" --working-directory=/var/home/agent/workspace /usr/bin/env -i PATH=/usr/bin:/bin HOME="$HOME" XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus /opt/piclaw/current/bun/bin/bun "$root/agentic-runner-q6.ts" "$id" "$fixture" "$arm" "$series" > "$root/evidence/unit-$id.log" 2>&1
cat "$root/evidence/unit-$id.log"
