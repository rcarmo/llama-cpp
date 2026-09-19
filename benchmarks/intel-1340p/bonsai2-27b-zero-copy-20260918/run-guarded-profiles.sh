#!/bin/bash
# SCRIPT_JDOC: {"summary":"Run guarded Bonsai PTQ1 CPU/Vulkan/handoff qualifier profiles with durable output and primary restoration","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail

if [[ $# -lt 4 ]]; then
    echo "usage: $0 OUTPUT_DIR PREFILL_TOKENS CONTINUE_TOKENS PROFILE..." >&2
    exit 2
fi

root=/var/home/agent/workspace
worktree="$root/projects/llama-cpp"
model="$root/projects/models/ternary-bonsai-2-27b/Ternary-Bonsai-2-27B-PTQ1_0.gguf"
image=localhost/llama-intel-build:fedora44
output_dir=$1
prefill_tokens=$2
continue_tokens=$3
shift 3
profiles=("$@")
chunk_tokens=${QWEN_CHUNK:-256}
ubatch_tokens=${QWEN_UBATCH:-$chunk_tokens}
batch_tokens=${QWEN_BATCH:-$chunk_tokens}

if [[ $prefill_tokens -lt $chunk_tokens ]]; then
    chunk_tokens=$prefill_tokens
    ubatch_tokens=$prefill_tokens
fi

mkdir -p "$output_dir"
export XDG_RUNTIME_DIR=/run/user/1001
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus

restore() {
    for name in $(podman ps -a --format '{{.Names}}' | grep '^bonsai-zc-guarded-' || true); do
        podman stop -t 10 "$name" >/dev/null 2>&1 || true
        podman rm -f "$name" >/dev/null 2>&1 || true
    done
    ~/.local/bin/gemma-profile primary > "$output_dir/restore.log" 2>&1 || true
}
trap restore EXIT INT TERM

~/.local/bin/gemma-profile status > "$output_dir/primary-before.txt"
systemctl --user stop llama-gemma-lan-test.socket llama-gemma-lan-test.service llama-gemma-zero-copy.service
for _ in $(seq 1 60); do
    [[ -z $(fuser /dev/dri/renderD128 2>/dev/null || true) ]] && break
    sleep 1
done
[[ -z $(fuser /dev/dri/renderD128 2>/dev/null || true) ]]

sequence=0
for profile in "${profiles[@]}"; do
    sequence=$((sequence + 1))
    name="bonsai-zc-guarded-$sequence"
    run_dir="$output_dir/$(printf '%02d-%s' "$sequence" "$profile")"
    mkdir -p "$run_dir"
    device=()
    if [[ $profile != cpu ]]; then
        device=(--device /dev/dri/renderD128:/dev/dri/renderD128)
    fi
    timeout --signal=TERM --kill-after=20 2400 \
        podman run --rm --name "$name" --network none "${device[@]}" \
        --security-opt label=disable --userns=keep-id --cpus=12 \
        --memory=24g --memory-swap=24g --pids-limit=512 \
        -v "$worktree:$worktree" -v "$model:$model:ro" -w "$worktree" \
        -e QWEN_THREADS=12 -e QWEN_FLASH_ATTN="${QWEN_FLASH_ATTN:-1}" -e QWEN_GPU_LAYERS=999 -e QWEN_BATCH="$batch_tokens" \
        -e RUN_PROFILE="$profile" -e RUN_MODEL="$model" \
        -e RUN_PREFILL="$prefill_tokens" -e RUN_CONTINUE="$continue_tokens" \
        -e RUN_CHUNK="$chunk_tokens" -e RUN_UBATCH="$ubatch_tokens" \
        -e RUN_DIR="$run_dir" "$image" bash -lc '
            set -euo pipefail
            export LD_LIBRARY_PATH="$PWD/build-bonsai-recovery/bin"
            build-bonsai-recovery/bin/test-qwen-target-trained-handoff \
                "$RUN_PROFILE" "$RUN_MODEL" "$RUN_PREFILL" "$RUN_CONTINUE" "$RUN_CHUNK" "$RUN_UBATCH" \
                > "$RUN_DIR/run.log" 2> "$RUN_DIR/run.stderr"
            rc=$?
            printf "%s\n" "$rc" > "$RUN_DIR/run.exit"
            {
                for f in memory.current memory.peak memory.swap.current memory.swap.peak memory.events; do
                    echo "$f"
                    cat "/sys/fs/cgroup/$f"
                done
            } > "$RUN_DIR/final.cgroup"
            exit "$rc"
        '
    grep -q '^QUALIFY_RESULT ' "$run_dir/run.log"
    grep -q 'logits_finite=1' "$run_dir/run.log"
    expected_pos=$((prefill_tokens + continue_tokens - 1))
    grep -q "final_pos=$expected_pos" "$run_dir/run.log"
    [[ $(awk '/^memory.swap.peak$/{getline;print}' "$run_dir/final.cgroup") == 0 ]]
    [[ $(awk '/^oom_kill /{print $2}' "$run_dir/final.cgroup") == 0 ]]
    if [[ $profile == handoff ]]; then
        grep -Eq 'shared_bytes=[1-9][0-9]* copied_bytes=0' "$run_dir/run.log"
    fi
done

[[ -z $(fuser /dev/dri/renderD128 2>/dev/null || true) ]]
restore
trap - EXIT INT TERM
~/.local/bin/gemma-profile status > "$output_dir/primary-after.txt"
touch "$output_dir/complete"
