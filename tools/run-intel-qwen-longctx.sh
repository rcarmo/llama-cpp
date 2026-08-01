#!/usr/bin/env bash
set -euo pipefail

root=${LLAMA_ROOT:-/var/home/agent/workspace/projects/llama-cpp}
build=${LLAMA_BUILD:-$root/build-intel-clang}
model=${LLAMA_MODEL:-$root/../models/qwen3.6/Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf}
host=${LLAMA_HOST:-0.0.0.0}
port=${LLAMA_PORT:-8090}
ctx=${LLAMA_CTX:-131072}
cpus=${LLAMA_CPUS:-0-7}
process_cpus=${LLAMA_PROCESS_CPUS:-0-15}
threads=${LLAMA_THREADS:-8}
batch=${LLAMA_BATCH:-1024}
ubatch=${LLAMA_UBATCH:-256}
kv=${LLAMA_KV:-q4_0}
draft=${LLAMA_MTP_DEPTH:-3}
cache_ram=${LLAMA_CACHE_RAM_MIB:-0}
http_timeout=${LLAMA_HTTP_TIMEOUT:-28800}
slot_dir=${LLAMA_SLOT_DIR:-$HOME/.cache/llama-qwen-longctx/slots/}

server=$build/bin/llama-server
runtime=$build/runtime

[[ -x $server ]] || { echo "missing llama-server: $server" >&2; exit 1; }
[[ -s $model ]] || { echo "missing model: $model" >&2; exit 1; }
[[ $ctx =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_CTX must be positive" >&2; exit 2; }
[[ $draft =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_MTP_DEPTH must be positive" >&2; exit 2; }
mkdir -p "$slot_dir"

export LD_LIBRARY_PATH="$build/bin:$runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GGML_CPU_EXPERT_IO_PROFILE=${GGML_CPU_EXPERT_IO_PROFILE:-1}
export GGML_CPU_EXPERT_IO_ADVISE_MODE=${GGML_CPU_EXPERT_IO_ADVISE_MODE:-bounded}

exec taskset -c "$process_cpus" "$server" \
  --model "$model" \
  --alias qwen3.6-35b-a3b-128k-mtp \
  --load-mode mmap \
  --gpu-layers 0 \
  --threads "$threads" --cpu-range "$cpus" --cpu-strict 1 \
  --ctx-size "$ctx" --parallel 1 \
  --batch-size "$batch" --ubatch-size "$ubatch" \
  --cache-type-k "$kv" --cache-type-v "$kv" \
  --flash-attn on \
  --spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max "$draft" \
  --spec-draft-threads "$threads" --spec-draft-threads-batch "$threads" \
  --spec-draft-type-k "$kv" --spec-draft-type-v "$kv" \
  --cache-prompt --cache-ram "$cache_ram" --no-cache-idle-slots \
  --slot-save-path "$slot_dir" \
  --metrics --slots --ui --no-warmup \
  --timeout "$http_timeout" \
  --host "$host" --port "$port" \
  "$@"
