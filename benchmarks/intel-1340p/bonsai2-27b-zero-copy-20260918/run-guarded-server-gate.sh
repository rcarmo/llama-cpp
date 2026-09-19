#!/bin/bash
# SCRIPT_JDOC: {"summary":"Run one Bonsai service gate in a bounded user systemd unit","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail

if [[ $# != 3 ]]; then
    echo "usage: $0 UNIT_NAME GATE_SCRIPT OUTPUT_DIR" >&2
    exit 2
fi

unit=$1
script=$2
out=$3
case $unit in
    *[!a-zA-Z0-9_-]*|'') echo "invalid unit name" >&2; exit 2 ;;
esac
[[ -x $script ]]

export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus

systemctl --user reset-failed "$unit.service" 2>/dev/null || true
systemd-run --user --wait --collect --unit="$unit.service" \
    --property=Type=exec \
    --property=KillMode=control-group \
    --property=TimeoutStopSec=30 \
    --property=RuntimeMaxSec=1800 \
    --property=MemoryMax=24G \
    --property=MemorySwapMax=0 \
    --property=TasksMax=512 \
    "$script" "$out"
