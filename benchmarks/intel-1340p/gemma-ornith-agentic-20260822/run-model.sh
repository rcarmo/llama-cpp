#!/usr/bin/env bash
set -euo pipefail

label=${1:?label}
unit=${2:?systemd unit}
provider=${3:?Pi provider}
model=${4:?model alias}
endpoint=${5:?endpoint}
out=${6:?output directory}
root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$root"
mkdir -p "$out/api" "$out/pi"
start_epoch=$(date +%s)
printf 'startup\n' > "$out/phase.txt"

systemctl --user show "$unit" > "$out/systemd-show.txt"
systemctl --user cat "$unit" > "$out/systemd-unit.txt"
curl -fsS --max-time 10 "$endpoint/health" > "$out/health-before.json"
curl -fsS --max-time 10 "$endpoint/v1/models" > "$out/models.json"
curl -fsS --max-time 10 "$endpoint/props" > "$out/props.json"
curl -fsS --max-time 10 "$endpoint/slots" > "$out/slots-before.json"

printf 'epoch\tphase\trss_kib\tpss_kib\tswap_kib\tmem_available_kib\tswap_free_kib\tpkg_temp_mC\n' > "$out/telemetry.tsv"
monitor() {
  while systemctl --user is-active --quiet "$unit"; do
    local pid phase rss pss swap mem swap_free temp
    pid=$(systemctl --user show -p MainPID --value "$unit")
    phase=$(cat "$out/phase.txt")
    rss=$(awk '/^VmRSS:/{print $2}' "/proc/$pid/status" 2>/dev/null || echo 0)
    pss=$(awk '/^Pss:/{print $2}' "/proc/$pid/smaps_rollup" 2>/dev/null || echo 0)
    swap=$(awk '/^VmSwap:/{print $2}' "/proc/$pid/status" 2>/dev/null || echo 0)
    mem=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
    swap_free=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)
    temp=$(cat /sys/class/thermal/thermal_zone1/temp)
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date +%s)" "$phase" "${rss:-0}" "${pss:-0}" "${swap:-0}" "$mem" "$swap_free" "$temp" >> "$out/telemetry.tsv"
    if (( temp >= 95000 )) && [[ $phase != cooldown ]]; then
      printf 'thermal gate reached during %s: %s mC\n' "$phase" "$temp" > "$out/thermal-abort.txt"
      systemctl --user stop "$unit" || true
      break
    fi
    sleep 1
  done
}
monitor &
monitor_pid=$!
cleanup() {
  kill "$monitor_pid" 2>/dev/null || true
  wait "$monitor_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

printf 'api\n' > "$out/phase.txt"
set +e
timeout --signal=TERM --kill-after=30 3600 bun \
  "$root/benchmarks/intel-1340p/maple-preview/agentic/run-matched-corpus.ts" \
  "$endpoint" "$model" "$label" "$out/api" \
  > "$out/api-run.stdout" 2> "$out/api-run.stderr"
api_rc=$?
set -e
printf '%s\n' "$api_rc" > "$out/api-run.exit-code"
[[ ! -e "$out/thermal-abort.txt" ]] || exit 70
systemctl --user is-active --quiet "$unit" || exit 71

printf 'cooldown\n' > "$out/phase.txt"
for _ in $(seq 1 900); do
  (( $(cat /sys/class/thermal/thermal_zone1/temp) < 70000 )) && break
  sleep 1
done
(( $(cat /sys/class/thermal/thermal_zone1/temp) < 70000 )) || exit 72

printf 'pi\n' > "$out/phase.txt"
set +e
timeout --signal=TERM --kill-after=30 3600 \
  "$root/benchmarks/intel-1340p/gemma-ornith-agentic-20260822/run-pi-suite.sh" \
  "$label" "$provider" "$model" "$endpoint" "$out/pi" \
  > "$out/pi-run.stdout" 2> "$out/pi-run.stderr"
pi_rc=$?
set -e
printf '%s\n' "$pi_rc" > "$out/pi-run.exit-code"
[[ ! -e "$out/thermal-abort.txt" ]] || exit 70
systemctl --user is-active --quiet "$unit" || exit 71

printf 'after\n' > "$out/phase.txt"
curl -fsS --max-time 10 "$endpoint/health" > "$out/health-after.json"
curl -fsS --max-time 10 "$endpoint/slots" > "$out/slots-after.json"
cleanup
trap - EXIT INT TERM
journalctl --user -u "$unit" --since "@$start_epoch" --no-pager > "$out/server-journal.txt"
printf 'api_exit=%s pi_exit=%s\n' "$api_rc" "$pi_rc"
