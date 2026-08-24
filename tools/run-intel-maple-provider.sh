#!/usr/bin/env bash
set -euo pipefail

root=${LLAMA_ROOT:-/var/home/agent/workspace/projects/llama-cpp}
build=${LLAMA_BUILD:-$root/build-intel-clang}
model=${LLAMA_MODEL:-$root/../models/maple-preview-tq2-exact-head.gguf}
alias=${LLAMA_ALIAS:-maple-preview-tq2-exact-head}
host=${LLAMA_HOST:-127.0.0.1}
port=${LLAMA_PORT:-8093}
ctx=${LLAMA_CTX:-262144}
parallel=${LLAMA_PARALLEL:-2}
cpus=${LLAMA_CPUS:-0-7}
process_cpus=${LLAMA_PROCESS_CPUS:-0-15}
threads=${LLAMA_THREADS:-8}
batch=${LLAMA_BATCH:-2048}
ubatch=${LLAMA_UBATCH:-512}
kv=${LLAMA_KV:-f16}
cache_ram=${LLAMA_CACHE_RAM_MIB:-12288}
ctx_checkpoints=${LLAMA_CTX_CHECKPOINTS:-32}
checkpoint_min_step=${LLAMA_CHECKPOINT_MIN_STEP:-8192}
http_timeout=${LLAMA_HTTP_TIMEOUT:-7200}
slot_dir=${LLAMA_SLOT_DIR:-$HOME/.cache/llama-maple-local-provider/slots/}

server=$build/bin/llama-server
runtime=$build/runtime

[[ -x $server ]] || { echo "missing llama-server: $server" >&2; exit 1; }
[[ -s $model ]] || { echo "missing model: $model" >&2; exit 1; }
[[ $ctx =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_CTX must be positive" >&2; exit 2; }
[[ $parallel =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_PARALLEL must be positive" >&2; exit 2; }
[[ $threads =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_THREADS must be positive" >&2; exit 2; }
[[ $batch =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_BATCH must be positive" >&2; exit 2; }
[[ $ubatch =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_UBATCH must be positive" >&2; exit 2; }
[[ $cache_ram =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_CACHE_RAM_MIB must be positive" >&2; exit 2; }
[[ $ctx_checkpoints =~ ^[0-9]+$ ]] || { echo "LLAMA_CTX_CHECKPOINTS must be non-negative" >&2; exit 2; }
[[ $checkpoint_min_step =~ ^[0-9]+$ ]] || { echo "LLAMA_CHECKPOINT_MIN_STEP must be non-negative" >&2; exit 2; }
(( ctx % parallel == 0 )) || { echo "LLAMA_CTX must divide evenly across LLAMA_PARALLEL" >&2; exit 2; }
(( ctx / parallel <= 131072 )) || { echo "Maple slot context must not exceed the trained 131072-token context" >&2; exit 2; }
mkdir -p "$slot_dir"

export LD_LIBRARY_PATH="$build/bin:$runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GGML_CPU_EXPERT_IO_PROFILE=${GGML_CPU_EXPERT_IO_PROFILE:-1}
export GGML_CPU_EXPERT_IO_ADVISE_MODE=${GGML_CPU_EXPERT_IO_ADVISE_MODE:-off}

cmd=(
  taskset -c "$process_cpus" "$server"
  --model "$model" --alias "$alias"
  --load-mode mmap --gpu-layers 0
  --threads "$threads" --cpu-range "$cpus" --cpu-strict 1
  --ctx-size "$ctx" --parallel "$parallel" --no-kv-unified --cont-batching
  --batch-size "$batch" --ubatch-size "$ubatch"
  --cache-type-k "$kv" --cache-type-v "$kv" --flash-attn off
  --cache-prompt --cache-ram "$cache_ram" --cache-idle-slots --cache-reuse 0
  --ctx-checkpoints "$ctx_checkpoints" --checkpoint-min-step "$checkpoint_min_step"
  --slot-save-path "$slot_dir"
  --metrics --slots --no-warmup --timeout "$http_timeout"
  --host "$host" --port "$port"
)
cmd+=("$@")

if [[ ${LLAMA_DRY_RUN:-0} == 1 ]]; then
  printf '%q ' "${cmd[@]}"
  printf '\n'
  exit 0
fi

exec "${cmd[@]}"
