#!/bin/bash
# SCRIPT_JDOC: {"summary":"Live-check current and lifetime Bonsai zero-copy health telemetry across cold, warm and reset states","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail

if [[ $# != 1 ]]; then
    echo "usage: $0 OUTPUT_DIR" >&2
    exit 2
fi

root=/var/home/agent/workspace
worktree="$root/projects/llama-cpp"
model="$root/projects/models/ternary-bonsai-2-27b/Ternary-Bonsai-2-27B-PTQ1_0.gguf"
server="$worktree/build-bonsai-health-live/bin/llama-zero-copy-server"
out=$1
port=18140
alias=bonsai-2-27b-ptq1-zero-copy
conversation=health-live
mkdir -p "$out"

export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
server_pid=
request_pid=
restore() {
    if [[ -n ${request_pid:-} ]]; then
        kill -TERM "$request_pid" 2>/dev/null || true
        wait "$request_pid" 2>/dev/null || true
    fi
    if [[ -n ${server_pid:-} ]]; then
        kill -TERM "$server_pid" 2>/dev/null || true
        for _ in $(seq 1 60); do
            kill -0 "$server_pid" 2>/dev/null || break
            sleep 0.5
        done
        kill -KILL "$server_pid" 2>/dev/null || true
        wait "$server_pid" 2>/dev/null || true
    fi
    ~/.local/bin/gemma-profile primary > "$out/restore.log" 2>&1 || true
}
trap restore EXIT INT TERM

~/.local/bin/gemma-profile status > "$out/primary-before.txt"
systemctl --user stop llama-gemma-lan-test.socket llama-gemma-lan-test.service llama-gemma-zero-copy.service
for _ in $(seq 1 60); do
    [[ -z $(fuser /dev/dri/renderD128 2>/dev/null || true) ]] && break
    sleep 1
done
[[ -z $(fuser /dev/dri/renderD128 2>/dev/null || true) ]]

LD_LIBRARY_PATH="$worktree/build-bonsai-health-live/bin" "$server" \
    --model "$model" --host 127.0.0.1 --port "$port" --alias "$alias" \
    --ctx-size 2048 --batch-size 256 --ubatch-size 256 \
    --threads 12 --threads-batch 12 --model-sampling 0 --max-output 128 \
    > "$out/server.stdout" 2> "$out/server.stderr" &
server_pid=$!
printf '%s\n' "$server_pid" > "$out/server.pid"

ready=0
for _ in $(seq 1 600); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$port/health" > "$out/health-start.json"; then
        ready=1
        break
    fi
    kill -0 "$server_pid" 2>/dev/null || break
    sleep 1
done
[[ $ready == 1 ]]
jq -e '.status == "ok" and .processing == false and .route == "idle" and .zero_copy_ready == false and .current_shared_bytes == 0 and .current_copied_bytes == 0 and .handoffs_total == 0 and .shared_bytes_total == 0 and .copied_bytes_total == 0' "$out/health-start.json" > /dev/null

cat > "$out/cold-request.json" <<'JSON'
{"model":"bonsai-2-27b-ptq1-zero-copy","messages":[{"role":"user","content":"Reply with exactly BONSAI_HEALTH_COLD_OK and nothing else."}],"temperature":0,"max_tokens":40,"stream":false}
JSON
curl -fsS --max-time 600 -H 'Content-Type: application/json' -H "X-Conversation-Id: $conversation" \
    --data-binary @"$out/cold-request.json" "http://127.0.0.1:$port/v1/chat/completions" > "$out/cold-response.json" &
request_pid=$!
cold_busy=0
for i in $(seq 1 1200); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$port/health" > "$out/health-cold-poll.json" 2>/dev/null && \
            jq -e '.processing == true and .route == "vulkan_prefill_cpu_target"' "$out/health-cold-poll.json" > /dev/null 2>&1; then
        cp "$out/health-cold-poll.json" "$out/health-cold-busy.json"
        cold_busy=1
        break
    fi
    kill -0 "$request_pid" 2>/dev/null || break
    sleep 0.05
done
[[ $cold_busy == 1 ]]
jq -e '.status == "ok" and .processing == true and .route == "vulkan_prefill_cpu_target" and .zero_copy_ready == false and .current_shared_bytes == 0 and .current_copied_bytes == 0 and (has("round") | not) and (has("handoffs") | not) and (has("shared_bytes") | not) and (has("copied_bytes") | not) and (has("handoffs_total") | not) and (has("shared_bytes_total") | not) and (has("copied_bytes_total") | not)' "$out/health-cold-busy.json" > /dev/null
wait "$request_pid"
request_pid=
jq -e '.choices[0].message.content == "BONSAI_HEALTH_COLD_OK" and .zero_copy.route == "vulkan_prefill_cpu_target" and .zero_copy.zero_copy == true and .zero_copy.shared_bytes > 0 and .zero_copy.copied_bytes == 0' "$out/cold-response.json" > /dev/null
curl -fsS --max-time 10 "http://127.0.0.1:$port/health" > "$out/health-after-cold.json"
jq -e '.processing == false and .route == "vulkan_prefill_cpu_target" and .zero_copy_ready == true and .current_shared_bytes > 0 and .current_copied_bytes == 0 and .handoffs_total == 1 and .shared_bytes_total == .current_shared_bytes and .copied_bytes_total == 0 and .handoffs == .handoffs_total and .shared_bytes == .shared_bytes_total and .copied_bytes == .copied_bytes_total' "$out/health-after-cold.json" > /dev/null

jq -n --slurpfile cold "$out/cold-response.json" '{model:"bonsai-2-27b-ptq1-zero-copy",messages:[{role:"user",content:"Reply with exactly BONSAI_HEALTH_COLD_OK and nothing else."},$cold[0].choices[0].message,{role:"user",content:"Reply with exactly BONSAI_HEALTH_WARM_OK and nothing else."}],temperature:0,max_tokens:40,stream:false}' > "$out/warm-request.json"
curl -fsS --max-time 600 -H 'Content-Type: application/json' -H "X-Conversation-Id: $conversation" \
    --data-binary @"$out/warm-request.json" "http://127.0.0.1:$port/v1/chat/completions" > "$out/warm-response.json" &
request_pid=$!
warm_busy=0
for i in $(seq 1 1200); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$port/health" > "$out/health-warm-poll.json" 2>/dev/null && \
            jq -e '.processing == true and .route == "cpu_target_reuse" and .zero_copy_ready == true and .current_shared_bytes > 0 and .current_copied_bytes == 0' "$out/health-warm-poll.json" > /dev/null 2>&1; then
        cp "$out/health-warm-poll.json" "$out/health-warm-busy.json"
        warm_busy=1
        break
    fi
    kill -0 "$request_pid" 2>/dev/null || break
    sleep 0.05
done
[[ $warm_busy == 1 ]]
jq -e '(has("round") | not) and (has("handoffs") | not) and (has("shared_bytes") | not) and (has("copied_bytes") | not) and (has("handoffs_total") | not) and (has("shared_bytes_total") | not) and (has("copied_bytes_total") | not)' "$out/health-warm-busy.json" > /dev/null
wait "$request_pid"
request_pid=
jq -e '.choices[0].message.content == "BONSAI_HEALTH_WARM_OK" and .zero_copy.route == "cpu_target_reuse" and .zero_copy.cold == false and .zero_copy.shared_bytes == 0 and .zero_copy.copied_bytes == 0' "$out/warm-response.json" > /dev/null
curl -fsS --max-time 10 "http://127.0.0.1:$port/health" > "$out/health-after-warm.json"
jq -e '.processing == false and .route == "cpu_target_reuse" and .zero_copy_ready == true and .current_shared_bytes > 0 and .current_copied_bytes == 0 and .handoffs_total == 1 and .shared_bytes_total == .current_shared_bytes and .copied_bytes_total == 0' "$out/health-after-warm.json" > /dev/null

shared_before_reset=$(jq -r '.shared_bytes_total' "$out/health-after-warm.json")
curl -fsS --max-time 30 -X DELETE -H "X-Conversation-Id: $conversation" "http://127.0.0.1:$port/v1/stream" > "$out/reset-response.json"
jq -e '.status == "reset"' "$out/reset-response.json" > /dev/null
curl -fsS --max-time 10 "http://127.0.0.1:$port/health" > "$out/health-after-reset.json"
jq -e --argjson shared "$shared_before_reset" '.processing == false and .round == 0 and .route == "idle" and .zero_copy_ready == false and .current_shared_bytes == 0 and .current_copied_bytes == 0 and .handoffs_total == 1 and .shared_bytes_total == $shared and .copied_bytes_total == 0 and .handoffs == .handoffs_total and .shared_bytes == .shared_bytes_total and .copied_bytes == .copied_bytes_total' "$out/health-after-reset.json" > /dev/null

cgroup=$(awk -F: '$1=="0"{print $3}' /proc/self/cgroup)
{
    for f in memory.current memory.peak memory.swap.current memory.swap.peak memory.events; do
        echo "$f"
        cat "/sys/fs/cgroup$cgroup/$f"
    done
} > "$out/final.cgroup"
[[ $(awk '/^memory.swap.peak$/{getline;print}' "$out/final.cgroup") == 0 ]]
[[ $(awk '/^oom_kill /{print $2}' "$out/final.cgroup") == 0 ]]

restore
server_pid=
trap - EXIT INT TERM
~/.local/bin/gemma-profile status > "$out/primary-after.txt"
touch "$out/complete"
