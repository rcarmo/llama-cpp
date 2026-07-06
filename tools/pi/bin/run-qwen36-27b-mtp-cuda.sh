#!/usr/bin/env bash
set -euo pipefail

# llama.cpp Qwen3.6 35B-A3B native MTP profile for RTX 3060 trial.
# Conservative single-slot profile; this is a large ~12GiB GGUF.
#
# Tuned RTX 3060 profile notes:
# - Historical script name says 27B, but the current model path is the faster
#   Qwen3.6 35B-A3B Q2 native-MTP GGUF.
# - 32K context is deliberate for speed: a 26K-token smoke test measured about
#   900 prompt tok/s and 52.7 generation tok/s before later llama.cpp updates.
# - 128K and 262K contexts work as long-context/coherence modes but are slower.
# - After the July 2026 merge, the fastest reliable RTX 3060 profile uses
#   q4_0 KV cache, `--no-mmap`, native MTP draft depth 1, and MoE-aware
#   placement (`--n-gpu-layers all --n-cpu-moe 5`). This measured ~70 tok/s on
#   a controlled 160-token local prompt, with higher draft depths and larger
#   n_cpu_moe values slower.

MODEL_DIR=${MODEL_DIR:-/workspace/models/gguf-misc}
LLAMA_SERVER=${LLAMA_SERVER:-/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin/llama-server}
SLOT_SAVE_PATH=${SLOT_SAVE_PATH:-/workspace/tmp/llama-server-slots/qwen36-27b}
if [[ ! -x "$LLAMA_SERVER" ]]; then
  LLAMA_SERVER=$(command -v llama-server)
fi

export CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-0}
export LD_LIBRARY_PATH=/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin:${LD_LIBRARY_PATH:-}
mkdir -p "$SLOT_SAVE_PATH"

exec "$LLAMA_SERVER" \
  --model "$MODEL_DIR/Qwen3.6-35B-A3B-UD-Q2_K_XL-MTP.gguf" \
  --spec-type draft-mtp --spec-draft-n-max 1 \
  --alias qwen36-35b-a3b-mtp-q2 \
  --host 0.0.0.0 --port 8090 \
  --threads 8 --threads-batch 8 \
  --batch-size 1024 --ubatch-size 1024 \
  --ctx-size 32768 \
  --parallel 1 \
  --cache-type-k q4_0 --cache-type-v q4_0 \
  --no-mmap \
  -fa on \
  --jinja \
  --cache-prompt \
  --cache-reuse 512 \
  --ctx-checkpoints 32 \
  --checkpoint-min-step 128 \
  --cache-ram -1 \
  --cache-idle-slots \
  --slot-save-path "$SLOT_SAVE_PATH" \
  --metrics \
  --ui-mcp-proxy \
  --ui-config-file /workspace/.pi/llama-ui-config.json \
  --n-gpu-layers all \
  --n-cpu-moe 5 \
  --reasoning on --reasoning-format deepseek \
  --no-warmup
