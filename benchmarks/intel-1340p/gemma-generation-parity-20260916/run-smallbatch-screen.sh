#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Screen isolated Gemma small-target-batch dispatch on the zero-copy service","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
out="$root/benchmarks/intel-1340p/gemma-generation-parity-20260916/smallbatch-screen"
build="$root/build-gemma-generation-parity"
runtime="$root/runtime/gemma-vulkan-f32-0bdd7cd8b/runtime"
model="$root/../models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf"
draft="$root/../models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf"
fixture="$root/benchmarks/intel-1340p/gemma-generation-parity-20260916/fixtures/sustained-chat-512.json"
production=llama-gemma-zero-copy.service
mkdir -p "$out/runs"

export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus

restore() {
    local rc=$?
    for unit in $(systemctl --user list-units --all --plain --no-legend 'gemma-parity-smallbatch-*.service' 2>/dev/null | awk '{print $1}'); do
        systemctl --user stop "$unit" >/dev/null 2>&1 || true
        systemctl --user reset-failed "$unit" >/dev/null 2>&1 || true
    done
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

if [[ ! -s "$out/results.tsv" ]]; then
    printf 'sequence\tarm\tflag\tdecode_tps\twall_s\tprefill_s\tdrafted\taccepted\tacceptance\tmemory_peak\tswap_peak\ttemp_before_c\ttemp_after_c\tcontent_sha256\n' > "$out/results.tsv"
fi

run_one() {
    local seq=$1 arm=$2 flag=$3
    local port=$((18200 + seq)) unit="gemma-parity-smallbatch-${seq}.service"
    local dir="$out/runs/$(printf '%02d-%s' "$seq" "$arm")"
    if [[ -e "$dir/complete" ]]; then
        awk -F '\t' -v seq="$seq" 'NR > 1 && $1 == seq { found=1 } END { exit !found }' "$out/results.tsv"
        return
    fi
    [[ ! -e "$dir" ]]
    mkdir -p "$dir"
    [[ $(awk '/MemAvailable:/{print $2}' /proc/meminfo) -ge 12582912 ]]
    local temp_before
    temp_before=$(sensors -j | jq '[.. | objects | to_entries[]? | select(.key|test("temp[0-9]+_input")) | .value] | max')
    printf '%s\n' "$temp_before" > "$dir/temp-before-c.txt"

    local env_args=()
    if [[ $flag == 1 ]]; then env_args+=(--setenv=LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH=1); fi
    systemd-run --user --unit "$unit" --collect \
      -p Type=simple -p TimeoutStopSec=30 -p MemoryMax=16G -p MemorySwapMax=0 -p TasksMax=256 \
      --setenv=LD_LIBRARY_PATH="$build/bin:$runtime" --setenv=GGML_VK_VISIBLE_DEVICES=0 \
      --setenv=GGML_VK_EXPERIMENTAL_ATTN_MODE=f32 "${env_args[@]}" \
      "$build/bin/llama-gemma-zero-copy-server" \
        --model "$model" --draft "$draft" --alias "gemma-parity-smallbatch-$arm" \
        --host 127.0.0.1 --port "$port" --ctx-size 32768 --batch-size 256 --ubatch-size 256 \
        --threads 8 --threads-batch 16 --draft-max 3 --draft-min 1 \
        --threadpools 1 --model-sampling 1 --max-output 2048 > "$dir/systemd-run.txt"
    local ready=0
    for _ in $(seq 1 180); do if curl -fsS "http://127.0.0.1:$port/health" > "$dir/health-before.json" 2>/dev/null; then ready=1; break; fi; sleep 1; done
    [[ $ready == 1 ]]
    curl -fsS "http://127.0.0.1:$port/props" > "$dir/props.json"
    jq -e '.default_generation_settings.params | .top_k == 64 and .["speculative.n_min"] == 1 and .threadpools == true' "$dir/props.json"
    local start end
    start=$(date +%s%N)
    curl --max-time 180 -fsS "http://127.0.0.1:$port/v1/chat/completions" \
      -H 'Content-Type: application/json' -H "X-Conversation-Id: parity-smallbatch-$seq" \
      --data-binary @"$fixture" > "$dir/response.json"
    end=$(date +%s%N)
    awk -v s="$start" -v e="$end" 'BEGIN { printf "%.9f\n", (e-s)/1000000000 }' > "$dir/client-wall-s.txt"
    jq -e '.usage.completion_tokens == 512 and .choices[0].finish_reason == "length" and
      .zero_copy.shared_bytes > 0 and .zero_copy.copied_bytes == 0 and .zero_copy.zero_copy == true and
      .zero_copy.drafted == 385 and .zero_copy.accepted == 382' "$dir/response.json"
    jq -r '.choices[0].message.content' "$dir/response.json" | sha256sum | cut -d' ' -f1 > "$dir/content-sha256.txt"
    systemctl --user show "$unit" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent -p MemorySwapPeak > "$dir/service.txt"
    local swap_peak memory_peak
    swap_peak=$(sed -n 's/^MemorySwapPeak=//p' "$dir/service.txt"); [[ $swap_peak == 0 ]]
    memory_peak=$(sed -n 's/^MemoryPeak=//p' "$dir/service.txt")
    journalctl --user -u "$unit" --no-pager > "$dir/journal.txt"
    local temp_after decode wall prefill drafted accepted acceptance hash
    temp_after=$(sensors -j | jq '[.. | objects | to_entries[]? | select(.key|test("temp[0-9]+_input")) | .value] | max')
    decode=$(jq -r '.zero_copy.decode_tps' "$dir/response.json")
    wall=$(jq -r '.zero_copy.wall_s' "$dir/response.json")
    prefill=$(jq -r '.zero_copy.prefill_s' "$dir/response.json")
    drafted=$(jq -r '.zero_copy.drafted' "$dir/response.json")
    accepted=$(jq -r '.zero_copy.accepted' "$dir/response.json")
    acceptance=$(awk -v a="$accepted" -v d="$drafted" 'BEGIN {printf "%.9f",a/d}')
    hash=$(cat "$dir/content-sha256.txt")
    printf '%d\t%s\t%d\t%.9f\t%.9f\t%.9f\t%d\t%d\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$seq" "$arm" "$flag" "$decode" "$wall" "$prefill" "$drafted" "$accepted" "$acceptance" "$memory_peak" "$swap_peak" "$temp_before" "$temp_after" "$hash" >> "$out/results.tsv"
    sha256sum "$dir"/* > "$dir/SHA256SUMS"
    touch "$dir/complete"
    systemctl --user stop "$unit"
    systemctl --user reset-failed "$unit" >/dev/null 2>&1 || true
    sleep 2
}

run_one 1 off 0
run_one 2 on 1
run_one 3 on 1
run_one 4 off 0
sha256sum "$out/results.tsv" > "$out/SHA256SUMS"
