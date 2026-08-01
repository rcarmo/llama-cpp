#!/usr/bin/env bash
set -euo pipefail

root=/var/home/agent/workspace/projects/llama-cpp
cd "$root"

export FIELDFARE_REQUEST="$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/workloads/agentic-retrieval-2825.json"
export FIELDFARE_EVICT=0
export FIELDFARE_KV=q4_0
export FIELDFARE_DRAFT=3
export FIELDFARE_BATCH=1024
export FIELDFARE_UBATCH=256
export FIELDFARE_RUN_NAME=selected-99104
export FIELDFARE_SAMPLE_INTERVAL=10
export FIELDFARE_REQUEST_MAX_TIME=28800
export FIELDFARE_OUT_ROOT="$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/near-capacity"
export GGML_CPU_EXPERT_IO_ADVISE_MODE=bounded

exec "$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/run-fieldfare-gate.sh" bounded 8258
