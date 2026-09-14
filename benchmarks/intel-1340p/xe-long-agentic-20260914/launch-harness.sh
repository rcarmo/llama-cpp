#!/bin/bash
# Requires exact long-agentic-harness-r1 ADMIT; no old reservation rollover.
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-long-agentic-20260914
[[ ${1:-} == explicit-three-way-admit ]] || exit 2
[[ ! -e "$root/evidence/harness-r1-unit.log" ]] || { echo 'Retained admission attempt';exit 2; }
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
# External timeout covers both compilation and the nine serial isolated fixture tests.
# ExecStopPost also removes a detached container if timeout/agent abort interrupts cleanup.
systemd-run --user --wait --collect --unit=xe-long-agentic-harness-r1 --property=RuntimeMaxSec=120 --property=TimeoutStopSec=3 --property=KillMode=control-group --property=MemoryMax=1G --property=MemorySwapMax=0 --property=CPUQuota=200% --property=TasksMax=128 --property="ExecStopPost=/bin/bash $root/harness-stop.sh" --working-directory=/var/home/agent/workspace /usr/bin/env -i PATH=/usr/bin:/bin HOME="$HOME" XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus /bin/bash "$root/harness-guard.sh" > "$root/evidence/harness-r1-unit.log" 2>&1
cat "$root/evidence/harness-r1-unit.log"
