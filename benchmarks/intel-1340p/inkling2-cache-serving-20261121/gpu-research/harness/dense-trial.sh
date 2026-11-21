#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-gpu-cache768-20261121-1dadee62b/dense"
runtime="$ws/tmp/llama-cpp/runs/upstream-review-20261114-976edc030/private-podman.sh"
label=${1:?};kind=${2:?}
[[ "$label" =~ ^[a-z0-9-]+$ && "$kind" =~ ^(counter|fallback|group6|dense)$ ]]
p(){ bash "$runtime" "$@"; }
export TMPDIR="$run/tmp/$label" TMP="$run/tmp/$label" TEMP="$run/tmp/$label"
mkdir -p "$TMPDIR"
test ! -e "$run/$label.exit";test ! -e "$run/$label.container.id"
for live in inkling2-mini-cache768-webui-20261121 inkling2-mini-simd-webui-20261121 inkling2-mini-webui-20261120 gemma4-base-webui-20261114;do test "$(p inspect "$live" --format '{{.State.Running}}')" = false;done
cg=$(awk -F: '$1==0{print $3}' /proc/self/cgroup)
for spec in 'memory.max 24964497408' 'memory.swap.max 0' 'cpu.max 1600000 100000';do test "$(cat "/sys/fs/cgroup$cg/${spec%% *}")" = "${spec#* }";done
available=$(awk '/MemAvailable:/{print $2}' /proc/meminfo);(( available*1024 >= 24964497408+2147483648 ))
sha256sum -c "$run/gpu-runtime.sha256" > "$run/$label.integrity.log"
closure=$(cat "$run/gpu-runtime-path.txt")
model="$ws/projects/models/inkling-2-mini/Inkling-2-Mini-IQ4_NL.gguf"
projector="$ws/projects/models/inkling-2-mini/mmproj-Inkling-2-Mini-Q8_0.gguf"
pattern='^$';args=("$closure/replay-audited" "$model")
if [[ "$kind" = group6 ]];then pattern='^blk\.(6|7)\.ffn_(gate_up|down)_exps\.weight$';fi
if [[ "$kind" = dense ]];then pattern='^blk\.[0-9]+\.attn_(q|k|v|output)\.weight$';fi
if [[ "$kind" = counter ]];then model=/dev/null;projector=/dev/null;args=("$closure/check-gpu-counters" "$run/$label.fdinfo.txt");else test "$(cat "$run/gpu-counters.exit")" = 0;fi
name="inkling-cg-$label";owned=0
finish(){
 rc=$?;trap - EXIT TERM INT HUP
 if (( owned ));then p stop --time 20 "$name" >> "$run/$label.stop.txt" 2>&1 || true;p inspect "$name" > "$run/$label.container-after.json" || true;fi
 echo "$rc" > "$run/$label.exit";exit "$rc"
}
trap finish EXIT
trap 'exit 143' TERM INT HUP
! p container exists "$name"
owned=1
p run -d --name "$name" --restart=no --network none --cpus 16 --memory 24964497408 --memory-swap 24964497408 --pids-limit 512 --userns keep-id --security-opt label=disable --cap-drop=all --device /dev/dri/renderD128 --group-add keep-groups \
 -v "$ws:$ws" -w "$run" -e TMPDIR="$TMPDIR" -e TMP="$TMPDIR" -e TEMP="$TMPDIR" -e LD_LIBRARY_PATH="$closure" \
 -e XDG_CACHE_HOME="$ws/tmp/llama-cpp/cache/inkling-opt-native/xdg" -e MESA_SHADER_CACHE_DIR="$ws/tmp/llama-cpp/cache/inkling-opt-native/mesa" \
 -e GGML_VK_VISIBLE_DEVICES=0 -e GGML_SCHED_PREFETCH_EXPERTS=0 -e GGML_VK_CPU_PREFILL_PATTERN="$pattern" -e GGML_OP_OFFLOAD_MIN_BATCH=32 \
 -e FLINT_THREADS=4 -e FLINT_BATCH_THREADS=16 -e FLINT_POOL=3 -e FLINT_UBATCH=128 -e FLINT_FA=0 -e FLINT_ASYNC=0 -e FLINT_PROMPT=512 -e FLINT_DECODE=64 -e FLINT_REPS=2 \
 -e MOE_CPU_MASK=0x55 -e MOE_BATCH_CPU_MASK=0xffff -e MOE_DECODE_STRICT=1 -e MOE_POLL=50 -e MOE_BATCH_POLL=50 -e MOE_CONTEXT=65536 -e MOE_BATCH=512 -e MOE_GPU_PREFILL=1 -e OMP_NUM_THREADS=4 \
 -e MOE_DUMP_LOGITS="$run/$label.logits.f32" \
 --log-driver k8s-file --log-opt path="$run/$label.native.log" --log-opt max-size=40mb --entrypoint /bin/bash localhost/llama-intel-build:fedora44 \
 "$run/gpu-guard.sh" "$run" "$label-native" "$model" "$projector" 24964497408 1 "${args[@]}" > "$run/$label.container.id"
pid=$(p inspect "$name" --format '{{.State.Pid}}');cg=$(awk -F: '$1==0{print $3}' /proc/"$pid"/cgroup)
{ echo "container_root_pid=$pid";echo "cgroup=$cg";for key in memory.max memory.swap.max cpu.max;do printf '%s ' "$key";cat "/sys/fs/cgroup$cg/$key";done; } > "$run/$label.kernel.txt"
for spec in 'memory.max 24964497408' 'memory.swap.max 0' 'cpu.max 1600000 100000';do test "$(cat "/sys/fs/cgroup$cg/${spec%% *}")" = "${spec#* }";done
if [[ "$kind" != counter ]];then
 for ((i=0;i<60;i++));do
  native=$(p top "$name" hpid comm |awk '$2~/^replay-audited/ && !found {print $1;found=1}')
  if [[ -n "$native" ]] && grep -q BENCH_CONFIG "$run/$label.native.log" 2>/dev/null;then
   awk '/lib(llama|ggml)/{print $NF}' /proc/"$native"/maps |sort -u > "$run/$label.libraries.txt"
   test -s "$run/$label.libraries.txt";! grep -v "^$closure/" "$run/$label.libraries.txt"
   for f in /proc/"$native"/task/*/status;do awk '/^Name:|^Cpus_allowed_list:/{printf "%s ",$0}END{print ""}' "$f";done > "$run/$label.affinity.txt"
   for f in /proc/"$native"/fdinfo/*;do grep -q '^drm-' "$f" 2>/dev/null && { echo ===$f;cat "$f"; } || true;done > "$run/$label.fdinfo-start.txt"
   break
  fi
  test "$(p inspect "$name" --format '{{.State.Running}}')" = true || break;sleep 1
 done
fi
timeout --signal=TERM --kill-after=20 900 /bin/bash "$runtime" wait "$name" > "$run/$label.container-exit"
test "$(cat "$run/$label.container-exit")" = 0
test "$(cat "$run/$label-native.exit")" = 0
test ! -e "$run/$label-native.guard-stop.txt"
awk -F, 'NR>1 {if($3!=0||$5!=0||$6>24964497408||$4>24964497408||$2<2097152)bad=1;if($9>0&&$11>0)positive=1;n++}END{if(bad||!n||!positive)exit 1}' "$run/$label-native.monitor.csv"
if [[ "$kind" = counter ]];then
 awk -f "$run/drm-account.awk" "$run/$label.fdinfo.txt" > "$run/$label.counter-summary.txt"
 awk '$1>0&&$2>0&&$3>0&&$3==$4{ok=1}END{if(!ok)exit 1}' "$run/$label.counter-summary.txt"
 echo 0 > "$run/gpu-counters.exit"
else
 grep -q 'RESULT PASS finite replay' "$run/$label.native.log"
 grep -E 'BENCH_CONFIG|BENCH_RESULT|LOGITS_HASH|RESULT PASS' "$run/$label.native.log"
fi
echo "PASS GPU screen $label $kind; profiler off, confirm any winner before deployment"
