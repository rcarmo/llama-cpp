#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
here=$root/benchmarks/intel-1340p/qwen38-qwen36-dynamic-20260903
fixtures=$here/fixtures
build=${LLAMA_BUILD:-$root/build-intel-clang}
variant=${1:-}
shift || true
if (( $# > 0 )); then probes=("$@"); else probes=(512 1024 generation); fi
case "$variant" in
  qwen38)
    model=$root/../models/qwen3.8-27b/Qwen3.8-27B-UD-Q4_K_XL.gguf
    expected_sha=3f227079003add2511437e5b1e94812e363385225bf6a9b47b0054a72bc8b01e
    alias=qwen3.8-27b-ud-q4-k-xl-target
    port=8094
    ;;
  qwen36)
    model=$root/../models/qwen3.6/Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf
    expected_sha=ed7cda7e38985b4fcff76475865135039641d2bfbac3c169df15ca770f37fb0c
    alias=qwen3.6-35b-a3b-ud-q2-k-xl-target
    port=8090
    ;;
  *) echo "usage: $0 {qwen38|qwen36} [512|1024|4096|generation ...]" >&2; exit 2 ;;
esac
for probe in "${probes[@]}"; do
  [[ $probe == 512 || $probe == 1024 || $probe == 4096 || $probe == generation ]] || { echo "invalid probe: $probe" >&2; exit 2; }
done
threads=${BENCH_THREADS:-6}
[[ $threads =~ ^[1-8]$ ]] || { echo "BENCH_THREADS must be between 1 and 8" >&2; exit 2; }
last_cpu=$((threads-1))
out=$here/results/$variant/performance-${threads}t
server_pid=''
monitor_pid=''
uid=$(id -u)
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$uid}
export DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}
export LD_LIBRARY_PATH="$build/bin:$build/runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
mkdir -p "$out" "$fixtures"
if [[ ! -s $fixtures/completion-512.json ]]; then
  cp "$root/benchmarks/intel-1340p/qwen38-campaign/performance/fixtures/"{completion-512.json,completion-4096.json,completion-generation.json,prompt-512.txt,prompt-4096.txt,manifest.json} "$fixtures/"
fi

restore() {
  set +e
  [[ -z $monitor_pid ]] || kill "$monitor_pid" 2>/dev/null
  if [[ -n $server_pid ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill -TERM "$server_pid" 2>/dev/null
    wait "$server_pid" 2>/dev/null
  fi
  systemctl --user stop llama-qwen38-local-provider.service llama-qwen-longctx.service llama-gemma-local-provider.service llama-maple-local-provider.service 2>/dev/null
  systemctl --user start llama-ornith-local-provider.service
}
trap restore EXIT INT TERM
reset_zram() {
  sudo -n systemctl stop dev-zram0.swap 2>/dev/null || true
  sudo -n systemctl stop systemd-zram-setup@zram0.service 2>/dev/null || true
  if [[ -e /sys/block/zram0 ]]; then sudo -n zramctl --reset /dev/zram0 2>/dev/null || true; fi
  if [[ ! -e /sys/block/zram0 ]]; then sudo -n cat /sys/class/zram-control/hot_add >/dev/null; fi
  sudo -n systemctl reset-failed systemd-zram-setup@zram0.service dev-zram0.swap 2>/dev/null || true
  sudo -n systemctl start systemd-zram-setup@zram0.service
  for _ in $(seq 1 50); do
    if swapon --show=NAME --noheadings | grep -Fxq /dev/zram0; then return 0; fi
    sleep 0.1
  done
  echo "zram swap did not reactivate" >&2
  return 1
}
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
  [[ -r /proc/$server_pid/status ]] || return 1
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

[[ -x $build/bin/llama-server ]] || { echo "missing server" >&2; exit 1; }
[[ $(sha256sum "$model" | awk '{print $1}') == "$expected_sha" ]] || { echo "model checksum mismatch" >&2; exit 1; }
systemctl --user stop llama-ornith-local-provider.service llama-qwen38-local-provider.service llama-qwen-longctx.service llama-gemma-local-provider.service llama-maple-local-provider.service
# Return zram to a zero-use baseline after the resident model exits.
reset_zram
wait_cool

cmd=(taskset -c 0-15 "$build/bin/llama-server"
  --model "$model" --alias "$alias"
  --load-mode mmap --gpu-layers 0
  --threads "$threads" --cpu-range "0-$last_cpu" --cpu-strict 1
  --ctx-size 8192 --parallel 1
  --batch-size 1024 --ubatch-size 256
  --cache-type-k q4_0 --cache-type-v q4_0 --flash-attn on
  --spec-type none
  --cache-prompt --cache-ram 0 --no-cache-idle-slots
  --reasoning-preserve --metrics --slots --no-warmup
  --timeout 1800 --host 127.0.0.1 --port "$port")
printf '%q ' "${cmd[@]}" > "$out/server-command.txt"; printf '\n' >> "$out/server-command.txt"
sha256sum "$model" "$build/bin/llama-server" > "$out/artifact-sha256.txt"
if [[ $variant == qwen36 ]]; then
  export GGML_CPU_EXPERT_IO_PROFILE=1
  export GGML_CPU_EXPERT_IO_ADVISE_MODE=bounded
fi
"${cmd[@]}" > "$out/server.stdout" 2> "$out/server.stderr" &
server_pid=$!
printf '%s\n' "$server_pid" > "$out/server.pid"
healthy=0
for _ in $(seq 1 900); do
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  if curl -fsS --max-time 2 "http://127.0.0.1:$port/health" > "$out/health.json" 2>/dev/null; then healthy=1; break; fi
  sleep 1
done
if (( !healthy )); then tail -200 "$out/server.stderr" >&2; exit 1; fi
curl -fsS "http://127.0.0.1:$port/v1/models" > "$out/models.json"
curl -fsS "http://127.0.0.1:$port/slots" > "$out/slots-before.json"
if [[ ! -s $fixtures/completion-1024.json ]]; then
  /opt/piclaw/current/bun/bin/bun "$here/build-1024-fixture.ts" "http://127.0.0.1:$port" "$fixtures/prompt-4096.txt" "$fixtures" > "$out/fixture-1024-build.json"
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
  curl -fsS --max-time 1800 -H 'Content-Type: application/json' --data-binary "@$payload" "http://127.0.0.1:$port/completion" > "$response" &
  request_pid=$!
  over=0
  while kill -0 "$request_pid" 2>/dev/null; do
    sample "$samples" request "$start" "$before_in" "$before_out" "$before_major"
    temp=$(cat /sys/class/thermal/thermal_zone1/temp)
    if ((temp >= 95000)); then over=$((over+1)); else over=0; fi
    if ((over >= 3)); then
      printf 'thermal_limit_mC=95000 current_mC=%s\n' "$temp" > "$out/$probe-thermal-abort.txt"
      kill -TERM "$request_pid" 2>/dev/null; wait "$request_pid" 2>/dev/null || true
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
  jq '{prompt_tps:.timings.prompt_per_second,generation_tps:.timings.predicted_per_second,prompt_n:.timings.prompt_n,predicted_n:.timings.predicted_n}' "$response"
done
curl -fsS "http://127.0.0.1:$port/slots" > "$out/slots-after.json"
curl -fsS "http://127.0.0.1:$port/metrics" > "$out/metrics-after.txt"
