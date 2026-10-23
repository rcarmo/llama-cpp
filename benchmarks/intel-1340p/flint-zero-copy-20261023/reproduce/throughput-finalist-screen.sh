#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/flint-trial-20261023-be9528654612"
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp" BUN_TMPDIR="$run/tmp"
while test "$(podman inspect flint-build --format '{{.State.Status}}')" = running;do sleep 2;done
test "$(podman inspect flint-build --format '{{.State.ExitCode}}')" = 0
podman rm flint-build >/dev/null
sha256sum "$ws/tmp/llama-cpp/build/source-1309921403/flint-vulkan/bin/test-flint-handoff-synthetic" "$ws/tmp/llama-cpp/build/source-1309921403/flint-vulkan/bin/libllama.so.0.7.0" > "$run/final-binary.sha256"
model="$ws/projects/models/flint/flint-UD-Q3_K_XL.gguf"
export FLINT_PROMPT=512 FLINT_DECODE=64 FLINT_REPS=2 FLINT_CPUS=16 FLINT_THREADS=4 FLINT_POOL=0 FLINT_FA=0
: > "$run/throughput-finalist-status.txt"
while read -r label batch ub cpuset;do
 export FLINT_BATCH_THREADS="$batch" FLINT_UBATCH="$ub";unset FLINT_CPUSET
 test "$cpuset" = any || export FLINT_CPUSET="$cpuset"
 echo "START $(date -u +%FT%TZ) $label" |tee -a "$run/throughput-finalist-status.txt"
 bash "$run/run-tuned-trial.sh" "$label" cpu 0 bench "$model" > "$run/$label-supervisor.log" 2>&1
 grep -E 'BENCH_CONFIG|BENCH_RESULT|RESULT' "$run/$label.log" |tee -a "$run/throughput-finalist-status.txt"
 sleep 4
done <<'MATRIX'
bench-split16-4 16 128 any
bench-split16-4-ub64 16 64 any
bench-split16-4-ub256 16 256 any
bench-split16-4-ub512 16 512 any
bench-pcores4 4 128 0,2,4,6
bench-ecores4 4 128 8-11
MATRIX
printf 'COMPLETE %s\n' "$(date -u +%FT%TZ)" |tee -a "$run/throughput-finalist-status.txt"
