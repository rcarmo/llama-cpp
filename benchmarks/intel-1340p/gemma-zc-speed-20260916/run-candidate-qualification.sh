#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Qualify the accepted Gemma generation-parity stack before deployment","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
campaign="$root/benchmarks/intel-1340p/gemma-zc-speed-20260916"
out="$campaign/qualification"
build="$root/build-gemma-zc-speed"
runtime="$root/runtime/gemma-vulkan-f32-0bdd7cd8b/runtime"
model="$root/../models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf"
draft="$root/../models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf"
production=llama-gemma-zero-copy.service
unit=gemma-q4-schedule-qualification.service
port=20094
base="http://127.0.0.1:$port"

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
        if curl -fsS http://127.0.0.1:18094/health > "$out/restored-health.json" 2>/dev/null; then
            ready=1
            break
        fi
        sleep 1
    done
    systemctl --user show "$production" \
      -p ActiveState -p SubState -p MainPID -p NRestarts \
      -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent -p MemorySwapPeak \
      > "$out/restored-service.txt" 2>&1 || true
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
[[ $(find "$root/build-gemma-zero-copy-vulkan/tools/ui/dist" -type f | wc -l) -eq 70 ]]
grep -Fx '#define LLAMA_UI_HAS_ASSETS 1' "$root/build-gemma-generation-parity/tools/ui/ui.h"
grep -Fx 'const std::array<llama_ui_asset, 70> & llama_ui_get_assets();' "$root/build-gemma-generation-parity/tools/ui/ui.h"

systemctl --user stop "$production"
systemd-run --user --unit "$unit" --collect \
  -p Type=simple -p TimeoutStopSec=30 -p MemoryMax=16G -p MemorySwapMax=0 -p TasksMax=256 \
  --setenv=LD_LIBRARY_PATH="$build/bin:$runtime" \
  --setenv=GGML_VK_VISIBLE_DEVICES=0 \
  --setenv=GGML_VK_EXPERIMENTAL_ATTN_MODE=f32 \
  --setenv=GGML_CPU_EXPERIMENTAL_Q4_N4_SCHEDULE=1 --setenv=GGML_CPU_Q4_N4_SCHEDULE_TRACE=1 \
  "$build/bin/llama-gemma-zero-copy-server" \
    --model "$model" --draft "$draft" \
    --alias gemma-4-e4b-qat-mtp-zero-copy \
    --host 127.0.0.1 --port "$port" \
    --ctx-size 32768 --batch-size 256 --ubatch-size 256 \
    --threads 8 --threads-batch 16 \
    --draft-max 3 --draft-min 1 \
    --threadpools 0 --model-sampling 1 \
    --max-output 2048 > "$out/systemd-run.txt"

ready=0
for _ in $(seq 1 180); do
    if curl -fsS "$base/health" > "$out/health-before.json" 2>/dev/null; then
        ready=1
        break
    fi
    sleep 1
done
[[ $ready == 1 ]]

curl -fsS "$base/props" > "$out/props.json"
jq -e '.default_generation_settings.params |
  .top_k == 64 and .["speculative.n_min"] == 1 and
  .threadpools == false and .model_sampling == true and
  .backend_sampling == false' "$out/props.json"

curl -fsS -H 'Accept-Encoding: gzip' -D "$out/ui-headers.txt" "$base/" > "$out/ui-index.html.gz"
grep -qi '^Content-Type: text/html' "$out/ui-headers.txt"
grep -qi '^Content-Encoding: gzip' "$out/ui-headers.txt"
[[ $(wc -c < "$out/ui-index.html.gz") -ge 1000 ]]
gzip -dc "$out/ui-index.html.gz" > "$out/ui-index.html"
grep -qi '<!doctype html' "$out/ui-index.html"

GEMMA_ZERO_COPY_URL="$base" bun "$root/tools/gemma-hybrid/qualify-service.ts" > "$out/nonstream.json"
jq -e '.passed == true and (.results | length) == 7 and
  all(.results[]; .status == 200 and .data.zero_copy.copied_bytes == 0)' "$out/nonstream.json"

GEMMA_ZERO_COPY_URL="$base" bun "$root/tools/gemma-hybrid/verify-stream.ts" > "$out/stream.json"
jq -e '.passed == true and .progress_count >= 1 and .content_count >= 2 and
  .first_content_ms < .final_ms and .zero_copy.copied_bytes == 0 and .zero_copy.zero_copy == true' "$out/stream.json"
curl -fsS -X DELETE -H 'X-Conversation-Id: verify-live-stream' "$base/v1/stream" > "$out/stream-reset.json"

GEMMA_ZERO_COPY_URL="$base" bun "$root/tools/gemma-hybrid/verify-stream-tool.ts" > "$out/stream-tool.json"
jq -e '.passed == true and .calls[0].function.name == "get_temperature" and
  .finish_reason == "tool_calls" and .zero_copy.copied_bytes == 0 and .zero_copy.zero_copy == true' "$out/stream-tool.json"
curl -fsS -X DELETE -H 'X-Conversation-Id: verify-stream-tool' "$base/v1/stream" > "$out/stream-tool-reset.json"

GEMMA_ZERO_COPY_URL="$base" bun "$campaign/qualify-cancel-serial.ts" > "$out/cancel-serial.json"
jq -e '.passed == true and .cancellation.content_events_before_abort >= 3 and
  .recovery.content == "RECOVERED" and .recovery.zero_copy.copied_bytes == 0 and
  .serial.first_content_events >= 2 and
  .serial.second_finished_ms >= .serial.first_finished_ms and
  .serial.first_zero_copy.copied_bytes == 0 and .serial.second_zero_copy.copied_bytes == 0' \
  "$out/cancel-serial.json"

curl -fsS "$base/health" > "$out/health-after.json"
jq -e '.status == "ok" and .processing == false and
  .vulkan_model_resident == true and .round == 0 and .zero_copy_ready == false and
  .handoffs > 0 and .shared_bytes > 0 and .copied_bytes == 0' "$out/health-after.json"

systemctl --user show "$unit" \
  -p ActiveState -p SubState -p MainPID -p NRestarts \
  -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent -p MemorySwapPeak \
  > "$out/service.txt"
grep -Fx 'ActiveState=active' "$out/service.txt"
grep -Fx 'SubState=running' "$out/service.txt"
grep -Fx 'NRestarts=0' "$out/service.txt"
grep -Fx 'MemorySwapCurrent=0' "$out/service.txt"
grep -Fx 'MemorySwapPeak=0' "$out/service.txt"

pid=$(sed -n 's/^MainPID=//p' "$out/service.txt")
{
    printf 'commit=%s\n' "$(git -C "$root" rev-parse HEAD)"
    printf 'pid=%s\n' "$pid"
    printf 'argv='; tr '\0' ' ' < "/proc/$pid/cmdline"; printf '\n'
    printf 'exe='; readlink -f "/proc/$pid/exe"
    sha256sum "/proc/$pid/exe"
    grep -E 'lib(llama|ggml|omp|vulkan)' "/proc/$pid/maps" | awk '{print $6}' | sort -u
} > "$out/runtime-identity.txt"

journalctl --user -u "$unit" --no-pager > "$out/journal.txt"
sha256sum "$out"/* > "$out/SHA256SUMS"
touch "$out/complete"
