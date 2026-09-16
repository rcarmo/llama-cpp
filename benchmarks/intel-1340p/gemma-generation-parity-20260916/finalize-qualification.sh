#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Finalize candidate qualification without repeating the behavioural suite","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
out="$root/benchmarks/intel-1340p/gemma-generation-parity-20260916/qualification"
build="$root/build-gemma-generation-parity"
runtime="$root/runtime/gemma-vulkan-f32-0bdd7cd8b/runtime"
model="$root/../models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf"
draft="$root/../models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf"
unit=gemma-generation-parity-finalize.service
production=llama-gemma-zero-copy.service
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus

restore() {
    local rc=$?
    systemctl --user stop "$unit" >/dev/null 2>&1 || true
    systemctl --user reset-failed "$unit" >/dev/null 2>&1 || true
    systemctl --user start "$production" >/dev/null 2>&1 || true
    local ready=0
    for _ in $(seq 1 180); do
        if curl -fsS http://127.0.0.1:18094/health > "$out/finalize-restored-health.json" 2>/dev/null; then
            ready=1
            break
        fi
        sleep 1
    done
    systemctl --user show "$production" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemorySwapCurrent -p MemorySwapPeak > "$out/finalize-restored-service.txt" 2>&1 || true
    [[ $ready == 1 ]] || rc=1
    exit "$rc"
}
trap restore EXIT INT TERM

# Revalidate, but do not rerun, the passed behavioural suite.
jq -e '.passed == true and (.results | length) == 7 and all(.results[]; .status == 200 and .data.zero_copy.copied_bytes == 0)' "$out/nonstream.json" >/dev/null
jq -e '.passed == true and .progress_count >= 1 and .content_count >= 2 and .zero_copy.copied_bytes == 0' "$out/stream.json" >/dev/null
jq -e '.passed == true and .finish_reason == "tool_calls" and .zero_copy.copied_bytes == 0' "$out/stream-tool.json" >/dev/null
jq -e '.passed == true and .cancellation.content_events_before_abort >= 3 and .recovery.content == "RECOVERED" and .serial.second_finished_ms >= .serial.first_finished_ms' "$out/cancel-serial.json" >/dev/null
jq -e '.status == "ok" and .round == 0 and .handoffs > 0 and .shared_bytes > 0 and .copied_bytes == 0' "$out/health-after.json" >/dev/null

systemctl --user stop "$production"
systemd-run --user --unit "$unit" --collect \
  -p Type=simple -p TimeoutStopSec=30 -p MemoryMax=16G -p MemorySwapMax=0 -p TasksMax=256 \
  --setenv=LD_LIBRARY_PATH="$build/bin:$runtime" \
  --setenv=GGML_VK_VISIBLE_DEVICES=0 --setenv=GGML_VK_EXPERIMENTAL_ATTN_MODE=f32 \
  "$build/bin/llama-gemma-zero-copy-server" \
    --model "$model" --draft "$draft" --alias gemma-4-e4b-qat-mtp-zero-copy \
    --host 127.0.0.1 --port 19095 --ctx-size 32768 --batch-size 256 --ubatch-size 256 \
    --threads 8 --threads-batch 16 --draft-max 3 --draft-min 1 \
    --threadpools 0 --model-sampling 1 --max-output 2048 > "$out/finalize-systemd-run.txt"
ready=0
for _ in $(seq 1 180); do
    if curl -fsS http://127.0.0.1:19095/health > "$out/finalize-health-before.json" 2>/dev/null; then ready=1; break; fi
    sleep 1
done
[[ $ready == 1 ]]
curl -fsS http://127.0.0.1:19095/v1/chat/completions \
  -H 'Content-Type: application/json' -H 'X-Conversation-Id: qualify-finalize' \
  -d '{"model":"gemma-4-e4b-qat-mtp-zero-copy","messages":[{"role":"user","content":"Reply with exactly QUALIFIED"}],"temperature":0,"max_tokens":32,"stream":false}' \
  > "$out/finalize-response.json"
jq -e '.choices[0].message.content == "QUALIFIED" and .zero_copy.zero_copy == true and .zero_copy.copied_bytes == 0' "$out/finalize-response.json"
curl -fsS http://127.0.0.1:19095/health > "$out/finalize-health-after.json"
jq -e '.status == "ok" and .vulkan_model_resident == true and .zero_copy_ready == true and .shared_bytes > 0 and .copied_bytes == 0' "$out/finalize-health-after.json"
systemctl --user show "$unit" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent -p MemorySwapPeak > "$out/service.txt"
for expected in ActiveState=active SubState=running NRestarts=0 MemorySwapCurrent=0 MemorySwapPeak=0; do grep -Fx "$expected" "$out/service.txt"; done
pid=$(sed -n 's/^MainPID=//p' "$out/service.txt")
{
    printf 'commit=%s\npid=%s\nargv=' "$(git -C "$root" rev-parse HEAD)" "$pid"
    tr '\0' ' ' < "/proc/$pid/cmdline"
    printf '\nexe='; readlink -f "/proc/$pid/exe"
    sha256sum "/proc/$pid/exe"
    grep -E 'lib(llama|ggml|omp|vulkan)' "/proc/$pid/maps" | awk '{print $6}' | sort -u
} > "$out/runtime-identity.txt"
journalctl --user -u "$unit" --no-pager > "$out/finalize-journal.txt"
sha256sum "$out"/* > "$out/SHA256SUMS"
touch "$out/complete"
