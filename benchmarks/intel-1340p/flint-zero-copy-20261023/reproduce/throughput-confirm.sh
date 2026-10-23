#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/flint-trial-20261023-be9528654612"
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp" BUN_TMPDIR="$run/tmp"
model="$ws/projects/models/flint/flint-UD-Q3_K_XL.gguf"
export FLINT_PROMPT=512 FLINT_DECODE=64 FLINT_REPS=1 FLINT_CPUS=16 FLINT_THREADS=4 FLINT_FA=0
: > "$run/throughput-confirm-status.txt"
while read -r label batch ub pool prompt;do
 export FLINT_BATCH_THREADS="$batch" FLINT_UBATCH="$ub" FLINT_POOL="$pool" FLINT_PROMPT="$prompt"
 echo "START $(date -u +%FT%TZ) $label" |tee -a "$run/throughput-confirm-status.txt"
 bash "$run/run-tuned-trial.sh" "$label" cpu 0 bench "$model" > "$run/$label-supervisor.log" 2>&1
 grep -E 'BENCH_CONFIG|BENCH_RESULT|RESULT' "$run/$label.log" |tee -a "$run/throughput-confirm-status.txt"
 sleep 5
done <<'MATRIX'
bench-confirm-A1 4 128 0 512
bench-confirm-B1 16 512 2 512
bench-confirm-B2 16 512 2 512
bench-confirm-A2 4 128 0 512
bench-long-A 4 128 0 1024
bench-long-B 16 512 2 1024
MATRIX
printf 'COMPLETE %s\n' "$(date -u +%FT%TZ)" |tee -a "$run/throughput-confirm-status.txt"
