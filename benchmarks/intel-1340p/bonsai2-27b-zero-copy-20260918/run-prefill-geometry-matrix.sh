#!/bin/bash
# SCRIPT_JDOC: {"summary":"Screen matched PTQ1 ordinary/strict/handoff prefill geometries against published llama-bench controls","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail

if [[ $# != 1 ]]; then
    echo "usage: $0 OUTPUT_DIR" >&2
    exit 2
fi

root=/var/home/agent/workspace
worktree="$root/projects/llama-cpp"
model="$root/projects/models/ternary-bonsai-2-27b/Ternary-Bonsai-2-27B-PTQ1_0.gguf"
image=localhost/llama-intel-build:fedora44
out=$1
runner="$worktree/build-bonsai-recovery/bin/test-qwen-target-trained-handoff"
bench="$worktree/build-bonsai-recovery/bin/llama-bench"
mkdir -p "$out/runs"

export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
container=
restore() {
    if [[ -n ${container:-} ]]; then
        podman stop -t 10 "$container" >/dev/null 2>&1 || true
        podman rm -f "$container" >/dev/null 2>&1 || true
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

printf 'sequence\tprofile\tprefill_tokens\tcontinue_tokens\tchunk_tokens\tbatch_tokens\tubatch_tokens\tprefill_us\tprefill_tps\tcontinuation_us\tgeneration_tps\tactive_wall_us\tshared_bytes\tcopied_bytes\tfinal_pos\tlogits_top_id\n' > "$out/results.tsv"

run_one() {
    local seq=$1 profile=$2 prefill=$3 output=$4 chunk=$5 batch=$6 ubatch=$7
    local id dir line prefill_us continuation_us active_us shared copied final_pos top_id
    id=$(printf '%02d-%s-p%d-c%d-b%d-u%d' "$seq" "$profile" "$prefill" "$chunk" "$batch" "$ubatch")
    dir="$out/runs/$id"
    mkdir -p "$dir"
    container="bonsai-prefill-$seq"
    timeout --signal=TERM --kill-after=20 1800 \
        podman run --rm --name "$container" --network none --device /dev/dri/renderD128:/dev/dri/renderD128 \
        --security-opt label=disable --userns=keep-id --cpus=12 --memory=24g --memory-swap=24g --pids-limit=512 \
        -v "$worktree:$worktree" -v "$model:$model:ro" -w "$worktree" \
        -e LD_LIBRARY_PATH="$worktree/build-bonsai-recovery/bin" \
        -e QWEN_THREADS=12 -e QWEN_FLASH_ATTN=1 -e QWEN_GPU_LAYERS=999 -e QWEN_BATCH="$batch" \
        -e RUNNER="$runner" -e PROFILE="$profile" -e MODEL="$model" -e PREFILL="$prefill" -e OUTPUT="$output" \
        -e CHUNK="$chunk" -e UBATCH="$ubatch" -e RUN_DIR="$dir" \
        "$image" bash -lc '
            set -euo pipefail
            "$RUNNER" "$PROFILE" "$MODEL" "$PREFILL" "$OUTPUT" "$CHUNK" "$UBATCH" > "$RUN_DIR/run.log" 2> "$RUN_DIR/run.stderr"
            {
                for f in memory.current memory.peak memory.swap.current memory.swap.peak memory.events; do
                    echo "$f"
                    cat "/sys/fs/cgroup/$f"
                done
            } > "$RUN_DIR/final.cgroup"
        ' \
        > "$dir/container.stdout" 2> "$dir/container.stderr"
    container=
    line=$(grep '^QUALIFY_RESULT ' "$dir/run.log")
    printf '%s\n' "$line" > "$dir/result.txt"
    prefill_us=$(sed -n 's/.* prefill_us=\([0-9]*\).*/\1/p' <<<"$line")
    continuation_us=$(sed -n 's/.* continuation_us=\([0-9]*\).*/\1/p' <<<"$line")
    active_us=$(sed -n 's/.* active_wall_us=\([0-9]*\).*/\1/p' <<<"$line")
    shared=$(sed -n 's/.* shared_bytes=\([0-9]*\).*/\1/p' <<<"$line")
    copied=$(sed -n 's/.* copied_bytes=\([0-9]*\).*/\1/p' <<<"$line")
    final_pos=$(sed -n 's/.* final_pos=\([0-9]*\).*/\1/p' <<<"$line")
    top_id=$(sed -n 's/.* logits_top_id=\([0-9-]*\).*/\1/p' <<<"$line")
    awk -v s="$seq" -v p="$profile" -v n="$prefill" -v o="$output" -v c="$chunk" -v b="$batch" -v u="$ubatch" \
        -v pu="$prefill_us" -v cu="$continuation_us" -v au="$active_us" -v sh="$shared" -v co="$copied" -v fp="$final_pos" -v ti="$top_id" \
        'BEGIN { printf "%d\t%s\t%d\t%d\t%d\t%d\t%d\t%d\t%.6f\t%d\t%.6f\t%d\t%d\t%d\t%d\t%d\n", s,p,n,o,c,b,u,pu,n*1000000/pu,cu,o*1000000/cu,au,sh,co,fp,ti }' >> "$out/results.tsv"
    [[ $final_pos == $((prefill + output - 1)) ]]
    [[ $copied == 0 ]]
    [[ $(awk '/^memory.swap.peak$/{getline;print}' "$dir/final.cgroup") == 0 ]]
    [[ $(awk '/^oom_kill /{print $2}' "$dir/final.cgroup") == 0 ]]
    if [[ $profile == handoff ]]; then [[ $shared -gt 0 ]]; fi
}

git -C "$worktree" rev-parse HEAD > "$out/source-commit.txt"
sha256sum "$runner" "$bench" "$model" > "$out/identities.sha256"

# One continuation token isolates prefill. The first eight runs cover the complete logical-batch and microbatch matrix with fixed 256-token chunks.
run_one  1 vulkan-strict 1024 1 256  256 256
run_one  2 vulkan-strict 1024 1 256  512 512
run_one  3 vulkan-strict 1024 1 256  512 256
run_one  4 vulkan-strict 1024 1 256 1024 512
run_one  5 vulkan-strict 1024 1 256 1024 256
run_one  6 vulkan-strict 1024 1 256 2048 512
run_one  7 vulkan-strict 1024 1 256 2048 256
run_one  8 vulkan-strict 1024 1 512 2048 512

# Compare chunked and single-call prefill, then ordinary, strict and handoff contexts at matched geometry.
run_one  9 vulkan-strict 1024 1 1024 2048 512
run_one 10 vulkan        1024 1 1024 2048 512
run_one 11 handoff       1024 1 1024 2048 512
run_one 12 vulkan        1024 1  256 2048 512
run_one 13 handoff       1024 1  256 2048 512

# Same-build controls at each requested prompt size.
printf 'prompt_tokens\tavg_ts\n' > "$out/llama-bench-controls.tsv"
for prompt in 256 512 1024 2048; do
    container="bonsai-prefill-bench-$prompt"
    podman run --rm --name "$container" --network none --device /dev/dri/renderD128:/dev/dri/renderD128 \
        --security-opt label=disable --userns=keep-id --cpus=12 --memory=24g --memory-swap=24g --pids-limit=512 \
        -v "$worktree:$worktree" -v "$model:$model:ro" -w "$worktree" \
        -e LD_LIBRARY_PATH="$worktree/build-bonsai-recovery/bin" \
        "$image" "$bench" -m "$model" -p "$prompt" -n 1 -r 1 -t 12 -ngl 99 -fa on -o json \
        > "$out/llama-bench-p${prompt}.json" 2> "$out/llama-bench-p${prompt}.stderr"
    container=
    jq -r --arg p "$prompt" '.[] | select(.n_prompt == ($p | tonumber)) | [$p, .avg_ts] | @tsv' "$out/llama-bench-p${prompt}.json" >> "$out/llama-bench-controls.tsv"
done

if awk -F '\t' 'NR>1 && $2=="handoff" && $9 >= 23 { pass=1 } END { exit !pass }' "$out/results.tsv"; then
    echo PASS > "$out/prefill-gate.txt"
else
    echo FAIL > "$out/prefill-gate.txt"
fi
[[ -z $(fuser /dev/dri/renderD128 2>/dev/null || true) ]]
restore
trap - EXIT INT TERM
~/.local/bin/gemma-profile status > "$out/primary-after.txt"
touch "$out/complete"
