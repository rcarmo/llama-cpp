#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Run the exact historical Gemma 512/64 fixture with its original server topology","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
out="$root/benchmarks/intel-1340p/gemma-generation-parity-20260916/historical-topology"
build="$root/build-gemma-generation-parity"
runtime="$root/runtime/gemma-vulkan-f32-0bdd7cd8b/runtime"
model="$root/../models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf"
draft="$root/../models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf"
fixture="$root/benchmarks/intel-1340p/gemma-generation-parity-20260916/fixtures/historical-completion-512-64.json"
production=llama-gemma-zero-copy.service
mkdir -p "$out/runs" "$out/cache"
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus

restore() {
    local rc=$?
    for unit in $(systemctl --user list-units --all --plain --no-legend 'gemma-parity-topology-*.service' 2>/dev/null | awk '{print $1}'); do
        systemctl --user stop "$unit" >/dev/null 2>&1 || true
        systemctl --user reset-failed "$unit" >/dev/null 2>&1 || true
    done
    systemctl --user start "$production" >/dev/null 2>&1 || true
    local ready=0
    for _ in $(seq 1 180); do if curl -fsS http://127.0.0.1:18094/health > "$out/restored-health.json" 2>/dev/null; then ready=1; break; fi; sleep 1; done
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
    printf 'sequence\tprompt_tps\tgeneration_tps\tprompt_n\tpredicted_n\tdrafted\taccepted\tacceptance\twall_s\tmemory_peak\tswap_peak\ttemp_before_c\ttemp_after_c\tcontent_sha256\n' > "$out/results.tsv"
fi

run_one() {
    local seq=$1
    local port=$((18400+seq))
    local unit="gemma-parity-topology-${seq}.service"
    local dir="$out/runs/$(printf '%02d' "$seq")"
    if [[ -e "$dir/complete" ]]; then awk -F '\t' -v seq="$seq" 'NR>1&&$1==seq{f=1}END{exit !f}' "$out/results.tsv"; return; fi
    [[ ! -e "$dir" ]]; mkdir -p "$dir"
    [[ $(awk '/MemAvailable:/{print $2}' /proc/meminfo) -ge 12582912 ]]
    local temp_before
    temp_before=$(sensors -j | jq '[..|objects|to_entries[]?|select(.key|test("temp[0-9]+_input"))|.value]|max')
    printf '%s\n' "$temp_before" > "$dir/temp-before-c.txt"
    systemd-run --user --unit "$unit" --collect \
      -p Type=simple -p TimeoutStopSec=30 -p MemoryMax=16G -p MemorySwapMax=0 -p TasksMax=256 \
      --setenv=LD_LIBRARY_PATH="$build/bin:$runtime" \
      "$build/bin/llama-server" --model "$model" --model-draft "$draft" \
        --alias gemma-parity-historical --load-mode mmap --gpu-layers 0 \
        --threads 8 --cpu-range 0-7 --cpu-strict 1 \
        --threads-batch 8 --cpu-range-batch 0-7 --cpu-strict-batch 1 \
        --ctx-size 262144 --parallel 2 --no-kv-unified --cont-batching \
        --batch-size 1024 --ubatch-size 256 --cache-type-k f16 --cache-type-v f16 --flash-attn off \
        --spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max 3 \
        --spec-draft-threads 8 --spec-draft-threads-batch 8 \
        --spec-draft-cpu-range 0-7 --spec-draft-cpu-strict 1 \
        --spec-draft-cpu-mask-batch ff --spec-draft-cpu-strict-batch 1 \
        --spec-draft-type-k f16 --spec-draft-type-v f16 \
        --cache-prompt --cache-ram 12288 --cache-reuse 256 --ctx-checkpoints 32 \
        --checkpoint-min-step 8192 --cache-idle-slots --slot-save-path "$out/cache" \
        --metrics --slots --no-ui --no-warmup --timeout 10800 \
        --host 127.0.0.1 --port "$port" > "$dir/systemd-run.txt"
    local ready=0
    for _ in $(seq 1 180); do if curl -fsS "http://127.0.0.1:$port/health" > "$dir/health.json" 2>/dev/null; then ready=1; break; fi; sleep 1; done
    [[ $ready == 1 ]]
    curl -fsS "http://127.0.0.1:$port/slots" > "$dir/slots-before.json"
    jq -e 'length == 2 and all(.[]; .n_ctx == 131072)' "$dir/slots-before.json"
    local start end
    start=$(date +%s%N)
    curl --max-time 120 -fsS "http://127.0.0.1:$port/completion" -H 'Content-Type: application/json' --data-binary @"$fixture" > "$dir/response.json"
    end=$(date +%s%N)
    awk -v s="$start" -v e="$end" 'BEGIN{printf "%.9f\n",(e-s)/1e9}' > "$dir/client-wall-s.txt"
    jq -e '.timings.prompt_n == 512 and .timings.predicted_n == 64 and .timings.draft_n == 55 and .timings.draft_n_accepted == 43' "$dir/response.json"
    jq -r '.content' "$dir/response.json" | sha256sum | cut -d' ' -f1 > "$dir/content-sha256.txt"
    grep -Fx '35f6d4194c1e9170ab5104d67b191ce47cee554fb21463d3f7d61cf86c2beddf' "$dir/content-sha256.txt"
    systemctl --user show "$unit" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent -p MemorySwapPeak > "$dir/service.txt"
    local swap_peak memory_peak temp_after
    swap_peak=$(sed -n 's/^MemorySwapPeak=//p' "$dir/service.txt"); [[ $swap_peak == 0 ]]
    memory_peak=$(sed -n 's/^MemoryPeak=//p' "$dir/service.txt")
    journalctl --user -u "$unit" --no-pager > "$dir/journal.txt"
    temp_after=$(sensors -j | jq '[..|objects|to_entries[]?|select(.key|test("temp[0-9]+_input"))|.value]|max')
    local prompt_tps generation_tps prompt_n predicted_n drafted accepted acceptance wall hash
    prompt_tps=$(jq -r '.timings.prompt_per_second' "$dir/response.json")
    generation_tps=$(jq -r '.timings.predicted_per_second' "$dir/response.json")
    prompt_n=$(jq -r '.timings.prompt_n' "$dir/response.json"); predicted_n=$(jq -r '.timings.predicted_n' "$dir/response.json")
    drafted=$(jq -r '.timings.draft_n' "$dir/response.json"); accepted=$(jq -r '.timings.draft_n_accepted' "$dir/response.json")
    acceptance=$(awk -v a="$accepted" -v d="$drafted" 'BEGIN{printf "%.9f",a/d}')
    wall=$(cat "$dir/client-wall-s.txt"); hash=$(cat "$dir/content-sha256.txt")
    printf '%d\t%.9f\t%.9f\t%d\t%d\t%d\t%d\t%s\t%.9f\t%s\t%s\t%s\t%s\t%s\n' "$seq" "$prompt_tps" "$generation_tps" "$prompt_n" "$predicted_n" "$drafted" "$accepted" "$acceptance" "$wall" "$memory_peak" "$swap_peak" "$temp_before" "$temp_after" "$hash" >> "$out/results.tsv"
    sha256sum "$dir"/* > "$dir/SHA256SUMS"; touch "$dir/complete"
    systemctl --user stop "$unit"; systemctl --user reset-failed "$unit" >/dev/null 2>&1 || true; sleep 2
}

run_one 1
run_one 2
run_one 3
run_one 4
sha256sum "$out/results.tsv" > "$out/SHA256SUMS"
