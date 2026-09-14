#!/bin/bash
# SCRIPT_JDOC: {"summary":"Launch one explicitly admitted zero-swap current-plugin synthetic handoff test unit, never a trained model","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-master-agentic-20260914
[[ ${1:-} == explicit-three-way-admit ]] || exit 2
[[ ! -e "$root/evidence/unit-master-agentic-gpu-check.log" ]] || { echo 'Retained run exists';exit 2; }
sha256sum -c "$root/evidence/cpu-build-identity.sha256"
sha256sum -c "$root/evidence/vulkan-plugin-identity.sha256"
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
systemd-run --user --wait --collect --unit=xe-master-agentic-gpu-check --property=RuntimeMaxSec=90 --property=TimeoutStopSec=3 --property=KillMode=control-group --property=MemoryMax=1G --property=MemorySwapMax=0 --property=TasksMax=128 --working-directory=/var/home/agent/workspace /usr/bin/env -i PATH=/usr/bin:/bin HOME="$HOME" XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus /bin/bash "$root/check-gpu.sh" > "$root/evidence/unit-master-agentic-gpu-check.log" 2>&1
cat "$root/evidence/unit-master-agentic-gpu-check.log"
