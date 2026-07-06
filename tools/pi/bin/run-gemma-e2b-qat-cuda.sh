#!/usr/bin/env bash
set -euo pipefail

# llama.cpp Gemma 4 E2B QAT + native MTP profile for sandbox RTX 3060.
# Tuned for Pi interactive use:
# - QAT main model + MTP drafter
# - two slots/sessions on port 8090
# - aggressive prompt/session cache reuse for repeated chat prefixes
# - metrics endpoint enabled for prompt/eval throughput monitoring

# Tuned RTX 3060 profile notes:
# - Current preferred interactive profile on this host.
# - `--spec-draft-n-max 1` is deliberate: local sweeps showed draft depths 2-4
#   over-drafted and reduced throughput for Gemma E2B QAT + MTP.
# - `--parallel 2` splits the 131072-token context into two 65536-token slots.
# - `--cache-prompt`, checkpoints, and idle slot caching favor repeated chat prefixes.
# - Fully offloads this small QAT model (`--n-gpu-layers 999`) and fits easily.

MODEL_DIR=${MODEL_DIR:-/workspace/models/gguf-misc}
LLAMA_SERVER=${LLAMA_SERVER:-/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin/llama-server}
SLOT_SAVE_PATH=${SLOT_SAVE_PATH:-/workspace/tmp/llama-server-slots/e2b}
if [[ ! -x "$LLAMA_SERVER" ]]; then
  LLAMA_SERVER=$(command -v llama-server)
fi

export CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-0}
export LD_LIBRARY_PATH=/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin:${LD_LIBRARY_PATH:-}
mkdir -p "$SLOT_SAVE_PATH"

exec "$LLAMA_SERVER" \
  --model "$MODEL_DIR/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf" \
  --model-draft "$MODEL_DIR/mtp-gemma-4-E2B-it-qat-Q4_0.gguf" \
  --spec-type draft-mtp --spec-draft-n-max 1 \
  --alias gemma4-e2b-qat-mtp \
  --host 0.0.0.0 --port 8090 \
  --threads 8 --threads-batch 8 \
  --batch-size 4096 --ubatch-size 2048 \
  --ctx-size 131072 \
  --parallel 2 \
  --cache-type-k f16 --cache-type-v f16 \
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
