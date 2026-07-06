#!/usr/bin/env bash
set -euo pipefail

# Qwen3.6-35B-A3B (MoE) + native MTP, long-context profile for a 12 GB NVIDIA GPU.
# n-cpu-moe 39 keeps most experts on CPU but offloads the top layers to GPU;
# ctx 65536 with a large prefill ubatch (2048) keeps even ~50K-token prompts
# answering in under 30 s. VRAM ~9.5 GB (safe headroom). Short answers ~22 tok/s.

# Tuned RTX 3060 profile notes:
# - Older Qwen 35B A3B launch profile kept as a baseline/reference.
# - Prefer `run-qwen36-27b-mtp-cuda.sh` for current native-MTP Qwen testing.

MODEL_DIR=${MODEL_DIR:-/workspace/models/gguf-misc}
LLAMA_SERVER=${LLAMA_SERVER:-/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin/llama-server}
MODEL="$MODEL_DIR/Qwen3.6-35B-A3B-UD-Q4_K_XL-MTP.gguf"

export LD_LIBRARY_PATH=/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin:${LD_LIBRARY_PATH:-}

exec "$LLAMA_SERVER" \
  --model "$MODEL" \
  --model-draft "$MODEL" \
  --spec-type draft-mtp --spec-draft-n-max 4 \
  --alias qwen3.6-35b-a3b \
  --host 0.0.0.0 --port 8090 \
  --threads 8 --threads-batch 8 \
  --batch-size 2048 --ubatch-size 2048 \
  --ctx-size 65536 \
  --cache-type-k f16 --cache-type-v f16 \
  --parallel 1 --jinja \
  --cache-prompt \
  --n-cpu-moe 39 --n-cpu-moe-draft 39 \
  --n-gpu-layers 999 \
  --reasoning off --reasoning-budget 0 --reasoning-format deepseek \
  --no-warmup
