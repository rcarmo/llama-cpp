#!/usr/bin/env bash
set -euo pipefail

# llama.cpp Gemma 4 E4B QAT + native MTP profile for sandbox RTX 3060.
# Conservative stable profile:
# - QAT main model + MTP drafter
# - one ~80k context slot on port 8090
# - CUDA flash-attn disabled due startup crash on this build/GPU
# - prompt/session cache and metrics enabled

# Tuned RTX 3060 profile notes:
# - Larger Gemma E4B QAT + MTP experiment retained for comparison.
# - Flash attention was disabled in this profile after CUDA startup instability on
#   this workstation; re-test after llama.cpp/CUDA upgrades before enabling.
# - Uses one large slot because VRAM headroom is tighter than E2B.

MODEL_DIR=${MODEL_DIR:-/workspace/models/gguf-misc}
LLAMA_SERVER=${LLAMA_SERVER:-/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin/llama-server}
SLOT_SAVE_PATH=${SLOT_SAVE_PATH:-/workspace/tmp/llama-server-slots/e4b}
if [[ ! -x "$LLAMA_SERVER" ]]; then
  LLAMA_SERVER=$(command -v llama-server)
fi

export CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-0}
export LD_LIBRARY_PATH=/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin:${LD_LIBRARY_PATH:-}
mkdir -p "$SLOT_SAVE_PATH"

exec "$LLAMA_SERVER" \
  --model "$MODEL_DIR/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf" \
  --model-draft "$MODEL_DIR/mtp-gemma-4-E4B-it-qat-Q4_0.gguf" \
  --spec-type draft-mtp --spec-draft-n-max 4 \
  --alias gemma4-e4b-qat-mtp \
  --host 0.0.0.0 --port 8090 \
  --threads 8 --threads-batch 8 \
  --batch-size 4096 --ubatch-size 2048 \
  --ctx-size 81920 \
  --parallel 1 \
  --cache-type-k f16 --cache-type-v f16 \
  -fa off \
  --jinja \
  --cache-prompt \
  --cache-reuse 1024 \
  --ctx-checkpoints 64 \
  --checkpoint-min-step 128 \
  --cache-ram -1 \
  --cache-idle-slots \
  --slot-save-path "$SLOT_SAVE_PATH" \
  --metrics \
  --ui-mcp-proxy \
  --ui-config-file /workspace/.pi/llama-ui-config.json \
  --n-gpu-layers 999 \
  --reasoning on --reasoning-format deepseek \
  --no-warmup
