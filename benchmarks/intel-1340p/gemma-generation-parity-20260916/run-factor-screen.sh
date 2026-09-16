#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Run bounded fresh-process Gemma generation-parity factor screens","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
out="$root/benchmarks/intel-1340p/gemma-generation-parity-20260916/factor-screen"
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
    for unit in $(systemctl --user list-units --all --plain --no-legend 'gemma-parity-factor-*.service' 2>/dev/null | awk '{print $1}'); do
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
    if [[ $ready != 1 ]]; then rc=1; fi
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
    printf 'sequence\tfactor\tarm\tthreadpools\tmodel_sampling\tdraft_min\tdecode_tps\twall_s\tdrafted\taccepted\tacceptance\tmemory_peak\tswap_peak\ttemp_before_c\ttemp_after_c\tcontent_sha256\n' > "$out/results.tsv"
fi

run_one() {
    local seq=$1 factor=$2 arm=$3 pools=$4 sampling=$5 draft_min=$6
    local port=$((18100 + seq))
    local unit="gemma-parity-factor-${seq}.service"
    local dir="$out/runs/$(printf '%02d-%s-%s' "$seq" "$factor" "$arm")"
    if [[ -e "$dir/complete" ]]; then
        if awk -F '\t' -v seq="$seq" 'NR > 1 && $1 == seq { found = 1 } END { exit !found }' "$out/results.tsv"; then
            return 0
        fi
        echo "complete marker without result row: $dir" >&2
        return 1
    fi
    [[ ! -e "$dir" ]]
    mkdir -p "$dir"
    [[ $(awk '/MemAvailable:/{print $2}' /proc/meminfo) -ge 12582912 ]]
    ! pgrep -x diar-server >/dev/null
    ! pgrep -x whisper-cli >/dev/null
    local temp_before
    temp_before=$(sensors -j | jq '[.. | objects | to_entries[]? | select(.key|test("temp[0-9]+_input")) | .value] | max')
    printf '%s\n' "$temp_before" > "$dir/temp-before-c.txt"

    systemd-run --user --unit "$unit" --collect \
      -p Type=simple -p TimeoutStopSec=30 -p MemoryMax=16G -p MemorySwapMax=0 -p TasksMax=256 \
      --setenv=LD_LIBRARY_PATH="$build/bin:$runtime" \
      --setenv=GGML_VK_VISIBLE_DEVICES=0 --setenv=GGML_VK_EXPERIMENTAL_ATTN_MODE=f32 \
      "$build/bin/llama-gemma-zero-copy-server" \
        --model "$model" --draft "$draft" --alias "gemma-parity-$factor-$arm" \
        --host 127.0.0.1 --port "$port" --ctx-size 32768 --batch-size 256 --ubatch-size 256 \
        --threads 8 --threads-batch 16 --draft-max 3 --draft-min "$draft_min" \
        --threadpools "$pools" --model-sampling "$sampling" --max-output 2048 > "$dir/systemd-run.txt"

    local ready=0
    for _ in $(seq 1 180); do
        if curl -fsS "http://127.0.0.1:$port/health" > "$dir/health-before.json" 2>/dev/null; then ready=1; break; fi
        sleep 1
    done
    [[ $ready == 1 ]]
    curl -fsS "http://127.0.0.1:$port/props" > "$dir/props.json"
    local expected_top_k=40
    if [[ $sampling == 1 ]]; then expected_top_k=64; fi
    jq -e --argjson p "$pools" --argjson s "$sampling" --argjson m "$draft_min" --argjson k "$expected_top_k" '
      .default_generation_settings.params |
      .threadpools == ($p == 1) and .model_sampling == ($s == 1) and
      .["speculative.n_min"] == $m and .top_k == $k and .backend_sampling == false
    ' "$dir/props.json"

    local start end
    start=$(date +%s%N)
    curl --max-time 180 -fsS "http://127.0.0.1:$port/v1/chat/completions" \
      -H 'Content-Type: application/json' -H "X-Conversation-Id: parity-factor-$seq" \
      --data-binary @"$fixture" > "$dir/response.json"
    end=$(date +%s%N)
    awk -v s="$start" -v e="$end" 'BEGIN { printf "%.9f\n", (e-s)/1000000000 }' > "$dir/client-wall-s.txt"
    jq -e '.usage.completion_tokens == 512 and .choices[0].finish_reason == "length" and
      .zero_copy.route == "vulkan_prefill_cpu_mtp" and .zero_copy.shared_bytes > 0 and
      .zero_copy.copied_bytes == 0 and .zero_copy.zero_copy == true and .zero_copy.drafted > 0' "$dir/response.json"
    jq -r '.choices[0].message.content' "$dir/response.json" | sha256sum | cut -d' ' -f1 > "$dir/content-sha256.txt"
    curl -fsS "http://127.0.0.1:$port/health" > "$dir/health-after.json"
    systemctl --user show "$unit" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent -p MemorySwapPeak > "$dir/service.txt"
    local swap_peak
    swap_peak=$(sed -n 's/^MemorySwapPeak=//p' "$dir/service.txt")
    [[ $swap_peak == 0 ]]
    journalctl --user -u "$unit" --no-pager > "$dir/journal.txt"
    local temp_after
    temp_after=$(sensors -j | jq '[.. | objects | to_entries[]? | select(.key|test("temp[0-9]+_input")) | .value] | max')
    printf '%s\n' "$temp_after" > "$dir/temp-after-c.txt"

    local decode wall drafted accepted memory_peak hash acceptance
    decode=$(jq -r '.zero_copy.decode_tps' "$dir/response.json")
    wall=$(jq -r '.zero_copy.wall_s' "$dir/response.json")
    drafted=$(jq -r '.zero_copy.drafted' "$dir/response.json")
    accepted=$(jq -r '.zero_copy.accepted' "$dir/response.json")
    memory_peak=$(sed -n 's/^MemoryPeak=//p' "$dir/service.txt")
    hash=$(cat "$dir/content-sha256.txt")
    acceptance=$(awk -v a="$accepted" -v d="$drafted" 'BEGIN { printf "%.9f", a/d }')
    printf '%d\t%s\t%s\t%d\t%d\t%d\t%.9f\t%.9f\t%d\t%d\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$seq" "$factor" "$arm" "$pools" "$sampling" "$draft_min" "$decode" "$wall" "$drafted" "$accepted" "$acceptance" "$memory_peak" "$swap_peak" "$temp_before" "$temp_after" "$hash" >> "$out/results.tsv"
    sha256sum "$dir"/* > "$dir/SHA256SUMS"
    touch "$dir/complete"
    systemctl --user stop "$unit"
    systemctl --user reset-failed "$unit" >/dev/null 2>&1 || true
    sleep 2
}

# Four-run ABBA screens. Only the named factor differs within each block.
run_one 1 threadpools off 0 1 1
run_one 2 threadpools on  1 1 1
run_one 3 threadpools on  1 1 1
run_one 4 threadpools off 0 1 1
run_one 5 model-sampling off 1 0 1
run_one 6 model-sampling on  1 1 1
run_one 7 model-sampling on  1 1 1
run_one 8 model-sampling off 1 0 1
run_one 9  draft-min off 1 1 0
run_one 10 draft-min on  1 1 1
run_one 11 draft-min on  1 1 1
run_one 12 draft-min off 1 1 0

sha256sum "$out/results.tsv" > "$out/SHA256SUMS"
