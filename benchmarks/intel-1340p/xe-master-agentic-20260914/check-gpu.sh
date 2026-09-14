#!/bin/bash
# SCRIPT_JDOC: {"summary":"Check fresh current-master Vulkan-to-CPU handoff on plain and Gemma synthetic contexts with zero-swap cgroup protection","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-master-agentic-20260914
plugin="$root/build-vulkan-parent/bin/libggml-vulkan.so"
bin="$root/build-cpu/bin/test-context-handoff"
export LD_LIBRARY_PATH="$root/build-cpu/bin:/var/home/agent/workspace/reports/gemma-simd-async-20260906/build-vulkan/runtime"
export GGML_BACKEND_PATH="$plugin"
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
cg="/sys/fs/cgroup$(awk -F:: '{print $2}' /proc/self/cgroup)"
[[ $(cat "$cg/memory.swap.max") == 0 ]] || { echo 'Zero-swap cgroup required';exit 1; }
[[ $(cat "$cg/memory.max") == 1073741824 ]] || { echo '1GiB cgroup required';exit 1; }
services(){ systemctl --user show llama-gemma-local-provider.service whisper-stt.service whisper-stt-diarizer.service -p Id -p ActiveState -p MainPID; }
services > "$root/evidence/gpu-services-before.txt"
[[ $(grep -c '^ActiveState=inactive$' "$root/evidence/gpu-services-before.txt") == 3 ]] || exit 1
child='';watcher=''
cleanup(){
 if [[ -n "$child" ]]; then kill -KILL "$child" 2>/dev/null || true;wait "$child" 2>/dev/null || true;fi
 if [[ -n "$watcher" ]];then kill "$watcher" 2>/dev/null || true;wait "$watcher" 2>/dev/null || true;fi
 for f in memory.peak memory.swap.peak memory.events cpu.stat;do printf '%s\n' "$f";cat "$cg/$f";done
 rm -f "$root/evidence/gpu-plain.gguf" "$root/evidence/gpu-gemma.gguf"
}
trap cleanup EXIT
for variant in plain gemma;do
 [[ ! -e "$root/evidence/gpu-$variant.log" ]] || { echo 'Retained native attempt exists';exit 2; }
 available=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
 [[ "$available" =~ ^[0-9]+$ && "$available" -ge 6291456 ]] || { echo 'Reserve preflight';exit 1; }
 "$bin" "--$variant" "$plugin" "$root/evidence/gpu-$variant.gguf" > "$root/evidence/gpu-$variant.log" 2>&1 & child=$!
 (
  while kill -0 "$child" 2>/dev/null; do
   available=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
   competitors=$(ps -eo pid=,comm= | awk '$2 ~ /^(go|llama-server|whisper-cli|diar-server|ffmpeg|python|python3|agentic-session)$/ {print $1, $2}')
   swap=$(cat "$cg/memory.swap.current")
   printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$available" "$swap" >> "$root/evidence/gpu-$variant-resources.txt"
   if [[ ! "$available" =~ ^[0-9]+$ || "$available" -lt 6291456 || "$swap" != 0 || -n "$competitors" ]];then
    printf 'reserve/swap/contention: %s %s %s\n' "$available" "$swap" "$competitors" > "$root/evidence/gpu-abort.txt"
    kill -KILL "$child" 2>/dev/null || true;exit 1
   fi
   if [[ -r /proc/$child/maps ]];then
    maps=$(cat /proc/$child/maps 2>/dev/null || true)
    if [[ "$maps" == *"$plugin"* ]];then printf '%s\n' "$maps" > "$root/evidence/gpu-$variant-maps.txt";fi
   fi
   sleep 0.05
  done
 ) & watcher=$!
 set +e;wait "$child";rc=$?;set -e
 child='';kill "$watcher" 2>/dev/null || true;wait "$watcher" 2>/dev/null || true;watcher=''
 printf '%s\n' "$rc" > "$root/evidence/gpu-$variant-exit.txt"
 [[ "$rc" == 0 && ! -e "$root/evidence/gpu-abort.txt" ]] || { tail -50 "$root/evidence/gpu-$variant.log";exit 1; }
 grep -q 'PASS: public API guards' "$root/evidence/gpu-$variant.log"
 grep -Eq 'HANDOFF shared=[1-9][0-9]* copied=0' "$root/evidence/gpu-$variant.log"
 grep -q "$plugin" "$root/evidence/gpu-$variant-maps.txt"
done
[[ $(cat "$cg/memory.swap.peak") == 0 ]] || exit 1
awk '$1 ~ /^(max|oom|oom_kill)$/ && $2 != 0 {bad=1} END {exit bad}' "$cg/memory.events"
services > "$root/evidence/gpu-services-after.txt"
cmp "$root/evidence/gpu-services-before.txt" "$root/evidence/gpu-services-after.txt"
echo 'PASS both fresh-plugin synthetic handoffs; no trained model or timing qualification'
