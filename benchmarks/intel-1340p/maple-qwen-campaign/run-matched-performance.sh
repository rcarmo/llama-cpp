#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
here=$root/benchmarks/intel-1340p/maple-qwen-campaign
source_file=$root/benchmarks/intel-1340p/ornith-gemma-optimization/workloads/near-capacity-128k/ornith-content.txt
[[ -f $root/CMakeLists.txt && -f $source_file ]] || { echo "repository root or source fixture not found" >&2; exit 1; }
out=${MATCHED_PERF_OUT:-$here/performance}
max_temp=${MATCHED_PERF_MAX_TEMP_MC:-97000}
request_timeout=${MATCHED_PERF_TIMEOUT:-2400}
uid=$(id -u)
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$uid}
export DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}
mkdir -p "$out"

all_models=(gemma maple qwen)
if (( $# > 0 )); then models=("$@"); else models=("${all_models[@]}"); fi
declare -A units=(
  [gemma]=llama-gemma-local-provider.service
  [maple]=llama-maple-local-provider.service
  [qwen]=llama-qwen-longctx.service
)
declare -A urls=(
  [gemma]=http://127.0.0.1:8091
  [maple]=http://127.0.0.1:8093
  [qwen]=http://127.0.0.1:8090
)

restore_gemma() {
  systemctl --user stop "${units[maple]}" "${units[qwen]}" 2>/dev/null || true
  systemctl --user start "${units[gemma]}" 2>/dev/null || true
}
trap restore_gemma EXIT INT TERM

wait_cool() {
  local load temp
  for _ in $(seq 1 1800); do
    load=$(awk '{print $1}' /proc/loadavg)
    temp=$(cat /sys/class/thermal/thermal_zone1/temp)
    if awk -v l="$load" -v t="$temp" 'BEGIN{exit !(l<1.5 && t<60000)}'; then return 0; fi
    sleep 2
  done
  echo "cool-start gate timed out" >&2
  return 1
}

start_one() {
  local model=$1 unit=${units[$1]} url=${urls[$1]}
  for other in "${all_models[@]}"; do systemctl --user stop "${units[$other]}"; done
  wait_cool
  systemctl --user start "$unit"
  for _ in $(seq 1 900); do
    if curl -fsS --max-time 2 "$url/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "$model service did not become healthy" >&2
  return 1
}

sample() {
  local file=$1 phase=$2 pid=$3 start=$4 before_in=$5 before_out=$6 before_global_major=$7 unit=$8
  local now rss pss vm_swap read_bytes minflt majflt mem_available swap_free pswpin pswpout global_major temp
  [[ -r /proc/$pid/status ]] || { echo "server PID disappeared during $phase" >&2; return 1; }
  [[ $(systemctl --user show -p MainPID --value "$unit") == "$pid" ]] || { echo "server PID changed during $phase" >&2; return 1; }
  now=$(date +%s)
  rss=$(awk '/^VmRSS:/{print $2}' /proc/$pid/status)
  pss=$(awk '/^Pss:/{print $2}' /proc/$pid/smaps_rollup)
  vm_swap=$(awk '/^VmSwap:/{print $2}' /proc/$pid/status)
  read_bytes=$(awk '/^read_bytes:/{print $2}' /proc/$pid/io)
  read -r minflt majflt < <(awk '{print $10,$12}' /proc/$pid/stat)
  mem_available=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
  swap_free=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)
  pswpin=$(awk '/^pswpin /{print $2}' /proc/vmstat)
  pswpout=$(awk '/^pswpout /{print $2}' /proc/vmstat)
  global_major=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
  temp=$(cat /sys/class/thermal/thermal_zone1/temp)
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$now" "$phase" "$((now-start))" "$rss" "$pss" "${vm_swap:-0}" "$read_bytes" "$minflt" "$majflt" \
    "$mem_available" "$swap_free" "$((pswpin-before_in))" "$((pswpout-before_out))" "$((global_major-before_global_major))" "$temp" >> "$file"
}

run_request() {
  local model=$1 target=$2 pid=$3 expected_prompt=$4 expected_generated=$5 identity=$6
  local unit=${units[$model]} dir=$out/$model response=$out/$model/response-$target.json payload=$out/$model/fixtures/completion-$target.json
  local samples=$out/$model/samples-$target.tsv start end request_pid rc=0 over=0 temp
  local before_in before_out before_major
  if [[ -s $response ]] && [[ $(cat "$dir/$target-identity.txt" 2>/dev/null) == "$identity" ]] && \
      jq -e --argjson prompt "$expected_prompt" --argjson generated "$expected_generated" \
      '.timings.prompt_n == $prompt and .timings.predicted_n == $generated' "$response" >/dev/null 2>&1; then
    echo "preserving completed $model $target" >&2
    return 0
  fi
  before_in=$(awk '/^pswpin /{print $2}' /proc/vmstat)
  before_out=$(awk '/^pswpout /{print $2}' /proc/vmstat)
  before_major=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
  start=$(date +%s)
  printf 'epoch\tphase\telapsed\trss_kib\tpss_kib\tvm_swap_kib\tread_bytes\tminflt\tmajflt\tmem_available_kib\tswap_free_kib\tpswpin_delta\tpswpout_delta\tpgmaj_delta\tpkg_temp_mC\n' > "$samples"
  sample "$samples" before "$pid" "$start" "$before_in" "$before_out" "$before_major" "$unit"
  curl -fsS --max-time "$request_timeout" -H 'Content-Type: application/json' --data-binary "@$payload" "${urls[$model]}/completion" > "$response" &
  request_pid=$!
  while kill -0 "$request_pid" 2>/dev/null; do
    sample "$samples" request "$pid" "$start" "$before_in" "$before_out" "$before_major" "$unit"
    temp=$(cat /sys/class/thermal/thermal_zone1/temp)
    if (( temp >= max_temp )); then over=$((over+1)); else over=0; fi
    if (( over >= 3 )); then
      printf 'thermal_limit_mC=%s current_mC=%s\n' "$max_temp" "$temp" > "$dir/$target-thermal-abort.txt"
      kill -TERM "$request_pid" 2>/dev/null || true
      wait "$request_pid" 2>/dev/null || true
      return 1
    fi
    sleep 1
  done
  set +e; wait "$request_pid"; rc=$?; set -e
  end=$(date +%s)
  printf '%s\n' "$rc" > "$dir/$target-exit-code.txt"
  printf '%s\n' "$((end-start))" > "$dir/$target-wall-seconds.txt"
  (( rc == 0 )) || return "$rc"
  jq -e --argjson prompt "$expected_prompt" --argjson generated "$expected_generated" \
    '.timings.prompt_n == $prompt and .timings.predicted_n == $generated' "$response" >/dev/null
  sample "$samples" after "$pid" "$start" "$before_in" "$before_out" "$before_major" "$unit"
  printf '%s\n' "$identity" > "$dir/$target-identity.txt"
}

for model in "${models[@]}"; do
  echo "starting $model" >&2
  start_one "$model"
  url=${urls[$model]}
  unit=${units[$model]}
  dir=$out/$model
  mkdir -p "$dir/fixtures"
  pid=$(systemctl --user show -p MainPID --value "$unit")
  [[ $pid =~ ^[1-9][0-9]*$ && -r /proc/$pid/status ]]
  sha256sum "/proc/$pid/exe" > "$dir/server-executable.sha256"
  sed 's/[[:space:]]*$//' < <(tr '\0' ' ' < "/proc/$pid/cmdline") > "$dir/server-command.txt"
  printf '\n' >> "$dir/server-command.txt"
  curl -fsS "$url/health" > "$dir/health.json"
  curl -fsS "$url/v1/models" > "$dir/models.json"
  curl -fsS "$url/slots" > "$dir/slots-before.json"
  if [[ ! -s $dir/fixtures/manifest.json || ! -s $dir/fixtures/completion-generation.json ]]; then
    bun "$here/build-matched-prompts.ts" "$url" "$source_file" "$dir/fixtures" "$model" > "$dir/fixture-build.json"
  fi
  identity=$(bun "$here/build-performance-identity.ts" "$model")
  for target in 512 4096 32768; do
    if [[ ! -s $dir/response-$target.json ]]; then wait_cool; fi
    run_request "$model" "$target" "$pid" "$target" 1 "$identity"
  done
  if [[ ! -s $dir/response-generation.json ]]; then wait_cool; fi
  run_request "$model" generation "$pid" 512 64 "$identity"
  curl -fsS "$url/slots" > "$dir/slots-after.json"
  curl -fsS "$url/metrics" > "$dir/metrics-after.txt"
  systemctl --user stop "$unit"
done

complete=1
for model in "${all_models[@]}"; do
  for target in 512 4096 32768 generation; do
    [[ -s $out/$model/response-$target.json ]] || complete=0
  done
done
if (( complete )); then
  bun "$here/summarize-matched-performance.ts" "$out" > "$out/summary.json"
  cat "$out/summary.json"
else
  echo "matched performance remains incomplete; preserved completed probes" >&2
  exit 1
fi
