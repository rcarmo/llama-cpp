#!/usr/bin/env bash
set -euo pipefail
repo=/var/home/agent/workspace/projects/llama-cpp
out="$repo/benchmarks/intel-1340p/huihui-gemma4-12b-trial-20260917/tuning"
build="$repo/build-gemma-zc-speed"
runtime="$repo/runtime/gemma-vulkan-f32-0bdd7cd8b/runtime"
models=/var/home/agent/workspace/projects/models/huihui-gemma-4-12b-abliterated-qat
model="$models/Huihui-gemma-4-12B-it-qat-q4_0-unquantized-abliterated-Q4_K.gguf"
draft="$models/mtp-ggml-model-bf16.gguf"
trial=huihui-gemma4-12b-zero-copy.service
primary=llama-gemma-zero-copy.service
proxy=llama-gemma-lan-test.service
proxy_socket=llama-gemma-lan-test.socket
base=http://127.0.0.1:8094
export XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
mkdir -p "$out/profiles"
restore_primary() {
    local rc=$?
    systemctl --user stop "$trial" >/dev/null 2>&1 || true
    systemctl --user reset-failed "$trial" >/dev/null 2>&1 || true
    systemctl --user start "$primary" >/dev/null 2>&1 || true
    systemctl --user start "$proxy_socket" >/dev/null 2>&1 || true
    for _ in $(seq 1 240); do curl -fsS http://127.0.0.1:18094/health >/dev/null 2>&1 && break; sleep 1; done
    exit "$rc"
}
trap restore_primary EXIT INT TERM
systemctl --user stop "$proxy_socket" "$proxy" "$primary" >/dev/null 2>&1 || true

start_profile() {
    local threads=$1 depth=$2
    systemctl --user stop "$trial" >/dev/null 2>&1 || true
    systemctl --user reset-failed "$trial" >/dev/null 2>&1 || true
    systemd-run --user --unit "$trial" --collect \
      -p Type=simple -p TimeoutStopSec=30 -p MemoryMax=28G -p MemorySwapMax=0 -p TasksMax=256 \
      --setenv=LD_LIBRARY_PATH="$build/bin:$runtime" --setenv=GGML_VK_VISIBLE_DEVICES=0 \
      --setenv=GGML_VK_EXPERIMENTAL_ATTN_MODE=f32 --setenv=GGML_CPU_EXPERIMENTAL_Q4_N4_SCHEDULE=1 \
      "$build/bin/llama-gemma-zero-copy-server" --model "$model" --draft "$draft" \
      --alias huihui-gemma-4-12b-abliterated-zero-copy --host 0.0.0.0 --port 8094 \
      --ctx-size 8192 --batch-size 256 --ubatch-size 256 --threads "$threads" --threads-batch 16 \
      --draft-max "$depth" --draft-min 1 --threadpools 0 --model-sampling 1 --max-output 2048 >/dev/null
    local ready=0
    for _ in $(seq 1 360); do
        if curl -fsS "$base/health" >/dev/null 2>&1; then ready=1; break; fi
        [[ $(systemctl --user show "$trial" -p ActiveState --value) == failed ]] && break
        sleep 1
    done
    [[ $ready == 1 ]]
}

run_profile() {
    local name=$1 threads=$2 depth=$3 dir="$out/profiles/$1"
    mkdir -p "$dir"
    start_profile "$threads" "$depth"
    curl --max-time 300 -fsS "$base/v1/chat/completions" -H 'Content-Type: application/json' --data-binary @"$out/warmup.json" > "$dir/warmup.json"
    jq -e '.choices[0].message.content == "AUDIT_READY" and .zero_copy.zero_copy == true and .zero_copy.shared_bytes > 0 and .zero_copy.copied_bytes == 0' "$dir/warmup.json" >/dev/null
    for i in 1 2; do
        curl --max-time 300 -fsS "$base/v1/chat/completions" -H 'Content-Type: application/json' --data-binary @"$out/request.json" > "$dir/run-$i.json"
        jq -e '.zero_copy.zero_copy == true and .zero_copy.shared_bytes > 0 and .zero_copy.copied_bytes == 0 and .usage.completion_tokens == 256' "$dir/run-$i.json" >/dev/null
    done
    systemctl --user show "$trial" -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent -p MemorySwapPeak > "$dir/service.txt"
    grep -Fx 'NRestarts=0' "$dir/service.txt" >/dev/null
    grep -Fx 'MemorySwapCurrent=0' "$dir/service.txt" >/dev/null
    grep -Fx 'MemorySwapPeak=0' "$dir/service.txt" >/dev/null
    jq -s --arg name "$name" --argjson threads "$threads" --argjson depth "$depth" '
      [.[].zero_copy.decode_tps] as $t |
      {profile:$name,threads:$threads,depth:$depth,tps:$t,mean_tps:($t|add/length),
       output_hashes:[.[].choices[0].message.content]|map(@base64),
       generated:[.[].zero_copy.generated_tokens],drafted:[.[].zero_copy.drafted],accepted:[.[].zero_copy.accepted],
       shared:[.[].zero_copy.shared_bytes],copied:[.[].zero_copy.copied_bytes]}' "$dir"/run-*.json > "$dir/summary.json"
    jq -c '{profile,threads,depth,mean_tps,tps,generated,drafted,accepted,copied}' "$dir/summary.json"
}

cat > "$out/warmup.json" <<'JSON'
{"model":"huihui-gemma-4-12b-abliterated-zero-copy","messages":[{"role":"user","content":"Reply with exactly AUDIT_READY"}],"temperature":0,"seed":424242,"max_tokens":32,"stream":false,"chat_template_kwargs":{"enable_thinking":false}}
JSON
cat > "$out/request.json" <<'JSON'
{"model":"huihui-gemma-4-12b-abliterated-zero-copy","messages":[{"role":"user","content":"Write a concise security review of a local HTTP service that binds to a private LAN address. Include exactly five numbered findings, each with a threat, impact, and mitigation. Do not use tools."}],"temperature":0,"seed":424242,"max_tokens":256,"stream":false,"chat_template_kwargs":{"enable_thinking":false}}
JSON

profiles=(t6-d3:6:3 t8-d3:8:3 t10-d3:10:3 t12-d3:12:3 t8-d1:8:1 t8-d2:8:2 t8-d4:8:4)
: > "$out/screen.jsonl"
for spec in "${profiles[@]}"; do
    IFS=: read -r name threads depth <<<"$spec"
    run_profile "$name" "$threads" "$depth" | tee -a "$out/screen.jsonl"
done
jq -s 'sort_by(-.mean_tps)' "$out/screen.jsonl" > "$out/screen-ranked.json"
winner=$(jq -r '.[0] | "\(.profile):\(.threads):\(.depth)"' "$out/screen-ranked.json")
IFS=: read -r winner_name winner_threads winner_depth <<<"$winner"
# Leave the measured winner resident and run one post-selection validation.
start_profile "$winner_threads" "$winner_depth"
curl --max-time 300 -fsS "$base/v1/chat/completions" -H 'Content-Type: application/json' --data-binary @"$out/warmup.json" > "$out/winner-live-smoke.json"
jq -e '.choices[0].message.content == "AUDIT_READY" and .zero_copy.zero_copy == true and .zero_copy.shared_bytes > 0 and .zero_copy.copied_bytes == 0' "$out/winner-live-smoke.json" >/dev/null
systemctl --user show "$trial" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent -p MemorySwapPeak > "$out/winner-live-service.txt"
for x in ActiveState=active SubState=running NRestarts=0 MemorySwapCurrent=0 MemorySwapPeak=0; do grep -Fx "$x" "$out/winner-live-service.txt" >/dev/null; done
jq -n --arg profile "$winner_name" --argjson threads "$winner_threads" --argjson depth "$winner_depth" '{profile:$profile,threads:$threads,depth:$depth}' > "$out/winner.json"
trap - EXIT INT TERM
jq '.' "$out/screen-ranked.json"
