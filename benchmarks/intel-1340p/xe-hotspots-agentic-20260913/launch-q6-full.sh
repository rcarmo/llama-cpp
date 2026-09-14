#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913
id=${1:-q6-full-8t}
[[ "$id" =~ ^q6-full-8t(-r[1-9])?$ ]]
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
systemd-run --user --wait --collect --unit="xe-$id" --property=RuntimeMaxSec=90 --property=TimeoutStopSec=3 --property=KillMode=control-group --property=MemoryAccounting=yes --property=MemoryMax=1G --property=MemorySwapMax=16M --property=TasksMax=64 --working-directory=/var/home/agent/workspace /usr/bin/env -i PATH=/usr/bin:/bin HOME="$HOME" XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus /opt/piclaw/current/bun/bin/bun "$root/run-q6-full.ts" "$id" > "$root/evidence/unit-$id.log" 2>&1
cat "$root/evidence/unit-$id.log"
