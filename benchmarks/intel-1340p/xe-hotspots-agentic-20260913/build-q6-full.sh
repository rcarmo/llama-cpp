#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913
repo=/var/home/agent/workspace/projects/llama-cpp
base=/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/release
/usr/sbin/clang++ -O3 -std=c++17 -pthread -I"$repo/ggml/include" -I"$repo/ggml/src" -I"$repo/ggml/src/ggml-cpu" "$root/q6-full.cpp" "$root/q6-build/pair.o" -L"$base/bin" -Wl,-rpath,"$base/bin" -lggml-base -lggml-cpu -lggml -o "$root/q6-build/test-q6-full"
