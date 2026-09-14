#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913
repo=/var/home/agent/workspace/projects/llama-cpp
base=/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/release
mkdir -p "$root/q6-build"
/usr/sbin/clang++ -O3 -std=c++17 -mavx2 -mf16c -mfma -I"$repo/ggml/include" -I"$repo/ggml/src" -I"$repo/ggml/src/ggml-cpu" -c "$root/q6-pair.cpp" -o "$root/q6-build/pair.o"
/usr/sbin/clang++ -O3 -std=c++17 -pthread -I"$repo/ggml/include" -I"$repo/ggml/src" -I"$repo/ggml/src/ggml-cpu" "$root/q6-native.cpp" "$root/q6-build/pair.o" -L"$base/bin" -Wl,-rpath,"$base/bin" -lggml-base -lggml-cpu -lggml -o "$root/q6-build/test-q6-pair"
objdump -d -C "$root/q6-build/pair.o" > "$root/q6-build/pair.asm"
