#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
model_name=${1:?ornith|gemma4}
draft_depth=${2:?0..4}
port=${3:?port}
run_name=${RUN_NAME:-${model_name}-d${draft_depth}}
out_root=${OUT_ROOT:-$root/benchmarks/intel-1340p/ornith-gemma-optimization/baseline}
out=$out_root/$run_name
request=${REQUEST:-$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/workloads/agentic-tool-planning-3k.json}
context=${CTX:-8192}
batch=${BATCH:-512}
ubatch=${UBATCH:-128}
kv=${KV:-q8_0}
threads=${THREADS:-8}
cpus=${CPUS:-0-7}
process_cpus=${PROCESS_CPUS:-0-15}
pressure_gib=${PRESSURE_GIB:-0}
advice_mode=${GGML_CPU_EXPERT_IO_ADVISE_MODE:-off}
load_mode=${LOAD_MODE:-mmap}
flash_attn=${FLASH_ATTN:-on}
prompt_cache=${PROMPT_CACHE:-on}

case "$model_name" in
  ornith)
    model=/var/home/agent/workspace/projects/models/ornith-1.0-35b-mtp-apex/Ornith-1.0-35B-MTP-APEX-I-Mini.gguf
    draft_model=
    ;;
  gemma4)
    model=/var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf
    draft_model=/var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf
    ;;
  *) echo "unknown model: $model_name" >&2; exit 2;;
esac

[[ $draft_depth =~ ^[0-4]$ ]] || { echo "draft depth must be 0..4" >&2; exit 2; }
if [[ $model_name == ornith && $draft_depth -gt 3 ]]; then
  echo "Ornith embedded MTP supports benchmark depths 0..3" >&2
  exit 2
fi
case "$prompt_cache" in
  on)  prompt_cache_args=(--cache-prompt) ;;
  off) prompt_cache_args=(--no-cache-prompt) ;;
  *) echo "PROMPT_CACHE must be on or off" >&2; exit 2 ;;
esac
[[ $flash_attn == on || $flash_attn == off || $flash_attn == auto ]] || { echo "FLASH_ATTN must be on, off or auto" >&2; exit 2; }
[[ $load_mode == none || $load_mode == mmap || $load_mode == mlock || $load_mode == mmap+mlock || $load_mode == dio ]] || { echo "invalid LOAD_MODE" >&2; exit 2; }

rm -rf "$out"; mkdir -p "$out"

export LD_LIBRARY_PATH="$root/build-intel-clang/bin:$root/build-intel-clang/runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GGML_CPU_EXPERT_IO_PROFILE=${GGML_CPU_EXPERT_IO_PROFILE:-1}
export GGML_CPU_EXPERT_IO_ADVISE_MODE=$advice_mode
export GGML_SPECULATIVE_PROFILE=${GGML_SPECULATIVE_PROFILE:-1}
if [[ ${WHOLE_TOKEN_PROFILE:-0} == 1 ]]; then
  export GGML_CPU_WHOLE_TOKEN_PROFILE=1
else
  unset GGML_CPU_WHOLE_TOKEN_PROFILE || true
fi

spec=(--spec-type none)
if (( draft_depth > 0 )); then
  spec=(--spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max "$draft_depth"
        --spec-draft-threads "$threads" --spec-draft-threads-batch "$threads"
        --spec-draft-type-k "$kv" --spec-draft-type-v "$kv")
  [[ -z $draft_model ]] || spec+=(--model-draft "$draft_model")
fi

before_swap_in=$(awk '/^pswpin /{print $2}' /proc/vmstat)
before_swap_out=$(awk '/^pswpout /{print $2}' /proc/vmstat)
before_major=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
start=$(date +%s)

printf 'epoch\tphase\telapsed\trss_kib\tpss_kib\tread_bytes\tminflt\tmajflt\tmem_available_kib\tswap_free_kib\tpswpin_delta\tpswpout_delta\tpgmaj_delta\tpkg_temp_mC\n' > "$out/samples.tsv"

taskset -c "$process_cpus" "$root/build-intel-clang/bin/llama-server" \
  --model "$model" --gpu-layers 0 \
  --threads "$threads" --cpu-range "$cpus" --cpu-strict 1 \
  --ctx-size "$context" --parallel 1 --batch-size "$batch" --ubatch-size "$ubatch" \
  --cache-type-k "$kv" --cache-type-v "$kv" --flash-attn "$flash_attn" \
  "${prompt_cache_args[@]}" --cache-ram 0 --no-cache-idle-slots \
  --load-mode "$load_mode" --no-warmup --metrics --no-ui --host 127.0.0.1 --port "$port" \
  "${spec[@]}" > "$out/server.log" 2>&1 &
pid=$!
pressure_pid=
cleanup(){
  kill -TERM "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  if [[ -n ${pressure_pid:-} ]]; then
    kill -TERM "$pressure_pid" 2>/dev/null || true
    wait "$pressure_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

sample(){
  local phase=$1 now rss pss read_bytes minflt majflt mem_avail swap_free si so major temp
  now=$(date +%s); [[ -r /proc/$pid/status ]] || return 0
  rss=$(awk '/^VmRSS:/{print $2}' /proc/$pid/status)
  pss=$(awk '/^Pss:/{print $2}' /proc/$pid/smaps_rollup 2>/dev/null || echo 0)
  read_bytes=$(awk '/^read_bytes:/{print $2}' /proc/$pid/io 2>/dev/null || echo 0)
  read -r minflt majflt < <(awk '{print $10,$12}' /proc/$pid/stat)
  mem_avail=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
  swap_free=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)
  si=$(awk '/^pswpin /{print $2}' /proc/vmstat); so=$(awk '/^pswpout /{print $2}' /proc/vmstat); major=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
  temp=$(cat /sys/class/thermal/thermal_zone1/temp)
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$now" "$phase" "$((now-start))" "${rss:-0}" "$pss" "$read_bytes" "$minflt" "$majflt" "$mem_avail" "$swap_free" "$((si-before_swap_in))" "$((so-before_swap_out))" "$((major-before_major))" "$temp" >> "$out/samples.tsv"
}

ready=0
for _ in $(seq 1 360); do
  sample startup
  if curl -fsS "http://127.0.0.1:$port/health" > "$out/health.json" 2>/dev/null; then ready=1; break; fi
  kill -0 "$pid" 2>/dev/null || break
  sleep 1
done
(( ready )) || { tail -100 "$out/server.log"; exit 1; }

curl -fsS "http://127.0.0.1:$port/metrics" > "$out/metrics-before.txt"

# Optional controlled pressure is established only after model loading so it
# exercises mmap residency/reclaim without changing startup behavior.
if [[ $pressure_gib != 0 ]]; then
  rm -f "$out/pressure.ready"
  python3 "$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/memory-pressure.py" \
    --gib "$pressure_gib" --ready "$out/pressure.ready" > "$out/pressure.log" 2>&1 &
  pressure_pid=$!
  for _ in $(seq 1 180); do
    sample pressure
    [[ -s "$out/pressure.ready" ]] && break
    kill -0 "$pressure_pid" 2>/dev/null || break
    sleep 1
  done
  [[ -s "$out/pressure.ready" ]] || { echo "memory pressure holder failed" >&2; exit 1; }
  sleep 5
  sample pressure
fi

curl -fsS --max-time 1800 -H 'Content-Type: application/json' --data-binary "@$request" \
  -w '%{time_total}\n' -o "$out/response.json" "http://127.0.0.1:$port/v1/chat/completions" > "$out/wall-seconds.txt" &
curl_pid=$!
while kill -0 "$curl_pid" 2>/dev/null; do sample request; sleep 1; done
wait "$curl_pid"
sample after
curl -fsS "http://127.0.0.1:$port/metrics" > "$out/metrics-after.txt"

jq -n \
  --arg model "$model_name" --arg run_name "$run_name" --arg model_path "$model" --arg draft_path "$draft_model" --arg kv "$kv" \
  --arg advice_mode "$advice_mode" --arg load_mode "$load_mode" --arg flash_attn "$flash_attn" --arg prompt_cache "$prompt_cache" --argjson pressure_gib "$pressure_gib" \
  --argjson draft_depth "$draft_depth" --argjson context "$context" --argjson batch "$batch" --argjson ubatch "$ubatch" \
  --argjson wall "$(cat "$out/wall-seconds.txt")" \
  --arg tool_name "$(jq -r '.choices[0].message.tool_calls[0].function.name // ""' "$out/response.json")" \
  --arg tool_args "$(jq -cS '.choices[0].message.tool_calls[0].function.arguments | fromjson' "$out/response.json" 2>/dev/null || echo null)" \
  --argjson prompt_tokens "$(jq '.timings.prompt_n // .usage.prompt_tokens // 0' "$out/response.json")" \
  --argjson generated_tokens "$(jq '.timings.predicted_n // .usage.completion_tokens // 0' "$out/response.json")" \
  --argjson prompt_tps "$(jq '.timings.prompt_per_second // null' "$out/response.json")" \
  --argjson generation_tps "$(jq '.timings.predicted_per_second // null' "$out/response.json")" \
  --argjson draft_tokens "$(jq '.timings.draft_n // 0' "$out/response.json")" \
  --argjson accepted_draft_tokens "$(jq '.timings.draft_n_accepted // 0' "$out/response.json")" \
  '{model:$model,run_name:$run_name,model_path:$model_path,draft_path:$draft_path,draft_depth:$draft_depth,context:$context,batch:$batch,ubatch:$ubatch,kv:$kv,advice_mode:$advice_mode,load_mode:$load_mode,flash_attn:$flash_attn,prompt_cache:$prompt_cache,pressure_gib:$pressure_gib,wall_seconds:$wall,prompt_tokens:$prompt_tokens,generated_tokens:$generated_tokens,prompt_tps:$prompt_tps,generation_tps:$generation_tps,draft_tokens:$draft_tokens,accepted_draft_tokens:$accepted_draft_tokens,tool_name:$tool_name,tool_args:($tool_args|fromjson)}' > "$out/result.json"

cleanup; trap - EXIT INT TERM
cat "$out/result.json"
