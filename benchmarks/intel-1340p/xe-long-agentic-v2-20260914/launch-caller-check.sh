#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-long-agentic-v2-20260914
[[ ${1:-} == explicit-three-way-admit ]] || exit 2
[[ ! -e "$root/evidence/caller-check.log" ]] || exit 2
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
name=xe-long2-caller-check
cleanup(){ podman kill --signal KILL "$name" >/dev/null 2>&1 || true;podman rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
available=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
[[ "$available" =~ ^[0-9]+$ && "$available" -ge 6291456 ]] || exit 1
timeout --kill-after=3 60 podman run --rm --name "$name" --network=none --cpus=2 --memory=1g --memory-swap=1g --pids-limit=128 --security-opt label=disable -v /var/home/agent/workspace:/var/home/agent/workspace:rw --workdir /var/home/agent/workspace localhost/llama-intel-build:fedora44 bash "$root/check-caller.sh" > "$root/evidence/caller-check.log" 2>&1
cat "$root/evidence/caller-check.log" | tail -30
