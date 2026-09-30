#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Run the default CPU Qwen MoE service from a pinned runtime","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
runtime=${QWEN_RUNTIME:-"$HOME/.local/lib/llama-qwen-moe/current"}
model=${QWEN_MODEL:-"$repo/../models/qwen3.6/Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf"}
host=${QWEN_HOST:-127.0.0.1}
port=${QWEN_PORT:-11434}
profile=${QWEN_PROFILE:-plain}
[[ -f "$model" && -x "$runtime/bin/llama-server" ]] || { echo 'Qwen model or pinned runtime missing' >&2; exit 2; }
args=(--spec-type none)
case "$profile" in
    plain) ;;
    mtp) args=(--spec-type draft-mtp --spec-draft-n-max 3);;
    *) echo "Unknown QWEN_PROFILE: $profile" >&2; exit 2;;
esac
export LD_LIBRARY_PATH="$runtime/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$runtime/bin/llama-server" \
    -m "$model" --alias qwen3.6-35b-a3b-local --host "$host" --port "$port" \
    -ngl 0 -t 8 -tb 16 -c 8704 -b 1024 -ub 256 -np 1 \
    -ctk f16 -ctv f16 -fa auto --fit off --no-warmup --jinja --reasoning off \
    --metrics --slots "${args[@]}" "$@"
