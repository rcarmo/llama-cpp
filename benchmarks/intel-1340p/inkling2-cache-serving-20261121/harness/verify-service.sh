#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/inkling-cache-serving-20261121-1dadee62b"
runtime="$ws/tmp/llama-cpp/runs/upstream-review-20261114-976edc030/private-podman.sh"
name=inkling2-mini-cache768-webui-20261121
label=${1:?}
[[ "$label" =~ ^[a-z0-9-]+$ ]]
p(){ bash "$runtime" "$@"; }
test "$(p inspect "$name" --format '{{.State.Running}}')" = true
test "$(p inspect inkling2-mini-simd-webui-20261121 --format '{{.State.Running}}')" = false
test "$(p inspect inkling2-mini-webui-20261120 --format '{{.State.Running}}')" = false
test "$(p inspect gemma4-base-webui-20261114 --format '{{.State.Running}}')" = false
p inspect "$name" > "$run/$label.container.json"
for endpoint in health props slots v1/models;do curl -fsS --max-time 10 "http://192.168.1.70:11434/$endpoint" > "$run/$label.${endpoint//\//-}.json";done
jq -e '.data[0].id=="Inkling-2-Mini"' "$run/$label.v1-models.json" >/dev/null
jq -e 'all(.[];.is_processing==false and .n_ctx==65536)' "$run/$label.slots.json" >/dev/null
curl --compressed -fsS --max-time 10 http://192.168.1.70:11434/ > "$run/$label.index.html"
cmp "$run/original.index.html" "$run/$label.index.html"
pid=$(p inspect "$name" --format '{{.State.Pid}}')
cg=$(awk -F: '$1==0{print $3}' /proc/"$pid"/cgroup)
{ echo "container_root_pid=$pid";echo "cgroup=$cg";for k in memory.max memory.current memory.peak memory.swap.max memory.swap.current memory.events cpu.max cpu.stat;do echo ===$k;cat "/sys/fs/cgroup$cg/$k";done; } > "$run/$label.kernel.txt"
test "$(cat "/sys/fs/cgroup$cg/memory.max")" = 24964497408
test "$(cat "/sys/fs/cgroup$cg/memory.swap.max")" = 0
test "$(cat "/sys/fs/cgroup$cg/memory.swap.current")" = 0
test "$(cat "/sys/fs/cgroup$cg/cpu.max")" = '1600000 100000'
! grep -Eq '^(oom|oom_kill) [1-9]' "/sys/fs/cgroup$cg/memory.events"
native=$(p top "$name" hpid comm |awk '$2~/^llama-server/ && !found {print $1;found=1}')
test -n "$native"
awk '/lib(llama|ggml|mtmd)/{print $NF}' /proc/"$native"/maps |sort -u > "$run/$label.libraries.txt"
closure=$(cat "$run/runtime-path.txt")
test -s "$run/$label.libraries.txt"
! grep -v "^$closure/" "$run/$label.libraries.txt"
for f in /proc/"$native"/task/*/status;do awk '/^Name:|^Cpus_allowed_list:/{printf "%s ",$0}END{print ""}' "$f";done > "$run/$label.affinity.txt"
for f in /proc/"$native"/fdinfo/*;do grep -q '^drm-' "$f" 2>/dev/null && { echo ===$f;cat "$f"; } || true;done > "$run/$label.drm.txt"
test ! -s "$run/$label.drm.txt"
serve=$(cat "$run/latest-serve-label.txt")
test ! -f "$run/$serve.guard-stop.txt"
awk -F, 'NR>1 {if($3!=0||$5!=0||$6>24964497408||$2<2097152)exit 1;n++}END{if(!n)exit 1}' "$run/$serve.monitor.csv"
printf '%s\n' "$serve" > "$run/$label.serve-label.txt"
sha256sum -c "$run/runtime.sha256" > "$run/$label.integrity.log"
echo "PASS $label identity, UI bytes, native caps, backing/RSS guard, affinity evidence and closure"
