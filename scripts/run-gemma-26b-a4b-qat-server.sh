#!/usr/bin/env bash
set -euo pipefail

if [ -x /home/me/bin/tcm-cleanup ]; then
  LD_LIBRARY_PATH=/home/me/lib:/usr/lib /home/me/bin/tcm-cleanup || true
fi

# Gemma 4 26B A4B QAT — optimal: t=8 ctx=16384 ctk=f16 ub=256 draft-mtp
exec /home/me/src/llama-cpp-ff-gemma4-mtp-ime2-work/build/bin/llama-server \
  --model /home/me/models/gguf-misc/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf \
  --model-draft /home/me/models/gguf-misc/mtp-gemma-4-26B-A4B-it-qat-Q4_0.gguf \
  --spec-type draft-mtp --spec-draft-n-max 4 \
  --alias gemma4-26b-a4b-qat \
  --host 0.0.0.0 --port 8080 \
  --threads 8 --threads-batch 8 \
  --ubatch-size 256 --ctx-size 16384 \
  --cache-type-k f16 --cache-type-v f16 \
  --parallel 1 --jinja \
  --cache-prompt \
  --cache-reuse 256 \
  --slot-save-path /home/me/gemma-26b-a4b-slot-cache \
  --reasoning off --reasoning-format deepseek \
  --no-warmup
