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
parallel=${LLAMA_PARALLEL:-1}
kv_unified=${LLAMA_KV_UNIFIED:-off}
cont_batching=${LLAMA_CONT_BATCHING:-on}
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
cache_idle_slots=${LLAMA_CACHE_IDLE_SLOTS:-off}
cache_reuse=${LLAMA_CACHE_REUSE:-0}
ctx_checkpoints=${LLAMA_CTX_CHECKPOINTS:-32}
checkpoint_min_step=${LLAMA_CHECKPOINT_MIN_STEP:-8192}
http_timeout=${LLAMA_HTTP_TIMEOUT:-3600}
slot_dir=${LLAMA_SLOT_DIR:-$HOME/.cache/llama-candidates/$alias/slots/}

server=$build/bin/llama-server
runtime=$build/runtime

[[ -x $server ]] || { echo "missing llama-server: $server" >&2; exit 1; }
[[ -s $model ]] || { echo "missing model: $model" >&2; exit 1; }
[[ -z $draft_model || -s $draft_model ]] || { echo "missing draft model: $draft_model" >&2; exit 1; }
[[ $ctx =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_CTX must be positive" >&2; exit 2; }
[[ $parallel =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_PARALLEL must be positive" >&2; exit 2; }
(( parallel <= 32 )) || { echo "LLAMA_PARALLEL must not exceed 32" >&2; exit 2; }
[[ $kv_unified == on || $kv_unified == off ]] || { echo "LLAMA_KV_UNIFIED must be on or off" >&2; exit 2; }
[[ $cont_batching == on || $cont_batching == off ]] || { echo "LLAMA_CONT_BATCHING must be on or off" >&2; exit 2; }
[[ $threads =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_THREADS must be positive" >&2; exit 2; }
[[ $draft =~ ^[1-9][0-9]*$ ]] || { echo "LLAMA_MTP_DEPTH must be positive" >&2; exit 2; }
[[ $flash_attn == on || $flash_attn == off || $flash_attn == auto ]] || { echo "LLAMA_FLASH_ATTN must be on, off or auto" >&2; exit 2; }
[[ $cache_ram =~ ^-1$|^[0-9]+$ ]] || { echo "LLAMA_CACHE_RAM_MIB must be -1 or a non-negative integer" >&2; exit 2; }
[[ $cache_idle_slots == on || $cache_idle_slots == off ]] || { echo "LLAMA_CACHE_IDLE_SLOTS must be on or off" >&2; exit 2; }
[[ $cache_reuse =~ ^[0-9]+$ ]] || { echo "LLAMA_CACHE_REUSE must be a non-negative integer" >&2; exit 2; }
[[ $ctx_checkpoints =~ ^[0-9]+$ ]] || { echo "LLAMA_CTX_CHECKPOINTS must be a non-negative integer" >&2; exit 2; }
[[ $checkpoint_min_step =~ ^[0-9]+$ ]] || { echo "LLAMA_CHECKPOINT_MIN_STEP must be a non-negative integer" >&2; exit 2; }
if [[ $cache_idle_slots == on && $cache_ram == 0 ]]; then
  echo "LLAMA_CACHE_IDLE_SLOTS=on requires LLAMA_CACHE_RAM_MIB to be non-zero" >&2
  exit 2
fi
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

cache=(
  --cache-prompt --cache-ram "$cache_ram" --cache-reuse "$cache_reuse"
  --ctx-checkpoints "$ctx_checkpoints" --checkpoint-min-step "$checkpoint_min_step"
)
if [[ $cache_idle_slots == on ]]; then
  cache+=(--cache-idle-slots)
else
  cache+=(--no-cache-idle-slots)
fi

concurrency=(--parallel "$parallel")
if [[ $kv_unified == on ]]; then
  concurrency+=(--kv-unified)
else
  concurrency+=(--no-kv-unified)
fi
if [[ $cont_batching == on ]]; then
  concurrency+=(--cont-batching)
else
  concurrency+=(--no-cont-batching)
fi

cmd=(
  taskset -c "$process_cpus" "$server"
  --model "$model" --alias "$alias"
  --load-mode "$load_mode" --gpu-layers 0
  --threads "$threads" --cpu-range "$cpus" --cpu-strict 1
  --ctx-size "$ctx" "${concurrency[@]}"
  --batch-size "$batch" --ubatch-size "$ubatch"
  --cache-type-k "$kv" --cache-type-v "$kv"
  --flash-attn "$flash_attn"
  "${spec[@]}"
  "${cache[@]}"
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
