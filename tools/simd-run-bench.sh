#!/usr/bin/env bash
set -euo pipefail

build=${1:?usage: $0 BUILD_DIR SIZE OUTPUT [MAX_LOAD]}
size=${2:?usage: $0 BUILD_DIR SIZE OUTPUT [MAX_LOAD]}
out=${3:?usage: $0 BUILD_DIR SIZE OUTPUT [MAX_LOAD]}
max_load=${4:-2.0}
iterations=${SIMD_BENCH_ITERATIONS:-200}

read -r load1 _ </proc/loadavg
if ! awk -v load="$load1" -v max="$max_load" 'BEGIN { exit !(load <= max) }'; then
  echo "refusing benchmark: 1-minute load $load1 exceeds limit $max_load" >&2
  exit 75
fi

mkdir -p "$(dirname "$out")"
{
  printf 'START '; date -Is
  uptime
  printf 'loadavg '; cat /proc/loadavg
  printf 'build=%s size=%s iterations=%s max_load=%s\n' "$build" "$size" "$iterations" "$max_load"
  "$build/bin/test-quantize-perf" \
    --type q4_0 --type q5_0 --type q8_0 \
    --op vec_dot_q --size "$size" --iterations "$iterations"
  printf 'END '; date -Is
  uptime
  printf 'loadavg '; cat /proc/loadavg
} 2>&1 | tee "$out"
