#!/usr/bin/env bash
set -euo pipefail

ctx=${1:?usage: $0 CTX PORT OUTPUT_PREFIX}
port=${2:?usage: $0 CTX PORT OUTPUT_PREFIX}
prefix=${3:?usage: $0 CTX PORT OUTPUT_PREFIX}
root=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck source=/dev/null
source "$root/tools/vulkan-toolchain-env.sh"

model=/workspace/models/gguf-misc/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf
log="$prefix.server.log"
pidfile="$prefix.pid"
response="$prefix.response.json"
telemetry="$prefix.gpu.csv"

cleanup() {
  if [[ -f "$pidfile" ]]; then
    kill "$(cat "$pidfile")" 2>/dev/null || true
    wait "$(cat "$pidfile")" 2>/dev/null || true
  fi
}
trap cleanup EXIT

GGML_VK_VISIBLE_DEVICES=0 "$root/build-vulkan-release/bin/llama-server" \
  --device Vulkan0 -m "$model" --host 127.0.0.1 --port "$port" \
  -ngl 999 -c "$ctx" -b 512 -ub 256 --parallel 1 --no-warmup \
  >"$log" 2>&1 &
echo $! > "$pidfile"

for _ in $(seq 1 120); do
  if curl -fsS --max-time 1 "http://127.0.0.1:$port/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS --max-time 2 "http://127.0.0.1:$port/health" >/dev/null

"$root/tools/run-gpu-telemetry.sh" "$telemetry" -- \
  curl -fsS --max-time 120 "http://127.0.0.1:$port/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Summarize Vulkan portability in one sentence."}],"max_tokens":32,"temperature":0}' \
  >"$response"

cat "$response"
