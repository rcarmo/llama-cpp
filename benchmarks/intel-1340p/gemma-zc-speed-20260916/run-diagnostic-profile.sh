#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Profile current ZC1 sustained CPU+MTP decode with existing diagnostic instrumentation","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
campaign="$root/benchmarks/intel-1340p/gemma-zc-speed-20260916"
out="$campaign/profile-shapes"
build="$root/build-gemma-zc-speed"
runtime="$root/runtime/gemma-vulkan-f32-0bdd7cd8b/runtime"
model="$root/../models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf"
draft="$root/../models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf"
fixture="$campaign/baseline/sustained-chat-512.json"
production=llama-gemma-zero-copy.service
unit=gemma-zc-shape-profile.service
mkdir -p "$out"
[[ ! -e "$out/complete" ]]
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
restore() {
    local rc=$?
    systemctl --user stop "$unit" >/dev/null 2>&1 || true
    systemctl --user reset-failed "$unit" >/dev/null 2>&1 || true
    systemctl --user start "$production" >/dev/null 2>&1 || true
    local ready=0
    for _ in $(seq 1 180); do
        if curl -fsS http://127.0.0.1:18094/health > "$out/restored-health.json" 2>/dev/null; then ready=1; break; fi
        sleep 1
    done
    systemctl --user show "$production" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemorySwapCurrent -p MemorySwapPeak > "$out/restored-service.txt" 2>&1 || true
    [[ $ready == 1 ]] || rc=1
    exit "$rc"
}
trap restore EXIT INT TERM
systemctl --user is-active --quiet "$production"
[[ $(systemctl --user show whisper-stt.service -p ActiveState --value) == inactive ]]
[[ $(systemctl --user show whisper-stt-diarizer.service -p ActiveState --value) == inactive ]]
! pgrep -x diar-server >/dev/null
! pgrep -x whisper-cli >/dev/null
[[ $(awk '/MemAvailable:/{print $2}' /proc/meminfo) -ge 12582912 ]]
systemctl --user stop "$production"
systemd-run --user --unit "$unit" --collect \
  -p Type=simple -p TimeoutStopSec=30 -p MemoryMax=16G -p MemorySwapMax=0 -p TasksMax=256 \
  --setenv=LD_LIBRARY_PATH="$build/bin:$runtime" \
  --setenv=GGML_VK_VISIBLE_DEVICES=0 --setenv=GGML_VK_EXPERIMENTAL_ATTN_MODE=f32 \
  --setenv=GGML_CPU_WHOLE_TOKEN_PROFILE=1 --setenv=GGML_SPECULATIVE_PROFILE=1 \
  "$build/bin/llama-gemma-zero-copy-server" \
    --model "$model" --draft "$draft" --alias gemma-4-e4b-qat-mtp-zero-copy \
    --host 127.0.0.1 --port 19202 --ctx-size 32768 --batch-size 256 --ubatch-size 256 \
    --threads 8 --threads-batch 16 --draft-max 3 --draft-min 1 \
    --threadpools 0 --model-sampling 1 --max-output 2048 > "$out/systemd-run.txt"
ready=0
for _ in $(seq 1 180); do
    if curl -fsS http://127.0.0.1:19202/health > "$out/health-before.json" 2>/dev/null; then ready=1; break; fi
    sleep 1
done
[[ $ready == 1 ]]
curl --max-time 300 -fsS http://127.0.0.1:19202/v1/chat/completions \
  -H 'Content-Type: application/json' -H 'X-Conversation-Id: diagnostic-profile' \
  --data-binary @"$fixture" > "$out/response.json"
jq -e '.usage.completion_tokens == 512 and .zero_copy.drafted == 385 and .zero_copy.accepted == 382 and .zero_copy.copied_bytes == 0' "$out/response.json"
systemctl --user show "$unit" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent -p MemorySwapPeak > "$out/service-before-stop.txt"
grep -Fx 'MemorySwapPeak=0' "$out/service-before-stop.txt"
systemctl --user stop "$unit"
journalctl --user -u "$unit" --no-pager > "$out/journal.txt"
grep 'GGML_CPU_WHOLE_TOKEN_PROFILE kind=total' "$out/journal.txt" > "$out/cpu-total.txt"
grep 'GGML_CPU_WHOLE_TOKEN_PROFILE kind=family' "$out/journal.txt" > "$out/cpu-families.txt"
grep 'GGML_CPU_WHOLE_TOKEN_PROFILE kind=op' "$out/journal.txt" > "$out/cpu-ops.txt"
grep 'GGML_CPU_WHOLE_TOKEN_PROFILE kind=mul_mat_shape' "$out/journal.txt" > "$out/mul-mat-shapes.txt"
grep 'GGML_SPECULATIVE_PROFILE phase=' "$out/journal.txt" > "$out/speculative-phases.txt"
grep 'GEMMA_ZERO_COPY_PROFILE ' "$out/journal.txt" > "$out/service-phases.txt"
sha256sum "$out"/* > "$out/SHA256SUMS"
touch "$out/complete"
