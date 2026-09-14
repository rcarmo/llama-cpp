#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913
repo=/var/home/agent/workspace/projects/llama-cpp
base=/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/release
for arm in reference candidate; do
 /usr/sbin/clang++ -O3 -std=c++17 -mavx2 -mf16c -mfma -I"$repo/ggml/include" -I"$repo/ggml/src" -I"$repo/ggml/src/ggml-cpu" -I"$repo/ggml/src/ggml-cpu/llamafile" -c "$root/q4-build/$arm.cpp" -o "$root/q4-build/$arm.o"
done
/usr/sbin/clang++ -O3 -std=c++17 -pthread -I"$repo/ggml/include" -I"$repo/ggml/src" -I"$repo/ggml/src/ggml-cpu" "$root/q4-native.cpp" "$root/q4-build/reference.o" "$root/q4-build/candidate.o" -L"$base/bin" -Wl,-rpath,"$base/bin" -lggml-base -lggml-cpu -lggml -o "$root/q4-build/test-q4-tiles"
