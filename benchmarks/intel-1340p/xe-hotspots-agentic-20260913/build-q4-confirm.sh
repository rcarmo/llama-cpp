#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913
repo=/var/home/agent/workspace/projects/llama-cpp
base=/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/release
for arm in reference candidate diagnostic; do
 /usr/sbin/clang++ -O3 -std=c++17 -mavx2 -mf16c -mfma -I"$repo/ggml/include" -I"$repo/ggml/src" -I"$repo/ggml/src/ggml-cpu" -I"$repo/ggml/src/ggml-cpu/llamafile" -c "$root/q4-confirm-build/$arm.cpp" -o "$root/q4-confirm-build/$arm.o"
done
/usr/sbin/clang++ -O3 -std=c++17 -pthread -I"$repo/ggml/include" -I"$repo/ggml/src" -I"$repo/ggml/src/ggml-cpu" "$root/q4-confirm.cpp" "$root/q4-confirm-build/reference.o" "$root/q4-confirm-build/candidate.o" "$root/q4-confirm-build/diagnostic.o" -L"$base/bin" -Wl,-rpath,"$base/bin" -lggml-base -lggml-cpu -lggml -o "$root/q4-confirm-build/test-q4-confirm"
nm -C "$root/q4-confirm-build/test-q4-confirm" > "$root/q4-confirm-build/symbols.txt"
objdump -d -C "$root/q4-confirm-build/test-q4-confirm" > "$root/q4-confirm-build/disassembly.txt"
