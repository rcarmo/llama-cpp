#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/flint-trial-20261023-be9528654612"
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp" BUN_TMPDIR="$run/tmp"
fixture="$ws/tmp/llama-cpp/build/llama-cpp-182732430/upstream-20261023-cpu/tests/test-models/flint-moe.gguf"
model="$ws/projects/models/flint/flint-UD-Q3_K_XL.gguf"
export FLINT_CPUS=4 FLINT_THREADS=4 FLINT_BATCH_THREADS=4 FLINT_UBATCH=128 FLINT_POOL=0
bash "$run/run-tuned-trial.sh" final-synthetic-gpu gpu 16 synthetic "$fixture" > "$run/final-synthetic-gpu-supervisor.log" 2>&1
bash "$run/run-tuned-trial.sh" final-trained-cache4096 gpu 4096 fixed "$model" > "$run/final-trained-cache4096-supervisor.log" 2>&1
export FLINT_CPUS=16 FLINT_BATCH_THREADS=16 FLINT_UBATCH=512
bash "$run/run-tuned-trial.sh" final-cpu-chat cpu 0 chat "$model" > "$run/final-cpu-chat-supervisor.log" 2>&1
printf 'COMPLETE %s\n' "$(date -u +%FT%TZ)" > "$run/final-qualification-status.txt"
