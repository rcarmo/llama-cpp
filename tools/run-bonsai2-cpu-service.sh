#!/usr/bin/env bash
set -euo pipefail

: "${LLAMA_BUILD:?set LLAMA_BUILD to the immutable Bonsai runtime}"
: "${LLAMA_MODEL:?set LLAMA_MODEL to the Bonsai PQ2_0 GGUF}"

server="$LLAMA_BUILD/bin/llama-server"
[[ -x $server ]] || { echo "Missing executable: $server" >&2; exit 1; }
[[ -r $LLAMA_MODEL ]] || { echo "Missing model: $LLAMA_MODEL" >&2; exit 1; }

export LD_LIBRARY_PATH="$LLAMA_BUILD/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

exec "$server" \
    --model "$LLAMA_MODEL" \
    --alias "${LLAMA_ALIAS:-bonsai-2-27b-pq2-cpu}" \
    --host "${LLAMA_HOST:-192.168.1.70}" \
    --port "${LLAMA_PORT:-11434}" \
    --ctx-size "${LLAMA_CTX:-2048}" \
    --threads "${LLAMA_THREADS:-8}" \
    --threads-batch "${LLAMA_THREADS_BATCH:-16}" \
    --parallel 1 \
    --gpu-layers 0 \
    --no-warmup \
    --metrics \
    --slots \
    --reasoning off \
    --reasoning-budget 0
