#!/usr/bin/env bash
set -euo pipefail

if [ -x /home/me/bin/tcm-cleanup ]; then
  LD_LIBRARY_PATH=/home/me/lib:/usr/lib /home/me/bin/tcm-cleanup || true
fi

# Gemma 4 E2B QAT + native MTP drafter — long-context production profile.
# 128K context is the model's train context (n_ctx_train=131072).
exec /home/me/src/llama-cpp-ff-gemma4-mtp-ime2-work/build/bin/llama-server \
  --model /home/me/models/gguf-misc/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf \
  --model-draft /home/me/models/gguf-misc/mtp-gemma-4-E2B-it-qat-Q4_0.gguf \
  --spec-type draft-mtp --spec-draft-n-max 4 \
  --alias gemma4-e2b-qat-mtp-128k \
  --host 0.0.0.0 --port 8080 \
  --threads 8 --threads-batch 8 \
  --ubatch-size 1024 --ctx-size 131072 \
  --cache-type-k f16 --cache-type-v f16 \
  --parallel 1 --jinja \
  --cache-prompt \
  --cache-reuse 256 \
  --slot-save-path /home/me/gemma-e2b-128k-slot-cache \
  --reasoning off --reasoning-format none \
  --no-warmup
