#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-long-agentic-v2-20260914
repo=/var/home/agent/workspace/projects/llama-cpp
base=/var/home/agent/workspace/reports/xe-master-agentic-20260914/build-cpu
mkdir -p "$root/bin"
/usr/sbin/clang++ -std=c++17 -O3 -Wall -Wextra -I"$repo/include" -I"$repo/ggml/include" -I"$repo/ggml/src" -I"$repo/common" -I"$repo/vendor" "$root/agentic-session.cpp" -L"$base/bin" -Wl,-rpath,"$base/bin" -lllama -lllama-common -lggml -lggml-base -lggml-cpu -o "$root/bin/agentic-session"
sha256sum "$root/bin/agentic-session" "$root/agentic-session.cpp"
