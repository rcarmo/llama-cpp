#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/flint-trial-20261023-be9528654612"
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp" BUN_TMPDIR="$run/tmp"
while kill -0 "$(cat "$run/throughput-screen-supervisor.pid")" 2>/dev/null;do
 grep -q '^COMPLETE' "$run/throughput-screen-status.txt" && break
 sleep 3
done
if ! grep -q '^COMPLETE' "$run/throughput-screen-status.txt";then echo 'Prior screen failed; stop';exit 1;fi
model="$ws/projects/models/flint/flint-UD-Q3_K_XL.gguf"
export FLINT_PROMPT=512 FLINT_DECODE=64 FLINT_REPS=2 FLINT_POOL=0 FLINT_FA=0 FLINT_UBATCH=128
: > "$run/throughput-core-status.txt"
while read -r label threads;do
 export FLINT_THREADS="$threads" FLINT_CPUS="$threads"
 echo "START $(date -u +%FT%TZ) $label cpus=$threads" |tee -a "$run/throughput-core-status.txt"
 if test -f "$run/$label.exit";then echo "EXISTS $label";continue;fi
 if bash "$run/run-core-trial.sh" "$label" cpu 0 bench "$model" > "$run/$label-supervisor.log" 2>&1;then
  grep -E 'BENCH_CONFIG|BENCH_RESULT|RESULT' "$run/$label.log" |tee -a "$run/throughput-core-status.txt"
 else echo "FAILED $label" |tee -a "$run/throughput-core-status.txt";exit 1;fi
 sleep 5
done <<'MATRIX'
bench-core4-control 4
bench-core6 6
bench-core8 8
bench-core12 12
bench-core16 16
MATRIX
printf 'COMPLETE %s\n' "$(date -u +%FT%TZ)" |tee -a "$run/throughput-core-status.txt"
