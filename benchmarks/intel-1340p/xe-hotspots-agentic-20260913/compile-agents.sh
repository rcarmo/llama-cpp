#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913
repo=/var/home/agent/workspace/projects/llama-cpp
base=/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/release
/usr/sbin/clang++ -std=c++17 -O2 -Wall -Wextra -I"$repo/include" -I"$repo/ggml/include" -I"$repo/common" "$root/agentic-session.cpp" -L"$root/build-cpu/bin" -L"$base/bin" -Wl,-rpath,"$root/build-cpu/bin:$base/bin" -lllama -lllama-common -lggml -lggml-base -lggml-cpu -o "$root/build-cpu/bin/agentic-session"
