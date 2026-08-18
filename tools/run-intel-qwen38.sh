#!/usr/bin/env bash
set -euo pipefail

root=${LLAMA_ROOT:-/var/home/agent/workspace/projects/llama-cpp}
build=${LLAMA_BUILD:-$root/build-intel-clang}
model_dir=${LLAMA_MODEL_DIR:-$root/../models/qwen3.8-27b}
model=${LLAMA_MODEL:-$model_dir/Qwen3.8-27B-Q4_K_M.gguf}
mtp_model=${LLAMA_MTP_MODEL:-$model_dir/mtp-Qwen3.8-27B-Q4_0.gguf}
use_mtp=${LLAMA_USE_MTP:-1}
mmproj=${LLAMA_MM_PROJ:-}
host=${LLAMA_HOST:-127.0.0.1}
port=${LLAMA_PORT:-8094}
ctx=${LLAMA_CTX:-8192}
cpus=${LLAMA_CPUS:-0-7}
process_cpus=${LLAMA_PROCESS_CPUS:-0-15}
threads=${LLAMA_THREADS:-8}
batch=${LLAMA_BATCH:-1024}
ubatch=${LLAMA_UBATCH:-256}
kv=${LLAMA_KV:-q4_0}
mtp_depth=${LLAMA_MTP_DEPTH:-3}
cache_ram=${LLAMA_CACHE_RAM_MIB:-0}
http_timeout=${LLAMA_HTTP_TIMEOUT:-28800}
slot_dir=${LLAMA_SLOT_DIR:-$HOME/.cache/llama-qwen38/slots/}

server=$build/bin/llama-server
runtime=$build/runtime

[[ -x $server ]] || { echo "missing llama-server: $server" >&2; exit 1; }
[[ -s $model ]] || { echo "missing model: $model" >&2; exit 1; }
[[ $use_mtp == 0 || $use_mtp == 1 ]] || { echo "LLAMA_USE_MTP must be 0 or 1" >&2; exit 2; }
[[ $use_mtp == 0 || -s $mtp_model ]] || { echo "missing MTP model: $mtp_model" >&2; exit 1; }
[[ -z $mmproj || -s $mmproj ]] || { echo "missing multimodal projector: $mmproj" >&2; exit 1; }
[[ $ctx =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_CTX must be positive" >&2; exit 2; }
[[ $use_mtp == 0 || $mtp_depth =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_MTP_DEPTH must be positive" >&2; exit 2; }
mkdir -p "$slot_dir"

export LD_LIBRARY_PATH="$build/bin:$runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

alias=qwen3.8-27b-q4km-target
[[ $use_mtp == 0 ]] || alias=qwen3.8-27b-q4km-mtp
args=(
  --model "$model"
  --alias "$alias"
  --load-mode mmap
  --gpu-layers 0
  --threads "$threads" --cpu-range "$cpus" --cpu-strict 1
  --ctx-size "$ctx" --parallel 1
  --batch-size "$batch" --ubatch-size "$ubatch"
  --cache-type-k "$kv" --cache-type-v "$kv"
  --flash-attn on
  --cache-prompt --cache-ram "$cache_ram" --no-cache-idle-slots
  --slot-save-path "$slot_dir"
  --reasoning-preserve
  --metrics --slots --ui --no-warmup
  --timeout "$http_timeout"
  --host "$host" --port "$port"
)
if [[ $use_mtp == 1 ]]; then
  args+=(
    --model-draft "$mtp_model"
    --spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max "$mtp_depth"
    --spec-draft-threads "$threads" --spec-draft-threads-batch "$threads"
    --spec-draft-type-k "$kv" --spec-draft-type-v "$kv"
  )
fi
[[ -z $mmproj ]] || args+=(--mmproj "$mmproj")

exec taskset -c "$process_cpus" "$server" "${args[@]}" "$@"
