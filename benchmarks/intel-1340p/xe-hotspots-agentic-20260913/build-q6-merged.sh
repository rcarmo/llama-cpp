#!/bin/bash
set -euo pipefail
repo=/var/home/agent/workspace/projects/llama-cpp
root=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913/q6-merged-build
cmake -S "$repo" -B "$root" -G Ninja -DCMAKE_C_COMPILER=/usr/sbin/clang -DCMAKE_CXX_COMPILER=/usr/sbin/clang++ -DCMAKE_BUILD_TYPE=Release -DGGML_VULKAN=OFF -DGGML_NATIVE=ON -DGGML_CCACHE=OFF -DLLAMA_BUILD_COMMON=ON -DLLAMA_BUILD_TESTS=ON -DLLAMA_BUILD_TOOLS=OFF -DLLAMA_BUILD_SERVER=OFF -DLLAMA_BUILD_APP=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_OPENSSL=OFF
cmake --build "$root" --target test-q6-pair -j2
ctest --test-dir "$root" -V -R '^test-q6-pair$'
sha256sum "$root/bin/test-q6-pair" "$root/bin/libggml-cpu.so.0.23.0"
for f in memory.peak memory.swap.peak memory.events cpu.stat; do printf '%s\n' "$f"; cat "/sys/fs/cgroup/$f"; done
