#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
mode=${1:?off|bounded|adaptive}
port=${2:?port}
run_name=${FIELDFARE_RUN_NAME:-$mode}
out_root=${FIELDFARE_OUT_ROOT:-$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/gate}
out="$out_root/$run_name"
request=${FIELDFARE_REQUEST:-$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/workloads/agentic-tool-planning-3k.json}
model=${FIELDFARE_MODEL:-$root/../models/qwen3.6/Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf}
ctx=${FIELDFARE_CTX:-131072}
kv=${FIELDFARE_KV:-q4_0}
draft=${FIELDFARE_DRAFT:-1}
batch=${FIELDFARE_BATCH:-512}
ubatch=${FIELDFARE_UBATCH:-128}
sample_interval=${FIELDFARE_SAMPLE_INTERVAL:-1}
request_max_time=${FIELDFARE_REQUEST_MAX_TIME:-600}
rm -rf "$out"
mkdir -p "$out"

export LD_LIBRARY_PATH="$root/build-intel-clang/bin:$root/build-intel-clang/runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GGML_CPU_EXPERT_IO_PROFILE=1
export GGML_CPU_EXPERT_IO_ADVISE_MODE="$mode"
if [[ ${FIELDFARE_WHOLE_TOKEN_PROFILE:-0} == 1 ]]; then
  export GGML_CPU_WHOLE_TOKEN_PROFILE=1
else
  unset GGML_CPU_WHOLE_TOKEN_PROFILE || true
fi

before_swap_in=$(awk '/^pswpin /{print $2}' /proc/vmstat)
before_swap_out=$(awk '/^pswpout /{print $2}' /proc/vmstat)
before_major=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
start=$(date +%s)
pressure_pid=

spec=(--spec-type none)
if (( draft > 0 )); then
  spec=(--spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max "$draft"
        --spec-draft-threads 8 --spec-draft-threads-batch 8
        --spec-draft-type-k "$kv" --spec-draft-type-v "$kv")
fi

taskset -c 0-15 "$root/build-intel-clang/bin/llama-server" \
  -m "$model" -ngl 0 -t 8 --cpu-range 0-7 --cpu-strict 1 \
  --ctx-size "$ctx" --parallel 1 --batch-size "$batch" --ubatch-size "$ubatch" \
  --cache-type-k "$kv" --cache-type-v "$kv" --flash-attn on --cache-prompt \
  --load-mode mmap --no-warmup --metrics --host 127.0.0.1 --port "$port" \
  "${spec[@]}" \
  >"$out/server.log" 2>&1 &
pid=$!
cleanup(){
  kill -TERM "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  if [[ -n ${pressure_pid:-} ]]; then
    kill -TERM "$pressure_pid" 2>/dev/null || true
    wait "$pressure_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

printf 'epoch\tphase\telapsed\trss_kib\tpss_kib\tread_bytes\tminflt\tmajflt\tblkio_ticks\tmem_available_kib\tswap_free_kib\tpswpin_delta\tpswpout_delta\tpgmaj_delta\n' > "$out/samples.tsv"
sample(){
  local phase=$1 now rss pss read_bytes minflt majflt blkio_ticks mem_avail swap_free si so major
  now=$(date +%s)
  [[ -r /proc/$pid/status ]] || return 0
  rss=$(awk '/^VmRSS:/{print $2}' /proc/$pid/status); pss=$(awk '/^Pss:/{s+=$2} END{print s+0}' /proc/$pid/smaps_rollup 2>/dev/null || echo 0)
  read_bytes=$(awk '/^read_bytes:/{print $2}' /proc/$pid/io 2>/dev/null || echo 0); read -r minflt majflt blkio_ticks < <(awk '{print $10,$12,$42}' /proc/$pid/stat)
  mem_avail=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo); swap_free=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)
  si=$(awk '/^pswpin /{print $2}' /proc/vmstat); so=$(awk '/^pswpout /{print $2}' /proc/vmstat); major=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$now" "$phase" "$((now-start))" "${rss:-0}" "$pss" "$read_bytes" "$minflt" "$majflt" "${blkio_ticks:-0}" "$mem_avail" "$swap_free" "$((si-before_swap_in))" "$((so-before_swap_out))" "$((major-before_major))" >> "$out/samples.tsv"
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
# Ask the active mapping to release clean pages only for explicit cold-cache
# diagnostics. Production/finalist runs leave the loaded mmap residency intact.
if [[ ${FIELDFARE_EVICT:-1} == 0 ]]; then
  printf 'eviction=disabled\n' > "$out/fadvise.txt"
elif [[ ${FIELDFARE_PAGEOUT:-0} == 1 ]]; then
  if python3 "$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/evict-process-mapping.py" \
      --pid "$pid" --model "$model" > "$out/pageout.txt" 2> "$out/pageout.err"; then
    printf 'process_madvise=ok\n' > "$out/fadvise.txt"
  else
    cat "$out/pageout.err" >&2
    exit 1
  fi
else
  python3 - "$model" <<'PY' > "$out/fadvise.txt"
import os, sys
fd=os.open(sys.argv[1], os.O_RDONLY)
try:
    os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)
    print('POSIX_FADV_DONTNEED=ok')
finally:
    os.close(fd)
PY
fi

# Establish controlled page pressure only after model loading, so clean mmap
# pages can be reclaimed before the request rather than repopulated afterward.
if [[ ${FIELDFARE_PRESSURE_GIB:-0} != 0 ]]; then
  rm -f "$out/pressure.ready"
  python3 "$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/memory-pressure.py" \
    --gib "$FIELDFARE_PRESSURE_GIB" --ready "$out/pressure.ready" >"$out/pressure.log" 2>&1 &
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

curl -fsS --max-time "$request_max_time" -H 'Content-Type: application/json' --data-binary "@$request" \
  -w '%{time_total}\n' -o "$out/response.json" "http://127.0.0.1:$port/v1/chat/completions" > "$out/wall-seconds.txt" &
curl_pid=$!
while kill -0 "$curl_pid" 2>/dev/null; do sample request; sleep "$sample_interval"; done
wait "$curl_pid"
sample after
curl -fsS "http://127.0.0.1:$port/metrics" > "$out/metrics-after.txt"
curl -fsS -H 'Accept-Encoding: gzip' "http://127.0.0.1:$port/" -o "$out/ui.html.gz"

jq '{id,choices,usage,timings}' "$out/response.json" > "$out/response-summary.json"
jq -n \
  --arg mode "$mode" --arg run_name "$run_name" --arg model "$model" --arg kv "$kv" \
  --argjson ctx "$ctx" --argjson draft "$draft" --argjson batch "$batch" --argjson ubatch "$ubatch" \
  --argjson pid "$pid" --argjson startup "$(( $(date +%s)-start ))" \
  --argjson wall "$(cat "$out/wall-seconds.txt")" \
  --arg tool "$(jq -r '.choices[0].message.tool_calls[0].function.name // ""' "$out/response.json")" \
  --argjson prompt "$(jq '.timings.prompt_n // .usage.prompt_tokens // 0' "$out/response.json")" \
  --argjson generated "$(jq '.timings.predicted_n // .usage.completion_tokens // 0' "$out/response.json")" \
  --argjson prompt_tps "$(jq '.timings.prompt_per_second // 0' "$out/response.json")" \
  --argjson generation_tps "$(jq '.timings.predicted_per_second // 0' "$out/response.json")" \
  --argjson draft_n "$(jq '.timings.draft_n // 0' "$out/response.json")" \
  --argjson accepted "$(jq '.timings.draft_n_accepted // 0' "$out/response.json")" \
  '{mode:$mode,run_name:$run_name,model:$model,ctx:$ctx,kv:$kv,draft_depth:$draft,batch:$batch,ubatch:$ubatch,pid:$pid,total_seconds:$startup,wall_seconds:$wall,tool_name:$tool,prompt_tokens:$prompt,generated_tokens:$generated,prompt_tps:$prompt_tps,generation_tps:$generation_tps,draft_tokens:$draft_n,accepted_draft_tokens:$accepted}' > "$out/result.json"

cleanup
trap - EXIT INT TERM
jq . "$out/result.json"
tail -4 "$out/samples.tsv"
