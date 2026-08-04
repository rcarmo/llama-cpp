#!/usr/bin/env bash
set -euo pipefail

profile=${1:?ornith|gemma4}
port=${2:-0}
root=${LLAMA_ROOT:-/var/home/agent/workspace/projects/llama-cpp}
validation_ctx=${VALIDATION_CTX:-32768}
validation_request=${VALIDATION_REQUEST:-}
validation_min_prompt_tokens=${VALIDATION_MIN_PROMPT_TOKENS:-0}
validation_reserved_output_tokens=${VALIDATION_RESERVED_OUTPUT_TOKENS:-0}
validation_required_tool=${VALIDATION_REQUIRED_TOOL:-search_repository}
validation_request_sha256=${VALIDATION_REQUEST_SHA256:-}
validation_timeout=${VALIDATION_TIMEOUT:-600}
sample_interval=${VALIDATION_SAMPLE_INTERVAL:-1}
max_temp_mC=${VALIDATION_MAX_TEMP_MC:-95000}
run_name=${VALIDATION_RUN_NAME:-$profile-ctx$validation_ctx}
request_pid=
server_pgid=

case "$profile" in
  ornith)
    env_example=$root/tools/config/llama-ornith-candidate.env.example
    expected_smoke_draft=2
    expected_smoke_accepted=2
    ;;
  gemma4)
    env_example=$root/tools/config/llama-gemma4-candidate.env.example
    expected_smoke_draft=3
    expected_smoke_accepted=3
    ;;
  *) echo "profile must be ornith or gemma4" >&2; exit 2 ;;
esac

[[ -s $env_example ]] || { echo "missing profile: $env_example" >&2; exit 1; }
[[ -x $root/tools/run-intel-candidate.sh ]] || { echo "missing launcher" >&2; exit 1; }
command -v curl >/dev/null
command -v jq >/dev/null
command -v systemd-analyze >/dev/null

if [[ $port == 0 ]]; then
  port=$((8400 + RANDOM % 200))
fi
[[ $port =~ ^[1-9][0-9]*$ ]] && (( port < 65536 )) || { echo "invalid port" >&2; exit 2; }
if command -v ss >/dev/null && ss -H -ltn "sport = :$port" | grep -q .; then
  echo "port already in use: $port" >&2
  exit 2
fi

out_root=${VALIDATION_OUT_ROOT:-$root/benchmarks/intel-1340p/ornith-gemma-optimization/validation/candidate-live}
out=$out_root/$run_name
mkdir -p "$out_root"
if [[ -d $out ]]; then
  if [[ -s $out/result.json && ${VALIDATION_FORCE:-0} != 1 ]]; then
    echo "completed validation exists: $out/result.json (set VALIDATION_FORCE=1 to replace)" >&2
    exit 2
  fi
  mv "$out" "$out-interrupted-$(date +%Y%m%dT%H%M%S)"
fi
mkdir -p "$out"

set -a
# shellcheck disable=SC1090
source "$env_example"
set +a

export LLAMA_HOST=127.0.0.1
export LLAMA_PORT=$port
export LLAMA_CTX=$validation_ctx
export LLAMA_PARALLEL=1
export LLAMA_KV_UNIFIED=off
export LLAMA_CONT_BATCHING=on
export LLAMA_HTTP_TIMEOUT=$validation_timeout
export LLAMA_BATCH=${VALIDATION_BATCH:-$LLAMA_BATCH}
export LLAMA_UBATCH=${VALIDATION_UBATCH:-$LLAMA_UBATCH}
export LLAMA_DRY_RUN=1
"$root/tools/run-intel-candidate.sh" > "$out/dry-run.txt"
unset LLAMA_DRY_RUN

systemd-analyze verify "$root/tools/systemd/user/llama-candidate.service" > "$out/systemd-verify.txt" 2>&1

before_in=$(awk '/^pswpin /{print $2}' /proc/vmstat)
before_out=$(awk '/^pswpout /{print $2}' /proc/vmstat)
before_major=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
start=$(date +%s)
printf 'epoch\tphase\telapsed\trss_kib\tpss_kib\tread_bytes\tminflt\tmajflt\tmem_available_kib\tswap_free_kib\tpswpin_delta\tpswpout_delta\tpgmaj_delta\tpkg_temp_mC\n' > "$out/samples.tsv"

setsid env GGML_SPECULATIVE_PROFILE=1 "$root/tools/run-intel-candidate.sh" --no-ui > "$out/server.log" 2>&1 &
pid=$!
server_pgid=$pid
cleanup(){
  if [[ -n ${request_pid:-} ]]; then
    kill -TERM "$request_pid" 2>/dev/null || true
    wait "$request_pid" 2>/dev/null || true
  fi
  if [[ -n ${server_pgid:-} ]]; then
    kill -TERM -- "-$server_pgid" 2>/dev/null || true
  fi
  wait "$pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sample(){
  local phase=$1 now rss pss read_bytes minflt majflt mem_available swap_free pswpin pswpout pgmaj temp
  [[ -r /proc/$pid/status ]] || return 0
  now=$(date +%s)
  rss=$(awk '/^VmRSS:/{print $2}' /proc/$pid/status)
  pss=$(awk '/^Pss:/{print $2}' /proc/$pid/smaps_rollup)
  read_bytes=$(awk '/^read_bytes:/{print $2}' /proc/$pid/io)
  read -r minflt majflt < <(awk '{print $10,$12}' /proc/$pid/stat)
  mem_available=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
  swap_free=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)
  pswpin=$(awk '/^pswpin /{print $2}' /proc/vmstat)
  pswpout=$(awk '/^pswpout /{print $2}' /proc/vmstat)
  pgmaj=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
  temp=$(cat /sys/class/thermal/thermal_zone1/temp)
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$now" "$phase" "$((now-start))" "$rss" "$pss" "$read_bytes" "$minflt" "$majflt" "$mem_available" "$swap_free" "$((pswpin-before_in))" "$((pswpout-before_out))" "$((pgmaj-before_major))" "$temp" >> "$out/samples.tsv"
}

ready=0
for _ in $(seq 1 360); do
  sample startup
  if curl -fsS "http://127.0.0.1:$port/health" > "$out/health.json" 2>/dev/null; then ready=1; break; fi
  kill -0 "$pid" 2>/dev/null || break
  sleep 1
done
(( ready )) || { tail -100 "$out/server.log" >&2; exit 1; }

curl -fsS "http://127.0.0.1:$port/slots" > "$out/slots.json"
jq -e --argjson ctx "$validation_ctx" 'length == 1 and .[0].n_ctx == $ctx and .[0].speculative == true' "$out/slots.json" >/dev/null

curl -fsS --max-time "$validation_timeout" "http://127.0.0.1:$port/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Reply exactly OK"}],"temperature":0,"seed":731,"max_tokens":16,"chat_template_kwargs":{"enable_thinking":false}}' \
  > "$out/response.json"

jq -e '.choices[0].message.content | sub("[[:space:]]+$"; "") == "OK"' "$out/response.json" >/dev/null
jq -e --argjson drafted "$expected_smoke_draft" --argjson accepted "$expected_smoke_accepted" '
  .timings.draft_n == $drafted and .timings.draft_n_accepted == $accepted
' "$out/response.json" >/dev/null
sample completion

if [[ -n $validation_request ]]; then
  [[ -s $validation_request ]] || { echo "missing validation request: $validation_request" >&2; exit 1; }
  if [[ -n $validation_request_sha256 ]]; then
    actual_request_sha256=$(sha256sum "$validation_request" | awk '{print $1}')
    [[ $actual_request_sha256 == "$validation_request_sha256" ]] || { echo "validation request checksum mismatch" >&2; exit 1; }
  fi
  curl -fsS --max-time "$validation_timeout" -H 'Content-Type: application/json' --data-binary "@$validation_request" \
    "http://127.0.0.1:$port/v1/chat/completions" > "$out/context-response.json" &
  request_pid=$!
  over_temp_samples=0
  while kill -0 "$request_pid" 2>/dev/null; do
    sample context
    current_temp=$(cat /sys/class/thermal/thermal_zone1/temp)
    if (( current_temp >= max_temp_mC )); then
      over_temp_samples=$((over_temp_samples + 1))
    else
      over_temp_samples=0
    fi
    if (( over_temp_samples >= 3 )); then
      printf 'thermal_limit_mC=%s current_mC=%s\n' "$max_temp_mC" "$current_temp" > "$out/thermal-abort.txt"
      kill -TERM "$request_pid" 2>/dev/null || true
      wait "$request_pid" 2>/dev/null || true
      request_pid=
      exit 1
    fi
    sleep "$sample_interval"
  done
  set +e
  wait "$request_pid"
  request_rc=$?
  set -e
  request_pid=
  printf '%s\n' "$request_rc" > "$out/request-exit-code.txt"
  if (( request_rc != 0 )); then
    if (( request_rc == 28 )); then
      printf 'timeout_seconds=%s\n' "$validation_timeout" > "$out/timeout-abort.txt"
    else
      printf 'curl_exit_code=%s\n' "$request_rc" > "$out/request-failed.txt"
    fi
    exit 1
  fi
  sample context-after
  jq -e --argjson min "$validation_min_prompt_tokens" --argjson reserved "$validation_reserved_output_tokens" --argjson ctx "$validation_ctx" --arg required "$validation_required_tool" '
    .timings.prompt_n >= $min and
    .timings.predicted_n > 0 and
    (.timings.prompt_n + $reserved <= $ctx) and
    (.choices[0].message.content // "" | test("^[[:space:]]*$")) and
    (.choices[0].message.tool_calls | length == 1) and
    (.choices[0].message.tool_calls[0].function.name == $required) and
    (.choices[0].message.tool_calls[0].function.arguments | fromjson |
      (keys|sort)==["max_results","path","query"] and
      (.query|type)=="string" and (.path|type)=="string" and
      (.max_results|type)=="number" and (.max_results|floor)==.max_results and .max_results>=1 and .max_results<=20)
  ' "$out/context-response.json" >/dev/null
fi

rss=$(awk '/^VmRSS:/{print $2}' /proc/$pid/status)
pss=$(awk '/^Pss:/{print $2}' /proc/$pid/smaps_rollup)
swap=$(awk '/^VmSwap:/{print $2}' /proc/$pid/status)
read_bytes=$(awk '/^read_bytes:/{print $2}' /proc/$pid/io)
read -r minflt majflt < <(awk '{print $10,$12}' /proc/$pid/stat)
after_in=$(awk '/^pswpin /{print $2}' /proc/vmstat)
after_out=$(awk '/^pswpout /{print $2}' /proc/vmstat)
after_major=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
temp=$(cat /sys/class/thermal/thermal_zone1/temp)

jq -n \
  --arg profile "$profile" --arg model "$LLAMA_MODEL" --arg draft_model "$LLAMA_DRAFT_MODEL" --arg alias "$LLAMA_ALIAS" \
  --arg kv "$LLAMA_KV" --arg flash_attn "$LLAMA_FLASH_ATTN" --arg load_mode "$LLAMA_LOAD_MODE" --arg cpus "$LLAMA_CPUS" --arg process_cpus "$LLAMA_PROCESS_CPUS" \
  --argjson port "$port" --argjson pid "$pid" --argjson context "$validation_ctx" --argjson batch "$LLAMA_BATCH" --argjson ubatch "$LLAMA_UBATCH" --argjson threads "$LLAMA_THREADS" \
  --argjson rss_kib "$rss" --argjson pss_kib "$pss" --argjson swap_kib "${swap:-0}" \
  --argjson read_bytes "$read_bytes" --argjson minflt "$minflt" --argjson majflt "$majflt" \
  --argjson pswpin_delta "$((after_in-before_in))" --argjson pswpout_delta "$((after_out-before_out))" \
  --argjson pgmaj_delta "$((after_major-before_major))" --argjson pkg_temp_mC "$temp" \
  --slurpfile response "$out/response.json" --slurpfile slots "$out/slots.json" \
  '{profile:$profile,model:$model,draft_model:$draft_model,alias:$alias,port:$port,pid:$pid,context:$context,batch:$batch,ubatch:$ubatch,kv:$kv,flash_attn:$flash_attn,load_mode:$load_mode,threads:$threads,cpus:$cpus,process_cpus:$process_cpus,rss_kib:$rss_kib,pss_kib:$pss_kib,swap_kib:$swap_kib,read_bytes:$read_bytes,minflt:$minflt,majflt:$majflt,pswpin_delta:$pswpin_delta,pswpout_delta:$pswpout_delta,pgmaj_delta:$pgmaj_delta,pkg_temp_mC:$pkg_temp_mC,slot:$slots[0][0],timings:$response[0].timings,content:$response[0].choices[0].message.content}' \
  > "$out/result.json"

cleanup
trap - EXIT INT TERM

if curl -fsS --max-time 1 "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
  echo "server still listening after cleanup" >&2
  exit 1
fi

jq . "$out/result.json"
