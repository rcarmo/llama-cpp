#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../../.." && pwd)
out=$root/benchmarks/intel-1340p/maple-preview/baseline
model=$(realpath "$root/../models/maple-preview-q8_0.gguf")
export LD_LIBRARY_PATH="$root/build-intel-clang/bin:$root/build-intel-clang/runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

snapshot() {
    local name=$1
    {
        date --iso-8601=seconds
        free -b
        cat /proc/vmstat | grep -E '^(pswpin|pswpout|pgfault|pgmajfault) '
        for sensor in /sys/class/thermal/thermal_zone*/temp /sys/class/hwmon/hwmon*/temp*_input; do
            if [[ -r $sensor ]]; then
                printf '%s %s\n' "$sensor" "$(cat "$sensor")"
            fi
        done
    } > "$out/$name.txt"
}

mkdir -p "$out"
snapshot before

for tokens in 4096 32768; do
    snapshot "pp${tokens}-before"
    timeout --signal=TERM --kill-after=20s 1200s /usr/bin/time -v \
        "$root/build-intel-clang/bin/llama-bench" \
        -m "$model" -p "$tokens" -n 0 -r 3 -o jsonl -oe jsonl \
        --no-warmup -t 8 -C 0xff --cpu-strict 1 \
        -b 2048 -ub 512 -fa off -ctk f16 -ctv f16 -lm mmap \
        > "$out/pp${tokens}.jsonl" 2> "$out/pp${tokens}.time.txt"
    snapshot "pp${tokens}-after"
done

snapshot tg16-before
timeout --signal=TERM --kill-after=20s 1200s /usr/bin/time -v \
    "$root/build-intel-clang/bin/llama-bench" \
    -m "$model" -p 0 -n 16 -r 3 -o jsonl -oe jsonl \
    --no-warmup -t 8 -C 0xff --cpu-strict 1 \
    -b 2048 -ub 512 -fa off -ctk f16 -ctv f16 -lm mmap \
    > "$out/tg16.jsonl" 2> "$out/tg16.time.txt"
snapshot tg16-after
snapshot after
