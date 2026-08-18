#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
here=$root/benchmarks/intel-1340p/qwen38-campaign
source_file=$root/benchmarks/intel-1340p/ornith-gemma-optimization/workloads/near-capacity-128k/ornith-content.txt
model_dir=$root/../models/qwen3.8-27b
model=$model_dir/Qwen3.8-27B-Q4_K_M.gguf
mtp_model=$model_dir/mtp-Qwen3.8-27B-Q4_0.gguf
build=${LLAMA_BUILD:-$root/build-intel-clang}
BUN_BIN=${BUN_BIN:-/opt/piclaw/current/bun/bin/bun}
variant=${1:-target}
shift || true
if (( $# > 0 )); then probes=("$@"); else probes=(512 4096 32768 generation); fi
[[ $variant == target || $variant == mtp ]] || { echo "usage: $0 target|mtp [512|4096|32768|generation ...]" >&2; exit 2; }
[[ -x $build/bin/llama-server && -s $model && -f $source_file ]] || { echo "runtime, model, or fixture source missing" >&2; exit 1; }
if [[ $variant == mtp ]]; then
  [[ -s $mtp_model ]] || { echo "MTP model missing" >&2; exit 1; }
  ctx=${QWEN38_CTX:-8192}
else
  ctx=${QWEN38_CTX:-32768}
fi
for probe in "${probes[@]}"; do
  [[ $probe == 512 || $probe == 4096 || $probe == 32768 || $probe == generation ]] || { echo "invalid probe: $probe" >&2; exit 2; }
  [[ $probe != 32768 || $ctx -ge 32768 ]] || { echo "32768 probe requires QWEN38_CTX >= 32768" >&2; exit 2; }
done

out=$here/performance/$variant
fixtures=$here/performance/fixtures
mkdir -p "$out" "$fixtures"
max_temp=${QWEN38_MAX_TEMP_MC:-97000}
request_timeout=${QWEN38_REQUEST_TIMEOUT:-10800}
uid=$(id -u)
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$uid}
export DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}
services=(llama-gemma-local-provider.service llama-maple-local-provider.service llama-qwen-longctx.service)
server_pid=''
restore() {
  if [[ -n $server_pid ]] && kill -0 "$server_pid" 2>/dev/null; then kill -TERM "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  systemctl --user start "${services[@]}" 2>/dev/null || true
}
trap restore EXIT INT TERM

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

sample() {
  local file=$1 phase=$2 start=$3 before_in=$4 before_out=$5 before_major=$6
  local now rss pss vm_swap read_bytes minflt majflt mem_available swap_free pswpin pswpout global_major temp
  [[ -r /proc/$server_pid/status ]] || { echo "server disappeared during $phase" >&2; return 1; }
  now=$(date +%s)
  rss=$(awk '/^VmRSS:/{print $2}' /proc/$server_pid/status)
  pss=$(awk '/^Pss:/{print $2}' /proc/$server_pid/smaps_rollup)
  vm_swap=$(awk '/^VmSwap:/{print $2}' /proc/$server_pid/status)
  read_bytes=$(awk '/^read_bytes:/{print $2}' /proc/$server_pid/io)
  read -r minflt majflt < <(awk '{print $10,$12}' /proc/$server_pid/stat)
  mem_available=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
  swap_free=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)
  pswpin=$(awk '/^pswpin /{print $2}' /proc/vmstat)
  pswpout=$(awk '/^pswpout /{print $2}' /proc/vmstat)
  global_major=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
  temp=$(cat /sys/class/thermal/thermal_zone1/temp)
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$now" "$phase" "$((now-start))" "$rss" "$pss" "${vm_swap:-0}" "$read_bytes" "$minflt" "$majflt" \
    "$mem_available" "$swap_free" "$((pswpin-before_in))" "$((pswpout-before_out))" "$((global_major-before_major))" "$temp" >> "$file"
}

systemctl --user stop "${services[@]}" llama-qwen38-local-provider.service
wait_cool
export LD_LIBRARY_PATH="$build/bin:$build/runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cmd=(taskset -c 0-15 "$build/bin/llama-server"
  --model "$model" --alias "qwen3.8-27b-q4km-$variant"
  --load-mode mmap --gpu-layers 0
  --threads 8 --cpu-range 0-7 --cpu-strict 1
  --ctx-size "$ctx" --parallel 1
  --batch-size 1024 --ubatch-size 256
  --cache-type-k q4_0 --cache-type-v q4_0 --flash-attn on
  --cache-prompt --cache-ram 0 --no-cache-idle-slots
  --reasoning-preserve --metrics --slots --no-warmup
  --timeout "$request_timeout" --host 127.0.0.1 --port 8094)
if [[ $variant == mtp ]]; then
  cmd+=(--model-draft "$mtp_model"
    --spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max 3
    --spec-draft-threads 8 --spec-draft-threads-batch 8
    --spec-draft-type-k q4_0 --spec-draft-type-v q4_0)
fi
printf '%q ' "${cmd[@]}" > "$out/server-command.txt"; printf '\n' >> "$out/server-command.txt"
"${cmd[@]}" > "$out/server.stdout" 2> "$out/server.stderr" &
server_pid=$!
printf '%s\n' "$server_pid" > "$out/server.pid"
healthy=0
for _ in $(seq 1 900); do
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  if curl -fsS --max-time 2 http://127.0.0.1:8094/health > "$out/health.json" 2>/dev/null; then healthy=1; break; fi
  sleep 1
done
if (( !healthy )); then wait "$server_pid" || true; server_pid=''; tail -200 "$out/server.stderr" >&2; exit 1; fi
curl -fsS http://127.0.0.1:8094/v1/models > "$out/models.json"
curl -fsS http://127.0.0.1:8094/slots > "$out/slots-before.json"
sha256sum "$model" "$build/bin/llama-server" > "$out/artifact-sha256.txt"
[[ $variant != mtp ]] || sha256sum "$mtp_model" >> "$out/artifact-sha256.txt"
if [[ ! -s $fixtures/manifest.json ]]; then
  "$BUN_BIN" "$here/../maple-qwen-campaign/build-matched-prompts.ts" http://127.0.0.1:8094 "$source_file" "$fixtures" qwen38 > "$here/performance/fixture-build.json"
fi

for probe in "${probes[@]}"; do
  if [[ $probe == generation ]]; then expected_prompt=512; expected_generated=64; else expected_prompt=$probe; expected_generated=1; fi
  payload=$fixtures/completion-$probe.json
  response=$out/response-$probe.json
  samples=$out/samples-$probe.tsv
  if [[ -s $response ]] && jq -e --argjson p "$expected_prompt" --argjson g "$expected_generated" '.timings.prompt_n==$p and .timings.predicted_n==$g' "$response" >/dev/null 2>&1; then
    echo "preserving completed $variant $probe" >&2
    continue
  fi
  wait_cool
  before_in=$(awk '/^pswpin /{print $2}' /proc/vmstat)
  before_out=$(awk '/^pswpout /{print $2}' /proc/vmstat)
  before_major=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
  start=$(date +%s)
  printf 'epoch\tphase\telapsed\trss_kib\tpss_kib\tvm_swap_kib\tread_bytes\tminflt\tmajflt\tmem_available_kib\tswap_free_kib\tpswpin_delta\tpswpout_delta\tpgmaj_delta\tpkg_temp_mC\n' > "$samples"
  sample "$samples" before "$start" "$before_in" "$before_out" "$before_major"
  curl -fsS --max-time "$request_timeout" -H 'Content-Type: application/json' --data-binary "@$payload" http://127.0.0.1:8094/completion > "$response" &
  request_pid=$!
  over=0
  while kill -0 "$request_pid" 2>/dev/null; do
    sample "$samples" request "$start" "$before_in" "$before_out" "$before_major"
    temp=$(cat /sys/class/thermal/thermal_zone1/temp)
    if ((temp >= max_temp)); then over=$((over+1)); else over=0; fi
    if ((over >= 3)); then
      printf 'thermal_limit_mC=%s current_mC=%s\n' "$max_temp" "$temp" > "$out/$probe-thermal-abort.txt"
      kill -TERM "$request_pid" 2>/dev/null || true; wait "$request_pid" 2>/dev/null || true
      exit 1
    fi
    sleep 1
  done
  set +e; wait "$request_pid"; rc=$?; set -e
  end=$(date +%s)
  printf '%s\n' "$rc" > "$out/$probe-exit-code.txt"
  printf '%s\n' "$((end-start))" > "$out/$probe-wall-seconds.txt"
  ((rc == 0)) || exit "$rc"
  jq -e --argjson p "$expected_prompt" --argjson g "$expected_generated" '.timings.prompt_n==$p and .timings.predicted_n==$g' "$response" >/dev/null
  sample "$samples" after "$start" "$before_in" "$before_out" "$before_major"
  jq '{prompt_tps:.timings.prompt_per_second,generation_tps:.timings.predicted_per_second,draft_n:.timings.draft_n,draft_accepted:.timings.draft_n_accepted,prompt_n:.timings.prompt_n,predicted_n:.timings.predicted_n}' "$response"
done
curl -fsS http://127.0.0.1:8094/slots > "$out/slots-after.json"
curl -fsS http://127.0.0.1:8094/metrics > "$out/metrics-after.txt"
kill -TERM "$server_pid"; wait "$server_pid" || true; server_pid=''
