#!/usr/bin/env bash
set -euo pipefail

# Unsloth Dynamic Qwen3.8 27B UD-Q4_K_XL profile for the RTX 3060 12 GiB host.
# Qwen3.8 27B is a dense Qwen3.5-family hybrid (attention + GDN/SSM), not MoE:
# do not enable expert caching, --n-cpu-moe, or the MoE-only async CPU path.

MODEL_DIR=${MODEL_DIR:-/workspace/models/gguf-misc}
MODEL=${LLAMA_MODEL:-$MODEL_DIR/Qwen3.8-27B-UD-Q4_K_XL.gguf}
LLAMA_SERVER=${LLAMA_SERVER:-/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin/llama-server}
SLOT_SAVE_PATH=${SLOT_SAVE_PATH:-/workspace/tmp/llama-server-slots/qwen38-27b}

if [[ ! -x "$LLAMA_SERVER" ]]; then
  LLAMA_SERVER=$(command -v llama-server)
fi
if [[ ! -s "$MODEL" ]]; then
  echo "missing or empty Qwen3.8 model: $MODEL" >&2
  exit 1
fi

export CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-0}
OPENSSL_LIB=${OPENSSL_LIB:-/home/linuxbrew/.linuxbrew/opt/openssl@3/lib}
if [[ -d "$OPENSSL_LIB" ]]; then
  export LD_LIBRARY_PATH=/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin:$OPENSSL_LIB:${LD_LIBRARY_PATH:-}
else
  export LD_LIBRARY_PATH=/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin:${LD_LIBRARY_PATH:-}
fi
mkdir -p "$SLOT_SAVE_PATH"

exec "$LLAMA_SERVER" \
  --model "$MODEL" \
  --alias qwen38-27b-ud-q4-xl-mtp \
  --host 0.0.0.0 --port 8090 \
  --threads 4 --threads-batch 4 \
  --batch-size 1024 --ubatch-size 256 \
  --ctx-size 32768 --parallel 1 \
  --cache-type-k q4_0 --cache-type-v q4_0 \
  --spec-draft-type-k q4_0 --spec-draft-type-v q4_0 \
  --flash-attn auto \
  --n-gpu-layers 39 \
  --spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max 1 \
  --no-sched-async-cpu \
  --jinja \
  --cache-prompt --cache-reuse 512 \
  --ctx-checkpoints 32 --checkpoint-min-step 128 \
  --cache-ram -1 --cache-idle-slots \
  --slot-save-path "$SLOT_SAVE_PATH" \
  --metrics \
  --ui-mcp-proxy \
  --ui-config-file /workspace/.pi/llama-ui-config.json \
  --reasoning on --reasoning-format deepseek \
  --no-warmup
