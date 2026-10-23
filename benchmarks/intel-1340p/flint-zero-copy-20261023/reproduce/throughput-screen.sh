#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/flint-trial-20261023-be9528654612"
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp" BUN_TMPDIR="$run/tmp"
model="$ws/projects/models/flint/flint-UD-Q3_K_XL.gguf"
export FLINT_PROMPT=512 FLINT_DECODE=64 FLINT_REPS=2
: > "$run/throughput-screen-status.txt"
while read -r label mode cache threads pool ub fa cpuset;do
 export FLINT_THREADS="$threads" FLINT_POOL="$pool" FLINT_UBATCH="$ub" FLINT_FA="$fa"
 unset FLINT_CPUSET
 if test "$cpuset" != any;then export FLINT_CPUSET="$cpuset";fi
 echo "START $(date -u +%FT%TZ) $label" |tee -a "$run/throughput-screen-status.txt"
 if test -f "$run/$label.exit";then echo "EXISTS $label" |tee -a "$run/throughput-screen-status.txt";continue;fi
 if bash "$run/run-trial.sh" "$label" "$mode" "$cache" bench "$model" > "$run/$label-supervisor.log" 2>&1;then
  grep -E 'BENCH_CONFIG|BENCH_RESULT|RESULT' "$run/$label.log" |tee -a "$run/throughput-screen-status.txt"
 else
  echo "FAILED $label" |tee -a "$run/throughput-screen-status.txt"
  cat "$run/$label-after.txt" "$run/$label-abort.txt" 2>/dev/null ||true
  if test -f "$run/$label-abort.txt" || grep -q 'oom=true' "$run/$label-after.txt";then exit 1;fi
 fi
 sleep 3
done <<'MATRIX'
bench-cpu4 cpu 0 4 0 128 0 any
bench-cpu3 cpu 0 3 0 128 0 any
bench-cpu2 cpu 0 2 0 128 0 any
bench-cpu4-pool cpu 0 4 1 128 0 any
bench-cpu4-pcores cpu 0 4 0 128 0 0,2,4,6
bench-cpu4-fa cpu 0 4 0 128 1 any
bench-gpu0 gpu 0 4 0 128 0 any
bench-gpu128 gpu 128 4 0 128 0 any
bench-gpu256 gpu 256 4 0 128 0 any
bench-gpu512 gpu 512 4 0 128 0 any
MATRIX
printf 'COMPLETE %s\n' "$(date -u +%FT%TZ)" |tee -a "$run/throughput-screen-status.txt"
