#!/usr/bin/env bash
# RTX 3060 12 GB: GSQ IQ2_S, 64K, single request. Requires IQ1_M scratch fallback.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
server=${LLAMA_SERVER:-"$root/build-mmq/bin/llama-server"}
model=${LLAMA_MODEL:-/workspace/models/gguf-misc/Qwen3.8-27B-GSQ-RCO-IQ2_S-mtp.gguf}
exec "$server" -m "$model" -ngl 99 -c "${CTX_SIZE:-65536}" -np 1 \
    -b 2048 -ub 256 -t 4 -tb 4 -ctk q4_0 -ctv q4_0 -fa on \
    --spec-type draft-mtp --spec-draft-n-max "${MTP_DEPTH:-4}" --no-sched-async-cpu \
    --host "${HOST:-127.0.0.1}" --port "${PORT:-19450}" --jinja --alias qwen38-gsq "$@"
