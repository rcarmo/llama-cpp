#!/bin/bash
# SCRIPT_JDOC: {"summary":"Run an explicitly admitted isolated fresh-master compile with CPU/memory/swap/time caps and host-reserve abort","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-master-agentic-20260914
workspace=/var/home/agent/workspace
repo="$workspace/projects/llama-cpp"
name=xe-master-agentic-vulkan-build
[[ ${1:-} == explicit-three-way-admit ]] || { echo 'Explicit fresh admission required'; exit 2; }
[[ ! -e "$root/evidence/vulkan-build.log" ]] || { echo 'Retained attempt exists'; exit 2; }
mkdir -p "$root/evidence"
printf '%s\n' "$(git -C "$repo" rev-parse HEAD)" > "$root/evidence/vulkan-build-base.txt"
git -C "$repo" diff --binary > "$root/evidence/vulkan-build-source.patch"
sha256sum "$root/build-vulkan.sh" "$root/launch-vulkan-build.sh" "$root/evidence/vulkan-source.json" > "$root/evidence/vulkan-build-source.sha256"
find "$root/vulkan-source" -type f -print0 | sort -z | xargs -0 sha256sum >> "$root/evidence/vulkan-build-source.sha256"
watcher=''
cleanup(){
 if [[ -n "$watcher" ]]; then kill "$watcher" 2>/dev/null || true;wait "$watcher" 2>/dev/null || true;fi
 podman kill --signal KILL "$name" >/dev/null 2>&1 || true
 podman rm -f "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
available=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
[[ "$available" =~ ^[0-9]+$ && "$available" -ge 6291456 ]] || { echo 'Host reserve guard'; exit 1; }
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
systemctl --user show llama-gemma-local-provider.service whisper-stt.service whisper-stt-diarizer.service -p Id -p ActiveState -p MainPID > "$root/evidence/vulkan-build-services-before.txt"
[[ $(grep -c '^ActiveState=inactive$' "$root/evidence/vulkan-build-services-before.txt") == 3 ]] || { echo 'Service state changed'; exit 1; }
(
 while :; do
  available=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$available" >> "$root/evidence/vulkan-build-reserve.log"
  competitors=$(ps -eo pid=,comm= | awk '$2 ~ /^(go|llama-server|whisper-cli|diar-server|ffmpeg|python|python3|agentic-session)$/ {print $1, $2}')
  if [[ -n "$competitors" ]]; then
   printf 'competing worker: %s\n' "$competitors" > "$root/evidence/vulkan-build-abort.txt"
   podman kill --signal KILL "$name" >/dev/null 2>&1 || true
   exit 1
  fi
  if [[ ! "$available" =~ ^[0-9]+$ || "$available" -lt 6291456 ]]; then
   printf 'host available memory below6GiB\n' > "$root/evidence/vulkan-build-abort.txt"
   podman kill --signal KILL "$name" >/dev/null 2>&1 || true
   exit 1
  fi
  sleep 1
 done
) & watcher=$!
set +e
timeout --kill-after=5 600 podman run --rm --name "$name" --network=none --cpus=2 --memory=2g --memory-swap=2g --pids-limit=128 --security-opt label=disable -v "$workspace:$workspace:rw" -v "$root/vulkan-source:$root/vulkan-source:ro" --workdir "$workspace" localhost/llama-intel-build:fedora44 bash "$root/build-vulkan.sh" > "$root/evidence/vulkan-build.log" 2>&1
rc=$?
set -e
printf '%s\n' "$rc" > "$root/evidence/vulkan-build-exit.txt"
[[ "$rc" == 0 && ! -e "$root/evidence/vulkan-build-abort.txt" ]] || { tail -70 "$root/evidence/vulkan-build.log";exit 1; }
sha256sum -c "$root/evidence/vulkan-build-source.sha256" > "$root/evidence/vulkan-build-source-after.log"
[[ "$(git -C "$repo" rev-parse HEAD)" == "$(cat "$root/evidence/vulkan-build-base.txt")" ]] || { echo 'Source revision changed';exit 1; }
git -C "$repo" diff --binary > "$root/evidence/vulkan-build-source-after.patch"
cmp "$root/evidence/vulkan-build-source.patch" "$root/evidence/vulkan-build-source-after.patch"
systemctl --user show llama-gemma-local-provider.service whisper-stt.service whisper-stt-diarizer.service -p Id -p ActiveState -p MainPID > "$root/evidence/vulkan-build-services-after.txt"
cmp "$root/evidence/vulkan-build-services-before.txt" "$root/evidence/vulkan-build-services-after.txt"
tail -60 "$root/evidence/vulkan-build.log"
