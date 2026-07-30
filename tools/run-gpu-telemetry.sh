#!/usr/bin/env bash
set -euo pipefail

out=${1:?usage: $0 OUTPUT -- COMMAND...}
shift
[[ ${1:-} == -- ]] || { echo "missing --" >&2; exit 2; }
shift
[[ $# -gt 0 ]] || { echo "missing command" >&2; exit 2; }

if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "run-gpu-telemetry.sh currently supports NVIDIA only (nvidia-smi not found)" >&2
  exit 2
fi

mkdir -p "$(dirname "$out")"
: > "$out"
(
  while true; do
    printf '%s,' "$(date +%s.%N)"
    nvidia-smi --query-gpu=memory.used,utilization.gpu,power.draw,temperature.gpu --format=csv,noheader,nounits || true
    sleep 0.25
  done
) >> "$out" 2>/dev/null &
sampler=$!
trap 'kill "$sampler" 2>/dev/null || true; wait "$sampler" 2>/dev/null || true' EXIT

"$@"
status=$?
kill "$sampler" 2>/dev/null || true
wait "$sampler" 2>/dev/null || true
trap - EXIT

awk -F, '
  BEGIN { maxmem=maxutil=maxpower=maxtemp=0 }
  NF >= 5 {
    if ($2+0 > maxmem) maxmem=$2+0
    if ($3+0 > maxutil) maxutil=$3+0
    if ($4+0 > maxpower) maxpower=$4+0
    if ($5+0 > maxtemp) maxtemp=$5+0
  }
  END { printf "peak_memory_mib=%.0f peak_util_percent=%.0f peak_power_w=%.2f peak_temp_c=%.0f\n", maxmem,maxutil,maxpower,maxtemp }
' "$out"
exit "$status"
