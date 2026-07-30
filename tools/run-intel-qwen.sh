#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
profile=${1:-}
shift || true

build=${LLAMA_BUILD:-$root/build-intel-clang}
models=${LLAMA_MODELS:-$root/../models/qwen3.6}
port=${LLAMA_PORT:-8080}
ctx=${LLAMA_CTX:-4096}
cpus=${LLAMA_CPUS:-0-7}
threads=${LLAMA_THREADS:-8}

case "$profile" in
  qwen36-35b-a3b-q4)
    model=Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf
    spec=(--spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max 1
          --spec-draft-threads "$threads" --spec-draft-threads-batch "$threads")
    ;;
  qwen36-35b-a3b-q2)
    model=Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf
    spec=(--spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max 1
          --spec-draft-threads "$threads" --spec-draft-threads-batch "$threads")
    ;;
  qwen36-27b-q2)
    model=Qwen3.6-27B-UD-Q2_K_XL.gguf
    spec=(--spec-type none)
    ;;
  *)
    echo "usage: $0 {qwen36-35b-a3b-q4|qwen36-35b-a3b-q2|qwen36-27b-q2} [llama-server options]" >&2
    exit 2
    ;;
esac

server=$build/bin/llama-server
[[ -x "$server" ]] || { echo "missing server: $server" >&2; exit 1; }
[[ -s "$models/$model" ]] || { echo "missing model: $models/$model" >&2; exit 1; }

runtime=$build/runtime
export LD_LIBRARY_PATH="$build/bin${runtime:+:$runtime}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

exec taskset -c "$cpus" "$server" \
  -m "$models/$model" -ngl 0 \
  -t "$threads" --cpu-range "$cpus" --cpu-strict 1 \
  --ctx-size "$ctx" --parallel 1 \
  --batch-size 2048 --ubatch-size 512 \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --flash-attn on --cache-prompt \
  --host 127.0.0.1 --port "$port" \
  "${spec[@]}" "$@"
