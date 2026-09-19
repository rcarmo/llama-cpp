#!/bin/bash
# SCRIPT_JDOC: {"summary":"Validate exact Bonsai response parsing on a fresh Vulkan-prefill zero-copy CPU-generation request","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail

if [[ $# != 1 ]]; then
    echo "usage: $0 OUTPUT_DIR" >&2
    exit 2
fi

root=/var/home/agent/workspace
worktree="$root/projects/llama-cpp-bonsai-ptq1-zero-copy"
model="$root/projects/models/ternary-bonsai-2-27b/Ternary-Bonsai-2-27B-PTQ1_0.gguf"
server="$worktree/build-bonsai-zc/bin/llama-zero-copy-server"
out=$1
port=18140
alias=bonsai-2-27b-ptq1-zero-copy
mkdir -p "$out"

export XDG_RUNTIME_DIR=/run/user/1001
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
server_pid=
restore() {
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

LD_LIBRARY_PATH="$worktree/build-bonsai-zc/bin" "$server" \
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
jq -e '.status == "ok" and .mode == "qwen35-target" and .handoffs == 0' "$out/health-start.json" > /dev/null

cat > "$out/recovery-request.json" <<'JSON'
{"model":"bonsai-2-27b-ptq1-zero-copy","messages":[{"role":"user","content":"Reply with exactly BONSAI_ZC_RECOVERY_OK and nothing else."}],"temperature":0,"max_tokens":40,"stream":false}
JSON
curl -fsS --max-time 600 -H 'Content-Type: application/json' -H 'X-Conversation-Id: parser-recovery' \
    --data-binary @"$out/recovery-request.json" "http://127.0.0.1:$port/v1/chat/completions" > "$out/recovery-response.json"
jq -e '.choices[0].finish_reason == "stop" and .choices[0].message.content == "BONSAI_ZC_RECOVERY_OK" and .zero_copy.route == "vulkan_prefill_cpu_target" and .zero_copy.cold == true and .zero_copy.zero_copy == true and .zero_copy.shared_bytes > 0 and .zero_copy.copied_bytes == 0' "$out/recovery-response.json" > /dev/null

curl -fsS --max-time 10 "http://127.0.0.1:$port/health" > "$out/health-final.json"
jq -e '.status == "ok" and .processing == false and .zero_copy_ready == true and .handoffs == 1 and .shared_bytes > 0 and .copied_bytes == 0' "$out/health-final.json" > /dev/null

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
