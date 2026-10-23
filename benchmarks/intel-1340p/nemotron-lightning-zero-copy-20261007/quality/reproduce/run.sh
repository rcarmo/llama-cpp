#!/usr/bin/env bash
set -euo pipefail
ws=/var/home/agent/workspace
out="$ws/tmp/llama-cpp/runs/nemotron-zero-copy-fdfd814abcb3/llama-cpp-182732430/source"
b=$(cat "$out/vulkan-build-path.txt")
out="$out/task-quality"
r="$ws/tmp/llama-cpp/runs/nemotron-zero-copy-fdfd814abcb3/source-3036849979/gcc-intel-vulkan"
mode=${1:?mode};fixture=${2:?fixture};suffix=${3:-};tag="semantic-${mode}-${fixture}${suffix:+-$suffix}"
name=nemotron-quality-gate
export XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
for unit in transcribe-web.service llama-qwen-moe.service llama-gemma-zero-copy.service;do
 test "$(systemctl --user show "$unit" -p MainPID --value)" = 0
done
! ss -ltnH 'sport = :8093 or sport = :8094 or sport = :11434 or sport = :8096' | grep -q .
awk '/MemAvailable/{if($2<6291456)exit 1}' /proc/meminfo
cleanup(){ podman rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
mkdir -p "$r/tmp" "$ws/tmp/llama-cpp/cache/xdg"
args=(--name "$name" --network none --security-opt label=disable --userns=keep-id --device /dev/dri/renderD128 --group-add keep-groups --cpus=4 --memory=20g --memory-swap=20g --pids-limit=256 --ulimit core=0:0 -v "$ws:$ws" -w "$r" -e LD_LIBRARY_PATH="$b/bin" -e TMPDIR="$r/tmp" -e TMP="$r/tmp" -e TEMP="$r/tmp" -e BUN_TMPDIR="$r/tmp" -e XDG_CACHE_HOME="$ws/tmp/llama-cpp/cache/xdg" -e VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/intel_icd.x86_64.json -e QWEN_THREADS=4 -e QWEN_BATCH=512)
test -f "$out/$fixture-request.json"
# Never overwrite a retained observation.
test ! -e "$out/$tag-response.json"
printf 'timestamp=%s\nmode=%s fixture=%s\n' "$(date -u --iso-8601=seconds)" "$mode" "$fixture" >"$out/$tag-manifest.txt"
sha256sum "$b/bin/test-nemotron-semantic-handoff" "$out/$fixture-request.json" "$b/bin/libllama.so" "$b/bin/libggml-vulkan.so" >>"$out/$tag-manifest.txt"
timeout --signal=TERM --kill-after=5s 180s podman run "${args[@]}" localhost/llama-intel-build:fedora44 "$b/bin/test-nemotron-semantic-handoff" "$mode" "$ws/projects/models/nemotron-lightning/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-Q4_0.gguf" "$out/$fixture-request.json" "$out/$tag-response.json" >"$out/$tag.log" 2>&1 &
job=$!
printf 'time memavailable_kib memory_current memory_peak swap_current\n' >"$out/$tag-resources.tsv"
while kill -0 "$job" 2>/dev/null;do
 available=$(awk '/MemAvailable/{print $2}' /proc/meminfo)
 pid=$(podman inspect "$name" --format '{{.State.Pid}}' 2>/dev/null || true)
 if [[ ${pid:-0} -gt 0 && -r /proc/$pid/cgroup ]];then
  cg="/sys/fs/cgroup$(awk -F: '$1==0{print $3}' /proc/$pid/cgroup)"
  if [[ -r $cg/memory.current ]];then
   printf '%s %s %s %s %s\n' "$(date -u +%FT%TZ)" "$available" "$(cat "$cg/memory.current")" "$(cat "$cg/memory.peak")" "$(cat "$cg/memory.swap.current")" >>"$out/$tag-resources.tsv"
   cat "$cg/memory.events" >"$out/$tag-memory.events"
  fi
 fi
 if (( available < 6291456 ));then echo HOST_RESERVE_ABORT >>"$out/$tag.log";cleanup;break;fi
 sleep 1
done
wait "$job" && rc=0 || rc=$?
podman inspect "$name" --format '{{json .State}}' >"$out/$tag-state.json" 2>/dev/null || true
printf 'rc=%s\n' "$rc" |tee "$out/$tag-exit.txt"
if [[ -f $out/$tag-response.json ]];then jq '{profile,passed_native,error,shared_bytes,copied_bytes,source_gpu_owner_destroyed,total_ms,turns:[.turns[]|{round,cached_tokens,evaluated_tokens,finish,parsed,generation_ms}]}' "$out/$tag-response.json";else tail -12 "$out/$tag.log";fi
exit "$rc"
