#!/usr/bin/env bash
set -euo pipefail

base_url=${MAPLE_BASE_URL:-http://127.0.0.1:8092}
server_unit=${MAPLE_SERVER_UNIT:-llama-maple-validation.service}
root=$(cd "$(dirname "$0")/../../../.." && pwd)
here=$root/benchmarks/intel-1340p/maple-preview/production-context
generated=$here/generated
out=${MAPLE_CONTEXT_OUT:-$here/results}
max_temp_mC=${MAPLE_MAX_TEMP_MC:-97000}
timeout_seconds=${MAPLE_REQUEST_TIMEOUT:-1800}
mkdir -p "$out"

uid=$(id -u)
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$uid}
export DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}
pid=$(systemctl --user show -p MainPID --value "$server_unit")
[[ $pid =~ ^[1-9][0-9]*$ && -r /proc/$pid/status ]] || { echo "server unit not active: $server_unit" >&2; exit 1; }
curl -fsS "$base_url/health" >/dev/null

before_in=$(awk '/^pswpin /{print $2}' /proc/vmstat)
before_out=$(awk '/^pswpout /{print $2}' /proc/vmstat)
before_major=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
start=$(date +%s)
printf 'epoch\tphase\telapsed\trss_kib\tpss_kib\tvm_swap_kib\tread_bytes\tminflt\tmajflt\tmem_available_kib\tswap_free_kib\tpswpin_delta\tpswpout_delta\tpgmaj_delta\tpkg_temp_mC\n' > "$out/samples.tsv"

sample() {
  local phase=$1 now rss pss vm_swap read_bytes minflt majflt mem_available swap_free pswpin pswpout pgmaj temp
  [[ -r /proc/$pid/status ]] || return 0
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
  pgmaj=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
  temp=$(cat /sys/class/thermal/thermal_zone1/temp 2>/dev/null || echo 0)
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$now" "$phase" "$((now-start))" "$rss" "$pss" "${vm_swap:-0}" "$read_bytes" "$minflt" "$majflt" \
    "$mem_available" "$swap_free" "$((pswpin-before_in))" "$((pswpout-before_out))" "$((pgmaj-before_major))" "$temp" \
    >> "$out/samples.tsv"
}

run_one() {
  local label=$1
  local payload=$generated/completion-$label.json
  local response=$out/response-$label.json
  local request_pid= over=0 rc=0
  rm -f "$response" "$out/$label-abort.txt"
  sample "$label-before"
  curl -fsS --max-time "$timeout_seconds" -H 'Content-Type: application/json' --data-binary "@$payload" \
    "$base_url/completion" > "$response" &
  request_pid=$!
  while kill -0 "$request_pid" 2>/dev/null; do
    sample "$label"
    temp=$(cat /sys/class/thermal/thermal_zone1/temp 2>/dev/null || echo 0)
    if (( temp >= max_temp_mC )); then over=$((over+1)); else over=0; fi
    if (( over >= 3 )); then
      printf 'thermal_limit_mC=%s current_mC=%s\n' "$max_temp_mC" "$temp" > "$out/$label-abort.txt"
      kill -TERM "$request_pid" 2>/dev/null || true
      wait "$request_pid" 2>/dev/null || true
      return 1
    fi
    sleep 1
  done
  set +e; wait "$request_pid"; rc=$?; set -e
  printf '%s\n' "$rc" > "$out/$label-exit-code.txt"
  (( rc == 0 )) || return "$rc"
  jq -e '.timings.prompt_n > 0 and .timings.predicted_n == 1 and (.content | type == "string")' "$response" >/dev/null
  sample "$label-after"
}

cp "$generated/manifest.json" "$out/manifest.json"
curl -fsS "$base_url/slots" > "$out/slots-before.json"
curl -fsS "$base_url/metrics" > "$out/metrics-before.txt"
run_one 64k
# Preserve a cool-down interval without wasting a model reload.
for _ in $(seq 1 600); do
  sample cooldown
  temp=$(cat /sys/class/thermal/thermal_zone1/temp 2>/dev/null || echo 0)
  (( temp < 60000 )) && break
  sleep 2
done
run_one 124k
curl -fsS "$base_url/slots" > "$out/slots-after.json"
curl -fsS "$base_url/metrics" > "$out/metrics-after.txt"
awk -F '\t' 'NR==1{next} {if ($4>maxrss)maxrss=$4;if($5>maxpss)maxpss=$5;if($6>maxswap)maxswap=$6;if($10<minavail||minavail==0)minavail=$10;if($15>maxtemp)maxtemp=$15} END{printf "max_rss_kib=%d\nmax_pss_kib=%d\nmax_swap_kib=%d\nmin_mem_available_kib=%d\nmax_temp_mC=%d\n",maxrss,maxpss,maxswap,minavail,maxtemp}' "$out/samples.tsv" > "$out/summary.txt"
cat "$out/summary.txt"
for label in 64k 124k; do jq '{content,stop,timings}' "$out/response-$label.json"; done
