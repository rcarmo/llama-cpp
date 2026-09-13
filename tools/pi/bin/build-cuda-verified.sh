#!/usr/bin/env bash
# Explicit CUDA configuration plus runtime backend verification. A directory
# named build-cuda can contain a CPU-only CMake cache; never trust its name.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
build=${1:-"$root/build-cuda-verified"}
cmake -S "$root" -B "$build" -DGGML_CUDA=ON -DLLAMA_BUILD_TESTS=ON
cmake --build "$build" --target llama-server llama-cli llama-bench test-prefetch-budget test-sched-async-cpu test-quantize-fns -j "${BUILD_JOBS:-4}"
grep -qx 'GGML_CUDA:BOOL=ON' "$build/CMakeCache.txt"
devices=$("$build/bin/llama-server" --list-devices 2>&1)
printf '%s\n' "$devices"
if ! grep -q 'CUDA[0-9].*:' <<<"$devices"; then
    echo 'CUDA build verification failed: no usable CUDA device' >&2
    exit 1
fi
ctest --test-dir "$build" -R 'test-(prefetch-budget|sched-async-cpu|quantize-fns)' --output-on-failure
