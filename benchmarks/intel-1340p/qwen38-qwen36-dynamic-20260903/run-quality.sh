#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
here=$root/benchmarks/intel-1340p/qwen38-qwen36-dynamic-20260903
build=${LLAMA_BUILD:-$root/build-intel-clang}
variant=${1:-}
threads=${BENCH_THREADS:-4}
((threads >= 1 && threads <= 16)) || { echo "BENCH_THREADS must be in 1..16" >&2; exit 2; }
cpu_end=$((threads-1))
case "$variant" in
  qwen38)
    model=$root/../models/qwen3.8-27b/Qwen3.8-27B-UD-Q4_K_XL.gguf
    expected_sha=3f227079003add2511437e5b1e94812e363385225bf6a9b47b0054a72bc8b01e
    alias=qwen3.8-27b-ud-q4-k-xl-mtp
    port=8094
    ;;
  qwen36)
    model=$root/../models/qwen3.6/Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf
    expected_sha=ed7cda7e38985b4fcff76475865135039641d2bfbac3c169df15ca770f37fb0c
    alias=qwen3.6-35b-a3b-ud-q2-k-xl-mtp
    port=8090
    ;;
  *) echo "usage: $0 {qwen38|qwen36}" >&2; exit 2 ;;
esac
out=$here/results/$variant/quality-${threads}t
pi_out=$here/results/$variant/pi-${threads}t
server_pid=''
monitor_pid=''
uid=$(id -u)
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$uid}
export DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}
export LD_LIBRARY_PATH="$build/bin:$build/runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
mkdir -p "$out/api"

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

[[ -x $build/bin/llama-server ]] || { echo "missing server" >&2; exit 1; }
[[ $(sha256sum "$model" | awk '{print $1}') == "$expected_sha" ]] || { echo "model checksum mismatch" >&2; exit 1; }
systemctl --user stop llama-ornith-local-provider.service llama-qwen38-local-provider.service llama-qwen-longctx.service llama-gemma-local-provider.service llama-maple-local-provider.service
reset_zram
wait_cool

cmd=(taskset -c 0-15 "$build/bin/llama-server"
  --model "$model" --alias "$alias"
  --load-mode mmap --gpu-layers 0
  --threads "$threads" --cpu-range "0-$cpu_end" --cpu-strict 1
  --ctx-size 8192 --parallel 1
  --batch-size 1024 --ubatch-size 256
  --cache-type-k q4_0 --cache-type-v q4_0 --flash-attn on
  --spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max 3
  --spec-draft-threads "$threads" --spec-draft-threads-batch "$threads"
  --spec-draft-type-k q4_0 --spec-draft-type-v q4_0
  --cache-prompt --cache-ram 0 --no-cache-idle-slots
  --reasoning-preserve --metrics --slots --no-warmup
  --timeout 1800 --host 127.0.0.1 --port "$port")
printf '%q ' "${cmd[@]}" > "$out/server-command.txt"; printf '\n' >> "$out/server-command.txt"
printf '%s  %s\n' "$expected_sha" "$model" > "$out/model.sha256"
if [[ $variant == qwen36 ]]; then
  export GGML_CPU_EXPERT_IO_PROFILE=1
  export GGML_CPU_EXPERT_IO_ADVISE_MODE=bounded
fi
"${cmd[@]}" > "$out/server.stdout" 2> "$out/server.stderr" &
server_pid=$!
printf '%s\n' "$server_pid" > "$out/server.pid"
(
  printf 'epoch\ttemp_mC\trss_kib\tpss_kib\tvm_swap_kib\tmem_available_kib\tswap_free_kib\n'
  over=0
  while kill -0 "$server_pid" 2>/dev/null; do
    temp=$(cat /sys/class/thermal/thermal_zone1/temp)
    rss=$(awk '/^VmRSS:/{print $2}' "/proc/$server_pid/status" 2>/dev/null || echo 0)
    pss=$(awk '/^Pss:/{print $2}' "/proc/$server_pid/smaps_rollup" 2>/dev/null || echo 0)
    vm_swap=$(awk '/^VmSwap:/{print $2}' "/proc/$server_pid/status" 2>/dev/null || echo 0)
    avail=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
    swap_free=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date +%s)" "$temp" "$rss" "$pss" "${vm_swap:-0}" "$avail" "$swap_free"
    if ((temp >= 95000)); then over=$((over+1)); else over=0; fi
    if ((over >= 3)); then
      printf 'thermal_limit_mC=95000 current_mC=%s\n' "$temp" > "$out/thermal-abort.txt"
      kill -TERM "$server_pid" 2>/dev/null
      exit 1
    fi
    sleep 1
  done
) > "$out/telemetry.tsv" &
monitor_pid=$!

healthy=0
for _ in $(seq 1 900); do
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  if curl -fsS --max-time 2 "http://127.0.0.1:$port/health" > "$out/health.json" 2>/dev/null; then healthy=1; break; fi
  sleep 1
done
if (( !healthy )); then tail -200 "$out/server.stderr" >&2; exit 1; fi
curl -fsS "http://127.0.0.1:$port/v1/models" > "$out/models.json"
curl -fsS "http://127.0.0.1:$port/slots" > "$out/slots-before.json"

set +e
(cd "$root" && REQUEST_TIMEOUT_MS=1800000 /opt/piclaw/current/bun/bin/bun "$here/run-matched-corpus.ts" \
  "http://127.0.0.1:$port" "$alias" "$variant" "$out/api") > "$out/api-run.stdout" 2> "$out/api-run.stderr"
api_rc=$?
set -e
printf '%s\n' "$api_rc" > "$out/api-run.exit-code"

pi_rc=125
if kill -0 "$server_pid" 2>/dev/null && [[ ! -e $out/thermal-abort.txt ]]; then
  set +e
  PI_OUT_DIR="$pi_out" "$here/run-pi-suite.sh" "$variant" > "$out/pi-run.stdout" 2> "$out/pi-run.stderr"
  pi_rc=$?
  set -e
else
  printf 'skipped: server unavailable after API phase\n' > "$out/pi-run.stderr"
fi
printf '%s\n' "$pi_rc" > "$out/pi-run.exit-code"
if curl -fsS --max-time 2 "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
  curl -fsS "http://127.0.0.1:$port/slots" > "$out/slots-after.json"
  curl -fsS "http://127.0.0.1:$port/metrics" > "$out/metrics-after.txt"
fi
jq -n --arg variant "$variant" --arg model "$alias" --argjson threads "$threads" --argjson api_exit "$api_rc" --argjson pi_exit "$pi_rc" --argjson thermal_abort "$(test -e "$out/thermal-abort.txt" && echo true || echo false)" \
  '{variant:$variant,model:$model,threads:$threads,api_exit_code:$api_exit,pi_exit_code:$pi_exit,thermal_abort:$thermal_abort}' > "$out/run-summary.json"
cat "$out/run-summary.json"
