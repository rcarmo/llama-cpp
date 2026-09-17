#!/usr/bin/env bash
# Launch the local Huihui Gemma 4 security-audit profile.
set -euo pipefail
: "${LLAMA_BUILD:?LLAMA_BUILD is required}"
: "${LLAMA_RUNTIME_DIR:?LLAMA_RUNTIME_DIR is required}"
: "${LLAMA_MODEL:?LLAMA_MODEL is required}"
: "${LLAMA_DRAFT_MODEL:?LLAMA_DRAFT_MODEL is required}"

export LD_LIBRARY_PATH="$LLAMA_BUILD/bin:$LLAMA_RUNTIME_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GGML_VK_VISIBLE_DEVICES="${GGML_VK_VISIBLE_DEVICES:-0}"
export GGML_VK_EXPERIMENTAL_ATTN_MODE="${GGML_VK_EXPERIMENTAL_ATTN_MODE:-f32}"
export GGML_CPU_EXPERIMENTAL_Q4_N4_SCHEDULE="${GGML_CPU_EXPERIMENTAL_Q4_N4_SCHEDULE:-1}"

exec "$LLAMA_BUILD/bin/llama-gemma-zero-copy-server" \
  --model "$LLAMA_MODEL" \
  --draft "$LLAMA_DRAFT_MODEL" \
  --alias "${LLAMA_ALIAS:-huihui-gemma-4-12b-abliterated-zero-copy}" \
  --host "${LLAMA_HOST:-192.168.1.70}" \
  --port "${LLAMA_PORT:-8094}" \
  --ctx-size "${LLAMA_CTX:-8192}" \
  --batch-size "${LLAMA_BATCH:-256}" \
  --ubatch-size "${LLAMA_UBATCH:-256}" \
  --threads "${LLAMA_THREADS:-8}" \
  --threads-batch "${LLAMA_THREADS_BATCH:-16}" \
  --draft-max "${LLAMA_MTP_DEPTH:-1}" \
  --draft-min "${LLAMA_MTP_MIN:-1}" \
  --threadpools "${LLAMA_THREADPOOLS:-0}" \
  --model-sampling "${LLAMA_MODEL_SAMPLING:-1}" \
  --max-output "${LLAMA_MAX_OUTPUT:-2048}"
