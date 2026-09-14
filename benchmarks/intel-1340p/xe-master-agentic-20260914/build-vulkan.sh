#!/bin/bash
# SCRIPT_JDOC: {"summary":"Build a current-source O3 Vulkan plugin from a pinned serial-generator snapshot with fresh shaders and no GPU execution","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-master-agentic-20260914
out="$root/build-vulkan"
cmake -S "$root/vulkan-source/ggml" -B "$out" -G Ninja -DCMAKE_C_COMPILER=/usr/sbin/clang -DCMAKE_CXX_COMPILER=/usr/sbin/clang++ -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=ON -DGGML_VULKAN=ON -DGGML_CPU=OFF -DGGML_BACKEND_DL=ON -DGGML_NATIVE=OFF -DGGML_CCACHE=OFF -DGGML_BUILD_TESTS=OFF -DGGML_BUILD_EXAMPLES=OFF
cmake --build "$out" --target ggml-vulkan -j1
find "$out" -type f \( -name 'libggml-vulkan.so*' -o -name '*.spv' -o -name '*.comp.cpp' -o -name '*shaders.hpp' \) -print0 | sort -z | xargs -0 sha256sum > "$root/evidence/vulkan-built.sha256"
for f in memory.peak memory.swap.peak memory.events cpu.stat;do printf '%s\n' "$f";cat "/sys/fs/cgroup/$f";done
