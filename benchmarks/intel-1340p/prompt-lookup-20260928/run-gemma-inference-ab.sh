#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Run counterbalanced bounded CPU-only Gemma prompt-lookup baseline/candidate inference","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
base="$repo/../../tmp/llama-lookup-baseline-20260928"
out="$repo/benchmarks/intel-1340p/prompt-lookup-20260928/inference"
model="$repo/../models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf"
image=localhost/llama-intel-build:fedora44
if [[ ! -x "$base/build-lookup/bin/llama-lookup" || ! -x "$repo/build-lookup-gemma/bin/llama-lookup" ]]; then
    echo 'build both lookup targets before running' >&2
    exit 2
fi
mkdir -p "$out"
if [[ -e "$out/results.tsv" ]]; then
    echo "Refusing to overwrite existing results: $out/results.tsv" >&2
    exit 2
fi
printf 'sequence\tarm\tdecoded\tdrafted\taccepted\tdecode_ms\ttotal_ms\twall_ms\tpeak_bytes\tswap_peak\toom_kill\toutput_sha256\n' > "$out/results.tsv"
base_prompt='Repeat this phrase exactly: green trees and blue rivers. green trees and blue rivers.'
prompt=$base_prompt
for _ in $(seq 1 12); do prompt="$prompt $base_prompt"; done
for item in baseline candidate candidate baseline candidate baseline baseline candidate; do
    seq=$(wc -l < "$out/results.tsv")
    dir="$out/$(printf '%02d' "$seq")-$item"
    mkdir -p "$dir"
    if [[ $item == baseline ]]; then work="$base"; bin="$base/build-lookup/bin"; else work="$repo"; bin="$repo/build-lookup-gemma/bin"; fi
    timeout --signal=TERM --kill-after=15 240 podman run --rm --name "gemma-lookup-$seq" --network none \
        --security-opt label=disable --userns=keep-id --cpus=4 --memory=8g --memory-swap=8g --pids-limit=128 \
        -v "$work:$work" -v "$model:/models/gemma.gguf:ro" -v "$dir:$dir" -w "$work" \
        -e OMP_NUM_THREADS=4 -e LD_LIBRARY_PATH="$bin" -e PROMPT="$prompt" -e OUT="$dir" \
        "$image" bash -lc '
            set -euo pipefail
            start=$(date +%s%3N)
            if [[ -x "$PWD/build-lookup/bin/llama-lookup" ]]; then runner="$PWD/build-lookup/bin/llama-lookup"; else runner="$PWD/build-lookup-gemma/bin/llama-lookup"; fi
            "$runner" -m /models/gemma.gguf -t 4 -tb 4 -c 1024 -b 256 -ub 256 -n 64 \
                -p "$PROMPT" --temp 0 --seed 42 -lcd /dev/null -co off > "$OUT/run.log" 2> "$OUT/run.stderr"
            end=$(date +%s%3N)
            echo $((end-start)) > "$OUT/wall_ms"
            for field in memory.peak memory.swap.peak memory.events; do
                echo "$field"
                cat "/sys/fs/cgroup/$field"
            done > "$OUT/final.cgroup"
        ' > "$dir/container.stdout" 2> "$dir/container.stderr"
    decoded=$(sed -n 's/.*decoded *\([0-9]*\) tokens.*/\1/p' "$dir/run.stderr" | tail -1)
    drafted=$(sed -n 's/.*n_drafted *= *\([0-9]*\).*/\1/p' "$dir/run.stderr" | tail -1)
    accepted=$(sed -n 's/.*n_accept *= *\([0-9]*\).*/\1/p' "$dir/run.stderr" | tail -1)
    decode_ms=$(sed -n 's/.*decoded *[0-9]* tokens in *\([0-9.]*\) seconds.*/\1/p' "$dir/run.stderr" | tail -1 | awk '{printf "%d",$1*1000}')
    total_ms=$(sed -n 's/.*total time = *\([0-9.]*\) ms.*/\1/p' "$dir/run.stderr" | tail -1 | awk '{printf "%d",$1}')
    peak=$(awk '/^memory.peak$/{getline;print}' "$dir/final.cgroup")
    swap=$(awk '/^memory.swap.peak$/{getline;print}' "$dir/final.cgroup")
    oom=$(awk '/^oom_kill /{print $2}' "$dir/final.cgroup")
    grep -q '^<bos>' "$dir/run.log"
    output_hash=$(grep '^<bos>' "$dir/run.log" | sha256sum | cut -d' ' -f1)
    [[ -n $decoded && -n $total_ms && $swap == 0 && $oom == 0 ]]
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$seq" "$item" "$decoded" "$drafted" "$accepted" "$decode_ms" "$total_ms" "$(cat "$dir/wall_ms")" "$peak" "$swap" "$oom" "$output_hash" >> "$out/results.tsv"
done
awk -F '\t' 'NR == 2 { decoded=$3; drafted=$4; accepted=$5; hash=$12 } NR > 2 && ($3 != decoded || $4 != drafted || $5 != accepted || $12 != hash) { exit 1 } END { if (NR != 9) exit 1 }' "$out/results.tsv"
