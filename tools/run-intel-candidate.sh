#!/usr/bin/env bash
set -euo pipefail

root=${LLAMA_ROOT:-/var/home/agent/workspace/projects/llama-cpp}
build=${LLAMA_BUILD:-$root/build-intel-clang}
model=${LLAMA_MODEL:?set LLAMA_MODEL}
draft_model=${LLAMA_DRAFT_MODEL:-}
alias=${LLAMA_ALIAS:?set LLAMA_ALIAS}
host=${LLAMA_HOST:-127.0.0.1}
port=${LLAMA_PORT:-8091}
ctx=${LLAMA_CTX:-32768}
cpus=${LLAMA_CPUS:-0-7}
process_cpus=${LLAMA_PROCESS_CPUS:-0-15}
threads=${LLAMA_THREADS:-8}
batch=${LLAMA_BATCH:-512}
ubatch=${LLAMA_UBATCH:-128}
kv=${LLAMA_KV:-f16}
draft=${LLAMA_MTP_DEPTH:?set LLAMA_MTP_DEPTH}
load_mode=${LLAMA_LOAD_MODE:-mmap}
flash_attn=${LLAMA_FLASH_ATTN:-off}
cache_ram=${LLAMA_CACHE_RAM_MIB:-0}
http_timeout=${LLAMA_HTTP_TIMEOUT:-3600}
slot_dir=${LLAMA_SLOT_DIR:-$HOME/.cache/llama-candidates/$alias/slots/}

server=$build/bin/llama-server
runtime=$build/runtime

[[ -x $server ]] || { echo "missing llama-server: $server" >&2; exit 1; }
[[ -s $model ]] || { echo "missing model: $model" >&2; exit 1; }
[[ -z $draft_model || -s $draft_model ]] || { echo "missing draft model: $draft_model" >&2; exit 1; }
[[ $ctx =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_CTX must be positive" >&2; exit 2; }
[[ $threads =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_THREADS must be positive" >&2; exit 2; }
[[ $draft =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_MTP_DEPTH must be positive" >&2; exit 2; }
[[ $flash_attn == on || $flash_attn == off || $flash_attn == auto ]] || { echo "LLAMA_FLASH_ATTN must be on, off or auto" >&2; exit 2; }
mkdir -p "$slot_dir"

export LD_LIBRARY_PATH="$build/bin:$runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GGML_CPU_EXPERT_IO_PROFILE=${GGML_CPU_EXPERT_IO_PROFILE:-1}
export GGML_CPU_EXPERT_IO_ADVISE_MODE=${GGML_CPU_EXPERT_IO_ADVISE_MODE:-off}

spec=(
  --spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max "$draft"
  --spec-draft-threads "$threads" --spec-draft-threads-batch "$threads"
  --spec-draft-type-k "$kv" --spec-draft-type-v "$kv"
)
[[ -z $draft_model ]] || spec+=(--model-draft "$draft_model")

cmd=(
  taskset -c "$process_cpus" "$server"
  --model "$model" --alias "$alias"
  --load-mode "$load_mode" --gpu-layers 0
  --threads "$threads" --cpu-range "$cpus" --cpu-strict 1
  --ctx-size "$ctx" --parallel 1
  --batch-size "$batch" --ubatch-size "$ubatch"
  --cache-type-k "$kv" --cache-type-v "$kv"
  --flash-attn "$flash_attn"
  "${spec[@]}"
  --cache-prompt --cache-ram "$cache_ram" --no-cache-idle-slots
  --slot-save-path "$slot_dir"
  --metrics --slots --ui --no-warmup
  --timeout "$http_timeout"
  --host "$host" --port "$port"
)
cmd+=("$@")

if [[ ${LLAMA_DRY_RUN:-0} == 1 ]]; then
  printf '%q ' "${cmd[@]}"
  printf '\n'
  exit 0
fi

exec "${cmd[@]}"
