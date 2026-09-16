#!/usr/bin/env bash
set -euo pipefail

: "${LLAMA_BUILD:?LLAMA_BUILD is required}"
: "${LLAMA_MODEL:?LLAMA_MODEL is required}"
: "${LLAMA_DRAFT_MODEL:?LLAMA_DRAFT_MODEL is required}"

export LD_LIBRARY_PATH="$LLAMA_BUILD/bin${LLAMA_RUNTIME:+:$LLAMA_RUNTIME}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GGML_VK_VISIBLE_DEVICES=${GGML_VK_VISIBLE_DEVICES:-0}
export GGML_VK_EXPERIMENTAL_ATTN_MODE=${GGML_VK_EXPERIMENTAL_ATTN_MODE:-f32}

exec "$LLAMA_BUILD/bin/llama-gemma-zero-copy-server" \
    --model "$LLAMA_MODEL" \
    --draft "$LLAMA_DRAFT_MODEL" \
    --alias "${LLAMA_ALIAS:-gemma-4-e4b-qat-mtp-zero-copy}" \
    --host "${LLAMA_HOST:-127.0.0.1}" \
    --port "${LLAMA_PORT:-18094}" \
    --ctx-size "${LLAMA_CTX:-32768}" \
    --batch-size "${LLAMA_BATCH:-256}" \
    --ubatch-size "${LLAMA_UBATCH:-256}" \
    --threads "${LLAMA_THREADS:-8}" \
    --threads-batch "${LLAMA_THREADS_BATCH:-16}" \
    --draft-max "${LLAMA_MTP_DEPTH:-3}" \
    --draft-min "${LLAMA_MTP_MIN:-1}" \
    --threadpools "${LLAMA_THREADPOOLS:-0}" \
    --model-sampling "${LLAMA_MODEL_SAMPLING:-1}" \
    --max-output "${LLAMA_MAX_OUTPUT:-2048}"
