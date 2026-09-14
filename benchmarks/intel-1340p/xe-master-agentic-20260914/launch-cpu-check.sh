#!/bin/bash
# SCRIPT_JDOC: {"summary":"Run explicitly admitted CPU/vocabulary checks with bounded memory, time, host-reserve and contention guards","kind":"mixed","weight":"standard","role":"entrypoint"}
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-master-agentic-20260914
workspace=/var/home/agent/workspace
name=xe-master-agentic-cpu-check
[[ ${1:-} == explicit-three-way-admit ]] || exit 2
[[ ! -e "$root/evidence/cpu-check.log" ]] || { echo 'Retained attempt exists';exit 2; }
sha256sum -c "$root/evidence/cpu-build-identity.sha256" > "$root/evidence/check-identity-before.log"
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
services(){ systemctl --user show llama-gemma-local-provider.service whisper-stt.service whisper-stt-diarizer.service -p Id -p ActiveState -p MainPID; }
services > "$root/evidence/check-services-before.txt"
[[ $(grep -c '^ActiveState=inactive$' "$root/evidence/check-services-before.txt") == 3 ]] || exit 1
watcher=''
cleanup(){
 if [[ -n "$watcher" ]];then kill "$watcher" 2>/dev/null || true;wait "$watcher" 2>/dev/null || true;fi
 podman kill --signal KILL "$name" >/dev/null 2>&1 || true;podman rm -f "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
check(){
 available=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
 competitors=$(ps -eo pid=,comm= | awk '$2 ~ /^(go|llama-server|whisper-cli|diar-server|ffmpeg|python|python3)$/ {print $1, $2}')
 printf '%s %s\n' "$(date -u +%FT%TZ)" "$available" >> "$root/evidence/check-reserve.log"
 [[ "$available" =~ ^[0-9]+$ && "$available" -ge 6291456 && -z "$competitors" ]]
}
check || { echo 'Preflight reserve/contention guard';exit 1; }
(while :;do
 if ! check;then echo 'Reserve/contention guard' > "$root/evidence/check-abort.txt";podman kill --signal KILL "$name" >/dev/null 2>&1 || true;exit 1;fi
 sleep 1
done) & watcher=$!
set +e
timeout --kill-after=5 90 podman run --rm --name "$name" --network=none --cpus=2 --memory=1g --memory-swap=1g --pids-limit=128 --security-opt label=disable -v "$workspace:$workspace:rw" --workdir "$workspace" localhost/llama-intel-build:fedora44 bash "$root/check-cpu.sh" > "$root/evidence/cpu-check.log" 2>&1
rc=$?
set -e
printf '%s\n' "$rc" > "$root/evidence/check-exit.txt"
[[ "$rc" == 0 && ! -e "$root/evidence/check-abort.txt" ]] || { tail -80 "$root/evidence/cpu-check.log";exit 1; }
services > "$root/evidence/check-services-after.txt"
cmp "$root/evidence/check-services-before.txt" "$root/evidence/check-services-after.txt"
sha256sum -c "$root/evidence/cpu-build-identity.sha256" > "$root/evidence/check-identity-after.log"
tail -55 "$root/evidence/cpu-check.log"
