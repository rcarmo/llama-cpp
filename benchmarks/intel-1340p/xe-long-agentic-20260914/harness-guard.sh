#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-long-agentic-20260914
cg="/sys/fs/cgroup$(awk -F:: '{print $2}' /proc/self/cgroup)"
[[ $(cat "$cg/memory.swap.max") == 0 && $(cat "$cg/memory.max") == 1073741824 ]] || exit 1
services(){ systemctl --user show llama-gemma-local-provider.service whisper-stt.service whisper-stt-diarizer.service -p Id -p ActiveState -p MainPID; }
services > "$root/evidence/harness-services-before.txt"
[[ $(grep -c '^ActiveState=inactive$' "$root/evidence/harness-services-before.txt") == 3 ]] || exit 1
check(){
 local avail other
 avail=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
 other=$(ps -eo pid=,comm= | awk '$2 ~ /^(go|llama-server|whisper-cli|diar-server|ffmpeg|python|python3)$/ {print $1,$2}')
 printf '%s %s\n' "$(date -u +%FT%TZ)" "$avail" >> "$root/evidence/harness-reserve.log"
 [[ "$avail" =~ ^[0-9]+$ && "$avail" -ge 6291456 && -z "$other" ]]
}
check || exit 1
owner=$$
(while :;do if ! check;then echo 'resource/contention guard' > "$root/evidence/harness-abort.txt";kill -TERM "$owner";exit 1;fi;sleep 1;done) & watcher=$!
cleanup(){
 kill "$watcher" 2>/dev/null || true;wait "$watcher" 2>/dev/null || true
 bash "$root/harness-stop.sh"
 for f in memory.peak memory.swap.peak memory.events cpu.stat;do printf '%s\n' "$f";cat "$cg/$f";done > "$root/evidence/harness-cgroup-final.txt"
}
trap cleanup EXIT
trap 'exit 1' TERM INT
/opt/piclaw/current/bun/bin/bun --version > "$root/evidence/bun-version.txt"
export PATH="/opt/piclaw/current/bun/bin:$PATH"
bash "$root/harness-check.sh" explicit-three-way-admit
services > "$root/evidence/harness-services-after.txt"
cmp "$root/evidence/harness-services-before.txt" "$root/evidence/harness-services-after.txt"
[[ ! -e "$root/evidence/harness-abort.txt" && $(cat "$cg/memory.swap.peak") == 0 ]]
awk '$1 ~ /^(max|oom|oom_kill)$/ && $2 != 0 {bad=1} END{exit bad}' "$cg/memory.events"
